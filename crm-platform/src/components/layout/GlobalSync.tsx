
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
import { CheckCircle, Eye } from 'lucide-react'
import { showInboxEmailToast } from '@/lib/inbox-email-toast'

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

function parseSenderLabel(value?: string | null) {
  const raw = String(value || '').trim()
  const angle = raw.match(/<\s*([^>]+)\s*>/)
  const email = (angle?.[1] || raw).trim().toLowerCase()
  const display = raw.replace(/<\s*[^>]+\s*>/, '').trim()
  return {
    raw,
    email: extractEmailAddress(email),
    display: display || raw,
    normalizedDisplay: normalizeLookupText(display || raw),
    normalizedEmail: normalizeLookupText(email),
  }
}

async function resolveNotificationContact(
  ownerEmail: string,
  senderLabel: string,
) {
  const sender = parseSenderLabel(senderLabel)
  if (!sender.display && !sender.email) return null

  const queryParts: string[] = []
  if (sender.email) {
    queryParts.push(`email.ilike.%${sender.email}%`)
    queryParts.push(`email.ilike.%${sender.normalizedEmail}%`)
  }
  if (sender.display) {
    queryParts.push(`name.ilike.%${sender.display}%`)
    queryParts.push(`firstName.ilike.%${sender.display}%`)
    queryParts.push(`lastName.ilike.%${sender.display}%`)
  }

  const searchContacts = async (ownerFilter: 'owned' | 'shared') => {
    const base = supabase
      .from('contacts')
      .select('id, email, name, firstName, lastName, metadata, accounts(name), ownerId')

    const scoped = ownerFilter === 'owned'
      ? base.eq('ownerId', ownerEmail)
      : base.is('ownerId', null)

    const { data, error } = await scoped.or(Array.from(new Set(queryParts)).join(',')).limit(10)
    if (error) return []
    return Array.isArray(data) ? data : []
  }

  const rows = [
    ...(await searchContacts('owned')),
    ...(await searchContacts('shared')),
  ]

  if (!rows.length) return null

  const scored = rows
    .map((row) => {
      const rowEmail = normalizeLookupText(row.email)
      const rowName = normalizeLookupText(row.name)
      const rowFullName = normalizeLookupText([row.firstName, row.lastName].filter(Boolean).join(' '))
      const rowPriority = String(row.ownerId || '').toLowerCase().trim() === ownerEmail.toLowerCase().trim()
        ? 2
        : (row.ownerId ? 1 : 0)

      let score = 0
      if (sender.normalizedEmail && sender.normalizedEmail === rowEmail) score = 100
      else if (sender.normalizedDisplay && sender.normalizedDisplay === rowName) score = 90
      else if (sender.normalizedDisplay && sender.normalizedDisplay === rowFullName) score = 85

      return { row, score, rowPriority }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.rowPriority !== a.rowPriority) return b.rowPriority - a.rowPriority
      if (b.score !== a.score) return b.score - a.score
      return String(a.row.name || '').localeCompare(String(b.row.name || ''))
    })

  if (!scored.length) return null

  const best = scored[0]
  const sameRank = scored.filter((entry) => entry.score === best.score && entry.rowPriority === best.rowPriority)
  if (sameRank.length > 1) return null

  return best.row
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

          // Avoid spam on first sync/load by only notifying for fresh inserts.
          const insertedAt = email.createdAt || email.created_at || email.timestamp
          if (insertedAt) {
            const insertedTs = new Date(insertedAt).getTime()
            if (!Number.isNaN(insertedTs) && Date.now() - insertedTs > 10 * 60 * 1000) return
          }

          const senderLabel = email.from || email.metadata?.fromAddress || email.metadata?.replyToAddress || ''
          let contact = null

          // 1. Try resolving using contactId from the payload (set by sync/backfill)
          if (email.contactId) {
            const { data: directContact } = await supabase
              .from('contacts')
              .select('id, email, name, firstName, lastName, metadata, accounts(name), ownerId')
              .eq('id', email.contactId)
              .maybeSingle()
            contact = directContact || null
          }

          // 2. Fallback to sender-name / sender-email lookup inside the current owner's contact scope
          if (!contact) {
            contact = await resolveNotificationContact(userEmail, senderLabel)
          }

          // Only notify if sender is actually a known CRM contact.
          if (!contact) return

          const signalId = String(email.id || '').trim()
          if (signalId && seenInboxSignalIdsRef.current.has(signalId)) return
          if (signalId) seenInboxSignalIdsRef.current.add(signalId)

          const senderEmail = extractEmailAddress(senderLabel) || extractEmailAddress(email.from)
          const name = (
            contact.name ||
            [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
            senderEmail ||
            'CRM contact'
          )
          const relatedAccount = Array.isArray(contact.accounts) ? contact.accounts[0] : contact.accounts
          const company = relatedAccount?.name || 'Unknown company'
          const snippet =
            String(email.snippet || email.text || email.html || 'New message received')
              .replace(/\s+/g, ' ')
              .slice(0, 140)
          const hasAttachments =
            !!email.metadata?.hasAttachments ||
            (Array.isArray(email.metadata?.attachments) && email.metadata.attachments.length > 0) ||
            (Array.isArray(email.attachments) && email.attachments.length > 0)
          showInboxEmailToast({
            name,
            company,
            subject: email.subject || 'New email from CRM contact',
            snippet,
            hasAttachments,
          })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] emails channel connected')
        }
      })

    return () => {
      clearTimeout(timer)
      supabase.removeChannel(sigChannel)
      supabase.removeChannel(emailChannel)
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

        seenInboxSignalIdsRef.current.add(signalId)

        showInboxEmailToast({
          name: String(payload.contactName || row.title?.replace(/^New email from\s+/i, '') || 'CRM contact'),
          company: String(payload.company || 'Unknown company'),
          subject: String(payload.subject || row.message || 'New email from CRM contact'),
          snippet: String(payload.snippet || row.message || 'New message received'),
          hasAttachments: Boolean(payload.hasAttachments),
        })

        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', row.id)
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
