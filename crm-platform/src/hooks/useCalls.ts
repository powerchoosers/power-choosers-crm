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
        .select('*, contacts(name, ownerId)')

      // Search in summary, transcript, or contact name
      query = query.or(`summary.ilike.%${queryTerm}%,transcript.ilike.%${queryTerm}%,contacts.name.ilike.%${queryTerm}%`)

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
          summary: item.summary,
          date: item.timestamp || item.createdAt
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
          query = query.or(`summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%`)
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
  direction?: string | null
  status?: string | null
  duration?: number | null
  timestamp?: string | null
  createdAt?: string | null
  summary?: string | null
  recordingUrl?: string | null
  recordingSid?: string | null
  transcript?: string | null
  aiInsights?: Record<string, unknown> | null
  contactId?: string | null
  accountId?: string | null
  from?: string | null
  to?: string | null
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

      let query = supabase
        .from('calls')
        .select('*, contacts(name, ownerId)', { count: 'exact' })

      if (searchQuery) {
        // Search in contact name, summary, or transcript
        query = query.or(`summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%,contacts.name.ilike.%${searchQuery}%`)
      }

      const from = pageParam * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await query
        .range(from, to)
        .order('createdAt', { ascending: false })

      if (error) {
        console.error('Error fetching calls:', error)
        throw error
      }

      const calls = (data as CallRow[]).map(item => {
        const contact = Array.isArray(item.contacts) ? item.contacts[0] : item.contacts
        
        // Map direction/status to UI types
        const type = item.direction === 'inbound' ? 'Inbound' : 'Outbound'
        // Capitalize status
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Completed'
        
        // Format duration (seconds to HH:MM:SS)
        const hours = Math.floor((item.duration || 0) / 3600)
        const minutes = Math.floor(((item.duration || 0) % 3600) / 60)
        const seconds = (item.duration || 0) % 60
        const durationStr = [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':')

        return {
          id: item.id,
          contactName: contact?.name || 'Unknown',
          phoneNumber: item.from === user.email ? item.to : item.from, // Rough guess
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.createdAt,
          note: item.summary,
          recordingUrl: item.recordingUrl,
          recordingSid: item.recordingSid,
          transcript: item.transcript,
          aiInsights: item.aiInsights,
          contactId: item.contactId
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

      // Fetch calls directly by accountId
      const { data, error } = await supabase
        .from('calls')
        .select('*, contacts(name)')
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
          contactName: contact?.name || 'Unknown',
          phoneNumber: item.from || item.to || '',
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.createdAt,
          note: item.summary,
          recordingUrl: item.recordingUrl,
          recordingSid: item.recordingSid,
          transcript: item.transcript,
          aiInsights: item.aiInsights,
          contactId: item.contactId,
          accountId: item.accountId
        }
      }) as Call[]
    },
    enabled: !!accountId && !loading && !!user,
    staleTime: 1000 * 60 * 5,
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
        .order('createdAt', { ascending: false })
        .limit(20) // Increased from 10 to 20 for better coverage

      if (error) {
        console.error('Error fetching contact calls:', error)
        return []
      }

      return (data as CallRow[]).map(item => {
        const type = item.direction === 'inbound' ? 'Inbound' : 'Outbound'
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Completed'
        const hours = Math.floor((item.duration || 0) / 3600)
        const minutes = Math.floor(((item.duration || 0) % 3600) / 60)
        const seconds = (item.duration || 0) % 60
        const durationStr = [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':')

        return {
          id: item.id,
          contactName: '', // Not needed for single contact view
          phoneNumber: item.from === user.email ? item.to : item.from,
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.createdAt,
          note: item.summary,
          recordingUrl: item.recordingUrl,
          recordingSid: item.recordingSid,
          transcript: item.transcript,
          aiInsights: item.aiInsights,
          contactId: item.contactId
        }
      }) as Call[]
    },
    enabled: !!contactId && !loading && !!user,
    staleTime: 1000 * 60 * 10, // 10 minutes - Rely on real-time updates for freshness
    gcTime: 1000 * 60 * 60, // 1 hour
  })
}
