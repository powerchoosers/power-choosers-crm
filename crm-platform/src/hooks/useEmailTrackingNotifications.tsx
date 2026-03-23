import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { Eye, MousePointer2 } from 'lucide-react'
import { playPing } from '@/lib/audio'
import { useUIStore } from '@/store/uiStore'
import Link from 'next/link'

/**
 * Listens for real-time email tracking updates (opens/clicks) via Supabase Realtime.
 * Shows instant toast notifications when a CRM-sent email is opened or clicked.
 * Low impact: single channel subscription, filters by owner, dedupes rapid events.
 */
export function useEmailTrackingNotifications() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
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
            ownerId?: string
            openCount?: number
            clickCount?: number
            metadata?: { ownerId?: string; email_id?: string; emailId?: string }
          }
          // Only CRM-sent emails use tracked IDs (zoho_, sig_, sig_exec_, seq_exec_)
          if (!email.id || (!email.id.startsWith('zoho_') && !email.id.startsWith('sig_') && !email.id.startsWith('sig_exec_') && !email.id.startsWith('seq_exec_'))) return

          // Signature/contract emails are handled exclusively by GlobalSync's contract notifications.
          // Still update React Query caches below for live counter updates, but skip toasts.
          const isContractEmail = email.id.startsWith('sig_') || email.id.startsWith('sig_exec_')

          const oldEmail = payload.old as {
            openCount?: number
            clickCount?: number
          } | null

          // Only notify for current user's emails (ownerId from metadata, or from address as fallback if metadata was wiped)
          const ownerEmail = String(email.metadata?.ownerId || email.ownerId || '').toLowerCase()
          const fromEmail = typeof email.from === 'string' && email.from.includes('@')
            ? email.from.replace(/^.*<([^>]+)>.*$/, '$1').trim().toLowerCase()
            : ''
          const userEmail = String(user.email || '').toLowerCase()
          const normalizeOwner = (value: string) => value.replace('@getnodalpoint.com', '@nodalpoint.io')
          const sameOwner = normalizeOwner(ownerEmail) === normalizeOwner(userEmail)
          const sameFrom = normalizeOwner(fromEmail) === normalizeOwner(userEmail)
          const isOwner = sameOwner || sameFrom
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

          // Update React Query caches for instant UI update in the table
          queryClient.setQueriesData({ queryKey: ['emails'] }, (oldData: any) => {
            if (!oldData || !oldData.pages) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map((page: any) => ({
                ...page,
                emails: page.emails.map((e: any) =>
                  e.id === email.id
                    ? { ...e, openCount: newOpens, clickCount: newClicks }
                    : e
                )
              }))
            };
          });

          queryClient.setQueriesData({ queryKey: ['emails-search'] }, (oldData: any) => {
            if (!Array.isArray(oldData)) return oldData;
            return oldData.map((e: any) =>
              e.id === email.id
                ? { ...e, openCount: newOpens, clickCount: newClicks }
                : e
            );
          });

          const soundEnabled = useUIStore.getState().soundEnabled

          // Format recipient info
          const recipient = Array.isArray(email.to) ? email.to[0] : 'recipient'
          const subject = email.subject?.slice(0, 35) || 'your email'
          const subjectTruncated = email.subject && email.subject.length > 35 ? '...' : ''
          const routeEmailId = String(email.metadata?.email_id || email.metadata?.emailId || email.id)

          if (!isContractEmail) {
            if (clicked) {
              if (soundEnabled) playPing()
              toast(
                <Link href={`/network/emails/${routeEmailId}`} className="no-underline block w-full">
                  <div className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                    <MousePointer2 className="w-4 h-4 text-[#002FA7]" />
                    <div className="flex flex-col">
                      <span className="font-medium text-white">Link clicked by {recipient}</span>
                      <span className="text-xs text-zinc-400">{subject}{subjectTruncated}</span>
                    </div>
                  </div>
                </Link>,
                { duration: 5000 }
              )
            } else if (opened) {
              if (soundEnabled) playPing()
              toast(
                <Link href={`/network/emails/${routeEmailId}`} className="no-underline block w-full">
                  <div className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="font-medium text-white">Email opened by {recipient}</span>
                      <span className="text-xs text-zinc-400">{subject}{subjectTruncated}</span>
                    </div>
                  </div>
                </Link>,
                { duration: 5000 }
              )
            }
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [user?.email])
}
