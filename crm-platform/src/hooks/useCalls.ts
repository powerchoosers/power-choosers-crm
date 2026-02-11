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
  /** Company/account for display: name, location, industry, logo */
  accountName?: string
  accountCity?: string
  accountState?: string
  accountIndustry?: string
  accountLogoUrl?: string
  accountDomain?: string
}

export function useSearchCalls(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['calls-search', queryTerm, user?.email ?? 'guest', role],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      // PostgREST .or() does not support !fkey hint in the filter, so we search by (1) summary/transcript,
      // (2) contact name via contacts then calls by contactId, and (3) account name via accounts then calls by accountId.
      const term = queryTerm.replace(/%/g, '\\%')
      const selectCalls = '*, contacts!calls_contactId_fkey(name)'

      const [byContentRes, contactIdsRes, accountIdsRes] = await Promise.all([
        supabase
          .from('calls')
          .select(selectCalls)
          .or(`summary.ilike.%${term}%,transcript.ilike.%${term}%`)
          .limit(5),
        supabase.from('contacts').select('id').ilike('name', `%${term}%`).limit(10),
        supabase.from('accounts').select('id').or(`name.ilike.%${term}%,domain.ilike.%${term}%`).limit(10)
      ])

      if (byContentRes.error) {
        const errMsg = typeof byContentRes.error?.message === 'string' ? byContentRes.error.message : String(byContentRes.error)
        console.error('Search calls error:', errMsg, {
          code: (byContentRes.error as { code?: string }).code,
          queryTerm,
          email: user?.email
        })
        return []
      }

      const contactIds = (contactIdsRes.data ?? [])
        .map((r: { id: string }) => r.id)
        .filter(Boolean)
      const accountIds = (accountIdsRes.data ?? [])
        .map((r: { id: string }) => r.id)
        .filter(Boolean)

      let byContactData: CallRow[] = []
      let byAccountData: CallRow[] = []
      const [byContactRes, byAccountRes] = await Promise.all([
        contactIds.length > 0 && contactIdsRes.error == null
          ? supabase.from('calls').select(selectCalls).in('contactId', contactIds).limit(5)
          : Promise.resolve({ data: [] as CallRow[], error: null }),
        accountIds.length > 0 && accountIdsRes.error == null
          ? supabase.from('calls').select(selectCalls).in('accountId', accountIds).limit(5)
          : Promise.resolve({ data: [] as CallRow[], error: null })
      ])
      if (!byContactRes.error && byContactRes.data) byContactData = byContactRes.data as CallRow[]
      if (!byAccountRes.error && byAccountRes.data) byAccountData = byAccountRes.data as CallRow[]

      const byId = new Map<string, CallRow>()
      for (const row of byContentRes.data ?? []) byId.set((row as CallRow).id, row as CallRow)
      for (const row of byContactData) if (!byId.has(row.id)) byId.set(row.id, row)
      for (const row of byAccountData) if (!byId.has(row.id)) byId.set(row.id, row)
      const data = Array.from(byId.values()).slice(0, 5)

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
  account_name?: string | null
  contacts?: CallContact | CallContact[] | null
  accounts?: CallAccount | CallAccount[] | null
}

type CallAccount = {
  name?: string | null
  city?: string | null
  state?: string | null
  industry?: string | null
  logo_url?: string | null
  domain?: string | null
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

      // Join accounts for company display (name, city, state, industry, logo); use explicit FK
      let query = supabase
        .from('calls')
        .select('*, accounts!calls_accountId_fkey(name, city, state, industry, logo_url, domain)', { count: 'exact' })

      if (searchQuery) {
        query = query.or(`summary.ilike.%${searchQuery}%,transcript.ilike.%${searchQuery}%`)
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
        const contactName = contact?.name ?? 'Unknown'
        const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts

        return {
          id: item.id,
          contactName,
          phoneNumber: item.direction === 'outbound' ? (item.to || '') : (item.from || ''),
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp || item.createdAt || '',
          note: item.summary,
          recordingUrl: item.recordingUrl,
          recordingSid: item.callSid || item.id,
          transcript: item.transcript,
          aiInsights: item.aiInsights,
          contactId: item.contactId,
          accountId: item.accountId,
          accountName: account?.name || undefined,
          accountCity: account?.city ?? undefined,
          accountState: account?.state ?? undefined,
          accountIndustry: account?.industry ?? undefined,
          accountLogoUrl: account?.logo_url ?? undefined,
          accountDomain: account?.domain ?? undefined
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

export function useAccountCalls(accountId: string, contactIds?: string[]) {
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
    queryKey: ['account-calls', accountId, contactIds?.join(',') ?? '', user?.email ?? 'guest'],
    queryFn: async () => {
      if (!accountId || loading || !user) return []

      // Fetch calls: accountId = this account, or contactId in contactIds (two queries then merge to avoid .or() issues)
      const [accountRes, contactRes] = await Promise.all([
        supabase.from('calls').select('*, contacts!calls_contactId_fkey(name)').eq('accountId', accountId).order('timestamp', { ascending: false }),
        contactIds && contactIds.length > 0
          ? supabase.from('calls').select('*, contacts!calls_contactId_fkey(name)').in('contactId', contactIds).order('timestamp', { ascending: false })
          : Promise.resolve({ data: [] as CallRow[], error: null })
      ])

      if (accountRes.error) throw accountRes.error
      if (contactRes.error) throw contactRes.error

      const byId = new Map<string, CallRow>()
      for (const row of accountRes.data || []) byId.set(row.id, row)
      for (const row of contactRes.data || []) if (!byId.has(row.id)) byId.set(row.id, row)
      const data = Array.from(byId.values()).sort((a, b) => {
        const ta = (a.timestamp || a.createdAt || '').toString()
        const tb = (b.timestamp || b.createdAt || '').toString()
        return tb.localeCompare(ta)
      })

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
          callSid: item.callSid || item.id,
          contactName: contact?.name || 'Unknown',
          phoneNumber: item.direction === 'outbound' ? (item.to || '') : (item.from || ''),
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp ?? item.createdAt ?? '',
          note: item.summary,
          recordingUrl: item.recordingUrl,
          recordingSid: item.callSid || item.id,
          transcript: item.transcript,
          aiInsights: item.aiInsights,
          contactId: item.contactId,
          accountId: item.accountId
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

export function useContactCalls(contactId: string, companyPhone?: string, accountId?: string) {
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
    queryKey: ['contact-calls', contactId, companyPhone ?? '', accountId ?? '', user?.email],
    queryFn: async () => {
      if (!contactId || loading || !user) return []

      // 1) Calls to/from this contact
      const contactRes = await supabase.from('calls').select('*').eq('contactId', contactId).order('timestamp', { ascending: false }).limit(50)

      if (contactRes.error) {
        console.error('Error fetching contact calls:', contactRes.error)
        return []
      }

      const byId = new Map<string, CallRow>()
      for (const row of contactRes.data || []) byId.set(row.id, row as CallRow)

      // 2) Calls to company phone (to = company number) – many calls have empty to, so also use (3)
      if (companyPhone?.trim()) {
        const normalized = companyPhone.replace(/\D/g, '').slice(-10)
        if (normalized) {
          const companyRes = await supabase.from('calls').select('*').or(`to.ilike.%${normalized}`).order('timestamp', { ascending: false }).limit(50)
          if (!companyRes.error && companyRes.data?.length) {
            for (const row of companyRes.data as CallRow[]) if (!byId.has(row.id)) byId.set(row.id, row)
          }
        }
      }

      // 3) Account-level calls (accountId set, no contact) – same as account dossier “company” calls; often have empty to
      if (accountId?.trim()) {
        const accountRes = await supabase.from('calls').select('*').eq('accountId', accountId).is('contactId', null).order('timestamp', { ascending: false }).limit(50)
        if (!accountRes.error && accountRes.data?.length) {
          for (const row of accountRes.data as CallRow[]) if (!byId.has(row.id)) byId.set(row.id, row)
        }
      }

      let data = Array.from(byId.values()).sort((a, b) => {
        const ta = (a.timestamp || a.createdAt || '').toString()
        const tb = (b.timestamp || b.createdAt || '').toString()
        return tb.localeCompare(ta)
      })

      return (data as CallRow[]).map(item => {
        const type = item.direction === 'inbound' ? 'Inbound' : 'Outbound'
        const status = item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Completed'
        const durationNum = typeof item.duration === 'number' ? item.duration : 0
        const hours = Math.floor(durationNum / 3600)
        const minutes = Math.floor((durationNum % 3600) / 60)
        const seconds = durationNum % 60
        const durationStr = [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':')
        const fromVal = item.from
        const toVal = item.to

        return {
          id: item.id,
          callSid: item.callSid || item.id,
          contactName: '',
          phoneNumber: item.direction === 'outbound' ? (toVal || '') : (fromVal || ''),
          type: type as Call['type'],
          status: status as Call['status'],
          duration: durationStr,
          date: item.timestamp ?? item.createdAt ?? '',
          note: item.summary,
          recordingUrl: item.recordingUrl,
          recordingSid: item.callSid || item.id,
          transcript: item.transcript,
          aiInsights: item.aiInsights,
          contactId: item.contactId,
          accountId: item.accountId
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
