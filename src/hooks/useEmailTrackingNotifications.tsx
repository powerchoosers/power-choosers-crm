import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { Eye, MousePointer2 } from 'lucide-react'
import { playSoftPing } from '@/lib/audio'
import { useUIStore } from '@/store/uiStore'
import Link from 'next/link'
import {
  extractRelatedEmailIds,
  getFallbackEmailOwnerScope,
  isEmailInOwnerScope,
  isTrackedEmailId,
  resolveEmailOwnerScope,
} from '@/lib/email-scope'

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
  status?: string
  openCount?: number
  clickCount?: number
  opens?: TrackingOpenEvent[]
  clicks?: TrackingClickEvent[]
  sentAt?: string | null
  updatedAt?: string | null
  is_read?: boolean
  metadata?: {
    ownerId?: string
    owner_id?: string
    email_id?: string
    emailId?: string
    trackingId?: string
    tracking_id?: string
  }
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

function mergeEmailSnapshot(existing: any, incoming: TrackingEmailRow) {
  if (!existing || !incoming?.id) {
    return existing
  }

  const metadata = {
    ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
    ...(incoming.metadata && typeof incoming.metadata === 'object' ? incoming.metadata : {}),
  }

  return {
    ...existing,
    openCount: typeof incoming.openCount === 'number' ? incoming.openCount : existing.openCount,
    clickCount: typeof incoming.clickCount === 'number' ? incoming.clickCount : existing.clickCount,
    status: incoming.status ?? existing.status,
    sentAt: incoming.sentAt ?? existing.sentAt,
    updatedAt: incoming.updatedAt ?? existing.updatedAt,
    unread: typeof incoming.is_read === 'boolean' ? !incoming.is_read : existing.unread,
    metadata,
  }
}

function patchEmailArray(oldData: any, incoming: TrackingEmailRow, relatedIds: string[]) {
  if (!Array.isArray(oldData)) return oldData
  const idSet = new Set(relatedIds)
  return oldData.map((entry: any) => {
    if (!entry?.id || !idSet.has(String(entry.id))) return entry
    return mergeEmailSnapshot(entry, incoming)
  })
}

function patchInfiniteEmailPages(oldData: any, incoming: TrackingEmailRow, relatedIds: string[]) {
  if (!oldData?.pages) return oldData
  const idSet = new Set(relatedIds)
  return {
    ...oldData,
    pages: oldData.pages.map((page: any) => {
      if (!page) return page
      if (Array.isArray(page.emails)) {
        return {
          ...page,
          emails: page.emails.map((entry: any) => {
            if (!entry?.id || !idSet.has(String(entry.id))) return entry
            return mergeEmailSnapshot(entry, incoming)
          }),
        }
      }
      return page
    }),
  }
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
  const ownerScopeRef = useRef<string[]>([])

  useEffect(() => {
    if (!enabled || !user?.email) return

    ownerScopeRef.current = getFallbackEmailOwnerScope(user.email)
    resolveEmailOwnerScope(user).then((scope) => {
      if (scope.length > 0) {
        ownerScopeRef.current = scope
      }
    })

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
          if (!email?.id) return

          // Signature emails still use GlobalSync for open/view/completed toasts.
          // We let click events through here so the sender still sees link-click activity.
          const isSignatureEmail = email.id.startsWith('sig_') || email.id.startsWith('sig_exec_')
          const isTrackedEmail = isTrackedEmailId(email.id)

          const oldEmail = payload.old as {
            openCount?: number
            clickCount?: number
            status?: string
            sentAt?: string | null
            updatedAt?: string | null
          } | null

          const scope = ownerScopeRef.current.length > 0
            ? ownerScopeRef.current
            : getFallbackEmailOwnerScope(user.email)
          if (!isEmailInOwnerScope(email, scope)) return

          const prevOpens = oldEmail?.openCount || 0
          const prevClicks = oldEmail?.clickCount || 0
          const newOpens = email.openCount || 0
          const newClicks = email.clickCount || 0

          const latestOpen = getLatestNewOpen(prevOpens, email.opens)
          const latestClick = getLatestNewClick(prevClicks, email.clicks)
          const openIsNew = newOpens > prevOpens && !!latestOpen && !isLikelyBotEvent(latestOpen)
          const clickIsNew = newClicks > prevClicks && !!latestClick && !isLikelyBotEvent(latestClick)

          const relatedIds = extractRelatedEmailIds(email)

          // Keep the list and search caches in sync instantly. Detail and thread views
          // are invalidated below so the active page refetches with the latest row state.
          queryClient.setQueriesData({ queryKey: ['emails'] }, (oldData: any) =>
            patchInfiniteEmailPages(oldData, email, relatedIds)
          )
          queryClient.setQueriesData({ queryKey: ['emails-search'] }, (oldData: any) =>
            patchEmailArray(oldData, email, relatedIds)
          )

          queryClient.invalidateQueries({ queryKey: ['email'] })
          queryClient.invalidateQueries({ queryKey: ['email-thread'] })
          queryClient.invalidateQueries({ queryKey: ['entity-emails'] })
          queryClient.invalidateQueries({ queryKey: ['emails-count'] })
          queryClient.invalidateQueries({ queryKey: ['emails-type-counts'] })

          const soundEnabled = useUIStore.getState().soundEnabled

          if (isTrackedEmail && (openIsNew || clickIsNew)) {
            const eventType = openIsNew && clickIsNew
              ? getEventTime(latestClick) >= getEventTime(latestOpen)
                ? 'click'
                : 'open'
              : clickIsNew
                ? 'click'
                : 'open'

            const latestEvent = eventType === 'click' ? latestClick : latestOpen
            if (latestEvent) {
              const eventSignature = eventType === 'click'
                ? `click:${'clickedAt' in latestEvent ? latestEvent.clickedAt || '' : ''}:${'url' in latestEvent ? latestEvent.url || '' : ''}:${latestEvent.userAgent || ''}:${latestEvent.deviceType || ''}`
                : `open:${'openedAt' in latestEvent ? latestEvent.openedAt || '' : ''}:${latestEvent.userAgent || ''}:${latestEvent.deviceType || ''}:${latestEvent.referer || ''}`

              const now = Date.now()
              const lastTime = lastEventRef.current.get(eventSignature) || 0
              if (now - lastTime < 5000) return
              lastEventRef.current.set(eventSignature, now)

              // Sequence/signature tracking updates both the tracking row and parent row.
              const recipient = Array.isArray(email.to) ? email.to[0] : 'recipient'
              const subject = email.subject?.slice(0, 35) || 'your email'
              const subjectTruncated = email.subject && email.subject.length > 35 ? '...' : ''
              const routeEmailId = String(email.metadata?.email_id || email.metadata?.emailId || email.id)
              const canonicalEventKey = `${routeEmailId}:${eventType}:${eventSignature}`
              const lastCanonicalTime = canonicalEventRef.current.get(canonicalEventKey) || 0
              if (now - lastCanonicalTime < 9000) return
              canonicalEventRef.current.set(canonicalEventKey, now)

              if (isSignatureEmail) {
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
                }
                return
              }

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
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [user?.id, user?.email, enabled])
}
