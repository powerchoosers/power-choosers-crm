'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useDesktopFolderSync } from '@/hooks/useDesktopFolderSync'
import {
  buildVaultAccountFolderLabel,
  buildVaultDocumentTypeFolderLabel,
  buildVaultSyncStoragePath,
  formatBytes,
  ingestAccountFileData,
  normalizeVaultRelativePath,
  parseVaultAccountFolderLabel,
  parseVaultDocumentTypeFolderLabel,
} from '@/lib/file-ingestion'

type RemoteVaultDocument = {
  id: string
  account_id: string | null
  name: string
  size: string | null
  type: string | null
  document_type: string | null
  updated_at: string | null
  storage_path: string
  metadata?: Record<string, unknown> | null
}

type RemoteAccount = {
  id: string
  name: string | null
  createdAt: string | null
}

type AccountFolderIndexEntry = {
  accountId: string
  accountName: string
  folderLabel: string
}

type AccountFolderIndex = {
  byAccountId: Map<string, AccountFolderIndexEntry>
  byFolderLabel: Map<string, AccountFolderIndexEntry>
  byBaseLabel: Map<string, AccountFolderIndexEntry[]>
}

type SyncedFileEntry = {
  documentId?: string | null
  documentUpdatedAt?: string | null
}

type FolderSyncStateLike = {
  syncedFiles?: Record<string, SyncedFileEntry>
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

function getRemoteDocumentTypeHint(document: RemoteVaultDocument) {
  const metadata = document.metadata
  const aiExtraction = metadata && typeof metadata === 'object' ? metadata['ai_extraction'] : null
  const aiExtractionRecord =
    aiExtraction && typeof aiExtraction === 'object' && !Array.isArray(aiExtraction)
      ? (aiExtraction as Record<string, unknown>)
      : null
  const aiExtractionType = typeof aiExtractionRecord?.type === 'string' ? aiExtractionRecord.type : null

  return document.document_type || aiExtractionType || document.type || null
}

function buildAccountFolderIndex(remoteAccounts: RemoteAccount[]): AccountFolderIndex {
  const groupedAccounts = new Map<string, RemoteAccount[]>()

  for (const account of remoteAccounts) {
    const baseFolderLabel = buildVaultAccountFolderLabel(account.id, account.name)
    const normalizedBaseLabel = normalizeKey(baseFolderLabel)
    const bucket = groupedAccounts.get(normalizedBaseLabel) || []
    bucket.push(account)
    groupedAccounts.set(normalizedBaseLabel, bucket)
  }

  const byAccountId = new Map<string, AccountFolderIndexEntry>()
  const byFolderLabel = new Map<string, AccountFolderIndexEntry>()
  const byBaseLabel = new Map<string, AccountFolderIndexEntry[]>()

  for (const [baseLabel, accounts] of groupedAccounts.entries()) {
    const sortedAccounts = [...accounts].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0

      if (leftTime !== rightTime) {
        return leftTime - rightTime
      }

      return left.id.localeCompare(right.id)
    })

    const baseFolderLabel = buildVaultAccountFolderLabel(sortedAccounts[0]?.id || '', sortedAccounts[0]?.name || null)
    const entries: AccountFolderIndexEntry[] = []

    sortedAccounts.forEach((account, index) => {
      const folderLabel = index === 0 ? baseFolderLabel : `${baseFolderLabel} (${index + 1})`
      const entry = {
        accountId: account.id,
        accountName: account.name || 'Account',
        folderLabel,
      }

      byAccountId.set(account.id, entry)
      byFolderLabel.set(normalizeKey(folderLabel), entry)
      entries.push(entry)
    })

    byBaseLabel.set(baseLabel, entries)
  }

  return {
    byAccountId,
    byFolderLabel,
    byBaseLabel,
  }
}

function resolveAccountFolderEntry(
  accountFolderIndex: AccountFolderIndex,
  input: {
    accountId?: string | null
    accountName?: string | null
    folderLabel?: string | null
  }
) {
  if (input.accountId && accountFolderIndex.byAccountId.has(input.accountId)) {
    return accountFolderIndex.byAccountId.get(input.accountId) || null
  }

  const normalizedFolderLabel = input.folderLabel ? normalizeKey(input.folderLabel) : null
  if (normalizedFolderLabel && accountFolderIndex.byFolderLabel.has(normalizedFolderLabel)) {
    return accountFolderIndex.byFolderLabel.get(normalizedFolderLabel) || null
  }

  if (input.accountName) {
    const normalizedBaseLabel = normalizeKey(buildVaultAccountFolderLabel(input.accountId || '', input.accountName))
    const candidates = accountFolderIndex.byBaseLabel.get(normalizedBaseLabel) || []

    if (candidates.length === 1) {
      return candidates[0] || null
    }
  }

  return null
}

function resolveRemoteRootRelativePath(document: RemoteVaultDocument, accountFolderLabel: string | null) {
  const accountFolder = accountFolderLabel || 'Unassigned'
  const documentTypeFolder = buildVaultDocumentTypeFolderLabel(getRemoteDocumentTypeHint(document))
  const storedRelativePath = normalizeVaultRelativePath(
    String(document.metadata?.relativePath || document.metadata?.localRelativePath || '')
  )

  if (storedRelativePath) {
    const segments = storedRelativePath.split('/').filter(Boolean)
    const firstSegment = segments[0] || ''
    if (parseVaultAccountFolderLabel(firstSegment)) {
      segments.shift()
    }

    if (parseVaultDocumentTypeFolderLabel(segments[0] || '')) {
      segments.shift()
    }

    const relativeLeafPath = normalizeVaultRelativePath(segments.join('/'))
    if (relativeLeafPath) {
      return `${accountFolder}/${documentTypeFolder}/${relativeLeafPath}`
    }
  }

  const rawFileName = normalizeVaultRelativePath(document.name || 'file') || 'file'
  const dotIndex = rawFileName.lastIndexOf('.')
  const shortId = document.id ? String(document.id).slice(0, 8) : 'file'
  const fallbackName =
    dotIndex > 0
      ? `${rawFileName.slice(0, dotIndex)}-${shortId}${rawFileName.slice(dotIndex)}`
      : `${rawFileName}-${shortId}`

  return `${accountFolder}/${documentTypeFolder}/${fallbackName}`
}

function findSyncedFileEntry(state: FolderSyncStateLike, documentId: string) {
  return Object.entries(state.syncedFiles || {}).find(([, entry]) => entry.documentId === documentId) || null
}

export function DesktopFolderSyncBridge() {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()
  const folderSync = useDesktopFolderSync()
  const localSyncBusyRef = useRef(false)
  const remoteSyncBusyRef = useRef(false)
  const pendingRemotePullRef = useRef(false)
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
      .select('id, account_id, name, size, type, document_type, updated_at, storage_path, metadata')
      .order('account_id', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      throw error
    }

    return (data ?? []) as RemoteVaultDocument[]
  }, [])

  const fetchAccountNames = useCallback(async () => {
    const { data, error } = await supabase.from('accounts').select('id, name, createdAt')

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
      previousRelativePath?: string | null
      documentUpdatedAt?: string | null
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
      let shouldRefreshRemoteDocs = false

      try {
        const [remoteDocuments, remoteAccounts] = await Promise.all([fetchRemoteDocuments(), fetchAccountNames()])
        const accountFolderIndex = buildAccountFolderIndex(remoteAccounts)

        const syncedDocumentIds = new Set(state.syncedDocumentIds || [])
        const remoteByRelativePath = new Map<string, RemoteVaultDocument>()
        const remoteByNameAndSize = new Map<string, RemoteVaultDocument>()

        for (const doc of remoteDocuments) {
          const accountFolderEntry = doc.account_id ? accountFolderIndex.byAccountId.get(doc.account_id) || null : null
          const rootRelativePath = normalizeVaultRelativePath(
            resolveRemoteRootRelativePath(doc, accountFolderEntry?.folderLabel || 'Unassigned')
          )
          remoteByRelativePath.set(rootRelativePath, doc)

          const nameKey = normalizeKey(doc.name)
          const sizeKey = normalizeKey(formatBytes(parseDocumentSize(doc.size)))
          if (nameKey && sizeKey) {
            remoteByNameAndSize.set(`${normalizeKey(String(doc.account_id || ''))}|${nameKey}|${sizeKey}`, doc)
          }
        }

        let uploadedCount = 0
        let linkedCount = 0
        const promotedAccountIds = new Set<string>()
        let warnedAboutMissingAccountFolder = false

        for (const file of files) {
          const rootRelativePath = normalizeVaultRelativePath(file.relativePath)
          const localState = state.syncedFiles?.[rootRelativePath]
          if (localState?.fingerprint === file.fingerprint) {
            continue
          }

          const parsedFolder = file.accountFolder
            ? parseVaultAccountFolderLabel(file.accountFolder)
            : parseVaultAccountFolderLabel(rootRelativePath.split('/')[0] || '')

          const resolvedFolderEntry = resolveAccountFolderEntry(accountFolderIndex, {
            accountId: file.accountId || parsedFolder?.accountId || null,
            accountName: file.accountName || parsedFolder?.accountName || null,
            folderLabel: file.accountFolder || parsedFolder?.folderLabel || null,
          })

          const accountId = resolvedFolderEntry?.accountId || file.accountId || parsedFolder?.accountId || null
          const accountName = resolvedFolderEntry?.accountName || file.accountName || parsedFolder?.accountName || null
          const accountFolder = resolvedFolderEntry?.folderLabel || file.accountFolder || parsedFolder?.folderLabel || null

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
            documentUpdatedAt: existingRemote.updated_at || null,
          })
            syncedDocumentIds.add(existingRemote.id)
            linkedCount += 1
            shouldRefreshRemoteDocs = true
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
            documentUpdatedAt: result.documentUpdatedAt || null,
          })

          if (result.analysisType) {
            const normalizedAnalysis = result.analysisType.toUpperCase()
            if (normalizedAnalysis === 'CONTRACT' || normalizedAnalysis === 'SIGNED_CONTRACT' || normalizedAnalysis === 'BILL') {
              promotedAccountIds.add(accountId)
            }
          }

          uploadedCount += 1
          shouldRefreshRemoteDocs = true
        }

        if (promotedAccountIds.size > 0) {
          for (const accountId of promotedAccountIds) {
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
        if (pendingForceRemotePullRef.current) {
          pendingRemotePullRef.current = false
          pendingForceRemotePullRef.current = false
          window.setTimeout(() => {
            void pullRemoteDocs({ force: true })
          }, 1000)
        } else if (shouldRefreshRemoteDocs || pendingRemotePullRef.current) {
          pendingRemotePullRef.current = false
          window.setTimeout(() => {
            void pullRemoteDocs()
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
      } else {
        pendingRemotePullRef.current = true
      }
      return
    }

    remoteSyncBusyRef.current = true

    try {
      const [remoteDocuments, remoteAccounts] = await Promise.all([fetchRemoteDocuments(), fetchAccountNames()])
      const accountFolderIndex = buildAccountFolderIndex(remoteAccounts)

      const unsyncedDocuments = options?.force
        ? remoteDocuments
        : remoteDocuments.filter((doc) => {
            const accountFolderEntry = doc.account_id ? accountFolderIndex.byAccountId.get(doc.account_id) || null : null
            const canonicalRelativePath = normalizeVaultRelativePath(
              resolveRemoteRootRelativePath(doc, accountFolderEntry?.folderLabel || 'Unassigned')
            )
            const syncedEntry = findSyncedFileEntry(state, doc.id)

            if (!syncedEntry) {
              return true
            }

            if (normalizeVaultRelativePath(syncedEntry[0] || '') !== canonicalRelativePath) {
              return true
            }

            if (doc.updated_at && syncedEntry[1].documentUpdatedAt !== doc.updated_at) {
              return true
            }

            return false
          })

      if (unsyncedDocuments.length === 0) {
        return
      }

      let downloadedCount = 0

      for (const doc of unsyncedDocuments) {
        const accountFolderEntry = doc.account_id ? accountFolderIndex.byAccountId.get(doc.account_id) || null : null
        const accountName = accountFolderEntry?.accountName || 'Unassigned'
        const rootRelativePath = normalizeVaultRelativePath(
          resolveRemoteRootRelativePath(doc, accountFolderEntry?.folderLabel || 'Unassigned')
        )
        const syncedEntry = findSyncedFileEntry(state, doc.id)
        const previousRelativePath = syncedEntry?.[0] || null

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

        if (previousRelativePath && previousRelativePath !== writeResult.relativePath) {
          await folderSync.deleteFile(previousRelativePath).catch(() => null)
        }

        await markSynced({
          relativePath: writeResult.relativePath,
          size: writeResult.size,
          mtimeMs: writeResult.mtimeMs,
          documentId: doc.id,
          storagePath: doc.storage_path,
          direction: 'vault-to-local',
          accountId: doc.account_id || null,
          accountName,
          accountFolder: accountFolderEntry?.folderLabel || buildVaultAccountFolderLabel(doc.account_id || 'unassigned', accountName),
          previousRelativePath: previousRelativePath && previousRelativePath !== writeResult.relativePath ? previousRelativePath : null,
          documentUpdatedAt: doc.updated_at || null,
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
        pendingRemotePullRef.current = false
        pendingForceRemotePullRef.current = false
        window.setTimeout(() => {
          void pullRemoteDocs({ force: true })
        }, 1000)
      } else if (pendingRemotePullRef.current) {
        pendingRemotePullRef.current = false
        window.setTimeout(() => {
          void pullRemoteDocs()
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

      if (event.type === 'scan-complete' && (event.reason === 'manual' || event.reason === 'connect' || event.reason === 'tray')) {
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
