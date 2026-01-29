import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export interface Contact {
  id: string
  name: string
  firstName?: string
  lastName?: string
  email: string
  phone: string
  company: string
  companyDomain?: string
  logoUrl?: string
  status: 'Lead' | 'Customer' | 'Churned'
  lastContact: string
  lastActivity?: string
  accountId?: string
  industry?: string
  location?: string
  metadata?: any
}

export type ContactDetail = Contact & {
  [key: string]: unknown
  firstName?: string
  lastName?: string
  title?: string
  companyName?: string
  city?: string
  state?: string
  industry?: string
  linkedinUrl?: string
  website?: string
  location?: string
  notes?: string
  linkedAccountId?: string
  // Enhanced account details for dossier
  electricitySupplier?: string
  annualUsage?: string
  currentRate?: string
  contractEnd?: string
  serviceAddresses?: unknown[]
  accountDescription?: string
  // Location
  address?: string
  // Phone fields
  mobile?: string
  workDirectPhone?: string
  otherPhone?: string
  companyPhone?: string
  primaryPhoneField?: 'mobile' | 'workDirectPhone' | 'otherPhone'
}

export interface ContactFilters {
  industry?: string[]
  status?: string[]
  location?: string[]
}

type ContactMetadata = {
  company?: string
  companyName?: string
  domain?: string
  city?: string
  state?: string
  address?: string
  website?: string
  firstName?: string
  lastName?: string
  first_name?: string
  last_name?: string
  workDirectPhone?: string
  mobile?: string
  otherPhone?: string
  primaryPhoneField?: string
  email?: string
  notes?: string
  general?: {
    firstName?: string
    lastName?: string
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    mobile?: string
    otherPhone?: string
    workDirectPhone?: string
    company?: string
    companyName?: string
    domain?: string
    notes?: string
  }
  contact?: {
    firstName?: string
    lastName?: string
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    mobile?: string
    otherPhone?: string
  }
}

type AccountJoin = {
  name?: string | null
  domain?: string | null
  logo_url?: string | null
  city?: string | null
  state?: string | null
  address?: string | null
  industry?: string | null
  electricity_supplier?: string | null
  annual_usage?: string | null
  current_rate?: string | null
  contract_end_date?: string | null
  service_addresses?: unknown[] | null
  description?: string | null
  phone?: string | null
}

function getFirstServiceAddressAddress(serviceAddresses: unknown[] | null | undefined) {
  if (!Array.isArray(serviceAddresses) || serviceAddresses.length === 0) return ''
  const first = serviceAddresses[0]
  if (!first || typeof first !== 'object') return ''
  const address = (first as Record<string, unknown>).address
  return typeof address === 'string' ? address : ''
}

type ContactRow = {
  id: string
  name?: string | null
  firstName?: string | null
  first_name?: string | null
  firstname?: string | null
  FirstName?: string | null
  lastName?: string | null
  last_name?: string | null
  lastname?: string | null
  LastName?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  workPhone?: string | null
  otherPhone?: string | null
  primaryPhoneField?: string | null
  status?: Contact['status'] | null
  created_at?: string | null
  lastContactedAt?: string | null
  lastActivityAt?: string | null
  accountId?: string | null
  title?: string | null
  city?: string | null
  state?: string | null
  linkedinUrl?: string | null
  website?: string | null
  notes?: string | null
  metadata?: ContactMetadata | string | null
  accounts?: AccountJoin | AccountJoin[] | null
}

const PAGE_SIZE = 50

const CONTACTS_QUERY_BUSTER = 'v5'

const PRIMARY_PHONE_FIELDS = ['mobile', 'workDirectPhone', 'otherPhone'] as const

function normalizePrimaryPhoneField(value: unknown): ContactDetail['primaryPhoneField'] {
  if (typeof value !== 'string') return 'mobile'
  return (PRIMARY_PHONE_FIELDS as readonly string[]).includes(value) ? (value as ContactDetail['primaryPhoneField']) : 'mobile'
}

function cleanText(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeMetadata(value: ContactMetadata | string | null | undefined): ContactMetadata | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as ContactMetadata
    } catch {
      return null
    }
  }
  return value
}

function buildContactName(args: {
  firstName?: unknown
  lastName?: unknown
  rawName?: unknown
  email?: unknown
  companyCandidate?: unknown
}): string {
  const firstName = cleanText(args.firstName)
  const lastName = cleanText(args.lastName)
  const rawName = cleanText(args.rawName)
  const email = cleanText(args.email)
  const companyCandidate = cleanText(args.companyCandidate)

  const combined = cleanText([firstName, lastName].filter(Boolean).join(' '))
  if (combined) return combined

  const looksLikeCompany = !!rawName && /\b(llc|l\.l\.c\.?|inc|inc\.|ltd|ltd\.|co\.|corp|corporation|company|plc|pc|l\.p\.?|lp|llp)\b/i.test(rawName)
  if (looksLikeCompany) return email || 'Unknown'

  if (rawName && companyCandidate && rawName.toLowerCase() === companyCandidate.toLowerCase()) {
    return email || 'Unknown'
  }

  return rawName || email || 'Unknown'
}

export function useAccountContacts(accountId: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['account-contacts', accountId, user?.email ?? 'guest'],
    queryFn: async () => {
      if (!accountId || loading || !user) return []

      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('accountId', accountId)

      if (error) {
        console.error("Error fetching account contacts:", error)
        throw error
      }

      return (data || []).map(row => ({
        id: row.id,
        name: buildContactName({ 
          firstName: row.firstName || row.first_name, 
          lastName: row.lastName || row.last_name, 
          rawName: row.name, 
          email: row.email 
        }),
        email: row.email || '',
        phone: row.phone || '',
        title: row.title || '',
        accountId: row.accountId,
        company: '', // Default for required field
        status: 'Lead', // Default for required field
        lastContact: row.lastContactedAt || '' // Default for required field
      })) as Contact[]
    },
    enabled: !!accountId && !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSearchContacts(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['contacts-search', queryTerm, user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase
          .from('contacts')
          .select('*, accounts(name, domain, logo_url)');

        if (role !== 'admin' && user?.email) {
          query = query.eq('ownerId', user.email);
        }

        // Search across multiple columns - more conservative list to avoid invalid column errors
        // name and email are standard. firstName/lastName are used in ordering so they should exist.
        query = query.or(`name.ilike.%${queryTerm}%,email.ilike.%${queryTerm}%,firstName.ilike.%${queryTerm}%,lastName.ilike.%${queryTerm}%`);

        const { data, error } = await query.limit(10);

        if (error) {
          console.error("Search error:", error);
          return [];
        }

        return (data as ContactRow[]).map(item => {
          const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts;
          const metadata = normalizeMetadata(item.metadata);
          
          const fName = item.firstName || item.first_name || item.firstname || item.FirstName || metadata?.firstName || metadata?.first_name || metadata?.general?.firstName || metadata?.general?.first_name || metadata?.contact?.firstName || metadata?.contact?.first_name;
          const lName = item.lastName || item.last_name || item.lastname || item.LastName || metadata?.lastName || metadata?.last_name || metadata?.general?.lastName || metadata?.general?.last_name || metadata?.contact?.lastName || metadata?.contact?.last_name;

          const fullName = buildContactName({
            firstName: fName,
            lastName: lName,
            rawName: item.name,
            email: item.email || metadata?.email || metadata?.general?.email || metadata?.contact?.email,
            companyCandidate: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName,
          });

          return {
            id: item.id,
            name: fullName,
            email: item.email || metadata?.email || metadata?.general?.email || metadata?.contact?.email || '',
            company: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName || '',
            logoUrl: account?.logo_url || '',
          };
        });
      } catch (err) {
        console.error("Search hook error:", err);
        return [];
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  });
}

export function useContacts(searchQuery?: string, filters?: ContactFilters) {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['contacts', CONTACTS_QUERY_BUSTER, user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (loading) return { contacts: [], nextCursor: null };
        if (!user && !loading) return { contacts: [], nextCursor: null };

        let query = supabase
          .from('contacts')
          .select('*, accounts(name, domain, logo_url, industry, city, state)', { count: 'exact' });

        if (role !== 'admin' && user?.email) {
           query = query.eq('ownerId', user.email);
        }

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,firstName.ilike.%${searchQuery}%,lastName.ilike.%${searchQuery}%`);
        }

        // Apply column filters
        if (filters?.status && filters.status.length > 0) {
          query = query.in('status', filters.status);
        }
        
        // Industry and Location filters are tricky for contacts because they often live on the account
        // but some contacts might have them directly. We'll check both if possible, or focus on account join
        if (filters?.industry && filters.industry.length > 0) {
          // Filter by account industry
          query = query.filter('accounts.industry', 'in', `(${filters.industry.map(i => `"${i}"`).join(',')})`);
        }
        
        if (filters?.location && filters.location.length > 0) {
          // Filter by account location (city or state)
          const conditions = filters.location.flatMap(loc => [
            `city.ilike.%${loc}%`,
            `state.ilike.%${loc}%`
          ]).join(',');
          query = query.or(conditions, { foreignTable: 'accounts' });
        }

        const from = pageParam * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error, count } = await query
          .range(from, to)
          .order('lastName', { ascending: true })
          .order('firstName', { ascending: true })
          .order('createdAt', { ascending: false });

        if (error) {
          console.error("Supabase error:", error);
          throw error;
        }
        if (!data) return { contacts: [], nextCursor: null };

        const contacts = (data as ContactRow[]).map(item => {
          const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts
          const metadata = normalizeMetadata(item.metadata)
          
          const fName = item.firstName
            || item.first_name
            || item.firstname
            || item.FirstName
            || metadata?.firstName
            || metadata?.first_name
            || metadata?.general?.firstName
            || metadata?.general?.first_name
            || metadata?.contact?.firstName
            || metadata?.contact?.first_name
          const lName = item.lastName
            || item.last_name
            || item.lastname
            || item.LastName
            || metadata?.lastName
            || metadata?.last_name
            || metadata?.general?.lastName
            || metadata?.general?.last_name
            || metadata?.contact?.lastName
            || metadata?.contact?.last_name

          const fullName = buildContactName({
            firstName: fName,
            lastName: lName,
            rawName: item.name,
            email: item.email || metadata?.email || metadata?.general?.email || metadata?.contact?.email,
            companyCandidate: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName,
          })

          return {
            id: item.id,
            name: fullName,
            firstName: fName as string,
            lastName: lName as string,
            email: item.email || metadata?.email || metadata?.general?.email || metadata?.contact?.email || '',
            phone: item.phone || item.mobile || item.workPhone || item.otherPhone || metadata?.mobile || metadata?.workDirectPhone || metadata?.otherPhone || metadata?.general?.phone || metadata?.contact?.phone || '',
            address: getFirstServiceAddressAddress(account?.service_addresses) || metadata?.address || '',
            company: account?.name || metadata?.company || metadata?.general?.company || '',
            companyDomain: account?.domain || metadata?.domain || metadata?.general?.domain || '',
            logoUrl: account?.logo_url || '',
            status: item.status || 'Lead',
            lastContact: item.lastContactedAt || item.created_at || new Date().toISOString(),
            accountId: item.accountId || undefined,
            industry: account?.industry || undefined,
            location: item.city ? `${item.city}, ${item.state || ''}` : (metadata?.city ? `${metadata.city}, ${metadata.state || ''}` : (account?.city ? `${account.city}, ${account.state || ''}` : (metadata?.address || account?.address || ''))),
            website: item.website || account?.domain || metadata?.website || undefined,
            metadata: metadata
          }
        }) as Contact[];
        
        const hasNextPage = count ? from + PAGE_SIZE < count : false;

        return { 
          contacts, 
          nextCursor: hasNextPage ? pageParam + 1 : null
        };
      } catch (error) {
        console.error("Error fetching contacts from Supabase:", error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
  })
}

export function useContactsCount(searchQuery?: string, filters?: ContactFilters) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['contacts-count', CONTACTS_QUERY_BUSTER, user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters],
    queryFn: async () => {
      if (loading) return 0
      if (!user) return 0

      // For count with filters on joined tables, we need to select something from the joined table
      let query = supabase.from('contacts').select('id, accounts!inner(industry, city, state)', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,firstName.ilike.%${searchQuery}%,lastName.ilike.%${searchQuery}%`);
      }

      // Apply column filters
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      
      if (filters?.industry && filters.industry.length > 0) {
        query = query.filter('accounts.industry', 'in', `(${filters.industry.map(i => `"${i}"`).join(',')})`);
      }
      
      if (filters?.location && filters.location.length > 0) {
        const conditions = filters.location.flatMap(loc => [
          `city.ilike.%${loc}%`,
          `state.ilike.%${loc}%`
        ]).join(',');
        query = query.or(conditions, { foreignTable: 'accounts' });
      }

      const { count, error } = await query
      if (error) {
        console.error("Error fetching contacts count:", error)
        return 0
      }
      return count || 0
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useContact(id: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['contact', CONTACTS_QUERY_BUSTER, id, user?.email ?? 'guest'],
    queryFn: async () => {
      if (!id) return null
      if (loading) return null
      if (!user) return null

      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *, 
          accounts (
            name, domain, logo_url, city, state, industry,
            electricity_supplier, annual_usage, current_rate, contract_end_date,
            service_addresses, description, phone
          )
        `)
        .eq('id', id)
        .single()

      if (error) return null

      const typedData = data as ContactRow
      let account = Array.isArray(typedData.accounts) ? typedData.accounts[0] : typedData.accounts
      const metadata = normalizeMetadata(typedData.metadata)

      // Fallback: If no account linked but metadata has company name, try to find it
      if (!account) {
        const companyName = metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName
        if (companyName) {
           const { data: foundAccount } = await supabase
             .from('accounts')
             .select('name, domain, logo_url, city, state, industry, electricity_supplier, annual_usage, current_rate, contract_end_date, service_addresses, description, phone, id')
             .ilike('name', companyName)
             .limit(1)
             .maybeSingle()
           
           if (foundAccount) {
             account = foundAccount
             typedData.accountId = foundAccount.id // logical link for the UI
           }
        }
      }
      
      const fName = typedData.firstName
        || typedData.first_name
        || typedData.firstname
        || typedData.FirstName
        || metadata?.firstName
        || metadata?.first_name
        || metadata?.general?.firstName
        || metadata?.general?.first_name
        || metadata?.contact?.firstName
        || metadata?.contact?.first_name
      const lName = typedData.lastName
        || typedData.last_name
        || typedData.lastname
        || typedData.LastName
        || metadata?.lastName
        || metadata?.last_name
        || metadata?.general?.lastName
        || metadata?.general?.last_name
        || metadata?.contact?.lastName
        || metadata?.contact?.last_name

      const { id: contactId, ...rest } = typedData

      const fullName = buildContactName({
        firstName: fName,
        lastName: lName,
        rawName: typedData.name,
        email: typedData.email || metadata?.email || metadata?.general?.email || metadata?.contact?.email,
        companyCandidate: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName,
      })

      return {
        id: contactId,
        ...rest,
        notes: typedData.notes || metadata?.notes || metadata?.general?.notes || '',
        lastActivity: typedData.lastActivityAt || undefined,
        name: fullName,
        email: typedData.email || metadata?.email || metadata?.general?.email || metadata?.contact?.email || '',
        phone: typedData.phone || typedData.mobile || typedData.workPhone || typedData.otherPhone || metadata?.mobile || metadata?.workDirectPhone || metadata?.otherPhone || metadata?.general?.phone || metadata?.contact?.phone || '',
        company: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName || '',
        companyDomain: account?.domain || metadata?.domain || metadata?.general?.domain || undefined,
        logoUrl: account?.logo_url || '',
        status: typedData.status || 'Lead',
        lastContact: typedData.lastContactedAt || new Date().toISOString(),
        
        // Detail fields
        firstName: fName,
        lastName: lName,
        title: typedData.title || undefined,
        companyName: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName,
        city: typedData.city || metadata?.city || account?.city,
        state: typedData.state || metadata?.state || account?.state,
        location: typedData.city ? `${typedData.city}, ${typedData.state || ''}` : (metadata?.city ? `${metadata.city}, ${metadata.state || ''}` : (account?.city ? `${account.city}, ${account.state || ''}` : (metadata?.address || account?.address || ''))),
        industry: account?.industry,
        linkedinUrl: typedData.linkedinUrl || undefined,
        website: account?.domain || metadata?.website,
        linkedAccountId: typedData.accountId || undefined,
        
        // Enhanced account details
        electricitySupplier: account?.electricity_supplier,
        annualUsage: account?.annual_usage,
        currentRate: account?.current_rate,
        contractEnd: account?.contract_end_date,
        serviceAddresses: account?.service_addresses,
        accountDescription: account?.description,
        
        // Location
        address: getFirstServiceAddressAddress(account?.service_addresses) || metadata?.address || '',

        // Phone fields
        mobile: typedData.mobile || metadata?.mobile || metadata?.general?.phone || '',
        workDirectPhone: typedData.workPhone || metadata?.workDirectPhone || metadata?.general?.workDirectPhone || '',
        otherPhone: typedData.otherPhone || metadata?.otherPhone || '',
        companyPhone: account?.phone || '',
        primaryPhoneField: normalizePrimaryPhoneField(typedData.primaryPhoneField)
      } as ContactDetail
    },
    enabled: !!id && !loading && !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newContact: Omit<Contact, 'id'>) => {
      // Basic insert - handling linked account is more complex in UI, assuming ID provided if linked
      const dbContact = {
        name: newContact.name,
        email: newContact.email,
        phone: newContact.phone,
        status: newContact.status,
        accountId: newContact.accountId || null,
        metadata: {
            company: newContact.company, // Fallback if no account ID
            domain: newContact.companyDomain
        }
      }
      
      const { data, error } = await supabase
        .from('contacts')
        .insert(dbContact)
        .select()
        .single()

      if (error) throw error
      return { id: data.id, ...newContact }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }
  })
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ContactDetail> & { id: string }) => {
      const dbUpdates: Record<string, unknown> = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.email !== undefined) dbUpdates.email = updates.email
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone
      if (updates.status !== undefined) dbUpdates.status = updates.status
      if (updates.accountId !== undefined) dbUpdates.accountId = updates.accountId
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes
      if (updates.title !== undefined) dbUpdates.title = updates.title
      if (updates.linkedinUrl !== undefined) dbUpdates.linkedinUrl = updates.linkedinUrl
      if (updates.mobile !== undefined) dbUpdates.mobile = updates.mobile
      if (updates.workDirectPhone !== undefined) dbUpdates.workPhone = updates.workDirectPhone
      if (updates.otherPhone !== undefined) dbUpdates.otherPhone = updates.otherPhone
      if (updates.primaryPhoneField !== undefined) dbUpdates.primaryPhoneField = updates.primaryPhoneField
      if (updates.city !== undefined) dbUpdates.city = updates.city
      if (updates.state !== undefined) dbUpdates.state = updates.state
      
      dbUpdates.updatedAt = new Date().toISOString()

      // 1. Update Contact Table
      const { error: contactError } = await supabase
        .from('contacts')
        .update(dbUpdates)
        .eq('id', id)

      if (contactError) throw contactError

      // 2. Update Account Table if account-specific fields are present
      // We first need to get the accountId if not provided in updates
      let targetAccountId = updates.accountId || updates.linkedAccountId
      
      if (!targetAccountId) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('accountId')
          .eq('id', id)
          .single()
        targetAccountId = contactData?.accountId
      }

      if (targetAccountId) {
        const accountUpdates: Record<string, unknown> = {}
        if (updates.electricitySupplier !== undefined) accountUpdates.electricity_supplier = updates.electricitySupplier
        if (updates.annualUsage !== undefined) accountUpdates.annual_usage = updates.annualUsage
        if (updates.currentRate !== undefined) accountUpdates.current_rate = updates.currentRate
        if (updates.contractEnd !== undefined) accountUpdates.contract_end_date = updates.contractEnd
        if (updates.serviceAddresses !== undefined) accountUpdates.service_addresses = updates.serviceAddresses
        if (updates.companyName !== undefined) accountUpdates.name = updates.companyName
        if (updates.companyPhone !== undefined) accountUpdates.phone = updates.companyPhone

        if (Object.keys(accountUpdates).length > 0) {
          const { error: accountError } = await supabase
            .from('accounts')
            .update(accountUpdates)
            .eq('id', targetAccountId)
          
          if (accountError) {
            console.error('Failed to update associated account:', accountError)
            // We don't throw here to avoid failing the whole sync if only account update fails
          }
        }
      }

      return { id, ...updates }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contact', CONTACTS_QUERY_BUSTER, variables.id] })
    }
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }
  })
}
