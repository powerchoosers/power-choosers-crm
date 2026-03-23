import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { Eye, MousePointer2 } from 'lucide-react'
import { playSoftPing } from '@/lib/audio'
import { useUIStore } from '@/store/uiStore'
import Link from 'next/link'

type TrackingOpenEvent = {
  openedAt?: string
  userAgent?: string
  ip?: string
  deviceType?: string
  referer?: string
  isBotFlagged?: boolean
}

type TrackingClickEvent = {
  clickedAt?: string
  userAgent?: string
  ip?: string
  deviceType?: string
  url?: string
  referer?: string
}

type TrackingEmailRow = {
  id: string
  subject?: string
  to?: string[]
  from?: string
  ownerId?: string
  openCount?: number
  clickCount?: number
  opens?: TrackingOpenEvent[]
  clicks?: TrackingClickEvent[]
  metadata?: { ownerId?: string; email_id?: string; emailId?: string }
}

function isLikelyBotEvent(value: TrackingOpenEvent | TrackingClickEvent | undefined) {
  if (!value) return false

  const deviceType = String(value.deviceType || '').toLowerCase()
  const userAgent = String(value.userAgent || '').toLowerCase()
  const referer = String(value.referer || '').toLowerCase()

  return (
    deviceType === 'bot' ||
    ('isBotFlagged' in value && value.isBotFlagged === true) ||
    userAgent.includes('googleimageproxy') ||
    userAgent.includes('feedfetcher') ||
    userAgent.includes('crawler') ||
    userAgent.includes('spider') ||
    userAgent.includes('bot') ||
    (referer.includes('mail.google.com') && userAgent.includes('mozilla/5.0 (windows nt 5.1; rv:11.0) gecko firefox/11.0'))
  )
}

function getEventTime(value: TrackingOpenEvent | TrackingClickEvent | undefined) {
  if (!value) return 0
  const raw = (value as TrackingOpenEvent).openedAt || (value as TrackingClickEvent).clickedAt || ''
  const parsed = Date.parse(String(raw || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function getLatestNewOpen(prevCount: number, opens?: TrackingOpenEvent[]) {
  const list = Array.isArray(opens) ? opens : []
  if (list.length <= prevCount) return null
  return list.slice(prevCount).filter(Boolean).at(-1) || null
}

function getLatestNewClick(prevCount: number, clicks?: TrackingClickEvent[]) {
  const list = Array.isArray(clicks) ? clicks : []
  if (list.length <= prevCount) return null
  return list.slice(prevCount).filter(Boolean).at(-1) || null
}

/**
 * Listens for real-time email tracking updates (opens/clicks) via Supabase Realtime.
 * Shows instant toast notifications when a CRM-sent email is opened or clicked.
 * Low impact: single channel subscription, filters by owner, dedupes rapid events.
 */
export function useEmailTrackingNotifications({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const lastEventRef = useRef<Map<string, number>>(new Map())
  const canonicalEventRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!enabled || !user?.email) return

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
          const email = payload.new as TrackingEmailRow
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

          const prevOpens = oldEmail?.openCount || 0
          const prevClicks = oldEmail?.clickCount || 0
          const newOpens = email.openCount || 0
          const newClicks = email.clickCount || 0

          const latestOpen = getLatestNewOpen(prevOpens, email.opens)
          const latestClick = getLatestNewClick(prevClicks, email.clicks)
          const openIsNew = newOpens > prevOpens && !!latestOpen && !isLikelyBotEvent(latestOpen)
          const clickIsNew = newClicks > prevClicks && !!latestClick && !isLikelyBotEvent(latestClick)

          if (!openIsNew && !clickIsNew) return

          const eventType = openIsNew && clickIsNew
            ? getEventTime(latestClick) >= getEventTime(latestOpen)
              ? 'click'
              : 'open'
            : clickIsNew
              ? 'click'
              : 'open'

          const latestEvent = eventType === 'click' ? latestClick : latestOpen
          if (!latestEvent) return

          const eventSignature = eventType === 'click'
            ? `click:${'clickedAt' in latestEvent ? latestEvent.clickedAt || '' : ''}:${'url' in latestEvent ? latestEvent.url || '' : ''}:${latestEvent.userAgent || ''}:${latestEvent.deviceType || ''}`
            : `open:${'openedAt' in latestEvent ? latestEvent.openedAt || '' : ''}:${latestEvent.userAgent || ''}:${latestEvent.deviceType || ''}:${latestEvent.referer || ''}`

          const now = Date.now()
          const lastTime = lastEventRef.current.get(eventSignature) || 0
          if (now - lastTime < 5000) return
          lastEventRef.current.set(eventSignature, now)

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
          const canonicalEventKey = `${routeEmailId}:${eventType}:${eventSignature}`
          const lastCanonicalTime = canonicalEventRef.current.get(canonicalEventKey) || 0
          // Sequence tracking updates both tracking row and parent row. Keep one toast.
          if (now - lastCanonicalTime < 9000) return
          canonicalEventRef.current.set(canonicalEventKey, now)

          if (!isContractEmail) {
            if (eventType === 'click') {
              if (soundEnabled) playSoftPing()
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
            } else {
              if (soundEnabled) playSoftPing()
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
  }, [user?.email, enabled])
}
