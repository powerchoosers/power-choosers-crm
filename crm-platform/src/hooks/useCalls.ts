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

export function useCallsCount(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['calls-count', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user) return 0

      let query = supabase
        .from('calls')
        .select('*, contacts!inner(name, ownerId)', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.filter('contacts.ownerId', 'eq', user.email)
      }

      if (searchQuery) {
        query = query.or(`summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%,contacts.name.ilike.%${searchQuery}%`)
      }

      const { count, error } = await query
      if (error) throw error
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
  summary?: string | null
  recordingUrl?: string | null
  transcript?: string | null
  contactId?: string | null
  from?: string | null
  to?: string | null
  contacts?: CallContact | CallContact[] | null
}

const PAGE_SIZE = 50

export function useCalls(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['calls', user?.email ?? 'guest', role, searchQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (loading) return { calls: [], nextCursor: null }
      if (!user) return { calls: [], nextCursor: null }

      let query = supabase
        .from('calls')
        .select('*, contacts!inner(name, ownerId)', { count: 'exact' })
      
      if (role !== 'admin' && user.email) {
         query = query.filter('contacts.ownerId', 'eq', user.email)
      }

      if (searchQuery) {
        // Search in contact name, summary, or transcript
        query = query.or(`summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%,contacts.name.ilike.%${searchQuery}%`)
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
          phoneNumber: item.from === user.email ? item.to : item.from, // Rough guess
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.created_at,
          note: item.summary,
          recordingUrl: item.recordingUrl,
          transcript: item.transcript,
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
