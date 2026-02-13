import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { Eye, MousePointer2 } from 'lucide-react'

/**
 * Listens for real-time email tracking updates (opens/clicks) via Supabase Realtime.
 * Shows instant toast notifications when a CRM-sent email is opened or clicked.
 * Low impact: single channel subscription, filters by owner, dedupes rapid events.
 */
export function useEmailTrackingNotifications() {
  const { user } = useAuth()
  const lastEventRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!user?.email) return

    // Listen to all email UPDATEs (Realtime doesn't support LIKE filter); filter in callback
    const channel = supabase
      .channel('email-tracking-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'emails',
        },
        (payload) => {
          const email = payload.new as {
            id: string
            subject?: string
            to?: string[]
            from?: string
            openCount?: number
            clickCount?: number
            metadata?: { ownerId?: string }
          }
          // Only CRM-sent emails have IDs like gmail_* or zoho_*
          if (!email.id || (!email.id.startsWith('gmail_') && !email.id.startsWith('zoho_'))) return

          const oldEmail = payload.old as {
            openCount?: number
            clickCount?: number
          } | null

          // Only notify for current user's emails (ownerId from metadata, or from address as fallback if metadata was wiped)
          const ownerEmail = email.metadata?.ownerId?.toLowerCase()
          const fromEmail = typeof email.from === 'string' && email.from.includes('@')
            ? email.from.replace(/^.*<([^>]+)>.*$/, '$1').trim().toLowerCase()
            : ''
          const isOwner = ownerEmail === user.email?.toLowerCase() || fromEmail === user.email?.toLowerCase()
          if (!isOwner) return

          // Dedupe: max 1 notification per email per 5 seconds
          const now = Date.now()
          const lastTime = lastEventRef.current.get(email.id) || 0
          if (now - lastTime < 5000) return
          lastEventRef.current.set(email.id, now)

          const prevOpens = oldEmail?.openCount || 0
          const prevClicks = oldEmail?.clickCount || 0
          const newOpens = email.openCount || 0
          const newClicks = email.clickCount || 0

          // Determine what changed
          const opened = newOpens > prevOpens
          const clicked = newClicks > prevClicks

          if (!opened && !clicked) return

          // Format recipient info
          const recipient = Array.isArray(email.to) ? email.to[0] : 'recipient'
          const subject = email.subject?.slice(0, 35) || 'your email'
          const subjectTruncated = email.subject && email.subject.length > 35 ? '...' : ''

          if (clicked) {
            toast.success(
              <div className="flex items-center gap-2">
                <MousePointer2 className="w-4 h-4 text-[#002FA7]" />
                <div className="flex flex-col">
                  <span className="font-medium">Link clicked by {recipient}</span>
                  <span className="text-xs text-zinc-400">{subject}{subjectTruncated}</span>
                </div>
              </div>,
              { duration: 5000 }
            )
          } else if (opened) {
            toast.success(
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <div className="flex flex-col">
                  <span className="font-medium">Email opened by {recipient}</span>
                  <span className="text-xs text-zinc-400">{subject}{subjectTruncated}</span>
                </div>
              </div>,
              { duration: 5000 }
            )
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [user?.email])
}
