import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export interface Call {
  id: string
  contactName: string
  phoneNumber: string
  type: 'Inbound' | 'Outbound'
  status: 'Completed' | 'Missed' | 'Voicemail' | 'in-progress' | 'failed' | 'no-answer' | 'busy' | 'canceled' | 'queued' | 'ringing'
  duration: string
  date: string
  note?: string
  recordingUrl?: string
  summary?: string
  transcript?: string
  contactId?: string
}

export function useSearchCalls(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['calls-search', queryTerm, user?.email ?? 'guest', role],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      // Use owner_id from calls table directly for better performance and reliability
      let query = supabase
        .from('calls')
        .select('*, contacts(name, ownerId)')
    
      if (role !== 'admin' && user.email) {
         query = query.eq('owner_id', user.email)
      }

      // Search in summary, transcript, or contact name
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
          summary: item.ai_summary,
          date: item.timestamp || item.created_at
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
      if (loading || !user) return 0

      let query = supabase
        .from('calls')
        .select('*, contacts(name, ownerId)', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.eq('owner_id', user.email)
      }

      if (searchQuery) {
        query = query.or(`ai_summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%,contacts.name.ilike.%${searchQuery}%`)
      }

      const { count, error } = await query
      if (error) {
        console.error('Calls count error:', error)
        return 0
      }
      return count || 0
    },
    enabled: !loading && !!user,
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
  created_at?: string | null
  ai_summary?: string | null
  recording_url?: string | null
  transcript?: string | null
  contact_id?: string | null
  from_phone?: string | null
  to_phone?: string | null
  contacts?: CallContact | CallContact[] | null
}

const PAGE_SIZE = 50

export function useCalls(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['calls', user?.email ?? 'guest', role, searchQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (loading || !user) return { calls: [], nextCursor: null }

      let query = supabase
        .from('calls')
        .select('*, contacts(name, ownerId)', { count: 'exact' })
      
      if (role !== 'admin' && user.email) {
         query = query.eq('owner_id', user.email)
      }

      if (searchQuery) {
        // Search in contact name, summary, or transcript
        query = query.or(`ai_summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%,contacts.name.ilike.%${searchQuery}%`)
      }

      const from = pageParam * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await query
        .range(from, to)
        .order('created_at', { ascending: false })

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
        
        // Format duration (seconds to mm:ss)
        const minutes = Math.floor((item.duration || 0) / 60)
        const seconds = (item.duration || 0) % 60
        const durationStr = `${minutes}m ${seconds}s`

        return {
          id: item.id,
          contactName: contact?.name || 'Unknown',
          phoneNumber: item.from_phone === user.email ? item.to_phone : item.from_phone, // Rough guess
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.created_at,
          note: item.ai_summary,
          recordingUrl: item.recording_url,
          transcript: item.transcript,
          contactId: item.contact_id
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

export function useContactCalls(contactId: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['contact-calls', contactId, user?.email],
    queryFn: async () => {
      if (!contactId || loading || !user) return []

      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Error fetching contact calls:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw error
      }

      return (data as CallRow[]).map(item => {
        const type = item.direction === 'inbound' ? 'Inbound' : 'Outbound'
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Completed'
        const minutes = Math.floor((item.duration || 0) / 60)
        const seconds = (item.duration || 0) % 60
        const durationStr = `${minutes}m ${seconds}s`

        return {
          id: item.id,
          contactName: '', // Not needed for single contact view
          phoneNumber: item.from_phone === user.email ? item.to_phone : item.from_phone,
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.created_at,
          note: item.ai_summary,
          recordingUrl: item.recording_url,
          transcript: item.transcript,
          contactId: item.contact_id
        }
      }) as Call[]
    },
    enabled: !!contactId && !loading && !!user,
  })
}
