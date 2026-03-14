
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
import { CheckCircle, Eye, Paperclip } from 'lucide-react'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'

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

function stripHtml(value?: string | null) {
  if (!value) return ''
  return String(value)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function getEmailSnippet(email: { snippet?: string | null, text?: string | null, html?: string | null }) {
  const plainSnippet = stripHtml(email.snippet)
  if (plainSnippet) return plainSnippet.slice(0, 120)

  const plainText = stripHtml(email.text)
  if (plainText) return plainText.slice(0, 120)

  const plainHtml = stripHtml(email.html)
  if (plainHtml) return plainHtml.slice(0, 120)

  return 'New message received'
}

export function GlobalSync() {
  const { user, loading } = useAuth()
  const { performSync } = useZohoSync()
  const queryClient = useQueryClient()
  const ownerScopeRef = useRef<string[]>([])
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
                icon: <Eye className="w-4 h-4 text-[#002FA7]" />
              })
            }
            invalidateDeals()
            invalidateEmails()
            queryClient.invalidateQueries({ queryKey: ['signature-requests'] })
          } else if (oldRecord.status !== 'viewed' && newRecord.status === 'viewed') {
            if (isOwner) {
              if (soundEnabled) playPing();
              toast('Contract Viewed by Signatory', {
                icon: <Eye className="w-4 h-4 text-[#002FA7]" />
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
            created_at?: string
            ownerId?: string
            attachments?: Array<unknown>
            metadata?: {
              ownerId?: string
              attachments?: Array<unknown>
              hasAttachments?: boolean
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
          const insertedAt = email.timestamp || email.created_at
          if (insertedAt) {
            const insertedTs = new Date(insertedAt).getTime()
            if (!Number.isNaN(insertedTs) && Date.now() - insertedTs > 10 * 60 * 1000) return
          }

          const senderEmail = extractEmailAddress(email.from)
          if (!senderEmail) return

          const selectColumns = 'id, email, name, firstName, lastName, metadata, accounts(name)'
          let contact = null

          // 1. Try resolving using contactId from the payload (set by sync record)
          if (email.contactId) {
            const { data: directContact } = await supabase
              .from('contacts')
              .select(selectColumns)
              .eq('id', email.contactId)
              .maybeSingle()
            contact = directContact
          }

          // 2. Fallback to owner-specific lookup by email (Corrected: ownerId = email)
          if (!contact) {
            const { data: ownedContact } = await supabase
              .from('contacts')
              .select(selectColumns)
              .eq('ownerId', userEmail)
              .ilike('email', senderEmail)
              .limit(1)
              .maybeSingle()
            contact = ownedContact
          }

          // 3. Fallback to shared contacts
          if (!contact) {
            const { data: sharedContact } = await supabase
              .from('contacts')
              .select(selectColumns)
              .is('ownerId', null)
              .ilike('email', senderEmail)
              .limit(1)
              .maybeSingle()
            contact = sharedContact
          }

          // Only notify if sender is actually a known CRM contact.
          if (!contact) return

          const name = (
            contact.name ||
            [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
            senderEmail
          )
          const relatedAccount = Array.isArray(contact.accounts) ? contact.accounts[0] : contact.accounts
          const company = relatedAccount?.name || 'Unknown company'
          const snippet = getEmailSnippet(email)
          const hasAttachments =
            !!email.metadata?.hasAttachments ||
            (Array.isArray(email.metadata?.attachments) && email.metadata.attachments.length > 0) ||
            (Array.isArray(email.attachments) && email.attachments.length > 0)
          const photoUrl = resolveContactPhotoUrl(contact)

          playPing();
          toast(
            <div className="flex items-start gap-3">
              <ContactAvatar name={name} photoUrl={photoUrl || undefined} size={32} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{name}</span>
                  {hasAttachments && <Paperclip className="w-3.5 h-3.5 text-zinc-400" />}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">{company}</div>
                <div className="text-xs text-zinc-300 mt-1 line-clamp-2">{snippet}</div>
              </div>
            </div>,
            {
              description: email.subject || 'New email from CRM contact',
              duration: 6500,
            }
          )
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

  return null
}
