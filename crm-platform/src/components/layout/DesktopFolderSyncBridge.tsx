'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useDesktopFolderSync } from '@/hooks/useDesktopFolderSync'
import {
  buildVaultSyncStoragePath,
  formatBytes,
  ingestAccountFileData,
  normalizeVaultRelativePath,
} from '@/lib/file-ingestion'

type RemoteVaultDocument = {
  id: string
  name: string
  size: string | null
  type: string | null
  storage_path: string
  metadata?: Record<string, unknown> | null
}

function base64ToUint8Array(base64: string) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return window.btoa(binary)
}

function normalizeKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseRemoteDocumentSize(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw
}

export function DesktopFolderSyncBridge() {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()
  const folderSync = useDesktopFolderSync()
  const localSyncBusyRef = useRef(false)
  const remoteSyncBusyRef = useRef(false)

  const isFolderSyncActive = Boolean(
    folderSync.isDesktop &&
    !loading &&
    user &&
    folderSync.state?.enabled &&
    folderSync.state?.folderPath &&
    folderSync.state?.accountId
  )

  const fetchRemoteDocuments = useCallback(async () => {
    const accountId = folderSync.state?.accountId
    if (!accountId) {
      return []
    }

    const { data, error } = await supabase
      .from('documents')
      .select('id, name, size, type, storage_path, metadata')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })

    if (error) {
      throw error
    }

    return (data ?? []) as RemoteVaultDocument[]
  }, [folderSync.state?.accountId])

  const markSynced = useCallback(async (payload: {
    relativePath: string
    size: number
    mtimeMs: number
    documentId?: string | null
    storagePath?: string | null
    direction: 'local-to-vault' | 'vault-to-local'
  }) => {
    await folderSync.acknowledgeFile(payload)
  }, [folderSync])

  const pushLocalFiles = useCallback(async (state: NonNullable<typeof folderSync.state>, files: Array<{
    absolutePath: string
    relativePath: string
    fileName: string
    size: number
    mtimeMs: number
    fingerprint: string
  }>) => {
    if (!state.accountId || !state.syncId) {
      return
    }

    if (localSyncBusyRef.current) {
      return
    }

    localSyncBusyRef.current = true
    const toastId = toast.loading('Syncing folder changes...')
    let shouldKickRemotePull = false

    try {
      const remoteDocuments = await fetchRemoteDocuments()
      const syncedDocumentIds = new Set(state.syncedDocumentIds || [])
      const remoteByRelativePath = new Map<string, RemoteVaultDocument>()
      const remoteByNameAndSize = new Map<string, RemoteVaultDocument>()

      for (const doc of remoteDocuments) {
        const relativePath = normalizeVaultRelativePath(String(doc.metadata?.relativePath || doc.metadata?.localRelativePath || ''))
        if (relativePath) {
          remoteByRelativePath.set(relativePath, doc)
        }

        const nameKey = normalizeKey(doc.name)
        const sizeKey = normalizeKey(parseRemoteDocumentSize(doc.size))
        if (nameKey && sizeKey) {
          remoteByNameAndSize.set(`${nameKey}|${sizeKey}`, doc)
        }
      }

      let uploadedCount = 0
      let linkedCount = 0
      let customerPromotionNeeded = false

      for (const file of files) {
        const localState = state.syncedFiles?.[file.relativePath]
        if (localState?.fingerprint === file.fingerprint) {
          continue
        }

        const relativeMatch = remoteByRelativePath.get(file.relativePath)
        const nameMatch = remoteByNameAndSize.get(`${normalizeKey(file.fileName)}|${normalizeKey(formatBytes(file.size))}`)
        const existingRemote = relativeMatch || nameMatch || null

        if (existingRemote && !syncedDocumentIds.has(existingRemote.id)) {
          await markSynced({
            relativePath: file.relativePath,
            size: file.size,
            mtimeMs: file.mtimeMs,
            documentId: existingRemote.id,
            storagePath: existingRemote.storage_path,
            direction: 'local-to-vault',
          })
          syncedDocumentIds.add(existingRemote.id)
          linkedCount += 1
          shouldKickRemotePull = true
          continue
        }

        const fileData = await folderSync.readFile(file.absolutePath)
        const result = await ingestAccountFileData({
          accountId: state.accountId,
          fileName: file.fileName,
          fileData: base64ToUint8Array(fileData.base64),
          fileType: fileData.mimeType,
          fileSize: fileData.size,
          apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || null,
          storagePath: buildVaultSyncStoragePath(state.accountId, state.syncId, file.relativePath),
          metadata: {
            syncSource: 'desktop-folder-sync',
            syncId: state.syncId,
            relativePath: file.relativePath,
            localFileName: file.fileName,
            localFingerprint: file.fingerprint,
          },
          upsert: true,
        })

        await markSynced({
          relativePath: file.relativePath,
          size: fileData.size,
          mtimeMs: fileData.mtimeMs,
          documentId: result.documentId,
          storagePath: result.storagePath,
          direction: 'local-to-vault',
        })

        if (result.analysisType) {
          const normalizedAnalysis = result.analysisType.toUpperCase()
          if (normalizedAnalysis === 'CONTRACT' || normalizedAnalysis === 'SIGNED_CONTRACT' || normalizedAnalysis === 'BILL') {
            customerPromotionNeeded = true
          }
        }

        uploadedCount += 1
        shouldKickRemotePull = true
      }

      if (customerPromotionNeeded && state.accountId) {
        const { error: accountError } = await supabase
          .from('accounts')
          .update({ status: 'CUSTOMER' })
          .eq('id', state.accountId)

        if (accountError) {
          console.error('[Folder Sync] Account status update failed:', accountError)
        }
      }

      if (uploadedCount > 0 || linkedCount > 0) {
        toast.success(
          linkedCount > 0 && uploadedCount === 0
            ? `Linked ${linkedCount} existing vault file${linkedCount === 1 ? '' : 's'} to the folder.`
            : `Synced ${uploadedCount} file${uploadedCount === 1 ? '' : 's'} to the vault.`,
          { id: toastId }
        )
      } else {
        toast.success('Folder is already in sync.', { id: toastId })
      }

      await queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
      await queryClient.invalidateQueries({ queryKey: ['vault-accounts'] })
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
    } catch (error) {
      console.error('[Folder Sync] Local upload failed:', error)
      toast.error(error instanceof Error ? error.message : 'Folder sync failed', { id: toastId })
    } finally {
      localSyncBusyRef.current = false
      if (shouldKickRemotePull) {
        window.setTimeout(() => {
          void pullRemoteDocs()
        }, 1000)
      }
    }
  }, [fetchRemoteDocuments, folderSync, markSynced, queryClient])

  const pullRemoteDocs = useCallback(async () => {
    const state = folderSync.state
    if (!state?.enabled || !state.folderPath || !state.accountId || !state.syncId) {
      return
    }

    if (remoteSyncBusyRef.current || localSyncBusyRef.current) {
      return
    }

    remoteSyncBusyRef.current = true

    try {
      const remoteDocuments = await fetchRemoteDocuments()
      const syncedDocumentIds = new Set(state.syncedDocumentIds || [])
      const unsyncedDocuments = remoteDocuments.filter((doc) => !syncedDocumentIds.has(doc.id))

      if (unsyncedDocuments.length === 0) {
        return
      }

      let downloadedCount = 0

      for (const doc of unsyncedDocuments) {
        const { data, error } = await supabase.storage.from('vault').createSignedUrl(doc.storage_path, 120, {
          download: doc.name,
        })

        if (error) {
          throw error
        }

        if (!data?.signedUrl) {
          continue
        }

        const response = await fetch(data.signedUrl)
        if (!response.ok) {
          throw new Error(`Failed to download ${doc.name}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const base64 = arrayBufferToBase64(arrayBuffer)
        const writeResult = await folderSync.writeFile({
          relativePath: normalizeVaultRelativePath(String(doc.metadata?.relativePath || doc.metadata?.localRelativePath || doc.name || 'file')),
          fileName: doc.name || 'file',
          base64,
          mimeType: doc.type || 'application/octet-stream',
        })

        await markSynced({
          relativePath: writeResult.relativePath,
          size: writeResult.size,
          mtimeMs: writeResult.mtimeMs,
          documentId: doc.id,
          storagePath: doc.storage_path,
          direction: 'vault-to-local',
        })

        downloadedCount += 1
      }

      if (downloadedCount > 0) {
        toast.success(`Copied ${downloadedCount} vault file${downloadedCount === 1 ? '' : 's'} into the folder.`)
        await queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
      }
    } catch (error) {
      console.error('[Folder Sync] Remote pull failed:', error)
    } finally {
      remoteSyncBusyRef.current = false
    }
  }, [fetchRemoteDocuments, folderSync, markSynced, queryClient])

  useEffect(() => {
    if (!folderSync.isDesktop || loading || !user) {
      return
    }

    const bridge = window.nodalDesktop
    if (!bridge?.onFolderSyncEvent) {
      return
    }

    const unsubscribe = bridge.onFolderSyncEvent((event) => {
      if (event.type === 'local-files-detected') {
        void pushLocalFiles(event.state, event.files)
      }

      if (event.type === 'error' && event.message) {
        toast.error(event.message)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [folderSync.isDesktop, loading, pushLocalFiles, user])

  useEffect(() => {
    if (!isFolderSyncActive) {
      return
    }

    void folderSync.scanNow().catch(() => null)
    const kickoffTimer = window.setTimeout(() => {
      void pullRemoteDocs()
    }, 4000)

    const timer = window.setInterval(() => {
      void folderSync.scanNow().catch(() => null)
      void pullRemoteDocs()
    }, 60 * 1000)

    return () => {
      window.clearTimeout(kickoffTimer)
      window.clearInterval(timer)
    }
  }, [folderSync, isFolderSyncActive, pullRemoteDocs])

  return null
}
