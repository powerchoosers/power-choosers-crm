import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export interface Account {
  id: string
  name: string
  industry: string
  domain: string
  description: string
  logoUrl?: string
  companyPhone: string
  contractEnd: string
  sqft: string
  occupancy: string
  employees: string
  location: string
  updated: string
  ownerId?: string
}

const COLLECTION_NAME = 'accounts'
const PAGE_SIZE = 50

export function useAccounts() {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['accounts', user?.email ?? 'guest', role ?? 'unknown'],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (loading) return { accounts: [], nextCursor: null };
        if (!user && !loading) return { accounts: [], nextCursor: null };

        let query = supabase.from('accounts').select('*', { count: 'exact' });

        // Apply ownership filter for non-admin users
        if (role !== 'admin' && user?.email) {
           query = query.eq('ownerId', user.email);
        }

        const from = pageParam * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error, count } = await query
          .range(from, to)
          .order('name', { ascending: true });

        if (error) {
          console.error("Supabase error:", error);
          throw error;
        }
        
        if (!data) {
          return { accounts: [], nextCursor: null };
        }

        const accounts = data.map(data => {
          return { 
            id: data.id, 
            name: data.name || 'Unknown Account',
            industry: data.industry || '',
            domain: data.domain || '',
            logoUrl: data.logo_url || '',
            companyPhone: data.phone || '',
            contractEnd: data.contract_end_date || '',
            employees: data.employees?.toString() || '',
            location: data.city ? `${data.city}, ${data.state || ''}` : (data.address || ''),
            updated: data.updated_at || new Date().toISOString(),
            // Fields from metadata if they exist
            sqft: data.metadata?.sqft || '',
            occupancy: data.metadata?.occupancy || '',
            ownerId: data.ownerId
          }
        }) as Account[];

        const hasNextPage = count ? from + PAGE_SIZE < count : false;

        return { 
          accounts, 
          nextCursor: hasNextPage ? pageParam + 1 : null
        };
      } catch (error) {
        console.error("Error fetching accounts from Supabase:", error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user, // Only run query when user is loaded
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24,   // 24 hours
  })
}

export function useAccount(id: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['account', id, user?.email ?? 'guest'],
    queryFn: async () => {
      if (!id || loading || !user) return null

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error("Error fetching account from Supabase:", error)
        throw error
      }

      if (!data) return null

      return { 
        id: data.id, 
        name: data.name || 'Unknown Account',
        industry: data.industry || '',
        domain: data.domain || '',
        logoUrl: data.logo_url || '',
        companyPhone: data.phone || '',
        contractEnd: data.contract_end_date || '',
        employees: data.employees?.toString() || '',
        location: data.city ? `${data.city}, ${data.state || ''}` : (data.address || ''),
        updated: data.updated_at || new Date().toISOString(),
        sqft: data.metadata?.sqft || '',
        occupancy: data.metadata?.occupancy || '',
        ownerId: data.ownerId
      } as Account
    },
    enabled: !!id && !loading && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useAccountsCount() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['accounts-count', user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (loading) return 0
      if (!user) return 0

      let query = supabase.from('accounts').select('*', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
      }

      const { count, error } = await query

      if (error) {
        console.error("Error fetching accounts count:", error)
        return 0
      }

      return count || 0
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newAccount: Omit<Account, 'id'>) => {
      // Map frontend fields to DB columns
      const dbAccount = {
        name: newAccount.name,
        industry: newAccount.industry,
        domain: newAccount.domain,
        logo_url: newAccount.logoUrl,
        phone: newAccount.companyPhone,
        contract_end_date: newAccount.contractEnd || null,
        employees: parseInt(newAccount.employees) || null,
        city: newAccount.location?.split(',')[0]?.trim(),
        state: newAccount.location?.split(',')[1]?.trim(),
        metadata: {
          sqft: newAccount.sqft,
          occupancy: newAccount.occupancy
        }
      }

      const { data, error } = await supabase
        .from('accounts')
        .insert(dbAccount)
        .select()
        .single()

      if (error) throw error
      
      // Return roughly what we sent, plus ID
      return { id: data.id, ...newAccount }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Account> & { id: string }) => {
      // Map updates to DB columns
      const dbUpdates: Record<string, string | number | null> = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.industry !== undefined) dbUpdates.industry = updates.industry
      if (updates.domain !== undefined) dbUpdates.domain = updates.domain
      if (updates.description !== undefined) dbUpdates.description = updates.description
      if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl
      if (updates.companyPhone !== undefined) dbUpdates.phone = updates.companyPhone
      if (updates.contractEnd !== undefined) dbUpdates.contract_end_date = updates.contractEnd || null
      if (updates.employees !== undefined) dbUpdates.employees = parseInt(updates.employees) || null
      if (updates.location !== undefined) {
        dbUpdates.city = updates.location?.split(',')[0]?.trim()
        dbUpdates.state = updates.location?.split(',')[1]?.trim()
      }
      
      // Handle metadata updates if needed (simplified)
      if (updates.sqft || updates.occupancy) {
         // This is tricky without fetching first, but for now we might skip or do a simple merge if supported
         // Supabase doesn't deeply merge JSONB on update easily without custom function or fetch-merge-update
         // For now, let's assume metadata is small enough to overwrite or ignore for this MVP
      }

      dbUpdates.updated_at = new Date().toISOString()

      const { error } = await supabase
        .from('accounts')
        .update(dbUpdates)
        .eq('id', id)

      if (error) throw error
      return { id, ...updates }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}
