import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

export interface EmailAttachment {
  filename: string
  mimeType?: string
  attachmentId?: string
  attachmentPath?: string
  size?: number
  messageId?: string
  provider?: string
  downloadUnavailable?: boolean
}

export interface Email {
  id: string
  subject: string
  from: string
  fromName?: string | null
  to: string | string[]
  contactId?: string | null
  accountId?: string | null
  threadId?: string | null
  html?: string
  text?: string
  snippet?: string
  date: string
  timestamp?: number
  unread: boolean
  type: 'received' | 'sent' | 'scheduled' | 'draft'
  status?: string
  ownerId: string
  openCount?: number
  clickCount?: number
  attachments?: EmailAttachment[]
  metadata?: Record<string, any>
  scheduledSendTime?: string | null
}

const PAGE_SIZE = 50
export type EmailListFilter = 'all' | 'received' | 'sent' | 'scheduled'

const FALLBACK_SHARED_INBOX_OWNERS_BY_USER: Record<string, string[]> = {
  'l.patterson@nodalpoint.io': ['signal@nodalpoint.io'],
}

function getFallbackOwnerScope(userEmail: string) {
  const normalized = userEmail.toLowerCase()
  const shared = FALLBACK_SHARED_INBOX_OWNERS_BY_USER[normalized] || []
  return Array.from(new Set([normalized, ...shared]))
}

function applyOwnerScope(query: any, owners: string[]) {
  const ownerConditions = owners.flatMap(owner => [
    `metadata->>ownerId.eq.${owner}`,
    `ownerId.eq.${owner}`,
  ])
  return query.or(ownerConditions.join(','))
}

async function resolveOwnerScope(user: any) {
  const primary = String(user?.email || '').toLowerCase().trim()
  if (!primary) return []

  const owners = new Set<string>(getFallbackOwnerScope(primary))
  if (user?.id) {
    const { data: connections } = await supabase
      .from('zoho_connections')
      .select('email')
      .eq('user_id', user.id)

    ;(connections || []).forEach((conn: { email?: string | null }) => {
      const email = String(conn.email || '').toLowerCase().trim()
      if (email) owners.add(email)
    })
  }

  return Array.from(owners)
}

async function applyNonAdminEmailScope(query: any, user: any) {
  if (!user?.email) return query

  const owners = await resolveOwnerScope(user)
  let scoped = applyOwnerScope(query, owners.length ? owners : [String(user.email).toLowerCase().trim()])

  // Contact-based scoping for non-admin users
  const { data: contactList } = await supabase
    .from('contacts')
    .select('email')
    .eq('ownerId', user.id)

  const validEmails = (contactList?.map(c => c.email).filter(Boolean) || []) as string[]

  if (validEmails.length > 0) {
    const conditions: string[] = []
    validEmails.forEach(e => {
      conditions.push(`from.ilike.*${e}*`)
      conditions.push(`to.cs.["${e}"]`)
    })
    scoped = scoped.or(conditions.join(','))
  }

  return scoped
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

function applyEmailSearch(query: any, searchQuery?: string) {
  if (!searchQuery) return query
  return query.or(`subject.ilike.%${searchQuery}%,from.ilike.%${searchQuery}%,text.ilike.%${searchQuery}%`)
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

export function useEmails(searchQuery?: string, typeFilter: EmailListFilter = 'all') {
  const { user, role, loading, profile } = useAuth()
  const queryClient = useQueryClient()

  const emailsQuery = useInfiniteQuery({
    queryKey: ['emails', user?.email ?? 'guest', role, searchQuery, typeFilter],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (loading) return { emails: [], nextCursor: null }
      if (!user?.email) return { emails: [], nextCursor: null }

      try {
        let query: any = supabase
          .from('emails')
          .select('*', { count: 'exact' })

        if (role === 'admin') {
          // Admin sees all emails across all connected inboxes (nodalpoint.io, getnodalpoint.com, signal@)
          // No ownership filter — unified inbox across all 3 Zoho addresses
        } else {
          query = await applyNonAdminEmailScope(query, user)
        }

        query = applyEmailSearch(applyCommonEmailExclusions(query), searchQuery)
        if (typeFilter === 'sent') {
          query = query.in('type', ['sent', 'uplink_out'])
        } else if (typeFilter === 'scheduled') {
          query = query.eq('type', 'scheduled')
        } else if (typeFilter === 'received') {
          query = query.in('type', ['received', 'uplink_in'])
        }

        const from = pageParam * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error, count } = await query
          .range(from, to)
          .order('timestamp', { ascending: false, nullsFirst: false })
          .order('createdAt', { ascending: false, nullsFirst: false })

        if (error) {
          // Silent abort for network cancellations
          if (error.message === 'FetchUserError: Request was aborted' || error.message?.includes('abort')) {
            throw error
          }
          console.error("Supabase error fetching emails:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          })
          throw error
        }

        const emails = data.map((item: any) => {
          // Normalize type from legacy or current formats
          let type: Email['type'] = 'received'
          const rawType = String(item.type || '').toLowerCase()

          if (rawType === 'sent' || rawType === 'uplink_out') {
            type = 'sent'
          } else if (rawType === 'scheduled') {
            type = 'scheduled'
          } else if (rawType === 'draft') {
            type = 'draft'
          } else {
            type = 'received' // default for 'received', 'uplink_in', or anything else
          }

          const date = item.timestamp || item.createdAt || item.created_at

          const plainText = stripHtml(item.text)
          const plainHtml = stripHtml(item.html)
          const plainSnippet = stripHtml(item.snippet)

          return {
            id: item.id,
            subject: item.subject,
            from: item.from,
            to: item.to,
            contactId: item.contactId || null,
            accountId: item.accountId || null,
            html: item.html,
            text: plainText || plainHtml || plainSnippet,
            snippet: (plainText || plainHtml || plainSnippet).slice(0, 140),
            date: date,
            timestamp: date ? new Date(date).getTime() : Date.now(),
            unread: !item.is_read,
            type,
            status: item.status,
            ownerId: item.metadata?.ownerId || user.email,
            openCount: item.openCount,
            clickCount: item.clickCount,
            attachments: item.attachments || item.metadata?.attachments,
            metadata: item.metadata || {},
            scheduledSendTime: item.scheduledSendTime || null
          }
        }) as Email[]

        const hasNextPage = count ? from + PAGE_SIZE < count : false

        return {
          emails,
          nextCursor: hasNextPage ? pageParam + 1 : null
        }
      } catch (error: any) {
        // Suppress logging for aborted requests (intentional cancellations by React Query)
        if (error?.name === 'AbortError' || error?.message === 'Fetch is aborted' || error?.message?.includes('abort')) {
          throw error
        }
        console.error("Error fetching emails:", error.message || error)
        throw error
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: { to: string, cc?: string, subject: string, content: string, html?: string, attachments?: Array<{ filename: string, content: string, type: string, size: number }> }) => {
      if (!user?.email) {
        throw new Error('You must be logged in to send email')
      }

      // Use provided HTML or fallback to simple wrapping
      const htmlContent = emailData.html || `<div style="font-family: sans-serif;">${emailData.content.replace(/\n/g, '<br />')}</div>`
      // Format: "FirstName • Nodal Point" for sender display (bullet point for compatibility)
      const firstName = profile.firstName || profile.name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || 'Nodal Point'
      const fromName = `${firstName} • Nodal Point`

      const response = await fetch('/api/email/zoho-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to,
          cc: emailData.cc,
          subject: emailData.subject,
          content: htmlContent,
          plainTextContent: emailData.content,
          isHtmlEmail: true,
          userEmail: user.email,
          from: user.email,
          fromName,
          attachments: emailData.attachments,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || err.message || 'Failed to send email');
      }

      return response.json();
    },
    onSuccess: (data) => {
      console.log('[Email Sent] Success:', data);
      toast.success('Email sent successfully');
      // Invalidate and refetch emails immediately
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['emails-count'] });
      queryClient.invalidateQueries({ queryKey: ['emails-type-counts'] });
      // Force refetch after a small delay to ensure backend has processed
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['emails'] });
      }, 500);
    },
    onError: (error: Error) => {
      console.error('[Email Send] Error:', error);
      toast.error(`Failed to send: ${error.message}`);
    }
  });

  return {
    data: emailsQuery.data,
    isLoading: emailsQuery.isLoading,
    isFetching: emailsQuery.isFetching,
    error: emailsQuery.error,
    fetchNextPage: emailsQuery.fetchNextPage,
    hasNextPage: emailsQuery.hasNextPage,
    isFetchingNextPage: emailsQuery.isFetchingNextPage,
    sendEmail: sendEmailMutation.mutate,
    isSending: sendEmailMutation.isPending
  };
}

export function useSearchEmails(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['emails-search', queryTerm, user?.email ?? 'guest', role],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase
          .from('emails')
          .select('*')

        if (role !== 'admin') {
          if (!user.email) return []
          const owners = await resolveOwnerScope(user)
          query = applyOwnerScope(query, owners.length ? owners : [String(user.email).toLowerCase().trim()])
        }

        // Filter out mailwarming emails
        query = query
          .neq('is_deleted', true)
          .not('subject', 'ilike', '%mailwarming%')
          .not('subject', 'ilike', '%mail warming%')
          .not('from', 'ilike', '%apollo.io%')
          .not('from', 'ilike', '%mailwarm%')

        query = query.or(`subject.ilike.%${queryTerm}%,from.ilike.%${queryTerm}%,text.ilike.%${queryTerm}%`)

        const { data, error } = await query.limit(5)

        if (error) throw error

        return data.map(item => ({
          id: item.id,
          subject: item.subject,
          from: item.from,
          date: item.timestamp || item.created_at
        }))
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message === 'Fetch is aborted' || error?.message?.includes('abort')) {
          return []
        }
        console.error("Search emails error:", error)
        return []
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}

export function useEmailsCount(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['emails-count', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user || !user.email) return 0

      try {
        let query: any = supabase
          .from('emails')
          .select('id', { count: 'exact', head: true })

        if (role === 'admin') {
          // Admin: count across all inboxes, no filtering
        } else {
          query = await applyNonAdminEmailScope(query, user)
        }

        query = applyEmailSearch(applyCommonEmailExclusions(query), searchQuery)

        const { count, error } = await query

        if (error) {
          if (error.message === 'FetchUserError: Request was aborted' || error.message?.includes('abort')) {
            throw error
          }
          console.error("Supabase error fetching emails count:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          })
          throw error
        }

        return count || 0
      } catch (error: any) {
        // Suppress logging for aborted requests
        if (error?.name === 'AbortError' || error?.message === 'Fetch is aborted' || error?.message?.includes('abort')) {
          throw error
        }
        console.error("Error fetching emails count:", error.message || error)
        return 0
      }
    },
    enabled: !loading && !!user && !!user?.email,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

export function useEmailTypeCounts(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['emails-type-counts', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user || !user.email) {
        return { all: 0, sent: 0, received: 0, scheduled: 0 }
      }

      const buildBase = async () => {
        let query: any = supabase
          .from('emails')
          .select('id', { count: 'exact', head: true })

        if (role !== 'admin') query = await applyNonAdminEmailScope(query, user)

        return applyEmailSearch(applyCommonEmailExclusions(query), searchQuery)
      }

      const [allRes, sentRes, receivedRes, scheduledRes] = await Promise.all([
        (async () => {
          const query = await buildBase()
          return query
        })(),
        (async () => {
          const query = await buildBase()
          return query.in('type', ['sent', 'uplink_out'])
        })(),
        (async () => {
          const query = await buildBase()
          return query.in('type', ['received', 'uplink_in'])
        })(),
        (async () => {
          const query = await buildBase()
          return query.eq('type', 'scheduled')
        })()
      ])

      const allError = allRes.error
      const sentError = sentRes.error
      const receivedError = receivedRes.error
      const scheduledError = scheduledRes.error

      if (allError || sentError || receivedError || scheduledError) {
        const error = allError || sentError || receivedError || scheduledError
        if (error?.message === 'FetchUserError: Request was aborted' || error?.message?.includes('abort')) {
          throw error
        }
        console.error('Supabase error fetching email type counts:', {
          allError,
          sentError,
          receivedError,
          scheduledError
        })
        throw error
      }

      return {
        all: allRes.count || 0,
        sent: sentRes.count || 0,
        received: receivedRes.count || 0,
        scheduled: scheduledRes.count || 0
      }
    },
    enabled: !loading && !!user && !!user?.email,
    staleTime: 1000 * 60 * 2,
  })
}
