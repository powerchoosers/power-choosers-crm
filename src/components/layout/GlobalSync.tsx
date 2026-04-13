
'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useZohoSync } from '@/hooks/useZohoSync'
import { useEmailTrackingNotifications } from '@/hooks/useEmailTrackingNotifications'
import { useDesktopNotifications } from '@/hooks/useDesktopNotifications'
import { playPing, playAlert } from '@/lib/audio'
import { useUIStore } from '@/store/uiStore'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { CheckCircle, Eye, CalendarCheck, CalendarX, Bell, Video } from 'lucide-react'
import { showInboxEmailToast } from '@/lib/inbox-email-toast'
import { consumeInboxToastId } from '@/lib/inbox-toast-dedupe'
import { getSignatureRequestKindConfig, normalizeSignatureRequestKind } from '@/lib/signature-request'
import { getFallbackEmailOwnerScope, isEmailInOwnerScope } from '@/lib/email-scope'
import { showDesktopNotification } from '@/lib/desktop-notifications'
import { forensicNotify } from '@/lib/notifications'

const FALLBACK_SHARED_INBOX_OWNERS: Record<string, string[]> = {
  'l.patterson@nodalpoint.io': ['signal@nodalpoint.io'],
}

async function resolveOwnerScope(user: { id?: string; email?: string | null }): Promise<string[]> {
  const primary = String(user.email || '').toLowerCase().trim()
  if (!primary) return []
  const shared = FALLBACK_SHARED_INBOX_OWNERS[primary] || []
  const owners = new Set<string>([primary, ...shared])
  if (user.id) {
    const { data: connections } = await supabase
      .from('zoho_connections')
      .select('email')
      .eq('user_id', user.id)
    ;(connections || []).forEach((conn: { email?: string | null }) => {
      const e = String(conn.email || '').toLowerCase().trim()
      if (e) owners.add(e)
    })
  }
  return Array.from(owners)
}

function extractEmailAddress(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const angle = raw.match(/<\s*([^>]+)\s*>/)
  const email = angle?.[1] || raw
  const normalized = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ''
}

function normalizeLookupText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function formatSourceLabel(value?: string | null) {
  const source = String(value || '').toLowerCase().trim()
  if (source === 'webhook') return 'Webhook'
  if (source === 'manual') return 'Manual sync'
  if (source === 'background') return 'Background sync'
  if (source === 'cron') return 'Cron sync'
  return ''
}

const CRM_ROUTE_PREFIXES = ['/network', '/market-data']

function isCrmRoute(pathname: string | null) {
  if (!pathname) return false
  return CRM_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function isRouteVisible(pathname: string | null, prefixes: string[]) {
  if (!pathname) return false
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function invalidateQueryGroup(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  shouldRefetchNow: boolean,
) {
  void queryClient.invalidateQueries({
    queryKey,
    refetchType: shouldRefetchNow ? 'active' : 'none',
  })
}

export function GlobalSync() {
  const pathname = usePathname()
  const router = useRouter()
  const onCrmRoute = isCrmRoute(pathname)
  const { user, loading, role } = useAuth()
  const { performSync } = useZohoSync()
  const queryClient = useQueryClient()
  const pathnameRef = useRef(pathname)
  const ownerScopeRef = useRef<string[]>([])
  const seenInboxSignalIdsRef = useRef<Set<string>>(new Set())
  const soundEnabled = useUIStore(s => s.soundEnabled)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  // Real-time email tracking notifications (opens/clicks) — CRM routes only
  useEmailTrackingNotifications({ enabled: onCrmRoute })
  useDesktopNotifications({ enabled: onCrmRoute })

  // Resolve owner scope once on mount (covers shared inboxes like signal@nodalpoint.io)
  useEffect(() => {
    if (!user || !onCrmRoute) return
    ownerScopeRef.current = getFallbackEmailOwnerScope(user.email)
    resolveOwnerScope(user).then(scope => { ownerScopeRef.current = scope })
  }, [user, onCrmRoute])

  // Automated Background Sync Lifecycle
  useEffect(() => {
    if (loading || !user || !onCrmRoute) return

    // Listen for signature_requests status changes (toasts + cache busting)
    // Only triggers toasts for the user who initiated the request (or admins)
    const sigChannel = supabase.channel('signature-request-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'signature_requests' },
        (payload) => {
          const oldRecord = payload.old as { status?: string }
          const newRecord = payload.new as { status?: string, created_by?: string, metadata?: any }
          const signatureKind = normalizeSignatureRequestKind(newRecord.metadata?.documentKind)
          const kindLabel = getSignatureRequestKindConfig(signatureKind).uiLabel
          const ownerEmail = String(
            newRecord.metadata?.ownerId ||
            newRecord.metadata?.agentEmail ||
            newRecord.created_by ||
            ''
          ).toLowerCase()
          const scope = ownerScopeRef.current.length > 0
            ? ownerScopeRef.current
            : [String(user.email || '').toLowerCase()]
          const isOwner = scope.includes(ownerEmail) || role === 'admin'
          const currentPath = pathnameRef.current
          const refreshDealsNow = isRouteVisible(currentPath, ['/network/contracts', '/network/accounts', '/network/contacts'])
          const refreshEmailsNow = isRouteVisible(currentPath, ['/network/emails', '/network/accounts', '/network/contacts'])
          const refreshDossierNow = isRouteVisible(currentPath, ['/network/accounts', '/network/contacts', '/network/targets', '/network/foundry', '/network/protocols'])
          const refreshVaultNow = isRouteVisible(currentPath, ['/network/vault'])

          if (oldRecord.status !== 'completed' && newRecord.status === 'completed') {
            if (isOwner) {
              if (soundEnabled) playPing();
              toast(`${kindLabel} Secured`, {
                icon: <CheckCircle className="w-4 h-4 text-emerald-500" />
              })
            }
            invalidateQueryGroup(queryClient, ['deals'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['deals-by-account'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['deals-by-contact'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['emails'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['entity-emails'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['emails-count'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['account'], refreshDossierNow)
            invalidateQueryGroup(queryClient, ['accounts'], refreshDossierNow)
            invalidateQueryGroup(queryClient, ['contact'], refreshDossierNow)
            invalidateQueryGroup(queryClient, ['contacts'], refreshDossierNow)
            invalidateQueryGroup(queryClient, ['vault-documents'], refreshVaultNow)
            invalidateQueryGroup(queryClient, ['signature-requests'], onCrmRoute)
            invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)
          } else if (oldRecord.status !== 'opened' && newRecord.status === 'opened') {
            if (isOwner) {
              if (soundEnabled) playPing();
              toast(`${kindLabel} Email Opened`, {
                icon: <Eye className="w-4 h-4 text-emerald-400" />
              })
            }
            invalidateQueryGroup(queryClient, ['deals'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['deals-by-account'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['deals-by-contact'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['emails'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['entity-emails'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['emails-count'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['signature-requests'], onCrmRoute)
            invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)
          } else if (oldRecord.status !== 'viewed' && newRecord.status === 'viewed') {
            if (isOwner) {
              if (soundEnabled) playPing();
              toast(`${kindLabel} Viewed by Signatory`, {
                icon: <Eye className="w-4 h-4 text-emerald-400" />
              })
            }
            invalidateQueryGroup(queryClient, ['deals'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['deals-by-account'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['deals-by-contact'], refreshDealsNow)
            invalidateQueryGroup(queryClient, ['emails'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['entity-emails'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['emails-count'], refreshEmailsNow)
            invalidateQueryGroup(queryClient, ['signature-requests'], onCrmRoute)
            invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] signature_requests channel connected')
        }
      })

    // Listen for new emails being inserted (Email Intelligence live refresh)
    const emailChannel = supabase.channel('email-insert-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'emails' },
        async (payload) => {
          const email = payload.new as {
            id: string
            from?: string
            subject?: string
            text?: string
            html?: string
            snippet?: string
            type?: string
            timestamp?: string
            createdAt?: string
            created_at?: string
            ownerId?: string
            attachments?: Array<unknown>
            metadata?: {
              ownerId?: string
              attachments?: Array<unknown>
              hasAttachments?: boolean
              fromAddress?: string
              replyToAddress?: string
            }
            contactId?: string | null
            accountId?: string | null
          }

          if (!email?.id) return
          if (String(email.type || '').toLowerCase() === 'tracking') return

          // Check against full owner scope (primary + shared inboxes like signal@nodalpoint.io)
          const userEmail = String(user.email || '').toLowerCase()
          const scope = ownerScopeRef.current.length > 0
            ? ownerScopeRef.current
            : [userEmail]

          if (!isEmailInOwnerScope(email, scope)) return

          // Refresh every inbox query family when a new owned email row lands.
          // This covers sent, received, reminder, sequence, and signature rows without a browser reload.
          const currentPath = pathnameRef.current
          const refreshEmailListNow = isRouteVisible(currentPath, ['/network/emails'])
          const refreshEntityEmailNow = isRouteVisible(currentPath, ['/network/accounts', '/network/contacts'])
          const refreshEmailDetailNow = isRouteVisible(currentPath, ['/network/emails'])
          invalidateQueryGroup(queryClient, ['emails'], refreshEmailListNow)
          invalidateQueryGroup(queryClient, ['entity-emails'], refreshEntityEmailNow)
          invalidateQueryGroup(queryClient, ['email'], refreshEmailDetailNow)
          invalidateQueryGroup(queryClient, ['email-thread'], refreshEmailDetailNow)
          invalidateQueryGroup(queryClient, ['emails-search'], refreshEmailListNow)
          invalidateQueryGroup(queryClient, ['emails-count'], refreshEmailListNow || refreshEntityEmailNow)
          invalidateQueryGroup(queryClient, ['emails-type-counts'], refreshEmailListNow)
          invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] emails channel connected')
        }
      })

    const callChannel = supabase.channel('call-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls' },
        (payload) => {
          const call = payload.new as { id?: string; contactId?: string | null; accountId?: string | null; contact_id?: string | null; account_id?: string | null }
          if (!call?.id) return

          const contactId = call.contactId || call.contact_id || null
          const accountId = call.accountId || call.account_id || null
          const currentPath = pathnameRef.current
          const refreshCallsNow = isRouteVisible(currentPath, ['/network/calls'])
          const refreshAccountNow = isRouteVisible(currentPath, ['/network/accounts'])
          const refreshContactNow = isRouteVisible(currentPath, ['/network/contacts'])

          invalidateQueryGroup(queryClient, ['calls'], refreshCallsNow)
          invalidateQueryGroup(queryClient, ['calls-count'], refreshCallsNow)
          if (contactId) invalidateQueryGroup(queryClient, ['contact-calls', contactId], refreshContactNow)
          if (accountId) invalidateQueryGroup(queryClient, ['account-calls', accountId], refreshAccountNow)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] calls channel connected')
        }
      })

    const notificationChannel = supabase.channel('email-notification-inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        async (payload) => {
          const notification = payload.new as {
            id?: string
            ownerId?: string
            type?: string
            read?: boolean
            data?: Record<string, any> | null
            metadata?: Record<string, any> | null
            title?: string | null
            message?: string | null
            link?: string | null
          }

          if (!notification?.id) return
          const notifType = String(notification.type || '').toLowerCase()
          if (notifType !== 'email' && notifType !== 'rsvp' && notifType !== 'reminder') return
          if (notification.read) return

          const ownerId = String(notification.ownerId || '').toLowerCase()
          const userEmail = String(user.email || '').toLowerCase()
          const scope = ownerScopeRef.current.length > 0
            ? ownerScopeRef.current
            : [userEmail]
          if (ownerId && !scope.includes(ownerId)) return

          const signalId = String(notification.data?.emailId || notification.id).trim()
          if (signalId && seenInboxSignalIdsRef.current.has(signalId)) return
          if (signalId && !consumeInboxToastId(signalId)) return
          if (signalId) seenInboxSignalIdsRef.current.add(signalId)

          const name = String(notification.data?.contactName || notification.title?.replace(/^New email from\s+/i, '') || 'CRM contact')
          const company = String(notification.data?.company || 'Unknown company')
          const subject = String(notification.data?.subject || notification.message || 'New email from CRM contact')
          const snippet = String(notification.data?.snippet || notification.message || 'New message received')
          const hasAttachments = Boolean(notification.data?.hasAttachments)
          const sourceLabel = formatSourceLabel(notification.data?.source || notification.metadata?.source)

          if (notifType === 'reminder') {
              const mins = notification.data?.reminderMinutes as number | undefined;
              const videoUrl = notification.data?.videoCallUrl as string | null | undefined;
              const isUrgent = mins === 15;
              if (useUIStore.getState().soundEnabled) isUrgent ? playAlert() : playPing();
              toast(
                  <div className="flex items-start gap-3">
                      {videoUrl ? (
                          <Video className="w-5 h-5 text-[#002FA7] shrink-0 mt-0.5" />
                      ) : (
                          <Bell className={`w-5 h-5 shrink-0 mt-0.5 ${isUrgent ? 'text-amber-400' : 'text-zinc-400'}`} />
                      )}
                      <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{notification.title}</span>
                          <span className="text-xs text-zinc-400">{notification.message}</span>
                          {videoUrl && (
                              <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                                 className="text-xs text-[#002FA7] underline mt-1 font-mono">
                                  Join Video Briefing →
                              </a>
                          )}
                      </div>
                  </div>,
                  { duration: isUrgent ? 30000 : 10000 }
              )
              void showDesktopNotification({
                title: notification.title || 'Reminder',
                body: notification.message || 'A follow-up is due.',
                link: videoUrl || notification.link || null,
                kind: 'reminder',
              })
              invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)
          } else if (notifType === 'rsvp') {
              const statusStr = String(notification.data?.status || 'UNKNOWN').toUpperCase();
              const isAccepted = statusStr === 'ACCEPTED' ||
                                 notification.title?.toLowerCase().includes('confirmed') ||
                                 notification.message?.toLowerCase().includes('accepted');

              // Immediately refresh task data so the badge updates alongside the toast
              invalidateQueryGroup(queryClient, ['tasks'], onCrmRoute)
              invalidateQueryGroup(queryClient, ['tasks-all-pending'], onCrmRoute)
              invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)

              if (useUIStore.getState().soundEnabled) playPing();

              toast(
                  <div className="flex items-center gap-3">
                      {isAccepted ? (
                          <CalendarCheck className="w-5 h-5 text-emerald-400" />
                      ) : (
                          <CalendarX className="w-5 h-5 text-red-400" />
                      )}
                      <div className="flex flex-col">
                          <span className="font-medium">{notification.title || 'RSVP Update'}</span>
                          <span className="text-xs text-zinc-400">{notification.message}</span>
                      </div>
                  </div>,
                  { duration: 6000 }
              )
          } else {
              showInboxEmailToast({
                  name,
                  company,
                  subject,
                  snippet,
                  hasAttachments,
                  photoUrl: (notification.data?.photoUrl as string | null) ?? null,
                  sourceLabel: sourceLabel || undefined,
                  emailId: signalId || undefined,
              })
              void showDesktopNotification({
                title: notification.title || 'New Email',
                body: notification.message || snippet,
                link: notification.link || null,
                kind: 'email',
              })
              invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)
          }

        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] notifications channel connected')
        }
      })

    const desktopUiUnsubscribe =
      typeof window !== 'undefined' && window.nodalDesktop?.onUiEvent
        ? window.nodalDesktop.onUiEvent((event) => {
            if (event.type === 'refresh-data') {
              forensicNotify.update('Refreshing data...')
              void performSync(true)
              invalidateQueryGroup(queryClient, ['notification-center-feed'], onCrmRoute)
            }

            if (event.type === 'navigate' && event.href) {
              router.push(event.href)
            }
          })
        : undefined

    return () => {
      supabase.removeChannel(sigChannel)
      supabase.removeChannel(emailChannel)
      supabase.removeChannel(callChannel)
      supabase.removeChannel(notificationChannel)
      desktopUiUnsubscribe?.()
    }
  }, [loading, user, performSync, queryClient, onCrmRoute, router])

  return null
}
