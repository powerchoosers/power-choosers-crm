import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { type Deal, type DealStage, type CreateDealInput, type UpdateDealInput } from '@/types/deals'

const PAGE_SIZE = 50
const QUERY_BUSTER = 'v1'

interface DealsFilters {
  stage?: DealStage | 'ALL'
  accountId?: string
  search?: string
}

// ---------------------------------------------------------------------------
// Main paginated deals list (for /network/contracts page)
// ---------------------------------------------------------------------------
export function useDeals(filters?: DealsFilters) {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['deals', QUERY_BUSTER, user?.email, role, filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      if (loading || !user) return { deals: [], nextCursor: null }

      let query = supabase
        .from('deals')
        .select('*', { count: 'exact' })

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
      }

      if (filters?.stage && filters.stage !== 'ALL') {
        query = query.eq('stage', filters.stage)
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
      let accountMap: Record<string, { name: string; domain?: string }> = {}

      if (accountIds.length > 0) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, domain')
          .in('id', accountIds)
        if (accounts) {
          accounts.forEach(a => { accountMap[a.id] = { name: a.name, domain: a.domain } })
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

// ---------------------------------------------------------------------------
// Deals for a specific account (RightPanel + VectorControlModule)
// ---------------------------------------------------------------------------
export function useDealsByAccount(accountId?: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['deals-by-account', QUERY_BUSTER, accountId],
    queryFn: async () => {
      if (!accountId) return []
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('accountId', accountId)
        .order('createdAt', { ascending: false })
      if (error) throw error
      return (data || []) as Deal[]
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
    queryKey: ['deals-by-contact', QUERY_BUSTER, contactId],
    queryFn: async () => {
      if (!contactId) return []
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('contactId', contactId)
        .order('createdAt', { ascending: false })
      if (error) throw error
      return (data || []) as Deal[]
    },
    enabled: !!contactId && !loading && !!user,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Contract initialized')
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
    mutationFn: async ({ id, ...updates }: UpdateDealInput) => {
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      if (data?.stage === 'SECURED') {
        toast.success('Contract secured — account promoted to Customer')
      } else {
        toast.success('Contract updated')
      }
    },
    onError: (error) => {
      console.error('Error updating deal:', error)
      toast.error('Failed to update contract')
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
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] })
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
    queryKey: ['deals-stats', QUERY_BUSTER, user?.email, role],
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
