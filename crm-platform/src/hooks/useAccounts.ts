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
  revenue?: string
  location: string
  serviceAddresses?: any[]
  address?: string
  updated: string
  ownerId?: string
  linkedinUrl?: string
  // Forensic/Asset Fields
  loadFactor?: number // 0-1
  loadZone?: string
  annualUsage?: string
  electricitySupplier?: string
  currentRate?: string
  status?: 'ACTIVE_LOAD' | 'PROSPECT' | 'CHURNED'
  meters?: Array<{
    id: string
    esiId: string
    address: string
    rate: string
    endDate: string
  }>
  metadata?: any
}

export interface AccountFilters {
  industry?: string[]
  status?: string[]
  location?: string[]
}

const PAGE_SIZE = 50

export function useSearchAccounts(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['accounts-search', queryTerm, user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase.from('accounts').select('*');

        if (role !== 'admin' && user?.email) {
          query = query.eq('ownerId', user.email);
        }

        query = query.or(`name.ilike.%${queryTerm}%,domain.ilike.%${queryTerm}%,industry.ilike.%${queryTerm}%`);

        const { data, error } = await query.limit(10);

        if (error) {
          console.error("Search error:", error);
          return [];
        }

        return data.map(item => ({
          id: item.id,
          name: item.name || 'Unknown Account',
          industry: item.industry || '',
          domain: item.domain || '',
          logoUrl: item.logo_url || '',
        }));
      } catch (err) {
        console.error("Search hook error:", err);
        return [];
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  });
}

export function useAccounts(searchQuery?: string, filters?: AccountFilters) {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['accounts', user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters],
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

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%,industry.ilike.%${searchQuery}%`);
        }

        // Apply column filters
        if (filters?.industry && filters.industry.length > 0) {
          query = query.in('industry', filters.industry);
        }
        if (filters?.status && filters.status.length > 0) {
          query = query.in('status', filters.status);
        }
        if (filters?.location && filters.location.length > 0) {
          const locConditions = filters.location.map(loc => `city.ilike.%${loc}%,state.ilike.%${loc}%,address.ilike.%${loc}%`).join(',');
          query = query.or(locConditions);
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
            revenue: data.revenue || '',
            location: data.city ? `${data.city}, ${data.state || ''}` : (data.address || ''),
            serviceAddresses: data.service_addresses || data.metadata?.service_addresses || [],
            address: data.address || '',
            updated: data.updatedAt || new Date().toISOString(),
            // Fields from metadata if they exist
            sqft: data.metadata?.sqft || '',
            occupancy: data.metadata?.occupancy || '',
            ownerId: data.ownerId,
            linkedinUrl: data.linkedinUrl || data.linkedin_url || data.metadata?.linkedinUrl || data.metadata?.linkedin || '',
            // Forensic/Asset Fields
            loadFactor: data.metadata?.loadFactor ?? 0.45, // Default for visual testing
            loadZone: data.metadata?.loadZone || data.metadata?.zone || 'LZ_NORTH',
            annualUsage: data.annual_usage || data.metadata?.annualUsage || '',
            electricitySupplier: data.electricity_supplier || data.metadata?.supplier || '',
            currentRate: data.current_rate || data.metadata?.rate || '',
            status: data.status || 'PROSPECT',
            meters: data.metadata?.meters || [],
            metadata: data.metadata || {}
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
        description: data.description || '',
        logoUrl: data.logo_url || '',
        companyPhone: data.phone || '',
        contractEnd: data.contract_end_date || '',
        employees: data.employees?.toString() || '',
        revenue: data.revenue || '',
        location: data.city ? `${data.city}, ${data.state || ''}` : (data.address || ''),
        serviceAddresses: data.service_addresses || data.metadata?.service_addresses || [],
        address: data.address || '',
        updated: data.updatedAt || new Date().toISOString(),
        sqft: data.metadata?.sqft || '',
        occupancy: data.metadata?.occupancy || '',
        ownerId: data.ownerId,
        linkedinUrl: data.linkedinUrl || data.linkedin_url || data.metadata?.linkedinUrl || data.metadata?.linkedin || '',
        // Forensic/Asset Fields
        loadFactor: data.metadata?.loadFactor ?? 0.45,
        loadZone: data.metadata?.loadZone || data.metadata?.zone || 'LZ_NORTH',
        annualUsage: data.annual_usage || data.metadata?.annualUsage || '',
        electricitySupplier: data.electricity_supplier || data.metadata?.supplier || '',
        currentRate: data.current_rate || data.metadata?.rate || '',
        status: data.status || 'PROSPECT',
        meters: data.metadata?.meters || [],
        metadata: data.metadata || {}
      } as Account
    },
    enabled: !!id && !loading && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useAccountsCount(searchQuery?: string, filters?: AccountFilters) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['accounts-count', user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters],
    queryFn: async () => {
      if (loading) return 0
      if (!user) return 0

      let query = supabase.from('accounts').select('*', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%,industry.ilike.%${searchQuery}%`);
      }

      // Apply column filters
      if (filters?.industry && filters.industry.length > 0) {
        query = query.in('industry', filters.industry);
      }
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.location && filters.location.length > 0) {
        const locConditions = filters.location.map(loc => `city.ilike.%${loc}%,state.ilike.%${loc}%,address.ilike.%${loc}%`).join(',');
        query = query.or(locConditions);
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
      // 1. Fetch current data to get metadata
      const { data: current, error: fetchError } = await supabase
        .from('accounts')
        .select('metadata')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        console.warn('Could not fetch current metadata, proceeding with empty metadata', fetchError)
      }
      
      const currentMetadata = current?.metadata || {}

      // 2. Map updates to DB columns
      const dbUpdates: Record<string, string | number | null | object> = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.industry !== undefined) dbUpdates.industry = updates.industry
      if (updates.domain !== undefined) dbUpdates.domain = updates.domain
      if (updates.description !== undefined) dbUpdates.description = updates.description
      if (updates.logoUrl !== undefined) dbUpdates.logo_url = updates.logoUrl
      if (updates.companyPhone !== undefined) dbUpdates.phone = updates.companyPhone
      if (updates.contractEnd !== undefined) dbUpdates.contract_end_date = updates.contractEnd || null
      if (updates.employees !== undefined) dbUpdates.employees = updates.employees ? (parseInt(updates.employees) || null) : null
      if (updates.location !== undefined) {
        const parts = updates.location?.split(',') || []
        dbUpdates.city = parts[0]?.trim() || null
        dbUpdates.state = parts[1]?.trim() || null
      }
      if (updates.address !== undefined) dbUpdates.address = updates.address || null

      // Forensic fields mapping
      if (updates.annualUsage !== undefined) dbUpdates.annual_usage = updates.annualUsage || null
      if (updates.electricitySupplier !== undefined) dbUpdates.electricity_supplier = updates.electricitySupplier || null
      if (updates.currentRate !== undefined) dbUpdates.current_rate = updates.currentRate || null
      if (updates.status !== undefined) dbUpdates.status = updates.status || 'PROSPECT'

      // Metadata updates
      const newMetadata = { ...currentMetadata }
      let hasMetadataUpdate = false

      if (updates.sqft !== undefined) { newMetadata.sqft = updates.sqft; hasMetadataUpdate = true; }
      if (updates.occupancy !== undefined) { newMetadata.occupancy = updates.occupancy; hasMetadataUpdate = true; }
      if (updates.loadFactor !== undefined) { newMetadata.loadFactor = updates.loadFactor; hasMetadataUpdate = true; }
      if (updates.loadZone !== undefined) { newMetadata.loadZone = updates.loadZone; hasMetadataUpdate = true; }
      if (updates.meters !== undefined) { newMetadata.meters = updates.meters; hasMetadataUpdate = true; }

      if (hasMetadataUpdate) {
         dbUpdates.metadata = newMetadata
      }

      dbUpdates.updatedAt = new Date().toISOString()

      const { error } = await supabase
        .from('accounts')
        .update(dbUpdates)
        .eq('id', id)

      if (error) throw error
      return { id, ...updates }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account'] })
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
