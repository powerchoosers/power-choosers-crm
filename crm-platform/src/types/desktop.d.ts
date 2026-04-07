export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

export type DesktopUiEvent =
  | { type: 'open-command-bar' }
  | { type: 'refresh-data' }
  | { type: 'open-csv-import' }
  | { type: 'open-file-attach' }
  | { type: 'navigate'; href: string }

export interface DesktopFolderSyncState {
  enabled: boolean
  watching: boolean
  keepRunningInTray: boolean
  folderPath: string | null
  folderName: string | null
  accountId: string | null
  accountName: string | null
  syncId: string | null
  mode: 'mirror'
  lastScanAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  syncedFileCount: number
  syncedDocumentIds: string[]
  syncedFiles: Record<
    string,
    {
      fingerprint: string
      size: number
      mtimeMs: number
      documentId?: string | null
      storagePath?: string | null
      direction?: 'local-to-vault' | 'vault-to-local'
      syncedAt?: string | null
    }
  >
}

export interface DesktopFolderSyncFileEntry {
  absolutePath: string
  relativePath: string
  fileName: string
  size: number
  mtimeMs: number
  fingerprint: string
}

export interface DesktopFolderSyncReadResult {
  absolutePath: string
  relativePath: string
  fileName: string
  size: number
  mtimeMs: number
  fingerprint: string
  mimeType: string
  base64: string
}

export interface DesktopFolderSyncWriteResult {
  absolutePath: string
  relativePath: string
  fileName: string
  size: number
  mtimeMs: number
  fingerprint: string
  mimeType: string
}

export interface DesktopFolderSyncConnectInput {
  folderPath: string
  accountId: string
  accountName?: string | null
  keepRunningInTray?: boolean
}

export interface DesktopFolderSyncAcknowledgeInput {
  relativePath: string
  size: number
  mtimeMs: number
  documentId?: string | null
  storagePath?: string | null
  direction?: 'local-to-vault' | 'vault-to-local'
}

export type DesktopFolderSyncEvent =
  | {
      type: 'state-changed'
      state: DesktopFolderSyncState
      reason?: string | null
    }
  | {
      type: 'local-files-detected'
      state: DesktopFolderSyncState
      reason?: string | null
      files: DesktopFolderSyncFileEntry[]
    }
  | {
      type: 'scan-complete'
      state: DesktopFolderSyncState
      reason?: string | null
      detectedCount: number
    }
  | {
      type: 'error'
      state: DesktopFolderSyncState
      reason?: string | null
      message: string
    }

export interface DesktopNotificationPayload {
  title: string
  body: string
  link?: string | null
  kind?: 'email' | 'reminder' | 'missed_call' | 'update' | 'system'
}

export interface DesktopUpdateState {
  phase: DesktopUpdatePhase
  version?: string | null
  releaseName?: string | null
  progress?: number | null
  error?: string | null
}

export interface DesktopUpdateCheckResult {
  ok: boolean
  updateAvailable?: boolean
  skipped?: boolean
  reason?: string
  state: DesktopUpdateState
}

export interface NodalDesktopBridge {
  isDesktop: true
  getUpdateState: () => Promise<DesktopUpdateState>
  checkForUpdatesNow: () => Promise<DesktopUpdateCheckResult>
  installUpdate: () => Promise<{ ok: boolean; reason?: string }>
  showNotification: (payload: DesktopNotificationPayload) => Promise<{ ok: boolean; reason?: string }>
  getFolderSyncState: () => Promise<DesktopFolderSyncState>
  chooseFolderForSync: () => Promise<string | null>
  connectFolderSync: (payload: DesktopFolderSyncConnectInput) => Promise<{ ok: boolean; reason?: string; state: DesktopFolderSyncState }>
  disconnectFolderSync: () => Promise<{ ok: boolean; reason?: string; state: DesktopFolderSyncState }>
  scanFolderSyncNow: () => Promise<{ ok: boolean; reason?: string; state: DesktopFolderSyncState }>
  setFolderSyncKeepRunningInTray: (keepRunningInTray: boolean) => Promise<{ ok: boolean; reason?: string; state: DesktopFolderSyncState }>
  openFolderSyncLocation: () => Promise<{ ok: boolean; reason?: string }>
  readFolderSyncFile: (absolutePath: string) => Promise<DesktopFolderSyncReadResult>
  writeFolderSyncFile: (payload: {
    relativePath: string
    fileName: string
    base64: string
    mimeType?: string | null
  }) => Promise<DesktopFolderSyncWriteResult>
  acknowledgeFolderSyncFile: (payload: DesktopFolderSyncAcknowledgeInput) => Promise<DesktopFolderSyncState>
  onUiEvent: (listener: (event: DesktopUiEvent) => void) => () => void
  onUpdateEvent: (listener: (state: DesktopUpdateState) => void) => () => void
  onFolderSyncEvent: (listener: (event: DesktopFolderSyncEvent) => void) => () => void
}

declare global {
  interface Window {
    nodalDesktop?: NodalDesktopBridge
  }
}
