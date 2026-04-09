import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { millDecimal } from '@/lib/mills'
import { mapLocationToZone, type ErcotZone } from '@/lib/market-mapping'
import { getTexasEnergyContext } from '@/lib/texas-territory'
import { buildOwnerScopeValues } from '@/lib/owner-scope'

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
  city?: string
  state?: string
  /** Account HQ coords for map/weather; may be null if not set */
  latitude?: number | null
  longitude?: number | null
  serviceAddresses?: any[]
  address?: string
  tdu?: string
  utilityTerritory?: string
  updated: string
  ownerId?: string
  linkedinUrl?: string
  // Forensic/Asset Fields
  loadFactor?: number // 0-1
  loadZone?: string
  annualUsage?: string
  electricitySupplier?: string
  currentRate?: string
  mills?: string // the commission/margin mills
  status?: 'ACTIVE_LOAD' | 'PROSPECT' | 'CHURNED' | 'CUSTOMER'
  meters?: Array<{
    id: string
    esiId: string
    address: string
    rate: string
    endDate: string
  }>
  metadata?: any
  primaryContactId?: string | null
}

export function useDeleteAccounts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      // Remove list memberships first so targets list counts stay correct
      await supabase
        .from('list_members')
        .delete()
        .in('targetId', ids)
        .in('targetType', ['account', 'accounts', 'companies', 'company'])

      const { error } = await supabase
        .from('accounts')
        .delete()
        .in('id', ids)

      if (error) throw error
    },
    onMutate: async (ids) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['accounts'] })

      // Snapshot the previous value
      const previousAccounts = queryClient.getQueryData(['accounts'])

      // Optimistically update to the new value
      queryClient.setQueryData(['accounts'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            accounts: page.accounts.filter((a: Account) => !ids.includes(a.id))
          }))
        }
      })

      // Return a context object with the snapshotted value
      return { previousAccounts }
    },
    onError: (err, ids, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(['accounts'], context.previousAccounts)
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we are in sync with the server
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts-count'] })
      queryClient.invalidateQueries({ queryKey: ['targets'] })
    }
  })
}

export interface AccountFilters {
  industry?: string[]
  status?: string[]
  location?: string[]
}

const PAGE_SIZE = 50
const ACCOUNT_SEARCH_SELECT = 'id, name, industry, domain, logo_url'
const ACCOUNT_LIST_SELECT = 'id, name, industry, domain, logo_url, phone, contract_end_date, employees, revenue, city, state, service_addresses, address, updatedAt, ownerId, linkedin_url, load_factor, annual_usage, electricity_supplier, current_rate, status, metadata'
const ACCOUNT_DETAIL_SELECT = 'id, name, industry, domain, description, logo_url, phone, contract_end_date, employees, revenue, city, state, latitude, longitude, service_addresses, address, updatedAt, ownerId, linkedin_url, load_factor, annual_usage, electricity_supplier, current_rate, status, metadata, primaryContactId, website'

function mapAccountRow(data: any, metersOverride?: Account['meters']): Account {
  const city = data.city || ''
  const state = data.state || ''
  const location = city ? `${city}, ${state}` : (data.address || '')

  return {
    id: data.id,
    name: data.name || 'Unknown Account',
    industry: data.industry || '',
    domain: data.domain || data.metadata?.domain || data.metadata?.general?.domain || '',
    description: data.description || '',
    logoUrl: data.logo_url || data.metadata?.logo_url || data.metadata?.logoUrl || '',
    companyPhone: data.phone || '',
    contractEnd: data.contract_end_date || '',
    employees: data.employees?.toString() || '',
    revenue: data.revenue || '',
    location,
    city,
    state,
    latitude: data.latitude != null ? Number(data.latitude) : null,
    longitude: data.longitude != null ? Number(data.longitude) : null,
    serviceAddresses: data.service_addresses || [],
    address: data.address || '',
    // tdu/utilityTerritory/loadZone are computed on-demand in the dossier detail view
    tdu: '',
    utilityTerritory: '',
    updated: data.updatedAt || new Date().toISOString(),
    sqft: data.metadata?.sqft || '',
    occupancy: data.metadata?.occupancy || '',
    ownerId: data.ownerId,
    linkedinUrl: data.linkedin_url || data.linkedinUrl || '',
    loadFactor: data.load_factor ?? data.metadata?.loadFactor ?? 0.45,
    loadZone: resolveAccountLoadZone(data),
    annualUsage: data.annual_usage || data.metadata?.annual_usage || '',
    electricitySupplier: data.electricity_supplier || data.metadata?.electricity_supplier || '',
    currentRate: data.current_rate || data.metadata?.current_rate || '',
    status: data.status || 'PROSPECT',
    meters: metersOverride ?? data.metadata?.meters ?? [],
    mills: data.metadata?.mills || '',
    metadata: data.metadata || {},
    primaryContactId: data.primaryContactId || null,
  }
}

function patchAccountListCache(old: any, accountPatch: Partial<Account> & { id: string }) {
  if (!old?.pages) return old
  return {
    ...old,
    pages: old.pages.map((page: any) => {
      if (!page || !Array.isArray(page.accounts)) return page
      return {
        ...page,
        accounts: page.accounts.map((account: Account) =>
          account.id === accountPatch.id
            ? { ...account, ...accountPatch }
            : account
        ),
      }
    }),
  }
}

function patchLinkedAccountInContactCache(contact: any, accountPatch: Partial<Account> & { id: string }) {
  if (!contact) return contact
  const linkedAccountId = contact.linkedAccountId || contact.accountId
  if (linkedAccountId !== accountPatch.id) return contact

  const location = accountPatch.city || accountPatch.state
    ? [accountPatch.city, accountPatch.state].filter(Boolean).join(', ')
    : accountPatch.address

  return {
    ...contact,
    company: accountPatch.name ?? contact.company,
    companyName: accountPatch.name ?? contact.companyName,
    companyDomain: accountPatch.domain ?? contact.companyDomain,
    logoUrl: accountPatch.logoUrl ?? contact.logoUrl,
    companyPhone: accountPatch.companyPhone ?? contact.companyPhone,
    industry: accountPatch.industry ?? contact.industry,
    website: accountPatch.domain ?? contact.website,
    location: location || contact.location,
    city: accountPatch.city ?? contact.city,
    state: accountPatch.state ?? contact.state,
    linkedAccountId: accountPatch.id,
    accountId: accountPatch.id,
    electricitySupplier: accountPatch.electricitySupplier ?? contact.electricitySupplier,
    annualUsage: accountPatch.annualUsage ?? contact.annualUsage,
    currentRate: accountPatch.currentRate ?? contact.currentRate,
    contractEnd: accountPatch.contractEnd ?? contact.contractEnd,
    serviceAddresses: accountPatch.serviceAddresses ?? contact.serviceAddresses,
    accountDescription: accountPatch.description ?? contact.accountDescription,
  }
}

function shouldInvalidateDealCaches(updates: Partial<Account>) {
  return Boolean(
    updates.name !== undefined ||
    updates.annualUsage !== undefined ||
    updates.currentRate !== undefined ||
    updates.contractEnd !== undefined ||
    updates.mills !== undefined ||
    updates.status !== undefined
  )
}

function resolveAccountLoadZone(data: any): ErcotZone {
  const metadataZone =
    data?.metadata?.loadZone ||
    data?.metadata?.load_zone ||
    data?.metadata?.ercotZone ||
    data?.metadata?.ercot_zone

  if (typeof metadataZone === 'string' && metadataZone.startsWith('LZ_')) {
    return metadataZone as ErcotZone
  }

  return mapLocationToZone(data?.city, data?.state, data?.address)
}

export function useSearchAccounts(queryTerm: string) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useQuery({
    queryKey: ['accounts-search', queryTerm, user?.id ?? user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase.from('accounts').select(ACCOUNT_SEARCH_SELECT);

        // Admin and dev see all accounts; others filtered by ownerId
        if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
          query = query.in('ownerId', ownerScopeValues);
        }

        query = query.or(`name.ilike.%${queryTerm}%,domain.ilike.%${queryTerm}%,industry.ilike.%${queryTerm}%`);

        const { data, error } = await query.limit(10);

        if (error) {
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            return [];
          }
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
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('Abort') || error?.message === 'FetchUserError: Request was aborted') {
          return [];
        }
        console.error("Search hook error:", error);
        return [];
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  });
}

export function useAccounts(searchQuery?: string, filters?: AccountFilters, listId?: string, enabled = true) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useInfiniteQuery({
    queryKey: ['accounts', user?.id ?? user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters, listId],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (!enabled || loading) return { accounts: [], nextCursor: null };
        if (!user && !loading) return { accounts: [], nextCursor: null };

        let query = supabase.from('accounts').select(ACCOUNT_LIST_SELECT, { count: 'exact' });

        if (listId) {
          // Fetch targetIds from list_members first due to lack of FK for inner join
          const { data: memberData, error: memberError } = await supabase
            .from('list_members')
            .select('targetId')
            .eq('listId', listId)
            .in('targetType', ['accounts', 'account', 'companies', 'company']);

          if (memberError) {
            console.error("Error fetching list members:", memberError);
            return { accounts: [], nextCursor: null };
          }

          const targetIds = memberData?.map(m => m.targetId).filter(Boolean) || [];
          if (targetIds.length === 0) {
            return { accounts: [], nextCursor: null };
          }

          query = query.in('id', targetIds);
        }

        // Apply ownership filter for non-admin users
        if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
          query = query.in('ownerId', ownerScopeValues);
        }

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%,industry.ilike.%${searchQuery}%`);
        }

        // Apply column filters
        if (filters?.industry && filters.industry.length > 0) {
          query = query.in('industry', filters.industry);
        }
        if (filters?.status && filters.status.length > 0) {
          // DB may store 'active' for Active Load and 'CUSTOMER' for Customer; expand filter to match both
          const statusValues = filters.status.flatMap((s: string) =>
            s === 'ACTIVE_LOAD' ? ['ACTIVE_LOAD', 'active'] : s === 'CUSTOMER' ? ['CUSTOMER', 'customer'] : [s]
          );
          query = query.in('status', statusValues);
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
          // Suppress logging for aborted requests
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            throw error;
          }
          console.error("Supabase error fetching accounts:", error);
          throw error;
        }

        if (!data) {
          return { accounts: [], nextCursor: null };
        }

        const accounts = data.map((row) => mapAccountRow(row)) as Account[];

        const hasNextPage = count ? from + PAGE_SIZE < count : false;

        return {
          accounts,
          nextCursor: hasNextPage ? pageParam + 1 : null
        };
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('Abort') || error?.message === 'FetchUserError: Request was aborted') {
          throw error;
        }
        console.error("Error fetching accounts from Supabase:", error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: enabled && !loading && !!user, // Only run query when user is loaded
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
        .select(ACCOUNT_DETAIL_SELECT)
        .eq('id', id)
        .single()

      if (error) {
        if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
          throw error;
        }
        console.error("Error fetching account from Supabase:", error)
        throw error
      }

      if (!data) return null

      // Fetch meters from dedicated table (bill-extracted ESIDs) and merge with metadata
      let meters: Account['meters'] = []
      const { data: meterRows } = await supabase
        .from('meters')
        .select('id, esid, service_address, rate, end_date')
        .eq('account_id', data.id)
        .order('created_at', { ascending: true })

      if (meterRows?.length) {
        meters = meterRows.map((m) => ({
          id: m.id,
          esiId: m.esid ?? '',
          address: m.service_address ?? '',
          rate: m.rate ?? '',
          endDate: m.end_date ?? ''
        }))
      } else {
        meters = data.metadata?.meters || []
      }

      const base = mapAccountRow(data, meters) as Account
      // Enrich with TDU/utility territory for the dossier view (single record, not the list)
      const texasEnergy = getTexasEnergyContext(base.city, base.state, base.address || base.location)
      return {
        ...base,
        tdu: texasEnergy.tduDisplay || '',
        utilityTerritory: texasEnergy.utilityTerritory || '',
      } as Account
    },
    enabled: !!id && !loading && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// ---------------------------------------------------------------------------
// Bill intelligence for contracts detail page
// Fetches forensic account data + meters populated by /api/analyze-document
// ---------------------------------------------------------------------------
export function useAccountBillIntelligence(accountId: string | undefined) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['account-bill-intel', accountId, user?.email ?? 'guest'],
    queryFn: async () => {
      if (!accountId) return null

      const { data: acc } = await supabase
        .from('accounts')
        .select('electricity_supplier, current_rate, annual_usage, load_factor, metadata')
        .eq('id', accountId)
        .single()

      const { data: meters } = await supabase
        .from('meters')
        .select('id, esid, service_address, rate, end_date, status')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })

      const { data: docs } = await supabase
        .from('documents')
        .select('id, name, metadata, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(20)

      const latestIntelDoc = docs?.find(
        d => ['BILL', 'USAGE_DATA'].includes(d.metadata?.ai_extraction?.type)
      )
      const latestIntelData = latestIntelDoc?.metadata?.ai_extraction?.data ?? null
      const latestIntelCurrentRate = latestIntelData?.strike_price != null ? String(latestIntelData.strike_price) : null
      const latestIntelAnnualUsage = latestIntelData?.annual_usage != null ? String(latestIntelData.annual_usage) : null
      const electricitySupplier = acc?.electricity_supplier ?? acc?.metadata?.electricity_supplier ?? latestIntelData?.supplier ?? null
      const currentRate = acc?.current_rate ?? acc?.metadata?.current_rate ?? latestIntelCurrentRate ?? null
      const annualUsage = acc?.annual_usage ?? acc?.metadata?.annual_usage ?? latestIntelAnnualUsage ?? null
      const loadFactor = acc?.load_factor ?? acc?.metadata?.loadFactor ?? null
      const resolvedMeters = meters?.length ? meters : (acc?.metadata?.meters ?? [])

      return {
        electricitySupplier: electricitySupplier as string | null,
        currentRate: currentRate as string | null,
        annualUsage: annualUsage as string | null,
        loadFactor: loadFactor as number | null,
        usageHistory: (acc?.metadata?.usageHistory ?? latestIntelData?.usage_history ?? []) as Array<{
          month: string; kwh: number; billed_kw: number | null;
          actual_kw: number | null; billed_demand_unit?: 'kW' | 'kVA' | null; actual_demand_unit?: 'kW' | 'kVA' | null; tdsp_charges: number | null
        }>,
        meters: (resolvedMeters as Array<{
          id: string; esid: string; service_address: string;
          rate: string; end_date: string; status: string
        }>),
        latestBillName: (latestIntelDoc?.name ?? null) as string | null,
        latestBillDate: (latestIntelDoc?.created_at ?? null) as string | null,
        latestBillData: latestIntelData,
      }
    },
    enabled: !!accountId && !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useAccountsCount(searchQuery?: string, filters?: AccountFilters, listId?: string, enabled = true) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useQuery({
    queryKey: ['accounts-count', user?.id ?? user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters, listId],
    queryFn: async () => {
      if (!enabled || loading) return 0
      if (!user) return 0

      let query = supabase.from('accounts').select('id', { count: 'exact', head: true })

      if (listId) {
        // Fetch targetIds from list_members first
        const { data: memberData, error: memberError } = await supabase
          .from('list_members')
          .select('targetId')
          .eq('listId', listId)
          .in('targetType', ['accounts', 'account', 'companies', 'company']);

        if (memberError) {
          console.error("Error fetching list members for count:", memberError);
          return 0;
        }

        const targetIds = memberData?.map(m => m.targetId).filter(Boolean) || [];
        if (targetIds.length === 0) return 0;

        query = query.in('id', targetIds);
      }

      // Admin and dev see all accounts; others filtered by ownerId
      if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
        query = query.in('ownerId', ownerScopeValues)
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%,industry.ilike.%${searchQuery}%`);
      }

      // Apply column filters
      if (filters?.industry && filters.industry.length > 0) {
        query = query.in('industry', filters.industry);
      }
      if (filters?.status && filters.status.length > 0) {
        const statusValues = filters.status.flatMap((s: string) =>
          s === 'ACTIVE_LOAD' ? ['ACTIVE_LOAD', 'active'] : s === 'CUSTOMER' ? ['CUSTOMER', 'customer'] : [s]
        );
        query = query.in('status', statusValues);
      }
      if (filters?.location && filters.location.length > 0) {
        const locConditions = filters.location.map(loc => `city.ilike.%${loc}%,state.ilike.%${loc}%,address.ilike.%${loc}%`).join(',');
        query = query.or(locConditions);
      }

      const { count, error } = await query

      if (error) {
        if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
          return 0;
        }
        console.error("Supabase error fetching accounts count:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return 0
      }

      return count || 0
    },
    enabled: enabled && !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (newAccount: Omit<Account, 'id'> & { id?: string }) => {
      // Map frontend fields to DB columns
      const dbAccount = {
        id: newAccount.id || crypto.randomUUID(),
        name: newAccount.name,
        industry: newAccount.industry,
        domain: newAccount.domain,
        logo_url: newAccount.logoUrl,
        phone: newAccount.companyPhone,
        linkedin_url: newAccount.linkedinUrl,
        service_addresses: newAccount.serviceAddresses,
        contract_end_date: newAccount.contractEnd || null,
        employees: parseInt(newAccount.employees) || null,
        city: newAccount.city || newAccount.location?.split(',')[0]?.trim(),
        state: newAccount.state || newAccount.location?.split(',')[1]?.trim(),
        description: newAccount.description || '',
        ownerId: user?.email || null,
        metadata: {
          sqft: newAccount.sqft,
          occupancy: newAccount.occupancy,
          ...newAccount.metadata
        }
      }

      const { data, error } = await supabase
        .from('accounts')
        .insert(dbAccount)
        .select()
        .single()

      if (error) {
        console.error('Supabase insert error:', error)
        throw error
      }

      return { id: data.id, ...newAccount }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}

export function useUpsertAccount() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (account: Omit<Account, 'id'> & { id?: string }) => {
      // 1. Try to find existing account by domain or name if ID is missing
      let existingId = account.id;

      if (!existingId) {
        if (account.domain) {
          const { data: existing } = await supabase
            .from('accounts')
            .select('id, metadata')
            .eq('domain', account.domain)
            .maybeSingle();

          if (existing) {
            existingId = existing.id;
          }
        }

        // Fallback: Try to find by name if no domain match found
        if (!existingId && account.name) {
          const { data: existing } = await supabase
            .from('accounts')
            .select('id, metadata')
            .ilike('name', account.name)
            .maybeSingle();

          if (existing) {
            existingId = existing.id;
          }
        }
      }

      const dbAccount: any = {
        name: account.name,
        industry: account.industry,
        domain: account.domain,
        logo_url: account.logoUrl,
        phone: account.companyPhone,
        linkedin_url: account.linkedinUrl,
        service_addresses: account.serviceAddresses,
        contract_end_date: account.contractEnd || null,
        employees: parseInt(account.employees) || null,
        description: account.description || '',
        updatedAt: new Date().toISOString()
      };

      if (account.address) dbAccount.address = account.address;
      if (account.city) dbAccount.city = account.city;
      if (account.state) dbAccount.state = account.state;

      if (!existingId) {
        dbAccount.id = crypto.randomUUID();
        dbAccount.ownerId = user?.email || null;
        dbAccount.metadata = {
          sqft: account.sqft,
          occupancy: account.occupancy,
          ...account.metadata
        };

        const { data, error } = await supabase
          .from('accounts')
          .insert(dbAccount)
          .select()
          .single();

        if (error) throw error;
        return { id: data.id, ...account, _isNew: true };
      } else {
        // Merge metadata for enrichment
        const { data: current } = await supabase
          .from('accounts')
          .select('metadata')
          .eq('id', existingId)
          .single();

        dbAccount.metadata = {
          ...(current?.metadata || {}),
          sqft: account.sqft || current?.metadata?.sqft,
          occupancy: account.occupancy || current?.metadata?.occupancy,
          ...account.metadata
        };

        const { data, error } = await supabase
          .from('accounts')
          .update(dbAccount)
          .eq('id', existingId)
          .select()
          .single();

        if (error) throw error;
        return { id: data.id, ...account, _isNew: false };
      }
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
      if (updates.city !== undefined) dbUpdates.city = updates.city || null
      if (updates.state !== undefined) dbUpdates.state = updates.state || null
      if (updates.address !== undefined) dbUpdates.address = updates.address || null

      // Forensic fields mapping
      if (updates.annualUsage !== undefined) dbUpdates.annual_usage = updates.annualUsage || null
      if (updates.electricitySupplier !== undefined) dbUpdates.electricity_supplier = updates.electricitySupplier || null
      if (updates.currentRate !== undefined) dbUpdates.current_rate = updates.currentRate || null
      if (updates.status !== undefined) dbUpdates.status = updates.status || 'PROSPECT' // PROSPECT | ACTIVE_LOAD | CUSTOMER | CHURNED

      // Metadata updates
      const newMetadata = { ...currentMetadata }
      let hasMetadataUpdate = false

      if (updates.sqft !== undefined) { newMetadata.sqft = updates.sqft; hasMetadataUpdate = true; }
      if (updates.occupancy !== undefined) { newMetadata.occupancy = updates.occupancy; hasMetadataUpdate = true; }
      if (updates.loadFactor !== undefined) { newMetadata.loadFactor = updates.loadFactor; hasMetadataUpdate = true; }
      if (updates.loadZone !== undefined) { newMetadata.loadZone = updates.loadZone; hasMetadataUpdate = true; }
      if (updates.mills !== undefined) { newMetadata.mills = updates.mills; hasMetadataUpdate = true; }
      if (updates.primaryContactId !== undefined) dbUpdates['primaryContactId'] = updates.primaryContactId ?? null
      if (updates.meters !== undefined) {
        newMetadata.meters = updates.meters;
        hasMetadataUpdate = true;
        // Also sync meters back to serviceAddresses for consistency
        const addresses = (updates.meters as any[])?.map((m: any) => m.address).filter(Boolean) || []
        if (addresses.length > 0) {
          dbUpdates.service_addresses = addresses
        }
      }

      if (hasMetadataUpdate) {
        dbUpdates.metadata = newMetadata
      }

      dbUpdates.updatedAt = new Date().toISOString()

      const { error } = await supabase
        .from('accounts')
        .update(dbUpdates)
        .eq('id', id)

      if (error) throw error

      // Synchronize with the latest active deal
      if (dbUpdates.annual_usage || dbUpdates.contract_end_date || (dbUpdates.metadata && (dbUpdates.metadata as any).mills)) {
        const { data: accountDeals } = await supabase
          .from('deals')
          .select('id, annualUsage, mills')
          .eq('accountId', id)
          .neq('stage', 'TERMINATED')
          .order('createdAt', { ascending: false })

        if (accountDeals?.length) {
          await Promise.all(
            accountDeals.map(async (deal: any) => {
              const dealUpdates: any = {}
              if (dbUpdates.annual_usage) dealUpdates.annualUsage = Number(dbUpdates.annual_usage)
              if (dbUpdates.contract_end_date) dealUpdates.closeDate = dbUpdates.contract_end_date
              if (dbUpdates.metadata && (dbUpdates.metadata as any).mills) {
                dealUpdates.mills = Number((dbUpdates.metadata as any).mills)
              }

              // Recalculate amount for each active deal using shared account usage + mills inputs.
              const usage = dealUpdates.annualUsage ?? deal.annualUsage
              const mills = dealUpdates.mills ?? deal.mills
              const millsValue = millDecimal(mills)
              if (usage && millsValue) {
                dealUpdates.amount = Number((usage * millsValue).toFixed(2))
              }

              if (Object.keys(dealUpdates).length > 0) {
                await supabase.from('deals').update(dealUpdates).eq('id', deal.id)
              }
            })
          )
        }
      }

      return { id, ...updates }
    },
    onSuccess: (data) => {
      queryClient.setQueriesData({ queryKey: ['accounts'] }, (old: any) =>
        patchAccountListCache(old, data)
      )
      queryClient.setQueriesData({ queryKey: ['account', data.id] }, (cached: any) =>
        cached?.id === data.id ? { ...cached, ...data } : cached
      )
      queryClient.setQueriesData({ queryKey: ['contacts'] }, (old: any) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => {
            if (!page || !Array.isArray(page.contacts)) return page
            return {
              ...page,
              contacts: page.contacts.map((contact: any) =>
                patchLinkedAccountInContactCache(contact, data)
              ),
            }
          }),
        }
      })
      // Avoid traversing all individual contact caches - only target contacts we know about if possible
      // Since we don't know which individual contacts belong to this account here, 
      // traversing ['contact'] might be necessary to keep them in sync, but it's expensive.
      // Optimally, we can skip it since individual contacts fetch fresh when opened.
      // queryClient.setQueriesData({ queryKey: ['contact'] }, ...)

      if (shouldInvalidateDealCaches(data)) {
        queryClient.invalidateQueries({ queryKey: ['deals'] })
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'deals-by-account' &&
            query.queryKey[2] === data.id
        })
        queryClient.invalidateQueries({
          predicate: (query) => Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'account-bill-intel' &&
            query.queryKey[1] === data.id
        })
      }
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['accounts'] })
      const previousAccounts = queryClient.getQueryData(['accounts'])
      queryClient.setQueryData(['accounts'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            accounts: page.accounts.filter((a: Account) => a.id !== id)
          }))
        }
      })
      return { previousAccounts }
    },
    onError: (err, id, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(['accounts'], context.previousAccounts)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts-count'] })
    }
  })
}
