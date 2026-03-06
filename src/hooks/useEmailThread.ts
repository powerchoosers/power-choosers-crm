import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
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
          .select('*')

        if (role !== 'admin' && user?.email) {
          query = query.eq('metadata->>ownerId', ownerEmail)
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

        return (data || []).map((item: any) => {
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
            ownerId: item.metadata?.ownerId || ownerEmail,
            openCount: item.openCount,
            clickCount: item.clickCount,
            attachments: normalizeAttachments(item.metadata?.attachments || item.attachments),
            threadId: item.threadId || item.metadata?.threadId || null,
            fromName: item.metadata?.fromName || null
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
