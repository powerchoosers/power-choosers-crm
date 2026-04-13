import type { QueryClient, QueryKey, Query } from '@tanstack/react-query'
import type { Email } from '@/hooks/useEmails'

type OptimisticEmailInput = {
  id: string
  subject: string
  from: string
  to: string | string[]
  html?: string
  text?: string
  ownerId?: string | null
  contactId?: string | null
  accountId?: string | null
  threadId?: string | null
  attachments?: Email['attachments']
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

function extractEmailAddress(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const angle = raw.match(/<\s*([^>]+)\s*>/)
  const candidate = (angle?.[1] || raw).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ''
}

function normalizeEmailList(value: string | string[]) {
  const list = Array.isArray(value) ? value : String(value).split(',')
  return list
    .map((part) => extractEmailAddress(part))
    .filter(Boolean)
}

export function buildOptimisticEmail(input: OptimisticEmailInput): Email {
  const nowIso = new Date().toISOString()
  const plainText = stripHtml(input.text || input.html || '')
  const snippet = plainText.slice(0, 140)
  return {
    id: input.id,
    subject: input.subject,
    from: input.from,
    to: input.to,
    contactId: input.contactId ?? null,
    accountId: input.accountId ?? null,
    threadId: input.threadId ?? null,
    html: input.html,
    text: plainText || input.text || '',
    snippet,
    date: nowIso,
    timestamp: Date.now(),
    unread: false,
    type: 'sent',
    status: 'sent',
    ownerId: input.ownerId || input.from,
    openCount: 0,
    clickCount: 0,
    attachments: input.attachments,
    sentAt: nowIso,
    scheduledSendTime: null,
    metadata: { optimistic: true },
  }
}

function insertIntoInfiniteEmails(oldData: any, email: Email) {
  if (!oldData?.pages) return oldData
  const exists = oldData.pages.some((page: any) =>
    Array.isArray(page?.emails) && page.emails.some((entry: any) => entry?.id === email.id)
  )
  if (exists) return oldData
  const [first, ...rest] = oldData.pages
  if (!first || !Array.isArray(first.emails)) return oldData
  return {
    ...oldData,
    pages: [
      { ...first, emails: [email, ...first.emails] },
      ...rest,
    ],
  }
}

function insertIntoArray(oldData: any, email: Email) {
  if (!Array.isArray(oldData)) return oldData
  if (oldData.some((entry) => entry?.id === email.id)) return oldData
  return [email, ...oldData]
}

function matchesEntityEmailQuery(queryKey: QueryKey, email: Email) {
  if (!Array.isArray(queryKey)) return false
  if (queryKey[0] !== 'entity-emails') return false
  const addresses = Array.isArray(queryKey[1]) ? (queryKey[1] as string[]) : []
  if (addresses.length === 0) return false
  const participants = [
    extractEmailAddress(email.from),
    ...normalizeEmailList(email.to),
  ].filter(Boolean)
  if (participants.length === 0) return false
  const addressSet = new Set(addresses.map((addr) => extractEmailAddress(addr)).filter(Boolean))
  return participants.some((addr) => addressSet.has(addr))
}

function matchesThreadQuery(queryKey: QueryKey, threadId: string) {
  return Array.isArray(queryKey) && queryKey[0] === 'email-thread' && queryKey[1] === threadId
}

export function applyOptimisticEmailSend(queryClient: QueryClient, email: Email) {
  queryClient.setQueriesData({ queryKey: ['emails'] }, (oldData: any) =>
    insertIntoInfiniteEmails(oldData, email)
  )

  queryClient.setQueriesData(
    { predicate: (query: Query) => matchesEntityEmailQuery(query.queryKey, email) },
    (oldData: any) => insertIntoArray(oldData, email)
  )

  if (email.threadId) {
    queryClient.setQueriesData(
      { predicate: (query: Query) => matchesThreadQuery(query.queryKey, email.threadId as string) },
      (oldData: any) => insertIntoArray(oldData, email)
    )
  }
}
