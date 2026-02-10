import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useEffect } from 'react'

export interface Call {
  id: string
  callSid?: string
  contactName: string
  phoneNumber: string
  type: 'Inbound' | 'Outbound'
  status: 'Completed' | 'Busy' | 'No-answer' | 'Failed' | 'Canceled'
  duration: string
  date: string
  note?: string
  recordingUrl?: string
  recordingSid?: string
  transcript?: string
  aiInsights?: Record<string, unknown> | null
  contactId?: string
  accountId?: string
}

export function useSearchCalls(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['calls-search', queryTerm, user?.email ?? 'guest', role],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      let query = supabase
        .from('calls')
        .select('*, contacts!calls_contactId_fkey(name)')

      // Search in ai_summary, transcript, or contact name (column is ai_summary after migration)
      query = query.or(`ai_summary.ilike.%${queryTerm}%,transcript.ilike.%${queryTerm}%,contacts.name.ilike.%${queryTerm}%`)

      const { data, error } = await query.limit(5)

      if (error) {
        console.error('Search calls error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          query: { queryTerm, role, email: user.email }
        })
        return []
      }

      return (data as CallRow[]).map(item => {
        const contact = Array.isArray(item.contacts) ? item.contacts[0] : item.contacts
        return {
          id: item.id,
          contactName: contact?.name || 'Unknown',
          summary: item.ai_summary || item.summary,
          date: item.timestamp || item.created_at || item.createdAt
        }
      })
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}

export function useCallsCount(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['calls-count', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user || !user.email) return 0

      try {
        let query = supabase
          .from('calls')
          .select('id', { count: 'exact', head: true })

        if (searchQuery) {
          query = query.or(`ai_summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%`)
        }

        const { count, error } = await query
        if (error) {
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            return 0
          }
          console.error("Supabase error fetching calls count:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          })
          throw error
        }
        return count || 0
      } catch (error: any) {
        if (error?.name !== 'AbortError' && error?.message !== 'Fetch is aborted') {
          console.error("Error fetching calls count:", error.message || error)
        }
        return 0
      }
    },
    enabled: !loading && !!user && !!user?.email,
    staleTime: 1000 * 60 * 5,
  })
}

type CallContact = {
  name?: string | null
  ownerId?: string | null
}

type CallRow = {
  id: string
  callSid?: string | null
  call_sid?: string | null
  direction?: string | null
  status?: string | null
  duration?: number | null
  timestamp?: string | null
  created_at?: string | null
  createdAt?: string | null
  summary?: string | null
  ai_summary?: string | null
  recording_url?: string | null
  recordingUrl?: string | null
  recording_sid?: string | null
  recordingSid?: string | null
  transcript?: string | null
  ai_insights?: Record<string, unknown> | null
  aiInsights?: Record<string, unknown> | null
  contact_id?: string | null
  contactId?: string | null
  account_id?: string | null
  accountId?: string | null
  from?: string | null
  from_phone?: string | null
  to?: string | null
  to_phone?: string | null
  contact_name?: string | null
  contacts?: CallContact | CallContact[] | null
}

const PAGE_SIZE = 50

export function useCalls(searchQuery?: string) {
  const { user, role, loading } = useAuth()
  const queryClient = useQueryClient()

  // Real-time updates for the calls list
  useEffect(() => {
    if (loading || !user) return

    const channel = supabase
      .channel('global-calls-updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for inserts and updates
          schema: 'public',
          table: 'calls',
        },
        (payload) => {
          console.log('Global call update received:', payload)
          queryClient.invalidateQueries({ queryKey: ['calls'] })
          queryClient.invalidateQueries({ queryKey: ['calls-count'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, loading, queryClient])

  return useInfiniteQuery({
    queryKey: ['calls', user?.email ?? 'guest', role, searchQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (loading || !user) return { calls: [], nextCursor: null }

      // Select only from calls (no join) to avoid FK/relationship errors; use contact_name on calls
      let query = supabase
        .from('calls')
        .select('*', { count: 'exact' })

      if (searchQuery) {
        query = query.or(`ai_summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%,contact_name.ilike.%${searchQuery}%`)
      }

      const from = pageParam * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await query
        .range(from, to)
        .order('timestamp', { ascending: false })

      if (error) {
        console.error('Error fetching calls:', error)
        throw error
      }

      const calls = (data as CallRow[]).map(item => {
        // Map direction/status to UI types
        const type = item.direction === 'inbound' ? 'Inbound' : 'Outbound'
        // Capitalize status
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Completed'
        
        // Format duration (seconds to HH:MM:SS)
        const hours = Math.floor((item.duration || 0) / 3600)
        const minutes = Math.floor(((item.duration || 0) % 3600) / 60)
        const seconds = (item.duration || 0) % 60
        const durationStr = [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':')

        const contact = Array.isArray(item.contacts) ? item.contacts[0] : item.contacts
        const contactName = item.contact_name ?? contact?.name ?? 'Unknown'

        return {
          id: item.id,
          contactName,
          phoneNumber: (item.from_phone || item.from) === user.email ? (item.to_phone || item.to) : (item.from_phone || item.from), // Rough guess
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.created_at || item.createdAt,
          note: item.ai_summary || item.summary,
          recordingUrl: item.recording_url || item.recordingUrl,
          recordingSid: item.recording_sid || item.recordingSid,
          transcript: item.transcript,
          aiInsights: item.ai_insights || item.aiInsights,
          contactId: item.contact_id || item.contactId,
          accountId: item.account_id || item.accountId
        }
      }) as Call[]

      const hasNextPage = count ? from + PAGE_SIZE < count : false

      return {
        calls,
        nextCursor: hasNextPage ? pageParam + 1 : null
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
  })
}

export function useAccountCalls(accountId: string) {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()

  // Subscribe to real-time updates for calls belonging to this account
  useEffect(() => {
    if (!accountId || !user || loading) return

    const channel = supabase
      .channel(`account-calls-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'calls',
          filter: `accountId=eq.${accountId}`,
        },
        (payload) => {
          console.log('Real-time call update for account:', accountId, payload)
          // Invalidate the account calls query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['account-calls', accountId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [accountId, user, loading, queryClient])

  return useQuery({
    queryKey: ['account-calls', accountId, user?.email ?? 'guest'],
    queryFn: async () => {
      if (!accountId || loading || !user) return []

      // Fetch calls by accountId. Use explicit FK for contacts (calls has duplicate FKs to contacts).
      const { data, error } = await supabase
        .from('calls')
        .select('*, contacts!calls_contactId_fkey(name)')
        .eq('accountId', accountId)
        .order('timestamp', { ascending: false })

      if (error) throw error

      return (data as CallRow[]).map(item => {
        const type = item.direction === 'inbound' ? 'Inbound' : 'Outbound'
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Completed'
        const hours = Math.floor((item.duration || 0) / 3600)
        const minutes = Math.floor(((item.duration || 0) % 3600) / 60)
        const seconds = (item.duration || 0) % 60
        const durationStr = [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':')
        const contact = Array.isArray(item.contacts) ? item.contacts[0] : item.contacts

        return {
          id: item.id,
          callSid: item.callSid ?? item.call_sid ?? item.id,
          contactName: contact?.name || 'Unknown',
          phoneNumber: (item.from_phone ?? item.from) || (item.to_phone ?? item.to) || '',
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp ?? item.createdAt ?? item.created_at ?? '',
          note: item.ai_summary ?? item.summary,
          recordingUrl: item.recordingUrl ?? item.recording_url,
          recordingSid: item.recordingSid ?? item.recording_sid,
          transcript: item.transcript,
          aiInsights: item.aiInsights ?? item.ai_insights,
          contactId: item.contactId ?? item.contact_id,
          accountId: item.accountId ?? item.account_id
        }
      }) as Call[]
    },
    enabled: !!accountId && !loading && !!user,
    staleTime: 1000 * 60 * 2, // 2 min – refetch + realtime keep list fresh
    refetchOnWindowFocus: true,
    refetchInterval: 20_000, // Poll every 20s so new calls show without refresh (fallback if Realtime misses)
    refetchIntervalInBackground: false,
  })
}

export function useContactCalls(contactId: string) {
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()

  // Subscribe to real-time updates for calls belonging to this contact
  useEffect(() => {
    if (!contactId || !user || loading) return

    const channel = supabase
      .channel(`contact-calls-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'calls',
          filter: `contactId=eq.${contactId}`,
        },
        (payload) => {
          console.log('Real-time call update for contact:', contactId, payload)
          // Invalidate the contact calls query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['contact-calls', contactId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [contactId, user, loading, queryClient])

  return useQuery({
    queryKey: ['contact-calls', contactId, user?.email],
    queryFn: async () => {
      if (!contactId || loading || !user) return []

      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('contactId', contactId)
        .order('timestamp', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching contact calls:', error)
        return []
      }

      return (data as CallRow[]).map(item => {
        const type = item.direction === 'inbound' ? 'Inbound' : 'Outbound'
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Completed'
        const durationNum = typeof item.duration === 'number' ? item.duration : 0
        const hours = Math.floor(durationNum / 3600)
        const minutes = Math.floor((durationNum % 3600) / 60)
        const seconds = durationNum % 60
        const durationStr = [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':')
        const fromVal = item.from_phone ?? item.from
        const toVal = item.to_phone ?? item.to

        return {
          id: item.id,
          callSid: item.callSid ?? item.call_sid ?? item.id,
          contactName: '',
          phoneNumber: fromVal === user.email ? toVal : fromVal,
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp ?? item.createdAt ?? item.created_at ?? '',
          note: item.ai_summary ?? item.summary,
          recordingUrl: item.recordingUrl ?? item.recording_url,
          recordingSid: item.recordingSid ?? item.recording_sid,
          transcript: item.transcript,
          aiInsights: item.aiInsights ?? item.ai_insights,
          contactId: item.contactId ?? item.contact_id,
          accountId: item.accountId ?? item.account_id
        }
      }) as Call[]
    },
    enabled: !!contactId && !loading && !!user,
    staleTime: 1000 * 60 * 2, // 2 min – refetch + realtime keep list fresh
    refetchOnWindowFocus: true,
    refetchInterval: 20_000, // Poll every 20s so new calls show without refresh (fallback if Realtime misses)
    refetchIntervalInBackground: false,
    gcTime: 1000 * 60 * 60, // 1 hour
  })
}
