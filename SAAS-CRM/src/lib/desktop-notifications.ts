export interface DesktopNotificationPayload {
  title: string
  body: string
  link?: string | null
  kind?: 'email' | 'reminder' | 'missed_call' | 'update' | 'system'
}

export function isDesktopBridgeAvailable() {
  return typeof window !== 'undefined' && Boolean(window.nodalDesktop?.isDesktop)
}

export async function showDesktopNotification(payload: DesktopNotificationPayload) {
  if (!isDesktopBridgeAvailable() || !window.nodalDesktop?.showNotification) {
    return { ok: false, reason: 'bridge_unavailable' as const }
  }

  try {
    return await window.nodalDesktop.showNotification(payload)
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'notification_failed',
    } as const
  }
}
