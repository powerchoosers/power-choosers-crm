import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'
import { Email } from './useEmails'

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

function normalizeAttachments(raw: any) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((att: any) => ({
      filename: att.filename || att.attachmentName || att.name || 'Attachment',
      mimeType: att.mimeType || att.type || att.contentType || undefined,
      size: typeof att.size === 'number' ? att.size : undefined,
      messageId: att.messageId || att.zohoMessageId || undefined,
      attachmentId: att.attachmentId || att.storeName || att.attachmentPath || undefined,
      attachmentPath: att.attachmentPath || undefined,
      provider: att.provider || undefined,
      downloadUnavailable: !!att.downloadUnavailable,
    }))
    .filter((att: any) => !!att.filename)
}

function applyCommonEmailExclusions(query: any) {
  return query
    .neq('is_deleted', true)
    .not('subject', 'ilike', '%mailwarming%')
    .not('subject', 'ilike', '%mail warming%')
    .not('subject', 'ilike', '%test email%')
    .not('from', 'ilike', '%apollo.io%')
    .not('from', 'ilike', '%mailwarm%')
    .not('from', 'ilike', '%lemwarm%')
    .not('from', 'ilike', '%warmup%')
}

function normalizeSubject(subject: string) {
  return String(subject || '')
    .replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
}

function extractEmailAddress(value: any) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const angle = raw.match(/<\s*([^>]+)\s*>/)
  const candidate = (angle?.[1] || raw).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ''
}

function extractEmailList(value: any) {
  if (!value) return []
  const values = Array.isArray(value)
    ? value
    : String(value)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

  return values
    .map((part) => extractEmailAddress(part))
    .filter(Boolean)
}

export function useEmailThread(threadKey?: string) {
  const { user, role, loading } = useAuth()
  const ownerEmail = user?.email?.toLowerCase() ?? 'guest'

  return useQuery({
    queryKey: ['email-thread', threadKey ?? '', ownerEmail, role],
    queryFn: async () => {
      if (!threadKey) return []
      if (loading) return []
      if (!user?.email && role !== 'admin') return []

      try {
        let query: any = supabase
          .from('emails')
          .select('*, contact:contacts(id, email, name, firstName, lastName, accountId, metadata)')

        if (role !== 'admin' && user?.email) {
          query = query.or(`metadata->>ownerId.eq.${ownerEmail},ownerId.eq.${ownerEmail}`)
        }

        query = applyCommonEmailExclusions(query)

        const conditions = [
          `threadId.eq.${threadKey}`,
          `metadata->>threadId.eq.${threadKey}`,
          `id.eq.${threadKey}`
        ]

        const { data, error } = await query
          .or(conditions.join(','))
          .order('timestamp', { ascending: false, nullsFirst: false })
          .order('createdAt', { ascending: false, nullsFirst: false })
          .limit(20)

        if (error) {
          if (error.message === 'FetchUserError: Request was aborted' || error.message?.includes('abort')) {
            return []
          }
          throw error
        }

        const primaryData: any[] = data || []

        // Secondary lookup: if the thread has NO sent emails, the outbound messages were
        // likely sent via sequences/protocols and stored with threadId: null. Pull in only
        // the most likely match instead of merging every email that happens to share a short
        // subject like "test".
        const hasSent = primaryData.some((item: any) => {
          const t = String(item.type || '').toLowerCase()
          return t === 'sent' || t === 'uplink_out'
        })

        let secondaryData: any[] = []
        if (!hasSent && primaryData.length > 0) {
          const sampleSubject = primaryData[0]?.subject || ''
          const baseSubject = normalizeSubject(sampleSubject)
          if (baseSubject.length > 6) {
            let sentQuery: any = supabase
              .from('emails')
              .select('*')
              .in('type', ['sent', 'uplink_out'])
              .ilike('subject', `%${baseSubject}%`)

            if (role !== 'admin' && user?.email) {
              sentQuery = sentQuery.eq('ownerId', ownerEmail)
            }

            sentQuery = applyCommonEmailExclusions(sentQuery)

            const { data: sentData } = await sentQuery
              .order('timestamp', { ascending: false, nullsFirst: false })
              .order('createdAt', { ascending: false, nullsFirst: false })
              .limit(10)

            const primaryIds = new Set(primaryData.map((item: any) => item.id))
            const primaryParticipants = new Set(
              primaryData.flatMap((item: any) => ([
                ...extractEmailList(item.from),
                ...extractEmailList(item.to),
                ...extractEmailList(item.cc),
                ...extractEmailList(item.bcc),
              ]))
            )

            secondaryData = (sentData || [])
              .filter((item: any) => !primaryIds.has(item.id))
              .filter((item: any) => normalizeSubject(item.subject || '') === baseSubject)
              .filter((item: any) => {
                if (primaryParticipants.size === 0) return true
                const itemRecipients = new Set([
                  ...extractEmailList(item.to),
                  ...extractEmailList(item.cc),
                  ...extractEmailList(item.bcc),
                ])
                for (const address of itemRecipients) {
                  if (primaryParticipants.has(address)) return true
                }
                return false
              })
          }
        }

        const allData = [...primaryData, ...secondaryData]

        // Re-sort the merged array so secondary (subject-matched) entries interleave
        // correctly with primary thread messages instead of always appending at the end.
        allData.sort((a: any, b: any) => {
          const ta = new Date(a.timestamp || a.createdAt || a.created_at || 0).getTime()
          const tb = new Date(b.timestamp || b.createdAt || b.created_at || 0).getTime()
          return tb - ta // descending — newest first
        })

        return allData.map((item: any) => {
          let type: Email['type'] = 'received'
          const rawType = String(item.type || '').toLowerCase()

          if (rawType === 'sent' || rawType === 'uplink_out') {
            type = 'sent'
          } else if (rawType === 'scheduled') {
            type = 'scheduled'
          } else if (rawType === 'draft') {
            type = 'draft'
          }

          const date = item.timestamp || item.createdAt || item.created_at

          return {
            id: item.id,
            subject: item.subject,
            from: item.from,
            to: item.to,
            html: item.html,
            text: stripHtml(item.text || item.html || item.snippet),
            snippet: stripHtml(item.text || item.html || item.snippet).slice(0, 140),
            date,
            timestamp: date ? new Date(date).getTime() : Date.now(),
            unread: !item.is_read,
            type,
            status: item.status,
            contactId: item.contactId || null,
            accountId: item.accountId || null,
            ownerId: item.metadata?.ownerId || ownerEmail,
            openCount: item.openCount,
            clickCount: item.clickCount,
            attachments: normalizeAttachments(item.metadata?.attachments || item.attachments),
            threadId: item.threadId || item.metadata?.threadId || null,
            fromName: item.metadata?.fromName || null,
            contact: item.contact
              ? {
                  ...item.contact,
                  displayName: item.contact.name || [item.contact.firstName, item.contact.lastName].filter(Boolean).join(' ').trim() || item.contact.email,
                  avatarUrl: resolveContactPhotoUrl(item.contact) || null,
                }
              : null
          } as Email
        })
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message === 'Fetch is aborted' || error?.message?.includes('abort')) {
          return []
        }
        console.error("Error fetching email thread:", error.message || error)
        return []
      }
    },
    enabled: !!threadKey && !!(user?.email || role === 'admin')
  })
}
