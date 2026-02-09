'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGmailSync } from '@/hooks/useGmailSync'
import { useEmailTrackingNotifications } from '@/hooks/useEmailTrackingNotifications'

const OPEN_SYNC_DELAY_MS = 2000
const BACKGROUND_SYNC_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes

export function GlobalSync() {
  const { user, loading } = useAuth()
  const { syncGmail, isSyncing } = useGmailSync()
  const hasTriggeredOpenSync = useRef(false)

  // Real-time email tracking notifications (opens/clicks)
  useEmailTrackingNotifications()

  // On page open: only attempt silent sync (no auth popup - browsers block non-click popups)
  // User must click Net_Sync button once to auth; after that, silent syncs work forever
  useEffect(() => {
    if (loading || !user || hasTriggeredOpenSync.current) return

    hasTriggeredOpenSync.current = true
    const hasCachedToken = typeof window !== 'undefined' && !!(
      sessionStorage.getItem('gmail_oauth_token') ||
      localStorage.getItem('gmail_oauth_token') ||
      localStorage.getItem('pc:googleAccessToken')
    )

    // Only sync if we already have a token; skip if no token (user hasn't connected Gmail yet)
    if (hasCachedToken) {
      const timer = setTimeout(() => {
        syncGmail(user, { silent: true })
      }, OPEN_SYNC_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [loading, user, syncGmail])

  // Background interval: keep syncing every 3 min while on /network (only if token exists)
  useEffect(() => {
    if (!user || loading) return

    const interval = setInterval(() => {
      const hasCachedToken = sessionStorage.getItem('gmail_oauth_token') ||
        localStorage.getItem('gmail_oauth_token') ||
        localStorage.getItem('pc:googleAccessToken')
      if (hasCachedToken) {
        syncGmail(user, { silent: true })
      }
    }, BACKGROUND_SYNC_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [user, syncGmail, loading])

  return null
}
