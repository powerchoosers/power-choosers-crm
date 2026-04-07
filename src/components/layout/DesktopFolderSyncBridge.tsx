'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useDesktopFolderSync } from '@/hooks/useDesktopFolderSync'
import {
  buildVaultAccountFolderLabel,
  buildVaultSyncStoragePath,
  formatBytes,
  ingestAccountFileData,
  normalizeVaultRelativePath,
  parseVaultAccountFolderLabel,
} from '@/lib/file-ingestion'

type RemoteVaultDocument = {
  id: string
  account_id: string | null
  name: string
  size: string | null
  type: string | null
  storage_path: string
  metadata?: Record<string, unknown> | null
}

type RemoteAccount = {
  id: string
  name: string | null
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

function parseDocumentSize(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) {
    return 0
  }

  const match = raw.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i)
  if (!match) {
    return 0
  }

  const amount = Number.parseFloat(match[1] || '0')
  if (!Number.isFinite(amount)) {
    return 0
  }

  const unit = String(match[2] || 'B').toUpperCase()
  const multiplier =
    unit === 'KB'
      ? 1024
      : unit === 'MB'
        ? 1024 ** 2
        : unit === 'GB'
          ? 1024 ** 3
          : unit === 'TB'
            ? 1024 ** 4
            : 1

  return amount * multiplier
}

function resolveRemoteRootRelativePath(document: RemoteVaultDocument, accountName: string | null) {
  const accountFolder = buildVaultAccountFolderLabel(document.account_id || 'unassigned', accountName)
  const storedRelativePath = normalizeVaultRelativePath(
    String(document.metadata?.relativePath || document.metadata?.localRelativePath || '')
  )

  if (storedRelativePath) {
    const firstSegment = storedRelativePath.split('/').filter(Boolean)[0] || ''
    const parsedFolder = parseVaultAccountFolderLabel(firstSegment)
    if (parsedFolder && parsedFolder.accountId === document.account_id) {
      return storedRelativePath
    }

    return `${accountFolder}/${storedRelativePath}`
  }

  const rawFileName = normalizeVaultRelativePath(document.name || 'file') || 'file'
  const dotIndex = rawFileName.lastIndexOf('.')
  const shortId = document.id ? String(document.id).slice(0, 8) : 'file'
  const fallbackName =
    dotIndex > 0
      ? `${rawFileName.slice(0, dotIndex)}-${shortId}${rawFileName.slice(dotIndex)}`
      : `${rawFileName}-${shortId}`

  return `${accountFolder}/${fallbackName}`
}

export function DesktopFolderSyncBridge() {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()
  const folderSync = useDesktopFolderSync()
  const localSyncBusyRef = useRef(false)
  const remoteSyncBusyRef = useRef(false)
  const pendingForceRemotePullRef = useRef(false)

  const isFolderSyncActive = Boolean(
    folderSync.isDesktop &&
      !loading &&
      user &&
      folderSync.state?.enabled &&
      folderSync.state?.folderPath
  )

  const fetchRemoteDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('id, account_id, name, size, type, storage_path, metadata')
      .order('account_id', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      throw error
    }

    return (data ?? []) as RemoteVaultDocument[]
  }, [])

  const fetchAccountNames = useCallback(async () => {
    const { data, error } = await supabase.from('accounts').select('id, name')

    if (error) {
      throw error
    }

    return (data ?? []) as RemoteAccount[]
  }, [])

  const markSynced = useCallback(
    async (payload: {
      relativePath: string
      size: number
      mtimeMs: number
      documentId?: string | null
      storagePath?: string | null
      direction: 'local-to-vault' | 'vault-to-local'
      accountId?: string | null
      accountName?: string | null
      accountFolder?: string | null
    }) => {
      await folderSync.acknowledgeFile(payload)
    },
    [folderSync]
  )

  const pushLocalFiles = useCallback(
    async (
      state: NonNullable<typeof folderSync.state>,
      files: Array<{
        absolutePath: string
        relativePath: string
        fileName: string
        size: number
        mtimeMs: number
        fingerprint: string
        accountId?: string | null
        accountName?: string | null
        accountFolder?: string | null
      }>
    ) => {
      if (!state.folderPath || !state.syncId) {
        return
      }

      if (localSyncBusyRef.current) {
        return
      }

      localSyncBusyRef.current = true
      const toastId = toast.loading('Syncing vault changes...')
      let shouldKickRemotePull = false

      try {
        const [remoteDocuments, remoteAccounts] = await Promise.all([fetchRemoteDocuments(), fetchAccountNames()])
        const accountNameMap = remoteAccounts.reduce<Record<string, string>>((accumulator, account) => {
          accumulator[account.id] = account.name || account.id
          return accumulator
        }, {})

        const syncedDocumentIds = new Set(state.syncedDocumentIds || [])
        const remoteByRelativePath = new Map<string, RemoteVaultDocument>()
        const remoteByNameAndSize = new Map<string, RemoteVaultDocument>()

        for (const doc of remoteDocuments) {
          const accountName = doc.account_id ? accountNameMap[doc.account_id] || doc.account_id : 'Unassigned'
          const rootRelativePath = normalizeVaultRelativePath(resolveRemoteRootRelativePath(doc, accountName))
          remoteByRelativePath.set(rootRelativePath, doc)

          const nameKey = normalizeKey(doc.name)
          const sizeKey = normalizeKey(formatBytes(parseDocumentSize(doc.size)))
          if (nameKey && sizeKey) {
            remoteByNameAndSize.set(`${normalizeKey(String(doc.account_id || ''))}|${nameKey}|${sizeKey}`, doc)
          }
        }

        let uploadedCount = 0
        let linkedCount = 0
        let customerPromotionNeeded = false
        let warnedAboutMissingAccountFolder = false

        for (const file of files) {
          const rootRelativePath = normalizeVaultRelativePath(file.relativePath)
          const localState = state.syncedFiles?.[rootRelativePath]
          if (localState?.fingerprint === file.fingerprint) {
            continue
          }

          const parsedFolder =
            file.accountFolder ? parseVaultAccountFolderLabel(file.accountFolder) : parseVaultAccountFolderLabel(rootRelativePath.split('/')[0] || '')

          const accountId = file.accountId || parsedFolder?.accountId || null
          const accountName = file.accountName || parsedFolder?.accountName || null
          const accountFolder = file.accountFolder || parsedFolder?.folderLabel || null

          if (!accountId || !accountFolder) {
            if (!warnedAboutMissingAccountFolder) {
              warnedAboutMissingAccountFolder = true
              toast.error('Put files inside an account folder inside the root vault folder.')
            }
            continue
          }

          const relativeMatch = remoteByRelativePath.get(rootRelativePath)
          const sizeKey = normalizeKey(formatBytes(file.size))
          const nameMatch = remoteByNameAndSize.get(`${normalizeKey(accountId)}|${normalizeKey(file.fileName)}|${sizeKey}`)
          const existingRemote = relativeMatch || nameMatch || null

          if (existingRemote && !syncedDocumentIds.has(existingRemote.id)) {
            await markSynced({
              relativePath: rootRelativePath,
              size: file.size,
              mtimeMs: file.mtimeMs,
              documentId: existingRemote.id,
              storagePath: existingRemote.storage_path,
              direction: 'local-to-vault',
              accountId,
              accountName,
              accountFolder,
            })
            syncedDocumentIds.add(existingRemote.id)
            linkedCount += 1
            shouldKickRemotePull = true
            continue
          }

          const fileData = await folderSync.readFile(file.absolutePath)
          const result = await ingestAccountFileData({
            accountId,
            fileName: file.fileName,
            fileData: base64ToUint8Array(fileData.base64),
            fileType: fileData.mimeType,
            fileSize: fileData.size,
            apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || null,
            storagePath: buildVaultSyncStoragePath(accountId, state.syncId, rootRelativePath),
            metadata: {
              syncSource: 'desktop-vault-root',
              syncId: state.syncId,
              relativePath: rootRelativePath,
              accountFolder,
              accountId,
              accountName,
              localFileName: file.fileName,
              localFingerprint: file.fingerprint,
            },
            upsert: true,
          })

          await markSynced({
            relativePath: rootRelativePath,
            size: fileData.size,
            mtimeMs: fileData.mtimeMs,
            documentId: result.documentId,
            storagePath: result.storagePath,
            direction: 'local-to-vault',
            accountId,
            accountName,
            accountFolder,
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

        if (customerPromotionNeeded) {
          const accountsToPromote = Array.from(
            new Set(
              files
                .map((file) => file.accountId || parseVaultAccountFolderLabel(file.accountFolder || file.relativePath.split('/')[0] || '')?.accountId || null)
                .filter((value): value is string => Boolean(value))
            )
          )

          for (const accountId of accountsToPromote) {
            const { error: accountError } = await supabase
              .from('accounts')
              .update({ status: 'CUSTOMER' })
              .eq('id', accountId)

            if (accountError) {
              console.error('[Folder Sync] Account status update failed:', accountError)
            }
          }
        }

        if (uploadedCount > 0 || linkedCount > 0) {
          toast.success(
            linkedCount > 0 && uploadedCount === 0
              ? `Linked ${linkedCount} existing vault file${linkedCount === 1 ? '' : 's'} to the root mirror.`
              : `Synced ${uploadedCount} file${uploadedCount === 1 ? '' : 's'} to the vault.`,
            { id: toastId }
          )
        } else {
          toast.success('Root vault is already in sync.', { id: toastId })
        }

        await queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
        await queryClient.invalidateQueries({ queryKey: ['vault-accounts'] })
        await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      } catch (error) {
        console.error('[Folder Sync] Local upload failed:', error)
        toast.error(error instanceof Error ? error.message : 'Vault sync failed', { id: toastId })
      } finally {
        localSyncBusyRef.current = false
        if (shouldKickRemotePull || pendingForceRemotePullRef.current) {
          const forceRemotePull = pendingForceRemotePullRef.current || shouldKickRemotePull
          pendingForceRemotePullRef.current = false
          window.setTimeout(() => {
            void pullRemoteDocs(forceRemotePull ? { force: true } : undefined)
          }, 1000)
        }
      }
    },
    [fetchAccountNames, fetchRemoteDocuments, folderSync, markSynced, queryClient]
  )

  const pullRemoteDocs = useCallback(async (options?: { force?: boolean }) => {
    const state = folderSync.state
    if (!state?.enabled || !state.folderPath || !state.syncId) {
      return
    }

    if (remoteSyncBusyRef.current || localSyncBusyRef.current) {
      if (options?.force) {
        pendingForceRemotePullRef.current = true
      }
      return
    }

    remoteSyncBusyRef.current = true

    try {
      const [remoteDocuments, remoteAccounts] = await Promise.all([fetchRemoteDocuments(), fetchAccountNames()])
      const accountNameMap = remoteAccounts.reduce<Record<string, string>>((accumulator, account) => {
        accumulator[account.id] = account.name || account.id
        return accumulator
      }, {})

      const syncedDocumentIds = new Set(state.syncedDocumentIds || [])
      const unsyncedDocuments = options?.force ? remoteDocuments : remoteDocuments.filter((doc) => !syncedDocumentIds.has(doc.id))

      if (unsyncedDocuments.length === 0) {
        return
      }

      let downloadedCount = 0

      for (const doc of unsyncedDocuments) {
        const accountName = doc.account_id ? accountNameMap[doc.account_id] || doc.account_id : 'Unassigned'
        const rootRelativePath = normalizeVaultRelativePath(resolveRemoteRootRelativePath(doc, accountName))

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
          relativePath: rootRelativePath,
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
          accountId: doc.account_id || null,
          accountName,
          accountFolder: buildVaultAccountFolderLabel(doc.account_id || 'unassigned', accountName),
        })

        downloadedCount += 1
      }

      if (downloadedCount > 0) {
        toast.success(`Copied ${downloadedCount} vault file${downloadedCount === 1 ? '' : 's'} into the root folder.`)
        await queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
      }
    } catch (error) {
      console.error('[Folder Sync] Remote pull failed:', error)
    } finally {
      remoteSyncBusyRef.current = false
      if (pendingForceRemotePullRef.current) {
        pendingForceRemotePullRef.current = false
        window.setTimeout(() => {
          void pullRemoteDocs({ force: true })
        }, 1000)
      }
    }
  }, [fetchAccountNames, fetchRemoteDocuments, folderSync, markSynced, queryClient])

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

      if (event.type === 'scan-complete' && (event.reason === 'manual' || event.reason === 'connect')) {
        void pullRemoteDocs({ force: true })
      }

      if (event.type === 'scan-complete' && event.reason === 'startup') {
        void pullRemoteDocs()
      }

      if (event.type === 'error' && event.message) {
        toast.error(event.message)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [folderSync.isDesktop, loading, pullRemoteDocs, pushLocalFiles, user])

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
