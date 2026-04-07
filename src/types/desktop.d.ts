export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

export type DesktopUiEvent =
  | { type: 'open-command-bar' }
  | { type: 'refresh-data' }
  | { type: 'open-csv-import' }
  | { type: 'open-file-attach' }
  | { type: 'navigate'; href: string }

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
  onUiEvent: (listener: (event: DesktopUiEvent) => void) => () => void
  onUpdateEvent: (listener: (state: DesktopUpdateState) => void) => () => void
}

declare global {
  interface Window {
    nodalDesktop?: NodalDesktopBridge
  }
}
