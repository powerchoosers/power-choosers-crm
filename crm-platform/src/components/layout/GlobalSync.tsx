'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGmailSync } from '@/hooks/useGmailSync'

export function GlobalSync() {
  const { user } = useAuth()
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

  // Initial sync on app load
  useEffect(() => {
    if (user && !isSyncing && !hasInitialSynced.current) {
      hasInitialSynced.current = true
      
      const timer = setTimeout(() => {
        // First sync: Use silent mode if we have a token, otherwise prompt for auth
        // This will trigger OAuth popup on first use, then be silent thereafter
        const hasCachedToken = sessionStorage.getItem('gmail_oauth_token')
        
        if (hasCachedToken) {
          // We have a token, sync silently
          syncGmail(user, { silent: true })
        } else {
          // No token yet, trigger auth flow (non-silent)
          // User will see OAuth popup ONCE on first CRM load
          syncGmail(user, { silent: false })
          setHasGmailToken(true)
        }
      }, 2000) // 2 second delay for smooth app load

      return () => clearTimeout(timer)
    }
  }, [user, syncGmail, isSyncing])

  // Background interval sync (every 3 minutes)
  useEffect(() => {
    if (!user || !hasGmailToken) return

    const interval = setInterval(() => {
      const hasCachedToken = sessionStorage.getItem('gmail_oauth_token')
      if (hasCachedToken) {
        syncGmail(user, { silent: true })
      }
    }, 3 * 60 * 1000) // Every 3 minutes

    return () => clearInterval(interval)
  }, [user, syncGmail, hasGmailToken])

  return null
}
