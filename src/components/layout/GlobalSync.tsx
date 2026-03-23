
'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useZohoSync } from '@/hooks/useZohoSync'
import { useEmailTrackingNotifications } from '@/hooks/useEmailTrackingNotifications'
import { playPing, playAlert } from '@/lib/audio'
import { useUIStore } from '@/store/uiStore'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { CheckCircle, Eye, CalendarCheck, CalendarX, Bell, Video } from 'lucide-react'
import { showInboxEmailToast } from '@/lib/inbox-email-toast'
import { consumeInboxToastId } from '@/lib/inbox-toast-dedupe'

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

export function GlobalSync() {
  const { user, loading } = useAuth()
  const { performSync } = useZohoSync()
  const queryClient = useQueryClient()
  const ownerScopeRef = useRef<string[]>([])
  const seenInboxSignalIdsRef = useRef<Set<string>>(new Set())
  const soundEnabled = useUIStore(s => s.soundEnabled)

  // Real-time email tracking notifications (opens/clicks)
  useEmailTrackingNotifications()

  // Resolve owner scope once on mount (covers shared inboxes like signal@nodalpoint.io)
  useEffect(() => {
    if (!user) return
    resolveOwnerScope(user).then(scope => { ownerScopeRef.current = scope })
  }, [user])

  // Automated Background Sync Lifecycle
  useEffect(() => {
    if (loading || !user) return

    // Immediately trigger a sync on load (silent)
    const timer = setTimeout(() => {
      performSync(true)
    }, 1000)

    // Listen for signature_requests status changes (toasts + cache busting)
    // Only triggers toasts for the user who initiated the request (or admins)
    const sigChannel = supabase.channel('signature-request-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'signature_requests' },
        (payload) => {
          const oldRecord = payload.old as { status?: string }
          const newRecord = payload.new as { status?: string, created_by?: string, metadata?: any }

          const isOwner = newRecord.created_by === user.id || newRecord.metadata?.ownerId === user.email || user.email === 'l.patterson@nodalpoint.io'

          const invalidateDeals = () => {
            queryClient.invalidateQueries({ queryKey: ['deals'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })
          }

          const invalidateEmails = () => {
            queryClient.invalidateQueries({ queryKey: ['emails'] })
            queryClient.invalidateQueries({ queryKey: ['entity-emails'] })
            queryClient.invalidateQueries({ queryKey: ['emails-count'] })
          }

          const invalidateDossierState = async () => {
            await queryClient.invalidateQueries({ queryKey: ['account'] })
            await queryClient.invalidateQueries({ queryKey: ['accounts'] })
            await queryClient.invalidateQueries({ queryKey: ['contact'] })
            await queryClient.invalidateQueries({ queryKey: ['contacts'] })
            await queryClient.refetchQueries({ queryKey: ['account'], type: 'active' })
            await queryClient.refetchQueries({ queryKey: ['contact'], type: 'active' })
          }

          if (oldRecord.status !== 'completed' && newRecord.status === 'completed') {
            if (isOwner) {
              if (soundEnabled) playPing();
              toast('Contract Secured', {
                icon: <CheckCircle className="w-4 h-4 text-emerald-500" />
              })
            }
            invalidateDeals()
            invalidateEmails()
            void invalidateDossierState()
            queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
            queryClient.invalidateQueries({ queryKey: ['signature-requests'] })
          } else if (oldRecord.status !== 'opened' && newRecord.status === 'opened') {
            if (isOwner) {
              if (soundEnabled) playPing();
              toast('Signature Email Opened', {
                icon: <Eye className="w-4 h-4 text-emerald-400" />
              })
            }
            invalidateDeals()
            invalidateEmails()
            queryClient.invalidateQueries({ queryKey: ['signature-requests'] })
          } else if (oldRecord.status !== 'viewed' && newRecord.status === 'viewed') {
            if (isOwner) {
              if (soundEnabled) playPing();
              toast('Contract Viewed by Signatory', {
                icon: <Eye className="w-4 h-4 text-emerald-400" />
              })
            }
            invalidateDeals()
            invalidateEmails()
            queryClient.invalidateQueries({ queryKey: ['signature-requests'] })
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

          const normalizedType = String(email.type || '').toLowerCase()
          if (normalizedType !== 'received' && normalizedType !== 'uplink_in') return

          // Check against full owner scope (primary + shared inboxes like signal@nodalpoint.io)
          const ownerId = String(email.metadata?.ownerId || email.ownerId || '').toLowerCase()
          const userEmail = String(user.email || '').toLowerCase()
          const scope = ownerScopeRef.current.length > 0
            ? ownerScopeRef.current
            : [userEmail]
          
          if (ownerId && !scope.includes(ownerId)) return

          // Always refresh inbox queries on new inbound rows for this owner.
          // Notification enrichment can fail (e.g., sender is display-name-only), but list refresh should not.
          queryClient.invalidateQueries({ queryKey: ['emails'] })
          queryClient.invalidateQueries({ queryKey: ['entity-emails'] })
          queryClient.invalidateQueries({ queryKey: ['emails-count'] })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] emails channel connected')
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
          } else if (notifType === 'rsvp') {
              const statusStr = String(notification.data?.status || 'UNKNOWN').toUpperCase();
              const isAccepted = statusStr === 'ACCEPTED' ||
                                 notification.title?.toLowerCase().includes('confirmed') ||
                                 notification.message?.toLowerCase().includes('accepted');

              // Immediately refresh task data so the badge updates alongside the toast
              queryClient.invalidateQueries({ queryKey: ['tasks'] })
              queryClient.invalidateQueries({ queryKey: ['tasks-all-pending'] })

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
          }

        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] notifications channel connected')
        }
      })

    return () => {
      clearTimeout(timer)
      supabase.removeChannel(sigChannel)
      supabase.removeChannel(emailChannel)
      supabase.removeChannel(notificationChannel)
    }
  }, [loading, user, performSync, queryClient])

  useEffect(() => {
    if (loading || !user?.email) return

    let cancelled = false

    const pollNotifications = async () => {
      const scope = ownerScopeRef.current.length > 0
        ? ownerScopeRef.current
        : [String(user.email || '').toLowerCase()]

      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('notifications')
        .select('id, ownerId, title, message, type, read, link, data, metadata, createdAt')
        .in('ownerId', scope)
        .eq('read', false)
        .gte('createdAt', cutoff)
        .order('createdAt', { ascending: true })
        .limit(20)

      if (error || cancelled || !Array.isArray(data)) return

      for (const row of data) {
        const payload = (row.data && typeof row.data === 'object') ? row.data as Record<string, any> : {}
        const signalId = String(payload.emailId || row.id || '').trim()
        if (!signalId || seenInboxSignalIdsRef.current.has(signalId)) continue
        if (!consumeInboxToastId(signalId)) continue

        seenInboxSignalIdsRef.current.add(signalId)

        const notifType = String(row.type || '').toLowerCase();

        if (notifType === 'reminder') {
            const mins = payload.reminderMinutes as number | undefined;
            const videoUrl = payload.videoCallUrl as string | null | undefined;
            const isUrgent = mins === 15;
            if (soundEnabled) isUrgent ? playAlert() : playPing();
            toast(
                <div className="flex items-start gap-3">
                    {videoUrl ? (
                        <Video className="w-5 h-5 text-[#002FA7] shrink-0 mt-0.5" />
                    ) : (
                        <Bell className={`w-5 h-5 shrink-0 mt-0.5 ${isUrgent ? 'text-amber-400' : 'text-zinc-400'}`} />
                    )}
                    <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm">{row.title}</span>
                        <span className="text-xs text-zinc-400">{row.message}</span>
                        {videoUrl && (
                            <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                               className="text-xs text-[#002FA7] underline mt-1 font-mono">
                                Join Video Briefing →
                            </a>
                        )}
                    </div>
                </div>,
                { duration: isUrgent ? 30000 : 10000 }
            );
        } else if (notifType === 'rsvp') {
            const statusStr = String(payload.status || 'UNKNOWN').toUpperCase();
            const isAccepted = statusStr === 'ACCEPTED' ||
                               row.title?.toLowerCase().includes('confirmed') ||
                               row.message?.toLowerCase().includes('accepted');

            // Refresh task data so badge updates
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks-all-pending'] })

            if (soundEnabled) playPing();
            toast(
                <div className="flex items-center gap-3">
                    {isAccepted ? (
                        <CalendarCheck className="w-5 h-5 text-emerald-400" />
                    ) : (
                        <CalendarX className="w-5 h-5 text-red-400" />
                    )}
                    <div className="flex flex-col">
                        <span className="font-medium">{row.title || 'RSVP Update'}</span>
                        <span className="text-xs text-zinc-400">{row.message}</span>
                    </div>
                </div>,
                { duration: 6000 }
            );
        } else {
            showInboxEmailToast({
              name: String(payload.contactName || row.title?.replace(/^New email from\s+/i, '') || 'CRM contact'),
              company: String(payload.company || 'Unknown company'),
              subject: String(payload.subject || row.message || 'New email from CRM contact'),
              snippet: String(payload.snippet || row.message || 'New message received'),
              hasAttachments: Boolean(payload.hasAttachments),
              photoUrl: (payload.photoUrl as string | null) ?? null,
              sourceLabel: formatSourceLabel(payload.source || row.metadata?.source),
              emailId: signalId || undefined,
            });
        }

      }
    }

    void pollNotifications()
    const interval = setInterval(() => {
      void pollNotifications()
    }, 15000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [loading, user?.email])

  return null
}
