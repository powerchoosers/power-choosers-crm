
'use client'

import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useZohoSync } from '@/hooks/useZohoSync'
import { useEmailTrackingNotifications } from '@/hooks/useEmailTrackingNotifications'

export function GlobalSync() {
  const { user, loading } = useAuth()
  const { performSync } = useZohoSync()

  // Real-time email tracking notifications (opens/clicks)
  useEmailTrackingNotifications()

  // Automated Background Sync Lifecycle
  // useZohoSync already handles internal intervals and user-based auth
  useEffect(() => {
    if (loading || !user) return

    // Immediately trigger a sync on load (silent)
    const timer = setTimeout(() => {
      performSync(true)
    }, 1000)

    return () => clearTimeout(timer)
  }, [loading, user, performSync])

  return null
}
