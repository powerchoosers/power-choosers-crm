'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { getSignatureRequestKindConfig, normalizeSignatureRequestKind } from '@/lib/signature-request'

const FALLBACK_SHARED_INBOX_OWNERS: Record<string, string[]> = {
  'l.patterson@nodalpoint.io': ['signal@nodalpoint.io'],
}

const ACK_STORAGE_KEY = 'np_notification_center_ack_v1'

export type NotificationFeedType =
  | 'email'
  | 'rsvp'
  | 'reminder'
  | 'email_open'
  | 'email_click'
  | 'contract_opened'
  | 'contract_viewed'
  | 'contract_signed'
  | 'missed_call'

export interface NotificationFeedItem {
  id: string
  type: NotificationFeedType
  title: string
  message: string
  createdAt: string
  read: boolean
  link?: string | null
  source: 'notifications' | 'derived'
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

function parseAckSet(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.map((v) => String(v)))
  } catch {
    return new Set()
  }
}

function getSignatureOwner(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return ''
  const record = metadata as Record<string, unknown>
  const candidates = [
    record.ownerId,
    record.owner_id,
    record.agentEmail,
    record.agent_email,
    record.createdByEmail,
    record.created_by_email,
    record.userEmail,
    record.user_email,
  ]
  for (const candidate of candidates) {
    const value = String(candidate || '').toLowerCase().trim()
    if (value) return value
  }
  return ''
}

function mapSignatureStatus(status: string): NotificationFeedType | null {
  const normalized = status.toLowerCase()
  if (normalized === 'opened') return 'contract_opened'
  if (normalized === 'viewed') return 'contract_viewed'
  if (normalized === 'signed' || normalized === 'completed') return 'contract_signed'
  return null
}

export function useNotificationCenter() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [acknowledgedDerivedIds, setAcknowledgedDerivedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    setAcknowledgedDerivedIds(parseAckSet(window.localStorage.getItem(ACK_STORAGE_KEY)))
  }, [])

  const query = useQuery({
    queryKey: ['notification-center-feed', user?.id || user?.email || 'anonymous'],
    enabled: Boolean(user?.email),
    queryFn: async (): Promise<{ items: NotificationFeedItem[]; ownerScope: string[] }> => {
      const ownerScope = await resolveOwnerScope({ id: user?.id, email: user?.email })
      if (ownerScope.length === 0) return { items: [], ownerScope: [] }

      const [notificationsRes, engagementRes, signaturesRes, missedCallsRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('id, ownerId, title, message, type, read, link, createdAt')
          .in('ownerId', ownerScope)
          .order('createdAt', { ascending: false })
          .limit(120),
        supabase
          .from('emails')
          .select('id, subject, openCount, clickCount, updatedAt, ownerId')
          .in('ownerId', ownerScope)
          .or('openCount.gt.0,clickCount.gt.0')
          .order('updatedAt', { ascending: false })
          .limit(80),
        supabase
          .from('signature_requests')
          .select('id, status, updated_at, created_at, account_id, contact_id, metadata')
          .in('status', ['opened', 'viewed', 'signed', 'completed'])
          .order('updated_at', { ascending: false })
          .limit(80),
        supabase
          .from('calls')
          .select('id, status, timestamp, ownerId, contactId, accountId, to, from')
          .in('ownerId', ownerScope)
          .in('status', ['no-answer', 'no_answer', 'busy', 'failed', 'canceled'])
          .order('timestamp', { ascending: false })
          .limit(80),
      ])

      const notifications = (notificationsRes.data || []).map((row: any) => {
        const normalizedType = String(row.type || '').toLowerCase()
        const safeType = (['email', 'rsvp', 'reminder'].includes(normalizedType)
          ? normalizedType
          : 'email') as NotificationFeedType
        return {
          id: String(row.id),
          type: safeType,
          title: String(row.title || 'New notification'),
          message: String(row.message || ''),
          createdAt: String(row.createdAt || new Date().toISOString()),
          read: Boolean(row.read),
          link: row.link ? String(row.link) : null,
          source: 'notifications' as const,
        }
      })

      const engagement: NotificationFeedItem[] = []
      for (const row of engagementRes.data || []) {
        const emailId = String(row.id || '').trim()
        if (!emailId) continue
        const updatedAt = String(row.updatedAt || new Date().toISOString())
        const subject = String(row.subject || 'Tracked email')
        const opens = Number(row.openCount || 0)
        const clicks = Number(row.clickCount || 0)
        if (opens > 0) {
          engagement.push({
            id: `email-open:${emailId}:${opens}`,
            type: 'email_open',
            title: 'Email Opened',
            message: `${subject} opened ${opens} time${opens === 1 ? '' : 's'}.`,
            createdAt: updatedAt,
            read: false,
            link: `/network/emails/${emailId}`,
            source: 'derived',
          })
        }
        if (clicks > 0) {
          engagement.push({
            id: `email-click:${emailId}:${clicks}`,
            type: 'email_click',
            title: 'Link Clicked',
            message: `${subject} clicked ${clicks} time${clicks === 1 ? '' : 's'}.`,
            createdAt: updatedAt,
            read: false,
            link: `/network/emails/${emailId}`,
            source: 'derived',
          })
        }
      }

      const contracts: NotificationFeedItem[] = []
      for (const row of signaturesRes.data || []) {
        const ownerEmail = getSignatureOwner(row.metadata)
        if (ownerEmail && !ownerScope.includes(ownerEmail)) continue
        const mapped = mapSignatureStatus(String(row.status || ''))
        if (!mapped) continue
        const signatureKind = normalizeSignatureRequestKind((row.metadata as any)?.documentKind || (row.metadata as any)?.document_kind || null)
        const kindLabel = getSignatureRequestKindConfig(signatureKind).uiLabel
        const createdAt = String(row.updated_at || row.created_at || new Date().toISOString())
        const accountId = String(row.account_id || '').trim()
        const contactId = String(row.contact_id || '').trim()
        const link = accountId
          ? `/network/accounts/${accountId}`
          : (contactId ? `/network/contacts/${contactId}` : '/network')
        const title = mapped === 'contract_signed'
          ? `${kindLabel} Signed`
          : mapped === 'contract_viewed'
            ? `${kindLabel} Viewed`
            : `${kindLabel} Opened`
        const message = mapped === 'contract_signed'
          ? 'A signer completed execution on the signing request.'
          : mapped === 'contract_viewed'
            ? 'A signer viewed the secure signing portal.'
            : 'A signer opened the secure signing invitation.'
        contracts.push({
          id: `contract:${String(row.id)}:${String(row.status || '').toLowerCase()}`,
          type: mapped,
          title,
          message,
          createdAt,
          read: false,
          link,
          source: 'derived',
        })
      }

      const missedCalls: NotificationFeedItem[] = (missedCallsRes.data || []).map((row: any) => {
        const status = String(row.status || 'Missed').replace(/[_-]/g, ' ').toUpperCase()
        const callId = String(row.id || '')
        const timestamp = String(row.timestamp || new Date().toISOString())
        const contactId = String(row.contactId || '').trim()
        const accountId = String(row.accountId || '').trim()
        const link = contactId
          ? `/network/contacts/${contactId}`
          : (accountId ? `/network/accounts/${accountId}` : '/network/calls')
        return {
          id: `missed-call:${callId}`,
          type: 'missed_call',
          title: 'Missed Call',
          message: `${status} • ${String(row.to || row.from || 'Unknown line')}`,
          createdAt: timestamp,
          read: false,
          link,
          source: 'derived',
        }
      })

      const merged = [...notifications, ...engagement, ...contracts, ...missedCalls]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 200)

      return { items: merged, ownerScope }
    },
  })

  const items = useMemo(() => {
    const sourceItems = query.data?.items || []
    return sourceItems.map((item) => {
      if (item.source === 'derived') {
        return { ...item, read: acknowledgedDerivedIds.has(item.id) }
      }
      return item
    })
  }, [query.data?.items, acknowledgedDerivedIds])

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items])

  const persistAckSet = (next: Set<string>) => {
    setAcknowledgedDerivedIds(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(Array.from(next)))
    }
  }

  const markItemRead = async (item: NotificationFeedItem) => {
    if (item.read) return
    if (item.source === 'notifications') {
      await supabase.from('notifications').update({ read: true }).eq('id', item.id)
      await queryClient.invalidateQueries({ queryKey: ['notification-center-feed'] })
      return
    }
    const next = new Set(acknowledgedDerivedIds)
    next.add(item.id)
    persistAckSet(next)
  }

  const markAllRead = async () => {
    const allItems = items
    const dbUnreadIds = allItems
      .filter((item) => item.source === 'notifications' && !item.read)
      .map((item) => item.id)

    if (dbUnreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', dbUnreadIds)
    }

    const next = new Set(acknowledgedDerivedIds)
    allItems
      .filter((item) => item.source === 'derived')
      .forEach((item) => next.add(item.id))
    persistAckSet(next)
    await queryClient.invalidateQueries({ queryKey: ['notification-center-feed'] })
  }

  return {
    items,
    unreadCount,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    markItemRead,
    markAllRead,
  }
}
