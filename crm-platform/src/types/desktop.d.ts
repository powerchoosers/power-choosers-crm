export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

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
  onUpdateEvent: (listener: (state: DesktopUpdateState) => void) => () => void
}

declare global {
  interface Window {
    nodalDesktop?: NodalDesktopBridge
  }
}
