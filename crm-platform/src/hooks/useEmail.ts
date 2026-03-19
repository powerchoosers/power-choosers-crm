import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'
import { Email } from './useEmails'

function normalizeAttachments(raw: any, provider?: string) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((att: any) => ({
      filename: att.filename || att.attachmentName || att.name || 'Attachment',
      mimeType: att.mimeType || att.type || att.contentType || undefined,
      size: typeof att.size === 'number' ? att.size : (typeof att.attachmentSize === 'number' ? att.attachmentSize : (att.attachmentSize ? Number(att.attachmentSize) : undefined)),
      messageId: att.messageId || att.zohoMessageId || undefined,
      attachmentId: att.attachmentId || att.storeName || att.attachmentPath || undefined,
      attachmentPath: att.attachmentPath || undefined,
      provider: att.provider || provider || undefined,
      downloadUnavailable: !!att.downloadUnavailable,
    }))
    .filter((att: any) => !!att.filename)
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

export function useEmail(id: string) {
  return useQuery({
    queryKey: ['email', id],
    queryFn: async () => {
      if (!id) return null
      
      const { data, error } = await supabase
        .from('emails')
        .select('*, contact:contacts(id, email, name, firstName, lastName, accountId, metadata)')
        .eq('id', id)
        .single()
      
      if (error) {
        console.error('Error fetching email from Supabase:', error)
        return null
      }
      
      if (data) {
        const rawType = String(data.type || '').toLowerCase()
        const normalizedType: Email['type'] =
          rawType === 'sent' || rawType === 'uplink_out'
            ? 'sent'
            : rawType === 'scheduled'
              ? 'scheduled'
              : rawType === 'draft'
                ? 'draft'
                : 'received'
        const provider = data.metadata?.provider || null
        const normalizedAttachments = normalizeAttachments(data.metadata?.attachments || data.attachments, provider)
        const plainText = stripHtml(data.text)
        const plainHtml = stripHtml(data.html)
        return {
          id: data.id,
          subject: data.subject,
          from: data.from,
          fromName: data.metadata?.fromName || null,
          to: data.to,
          contactId: data.contactId || null,
          accountId: data.accountId || null,
          threadId: data.threadId || data.metadata?.threadId || null,
          html: data.html,
          text: plainText || plainHtml,
          snippet: (plainText || plainHtml || '').slice(0, 140),
          date: data.timestamp || data.created_at,
          timestamp: new Date(data.timestamp || data.created_at).getTime(),
          unread: !data.is_read,
          type: normalizedType,
          status: data.status,
          ownerId: data.metadata?.ownerId || data.ownerId || null,
          openCount: data.openCount,
          clickCount: data.clickCount,
          attachments: normalizedAttachments,
          contact: data.contact
            ? {
                ...data.contact,
                displayName: data.contact.name || [data.contact.firstName, data.contact.lastName].filter(Boolean).join(' ').trim() || data.contact.email,
                avatarUrl: resolveContactPhotoUrl(data.contact) || null,
              }
            : null
        } as Email
      }
      return null
    },
    enabled: !!id
  })
}

export function useMarkEmailAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('emails')
        .update({ is_read: true })
        .eq('id', id)

      if (error) throw error

      // Fire-and-forget: mark as read in Zoho Mail portal too
      supabase.auth.getSession().then(({ data }) => {
        const token = data?.session?.access_token
        if (!token) return
        fetch('/api/email/zoho-mark-read', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ emailId: id }),
        }).catch(() => {
          // Zoho sync is best-effort — don't block UI
        })
      })

      return id
    },
    // Optimistic update: instantly mark as read in UI before Supabase responds
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['emails'] })
      await queryClient.cancelQueries({ queryKey: ['email', id] })

      // Snapshot previous values for rollback
      const previousEmail = queryClient.getQueryData<Email | null>(['email', id])
      const previousEmails = queryClient.getQueriesData({ queryKey: ['emails'] })

      // Optimistically update the individual email cache
      queryClient.setQueryData<Email | null>(['email', id], (old) => {
        if (!old) return old
        return { ...old, unread: false }
      })

      // Optimistically update the emails list cache (infinite query pages)
      queryClient.setQueriesData<any>({ queryKey: ['emails'] }, (old: any) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            emails: (page.emails || []).map((email: Email) =>
              email.id === id ? { ...email, unread: false } : email
            ),
          })),
        }
      })

      return { previousEmail, previousEmails }
    },
    onError: (_err, id, context) => {
      // Rollback on error
      if (context?.previousEmail !== undefined) {
        queryClient.setQueryData(['email', id], context.previousEmail)
      }
      if (context?.previousEmails) {
        for (const [key, data] of context.previousEmails) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: (_data, _error, id) => {
      // Refetch in background to ensure server state is synced
      queryClient.invalidateQueries({ queryKey: ['email', id] })
      queryClient.invalidateQueries({ queryKey: ['emails'] })
    }
  })
}
