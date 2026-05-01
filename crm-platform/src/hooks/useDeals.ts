import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { ensureFreshSupabaseSession } from '@/lib/auth/supabase-session'
import { type Deal, type DealStage, type CreateDealInput, type UpdateDealInput } from '@/types/deals'
import { buildOwnerScopeValues } from '@/lib/owner-scope'

const PAGE_SIZE = 50
export const DEALS_QUERY_BUSTER = 'v1'

interface DealsFilters {
  stage?: DealStage | DealStage[] | 'ALL'
  accountId?: string
  search?: string
}

// ---------------------------------------------------------------------------
// Main paginated deals list (for /network/contracts page)
// ---------------------------------------------------------------------------
export function useDeals(filters?: DealsFilters) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useInfiniteQuery({
    queryKey: ['deals', DEALS_QUERY_BUSTER, user?.id ?? user?.email ?? 'guest', role, filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (loading || !user) return { deals: [], nextCursor: null }

      let query = supabase
        .from('deals')
        .select('*, signature_requests(id, status, created_at, updated_at, expires_at)')

      if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
        query = query.in('ownerId', ownerScopeValues)
      }

      if (filters?.stage && filters.stage !== 'ALL') {
        const stages = Array.isArray(filters.stage) ? filters.stage : [filters.stage]
        query = stages.length > 1 ? query.in('stage', stages) : query.eq('stage', stages[0])
      }

      if (filters?.accountId) {
        query = query.eq('accountId', filters.accountId)
      }

      if (filters?.search) {
        query = query.ilike('title', `%${filters.search}%`)
      }

      const from = (pageParam as number) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await query
        .range(from, to)
        .order('createdAt', { ascending: false })

      if (error) throw error

      // Batch-fetch account names for the returned deals
      const accountIds = [...new Set((data || []).map(d => d.accountId).filter(Boolean))]
      let accountMap: Record<string, { name: string; domain?: string; logo_url?: string }> = {}

      if (accountIds.length > 0) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, domain, logo_url')
          .in('id', accountIds)
        if (accounts) {
          accounts.forEach(a => { accountMap[a.id] = { name: a.name, domain: a.domain, logo_url: a.logo_url } })
        }
      }

      const deals = (data || []).map(d => ({
        ...d,
        account: accountMap[d.accountId] || undefined,
      })) as Deal[]

      return {
        deals,
        nextCursor: count && ((pageParam as number) + 1) * PAGE_SIZE < count
          ? (pageParam as number) + 1
          : null,
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useDealsCount(filters?: DealsFilters) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useQuery({
    queryKey: ['deals-count', DEALS_QUERY_BUSTER, user?.id ?? user?.email ?? 'guest', role, filters],
    queryFn: async () => {
      if (loading || !user) return 0

      let query = supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })

      if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
        query = query.in('ownerId', ownerScopeValues)
      }

      if (filters?.stage && filters.stage !== 'ALL') {
        const stages = Array.isArray(filters.stage) ? filters.stage : [filters.stage]
        query = stages.length > 1 ? query.in('stage', stages) : query.eq('stage', stages[0])
      }

      if (filters?.accountId) {
        query = query.eq('accountId', filters.accountId)
      }

      if (filters?.search) {
        query = query.ilike('title', `%${filters.search}%`)
      }

      const { count, error } = await query
      if (error) throw error
      return count || 0
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}


// ---------------------------------------------------------------------------
// Deals for a specific account (RightPanel + VectorControlModule)
// ---------------------------------------------------------------------------
export function useDealsByAccount(accountId?: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['deals-by-account', DEALS_QUERY_BUSTER, accountId],
    queryFn: async () => {
      if (!accountId) return []
      const { data, error } = await supabase
        .from('deals')
        .select('*, signature_requests(id, status, created_at, updated_at, expires_at)')
        .eq('accountId', accountId)
        .order('createdAt', { ascending: false })
      if (error) throw error

      const deals = (data || []) as Deal[]
      const accountIds = [...new Set(deals.map((d) => d.accountId).filter(Boolean))]
      let accountMap: Record<string, { name: string; domain?: string; logo_url?: string; annualUsage?: string | number }> = {}

      if (accountIds.length > 0) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, domain, logo_url, annual_usage')
          .in('id', accountIds)
        if (accounts) {
          accounts.forEach((a) => {
            accountMap[a.id] = {
              name: a.name,
              domain: a.domain,
              logo_url: a.logo_url,
              annualUsage: a.annual_usage,
            }
          })
        }
      }

      return deals.map((d) => ({
        ...d,
        account: accountMap[d.accountId] || d.account,
      })) as Deal[]
    },
    enabled: !!accountId && !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

// ---------------------------------------------------------------------------
// Deals for a specific contact (RightPanel + VectorControlModule)
// ---------------------------------------------------------------------------
export function useDealsByContact(contactId?: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['deals-by-contact', DEALS_QUERY_BUSTER, contactId],
    queryFn: async () => {
      if (!contactId) return []
      const { data, error } = await supabase
        .from('deals')
        .select('*, signature_requests(id, status, created_at, updated_at, expires_at)')
        .eq('contactId', contactId)
        .order('createdAt', { ascending: false })
      if (error) throw error

      const deals = (data || []) as Deal[]
      const accountIds = [...new Set(deals.map((d) => d.accountId).filter(Boolean))]
      let accountMap: Record<string, { name: string; domain?: string; logo_url?: string; annualUsage?: string | number }> = {}

      if (accountIds.length > 0) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, domain, logo_url, annual_usage')
          .in('id', accountIds)
        if (accounts) {
          accounts.forEach((a) => {
            accountMap[a.id] = {
              name: a.name,
              domain: a.domain,
              logo_url: a.logo_url,
              annualUsage: a.annual_usage,
            }
          })
        }
      }

      return deals.map((d) => ({
        ...d,
        account: accountMap[d.accountId] || d.account,
      })) as Deal[]
    },
    enabled: !!contactId && !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

// ---------------------------------------------------------------------------
// Single deal fetch (for /network/contracts/[id] page)
// ---------------------------------------------------------------------------
export function useDeal(id: string | undefined) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['deal', DEALS_QUERY_BUSTER, id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('deals')
        .select('*, signature_requests(id, status, created_at, updated_at, expires_at)')
        .eq('id', id)
        .single()
      if (error) throw error

      // Fetch account context for icon/name/rate math displays.
      let account: { name: string; domain?: string; annualUsage?: string | number; logo_url?: string } | undefined
      if (data.accountId) {
        const { data: acc } = await supabase
          .from('accounts')
          .select('name, domain, annual_usage, logo_url')
          .eq('id', data.accountId)
          .single()
        if (acc) {
          account = {
            name: acc.name,
            domain: acc.domain,
            annualUsage: acc.annual_usage,
            logo_url: acc.logo_url,
          }
        }
      }
      return { ...data, account } as Deal
    },
    enabled: !!id && !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

// ---------------------------------------------------------------------------
// Create deal
// ---------------------------------------------------------------------------
export function useCreateDeal() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateDealInput) => {
      await ensureFreshSupabaseSession()
      const { data, error } = await supabase
        .from('deals')
        .insert({
          ...input,
          id: crypto.randomUUID(),
          stage: input.stage || 'IDENTIFIED',
          ownerId: user?.email,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw error
      return data as Deal
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ['deal', DEALS_QUERY_BUSTER, data.id] })
      }
      if (data?.accountId) {
        await ensureFreshSupabaseSession()
        queryClient.invalidateQueries({ queryKey: ['deals-by-account', DEALS_QUERY_BUSTER, data.accountId] })
        queryClient.invalidateQueries({ queryKey: ['account', data.accountId] })

        // Sync to account
        const accountUpdates: any = {}
        if (data.annualUsage != null) accountUpdates.annual_usage = String(data.annualUsage)
        if (data.mills != null) {
          // Fetch current account to merge metadata
          const { data: acc } = await supabase.from('accounts').select('metadata').eq('id', data.accountId).single()
          accountUpdates.metadata = { ...(acc?.metadata || {}), mills: String(data.mills) }
        }
        if (data.closeDate != null) accountUpdates.contract_end_date = data.closeDate

        if (Object.keys(accountUpdates).length > 0) {
          await supabase.from('accounts').update(accountUpdates).eq('id', data.accountId)
          queryClient.invalidateQueries({ queryKey: ['account', data.accountId] })
          queryClient.invalidateQueries({ queryKey: ['accounts'] })
        }
      }
      if (data?.contactId) queryClient.invalidateQueries({ queryKey: ['deals-by-contact', DEALS_QUERY_BUSTER, data.contactId] })
    },
    onError: (error) => {
      console.error('Error creating deal:', error)
      toast.error('Failed to initialize contract')
    },
  })
}

// ---------------------------------------------------------------------------
// Update deal — auto-promotes account to CUSTOMER when stage = SECURED
// ---------------------------------------------------------------------------
export function useUpdateDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ['deals'] })
      await queryClient.cancelQueries({ queryKey: ['deal', DEALS_QUERY_BUSTER, id] })
      await queryClient.cancelQueries({ queryKey: ['deals-by-account'] })
      await queryClient.cancelQueries({ queryKey: ['deals-by-contact'] })

      const previousDeal = queryClient.getQueryData<Deal>(['deal', DEALS_QUERY_BUSTER, id])
      const previousDealsQueries = queryClient.getQueriesData<{ pages: Array<{ deals: Deal[]; nextCursor: number | null }>; pageParams: unknown[] }>({
        queryKey: ['deals', DEALS_QUERY_BUSTER],
      })
      const previousAccountDeals = queryClient.getQueriesData<Deal[]>({
        queryKey: ['deals-by-account', DEALS_QUERY_BUSTER],
      })
      const previousContactDeals = queryClient.getQueriesData<Deal[]>({
        queryKey: ['deals-by-contact', DEALS_QUERY_BUSTER],
      })

      const applyUpdates = (deal: Deal): Deal => ({
        ...deal,
        ...updates,
        contactId: updates.contactId === null ? undefined : (updates.contactId ?? deal.contactId),
        updatedAt: new Date().toISOString(),
      })

      queryClient.setQueryData<Deal | null>(['deal', DEALS_QUERY_BUSTER, id], (current) => {
        if (!current) return current ?? null
        return applyUpdates(current)
      })

      queryClient.setQueriesData<{ pages: Array<{ deals: Deal[]; nextCursor: number | null }>; pageParams: unknown[] }>(
        { queryKey: ['deals', DEALS_QUERY_BUSTER] },
        (current) => {
          if (!current) return current
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              deals: page.deals.map((deal) => (deal.id === id ? applyUpdates(deal) : deal)),
            })),
          }
        }
      )

      queryClient.setQueriesData<Deal[]>(
        { queryKey: ['deals-by-account', DEALS_QUERY_BUSTER] },
        (current) => current?.map((deal) => (deal.id === id ? applyUpdates(deal) : deal)) ?? current
      )

      queryClient.setQueriesData<Deal[]>(
        { queryKey: ['deals-by-contact', DEALS_QUERY_BUSTER] },
        (current) => current?.map((deal) => (deal.id === id ? applyUpdates(deal) : deal)) ?? current
      )

      return {
        previousDeal,
        previousDealsQueries,
        previousAccountDeals,
        previousContactDeals,
      }
    },
    mutationFn: async ({ id, ...updates }: UpdateDealInput) => {
      await ensureFreshSupabaseSession()
      const { data, error } = await supabase
        .from('deals')
        .update({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Auto-promote linked account to CUSTOMER on SECURED
      if (updates.stage === 'SECURED' && data?.accountId) {
        await supabase
          .from('accounts')
          .update({ status: 'CUSTOMER' })
          .eq('id', data.accountId)
      }

      return data as Deal
    },
    onError: (error, _variables, context) => {
      if (context?.previousDeal) {
        queryClient.setQueryData(['deal', DEALS_QUERY_BUSTER, context.previousDeal.id], context.previousDeal)
      }
      if (context?.previousDealsQueries) {
        context.previousDealsQueries.forEach(([key, value]) => {
          queryClient.setQueryData(key, value)
        })
      }
      if (context?.previousAccountDeals) {
        context.previousAccountDeals.forEach(([key, value]) => {
          queryClient.setQueryData(key, value)
        })
      }
      if (context?.previousContactDeals) {
        context.previousContactDeals.forEach(([key, value]) => {
          queryClient.setQueryData(key, value)
        })
      }

      console.error('Error updating deal:', error)
      toast.error('Failed to update contract')
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ['deal', DEALS_QUERY_BUSTER, data.id] })
      }
      queryClient.invalidateQueries({ queryKey: ['deal'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      if (data?.accountId) {
        await ensureFreshSupabaseSession()
        queryClient.invalidateQueries({ queryKey: ['deals-by-account', DEALS_QUERY_BUSTER, data.accountId] })
        queryClient.invalidateQueries({ queryKey: ['account', data.accountId] })

        // Sync to account
        const accountUpdates: any = {}
        if (data.annualUsage != null) accountUpdates.annual_usage = String(data.annualUsage)
        if (data.mills != null) {
          const { data: acc } = await supabase.from('accounts').select('metadata').eq('id', data.accountId).single()
          accountUpdates.metadata = { ...(acc?.metadata || {}), mills: String(data.mills) }
        }
        if (data.closeDate != null) accountUpdates.contract_end_date = data.closeDate

        if (Object.keys(accountUpdates).length > 0) {
          await supabase.from('accounts').update(accountUpdates).eq('id', data.accountId)
          queryClient.invalidateQueries({ queryKey: ['account', data.accountId] })
        }
      }
      if (data?.contactId) queryClient.invalidateQueries({ queryKey: ['deals-by-contact', DEALS_QUERY_BUSTER, data.contactId] })

      if (data?.stage === 'SECURED') {
        toast.success('Contract secured — account promoted to Customer')
      } else {
        toast.success('Contract updated')
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Delete deal
// ---------------------------------------------------------------------------
export function useDeleteDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSupabaseSession()
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
      queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })
      toast.success('Contract terminated')
    },
    onError: (error) => {
      console.error('Error deleting deal:', error)
      toast.error('Failed to terminate contract')
    },
  })
}

// ---------------------------------------------------------------------------
// Pipeline summary stats (for dashboard KPI card)
// ---------------------------------------------------------------------------
export function useDealsStats() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['deals-stats', DEALS_QUERY_BUSTER, user?.email, role],
    queryFn: async () => {
      if (loading || !user) return null

      let query = supabase.from('deals').select('stage, amount, closeDate')

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
      }

      // Exclude terminated
      query = query.neq('stage', 'TERMINATED')

      const { data, error } = await query
      if (error) throw error

      const deals = data || []
      const now = new Date()
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      const totalPipeline = deals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
      const closing30d = deals.filter(d => {
        if (!d.closeDate) return false
        const close = new Date(d.closeDate)
        return close >= now && close <= in30Days
      })
      const engagedCount = deals.filter(d => d.stage === 'ENGAGED').length
      const securedCount = deals.filter(d => d.stage === 'SECURED').length

      return {
        totalPipeline,
        closing30dCount: closing30d.length,
        closing30dValue: closing30d.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
        engagedCount,
        securedCount,
        totalActive: deals.length,
      }
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}
