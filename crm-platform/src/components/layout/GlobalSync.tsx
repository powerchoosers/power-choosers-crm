'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGmailSync } from '@/hooks/useGmailSync'

const OPEN_SYNC_DELAY_MS = 1200
const BACKGROUND_SYNC_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes

export function GlobalSync() {
  const { user, loading } = useAuth()
  const { syncGmail, isSyncing } = useGmailSync()
  const hasTriggeredOpenSync = useRef(false)

  // As soon as user opens /network: prompt Net Sync with auth if no token, else sync silently
  useEffect(() => {
    if (loading || !user || hasTriggeredOpenSync.current) return

    hasTriggeredOpenSync.current = true
    const hasCachedToken = typeof window !== 'undefined' && !!sessionStorage.getItem('gmail_oauth_token')

    const timer = setTimeout(() => {
      if (hasCachedToken) {
        syncGmail(user, { silent: true })
      } else {
        // No token: trigger sync so auth popup runs and user can connect Gmail
        syncGmail(user, { silent: false })
      }
    }, OPEN_SYNC_DELAY_MS)

    return () => clearTimeout(timer)
  }, [loading, user, syncGmail])

  // Background interval: keep syncing every 3 min while on /network (check token at interval time)
  useEffect(() => {
    if (!user || loading) return

    const interval = setInterval(() => {
      const hasCachedToken = sessionStorage.getItem('gmail_oauth_token')
      if (hasCachedToken) {
        syncGmail(user, { silent: true })
      }
    }, BACKGROUND_SYNC_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [user, syncGmail, loading])

  return null
}
