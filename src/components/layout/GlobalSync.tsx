'use client'

import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGmailSync } from '@/hooks/useGmailSync'

export function GlobalSync() {
  const { user } = useAuth()
  const { syncGmail, isSyncing } = useGmailSync()

  useEffect(() => {
    if (user && !isSyncing) {
      // Auto-trigger sync on initial mount/login
      // We use a silent sync to avoid disruptive popups
      const timer = setTimeout(() => {
        syncGmail(user, { silent: true })
      }, 1000) // Reduced to 1s for more immediate sync

      return () => clearTimeout(timer)
    }
  }, [user, syncGmail]) // Removed isSyncing from dependencies to only run once on mount/login

  // Background interval sync (every 5 minutes)
  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      syncGmail(user, { silent: true })
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user, syncGmail])

  return null
}
