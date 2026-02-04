'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGmailSync } from '@/hooks/useGmailSync'

export function GlobalSync() {
  const { user, loading } = useAuth()
  const { syncGmail, isSyncing } = useGmailSync()
  const hasInitialSynced = useRef(false)
  const [hasGmailToken, setHasGmailToken] = useState(false)

  // Check for existing Gmail token on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = sessionStorage.getItem('gmail_oauth_token')
      setHasGmailToken(!!token)
    }
  }, [])

  // Initial sync on app load - ONLY after auth is fully loaded
  useEffect(() => {
    // Critical: Wait for Firebase auth to be fully initialized
    if (loading || !user || isSyncing || hasInitialSynced.current) return
    
    hasInitialSynced.current = true
    
    const timer = setTimeout(() => {
      const hasCachedToken = sessionStorage.getItem('gmail_oauth_token')
      
      if (hasCachedToken) {
        // We have a token, sync silently in the background
        syncGmail(user, { silent: true })
        setHasGmailToken(true)
      }
      // If no token, user needs to manually connect from /network/emails
    }, 3000) // 3 second delay - wait for everything to load

    return () => clearTimeout(timer)
  }, [loading, user, syncGmail, isSyncing])

  // Background interval sync (every 3 minutes) - ONLY if we have a token
  useEffect(() => {
    if (!user || !hasGmailToken || loading) return

    const interval = setInterval(() => {
      const hasCachedToken = sessionStorage.getItem('gmail_oauth_token')
      if (hasCachedToken) {
        syncGmail(user, { silent: true })
      }
    }, 3 * 60 * 1000) // Every 3 minutes

    return () => clearInterval(interval)
  }, [user, syncGmail, hasGmailToken, loading])

  return null
}
