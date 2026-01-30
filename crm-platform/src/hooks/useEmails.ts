import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { generateNodalSignature } from '@/lib/signature'

export interface Email {
  id: string
  subject: string
  from: string
  fromName?: string | null
  to: string | string[]
  html?: string
  text?: string
  snippet?: string
  date: string
  timestamp?: number
  unread: boolean
  type: 'received' | 'sent' | 'scheduled' | 'draft'
  status?: string
  ownerId: string
  gmailMessageId?: string
  openCount?: number
  clickCount?: number
}

const PAGE_SIZE = 50

export function useEmails(searchQuery?: string) {
  const { user, role, loading, profile } = useAuth()
  const queryClient = useQueryClient()

  const emailsQuery = useInfiniteQuery({
    queryKey: ['emails', user?.email ?? 'guest', role, searchQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (loading) return { emails: [], nextCursor: null }
      if (!user?.email) return { emails: [], nextCursor: null }

      try {
        let query = supabase
          .from('emails')
          .select('*', { count: 'exact' })
        
        if (role !== 'admin') {
           if (!user.email) return { emails: [], nextCursor: null }
           query = query.eq('metadata->>ownerId', user.email.toLowerCase())
        }

        if (searchQuery) {
          query = query.or(`subject.ilike.%${searchQuery}%,from.ilike.%${searchQuery}%,text.ilike.%${searchQuery}%`)
        }

        const from = pageParam * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error, count } = await query
          .range(from, to)
          .order('timestamp', { ascending: false, nullsFirst: false })

        if (error) throw error

        const emails = data.map(item => {
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
          
          return {
            id: item.id,
            subject: item.subject,
            from: item.from,
            to: item.to,
            html: item.html,
            text: item.text,
            snippet: item.text?.slice(0, 100) || item.snippet,
            date: date,
            timestamp: date ? new Date(date).getTime() : Date.now(),
            unread: !item.is_read,
            type,
            status: item.status,
            ownerId: item.metadata?.ownerId || user.email,
            openCount: item.openCount,
            clickCount: item.clickCount
          }
        }) as Email[]

        const hasNextPage = count ? from + PAGE_SIZE < count : false

        return {
          emails,
          nextCursor: hasNextPage ? pageParam + 1 : null
        }
      } catch (error: any) {
        // Suppress logging for aborted requests (intentional cancellations by React Query)
        if (error?.name === 'AbortError' || error?.message === 'Fetch is aborted') {
          throw error
        }
        console.error("Error fetching emails:", error)
        throw error
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: { to: string, subject: string, content: string }) => {
      if (!user?.email) {
        throw new Error('You must be logged in to send email')
      }

      // Simple HTML wrapping
      const htmlContent = `<div style="white-space:pre-wrap;">${emailData.content}</div>`
      const explicitFromName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
      const fromName = explicitFromName || profile.name || user.displayName || undefined

      const response = await fetch('/api/email/sendgrid-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to,
          subject: emailData.subject,
          content: htmlContent,
          plainTextContent: emailData.content,
          isHtmlEmail: true,
          userEmail: user.email,
          from: user.email,
          fromName,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to send email');
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success('Email sent successfully');
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to send: ${error.message}`);
    }
  });

  return {
    data: emailsQuery.data,
    isLoading: emailsQuery.isLoading,
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
           query = query.eq('metadata->>ownerId', user.email.toLowerCase())
        }

        query = query.or(`subject.ilike.%${queryTerm}%,from.ilike.%${queryTerm}%,text.ilike.%${queryTerm}%`)

        const { data, error } = await query.limit(5)

        if (error) throw error

        return data.map(item => ({
          id: item.id,
          subject: item.subject,
          from: item.from,
          date: item.timestamp || item.created_at
        }))
      } catch (error) {
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
      if (loading || !user) return 0

      try {
        let query = supabase
          .from('emails')
          .select('*', { count: 'exact', head: true })
        
        if (role !== 'admin' && user.email) {
           query = query.eq('metadata->>ownerId', user.email.toLowerCase())
        }

        if (searchQuery) {
          query = query.or(`subject.ilike.%${searchQuery}%,from.ilike.%${searchQuery}%,text.ilike.%${searchQuery}%`)
        }

        const { count, error } = await query
        if (error) throw error
        return count || 0
      } catch (error) {
        console.error("Error fetching emails count:", error)
        return 0
      }
    },
    enabled: !loading && !!user,
  })
}
