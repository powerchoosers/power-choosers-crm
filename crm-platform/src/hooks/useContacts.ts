import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'
import { buildOwnerScopeValues } from '@/lib/owner-scope'

export interface Contact {
  id: string
  name: string
  firstName?: string
  lastName?: string
  title?: string
  ownerId?: string | null
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
  avatarUrl?: string
  mobile?: string
  workPhone?: string
  workDirectPhone?: string
  otherPhone?: string
  companyPhone?: string
  primaryPhoneField?: 'mobile' | 'workDirectPhone' | 'otherPhone' | 'companyPhone'
  additionalPhones?: Array<{ number: string; type?: string }>
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
  // List Membership
  listName?: string
  // Phone fields
  mobile?: string
  workDirectPhone?: string
  otherPhone?: string
  companyPhone?: string
  primaryPhoneField?: 'mobile' | 'workDirectPhone' | 'otherPhone'
  additionalPhones?: Array<{ number: string; type?: string }>
}

export function useDeleteContacts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      // Remove list memberships first so targets list counts stay correct
      await supabase
        .from('list_members')
        .delete()
        .in('targetId', ids)
        .in('targetType', ['people', 'contact', 'contacts'])

      const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', ids)

      if (error) throw error
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['contacts'] })
      const previousContacts = queryClient.getQueryData(['contacts'])

      queryClient.setQueryData(['contacts'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            contacts: page.contacts.filter((c: Contact) => !ids.includes(c.id))
          }))
        }
      })

      return { previousContacts }
    },
    onError: (err, ids, context: any) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(['contacts'], context.previousContacts)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts-count'] })
      queryClient.invalidateQueries({ queryKey: ['targets'] })
    }
  })
}

export interface ContactFilters {
  industry?: string[]
  status?: string[]
  location?: string[]
  title?: string[]
}

type ContactMetadata = {
  company?: string
  companyName?: string
  ownerId?: string
  domain?: string
  city?: string
  state?: string
  address?: string
  website?: string
  firstName?: string
  lastName?: string
  first_name?: string
  last_name?: string
  job_title?: string
  title?: string
  linkedin_url?: string
  workDirectPhone?: string
  mobile?: string
  otherPhone?: string
  primaryPhoneField?: string
  apollo_revealed_phones?: Array<{ number?: string; type?: string } | string>
  email?: string
  notes?: string
  avatarUrl?: string
  avatar_url?: string
  photoUrl?: string
  photo_url?: string
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
    avatarUrl?: string
    avatar_url?: string
    photoUrl?: string
    photo_url?: string
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
    avatarUrl?: string
    avatar_url?: string
    photoUrl?: string
    photo_url?: string
  }
  original_apollo_data?: {
    photoUrl?: string
    photo_url?: string
    avatarUrl?: string
    avatar_url?: string
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
  metadata?: any | null
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
  ownerId?: string | null
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
  companyPhone?: string | null
  primaryPhoneField?: string | null
  status?: Contact['status'] | null
  created_at?: string | null
  lastContactedAt?: string | null
  lastActivityAt?: string | null
  accountId?: string | null
  account_id?: string | null
  title?: string | null
  city?: string | null
  state?: string | null
  linkedinUrl?: string | null
  website?: string | null
  notes?: string | null
  metadata?: ContactMetadata | string | null
  avatarUrl?: string | null
  avatar_url?: string | null
  photoUrl?: string | null
  photo_url?: string | null
  accounts?: AccountJoin | AccountJoin[] | null
}

const PAGE_SIZE = 50

const CONTACTS_QUERY_BUSTER = 'v5'
const ACCOUNT_CONTACTS_SELECT = 'id, name, ownerId, firstName, first_name, lastName, last_name, email, phone, mobile, workPhone, otherPhone, companyPhone, primaryPhoneField, title, accountId, lastContactedAt, metadata, avatarUrl, avatar_url, photoUrl, photo_url'
const CONTACT_SEARCH_SELECT = 'id, name, ownerId, email, firstName, first_name, firstname, FirstName, lastName, last_name, lastname, LastName, accountId, metadata, avatarUrl, avatar_url, photoUrl, photo_url, accounts!contacts_accountId_fkey(name, domain, logo_url)'
const CONTACT_LIST_SELECT = 'id, name, ownerId, firstName, first_name, firstname, FirstName, lastName, last_name, lastname, LastName, email, phone, mobile, workPhone, otherPhone, companyPhone, primaryPhoneField, status, created_at, lastContactedAt, lastActivityAt, accountId, account_id, title, city, state, website, linkedinUrl, notes, metadata, avatarUrl, avatar_url, photoUrl, photo_url, accounts!contacts_accountId_fkey(name, domain, logo_url, metadata, industry, city, state, address, service_addresses)'
const CONTACT_DETAIL_SELECT = `
          id, name, ownerId, firstName, first_name, firstname, FirstName, lastName, last_name, lastname, LastName,
          email, phone, mobile, workPhone, otherPhone, companyPhone, primaryPhoneField, status, created_at,
          lastContactedAt, lastActivityAt, accountId, account_id, title, city, state, website, linkedinUrl, notes,
          metadata, avatarUrl, avatar_url, photoUrl, photo_url,
          accounts!contacts_accountId_fkey (
            id, name, domain, logo_url, metadata, city, state, industry, address,
            electricity_supplier, annual_usage, current_rate, contract_end_date,
            service_addresses, description, phone
          )
        `

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

function extractAdditionalPhones(metadata: ContactMetadata | null): Array<{ number: string; type?: string }> {
  if (!metadata || !Array.isArray(metadata.apollo_revealed_phones)) return []
  const out: Array<{ number: string; type?: string }> = []
  const seen = new Set<string>()

  metadata.apollo_revealed_phones.forEach((entry) => {
    if (typeof entry === 'string') {
      const number = cleanText(entry)
      if (!number) return
      const key = `${number}|`
      if (seen.has(key)) return
      seen.add(key)
      out.push({ number })
      return
    }
    if (!entry || typeof entry !== 'object') return
    const number = cleanText(entry.number)
    const type = cleanText(entry.type) || undefined
    if (!number) return
    const key = `${number}|${type || ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ number, type })
  })

  return out
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

function patchContactDetailCache(cached: any, contactPatch: Partial<ContactDetail> & { id: string }) {
  if (!cached || cached.id !== contactPatch.id) return cached
  return {
    ...cached,
    ...contactPatch,
    linkedAccountId: contactPatch.accountId ?? contactPatch.linkedAccountId ?? cached.linkedAccountId,
  }
}

function patchContactListCache(old: any, contactPatch: Partial<ContactDetail> & { id: string }) {
  if (!old?.pages) return old
  return {
    ...old,
    pages: old.pages.map((page: any) => {
      if (!page || !Array.isArray(page.contacts)) return page
      return {
        ...page,
        contacts: page.contacts.map((contact: Contact) =>
          contact.id === contactPatch.id
            ? {
                ...contact,
                ...contactPatch,
                name: contactPatch.name ?? contact.name,
                accountId: contactPatch.accountId ?? contact.accountId,
                company: contactPatch.companyName ?? contact.company,
                companyPhone: contactPatch.companyPhone ?? contact.companyPhone,
                workDirectPhone: contactPatch.workDirectPhone ?? contact.workDirectPhone,
                location: contactPatch.location ?? contact.location,
              }
            : contact
        ),
      }
    }),
  }
}

function patchAccountContactsCache(old: any, contactPatch: Partial<ContactDetail> & { id: string }) {
  if (!Array.isArray(old)) return old
  return old.map((contact: Contact) =>
    contact.id === contactPatch.id
      ? {
          ...contact,
          ...contactPatch,
          name: contactPatch.name ?? contact.name,
        }
      : contact
  )
}

export function useAccountContacts(accountId: string) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: ['account-contacts', accountId, user?.email ?? 'guest'],
    queryFn: async () => {
      if (!accountId || loading || !user) return []

      const { data, error } = await supabase
        .from('contacts')
        .select(ACCOUNT_CONTACTS_SELECT)
        .eq('accountId', accountId)

      if (error) {
        if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
          throw error
        }
        console.error("Error fetching account contacts:", error)
        throw error
      }

      return (data || []).map(row => {
        const metadata = normalizeMetadata((row as ContactRow).metadata)
        const fName = row.firstName || row.first_name || ''
        const lName = row.lastName || row.last_name || ''
        return {
          id: row.id,
          name: buildContactName({
            firstName: fName,
            lastName: lName,
            rawName: row.name,
            email: row.email
          }),
          firstName: fName,
          lastName: lName,
          email: row.email || '',
          phone: row.phone || '',
          mobile: row.mobile || '',
          workDirectPhone: row.workPhone || '',
          otherPhone: row.otherPhone || '',
          companyPhone: row.companyPhone || '',
          ownerId: row.ownerId || null,
          primaryPhoneField: normalizePrimaryPhoneField(row.primaryPhoneField),
          additionalPhones: extractAdditionalPhones(metadata),
          avatarUrl: resolveContactPhotoUrl(row, metadata),
          title: row.title || '',
          accountId: row.accountId,
          company: '', // Default for required field
          status: 'Lead', // Default for required field
          lastContact: row.lastContactedAt || '' // Default for required field
        }
      }) as Contact[]
    },
    enabled: !!accountId && !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSearchContacts(queryTerm: string) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useQuery({
    queryKey: ['contacts-search', queryTerm, user?.id ?? user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase
          .from('contacts')
          .select(CONTACT_SEARCH_SELECT);

        // Admin and dev see all contacts; others filtered by ownerId
        if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
          query = query.in('ownerId', ownerScopeValues);
        }

        // Search across multiple columns
        query = query.or(`name.ilike.%${queryTerm}%,email.ilike.%${queryTerm}%,firstName.ilike.%${queryTerm}%,lastName.ilike.%${queryTerm}%,phone.ilike.%${queryTerm}%,mobile.ilike.%${queryTerm}%,workPhone.ilike.%${queryTerm}%,otherPhone.ilike.%${queryTerm}%`);

        const { data, error } = await query.limit(10);

        if (error) {
          // Only log if it's not a cancellation/abort error
          if (error.message !== 'FetchUserError: Request was aborted') {
            console.error("Search error:", error);
          }
          return [];
        }

        return (data as ContactRow[]).map(item => {
          const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts;
          const metadata = normalizeMetadata(item.metadata)

          const fName = item.firstName || item.first_name || item.firstname || item.FirstName;
          const lName = item.lastName || item.last_name || item.lastname || item.LastName;

          const fullName = buildContactName({
            firstName: fName,
            lastName: lName,
            rawName: item.name,
            email: item.email,
            companyCandidate: account?.name,
          });

          return {
            id: item.id,
            name: fullName,
            ownerId: item.ownerId || metadata?.ownerId || null,
            email: item.email || '',
            avatarUrl: resolveContactPhotoUrl(item, metadata),
            company: account?.name || '',
            logoUrl: account?.logo_url || '',
            accountId: item.accountId || undefined,
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

export function useContacts(searchQuery?: string, filters?: ContactFilters, listId?: string, enabled = true) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useInfiniteQuery({
    queryKey: ['contacts', CONTACTS_QUERY_BUSTER, user?.id ?? user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters, listId],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (!enabled || loading) return { contacts: [], nextCursor: null };
        if (!user && !loading) return { contacts: [], nextCursor: null };

        let query = supabase
          .from('contacts')
          .select(CONTACT_LIST_SELECT, { count: 'exact' });

        if (listId) {
          // Fetch targetIds from list_members first due to lack of FK for inner join
          const { data: memberData, error: memberError } = await supabase
            .from('list_members')
            .select('targetId')
            .eq('listId', listId)
            .in('targetType', ['people', 'contact', 'contacts']);

          if (memberError) {
            console.error("Error fetching list members:", memberError);
            return { contacts: [], nextCursor: null };
          }

          const targetIds = memberData?.map(m => m.targetId).filter(Boolean) || [];
          if (targetIds.length === 0) {
            return { contacts: [], nextCursor: null };
          }

          query = query.in('id', targetIds);
        }

        // Admin and dev see all contacts; others filtered by ownerId
        if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
          query = query.in('ownerId', ownerScopeValues);
        }

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,firstName.ilike.%${searchQuery}%,lastName.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,mobile.ilike.%${searchQuery}%,workPhone.ilike.%${searchQuery}%,otherPhone.ilike.%${searchQuery}%`);
        }

        // Apply column filters
        if (filters?.status && filters.status.length > 0) {
          query = query.in('status', filters.status);
        }

        if (filters?.title && filters.title.length > 0) {
          query = query.in('title', filters.title);
        }

        // Industry and Location filters are tricky for contacts because they often live on the account
        // but some contacts might have them directly. We'll check both if possible, or focus on account join
        if (filters?.industry && filters.industry.length > 0) {
          // Filter by account industry
          query = query.filter('accounts.industry', 'in', `(${filters.industry.map((i: string) => `"${i}"`).join(',')})`);
        }

        if (filters?.location && filters.location.length > 0) {
          // Filter by account location (city or state)
          const conditions = filters.location.flatMap((loc: string) => [
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
          if (error.message !== 'FetchUserError: Request was aborted') {
            console.error("Error fetching contacts:", error);
          }
          return { contacts: [], nextCursor: null };
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
            ownerId: item.ownerId || metadata?.ownerId || null,
            avatarUrl: resolveContactPhotoUrl(item, metadata),
            email: item.email || metadata?.email || metadata?.general?.email || metadata?.contact?.email || '',
            phone: item.phone || item.mobile || item.workPhone || item.otherPhone || metadata?.mobile || metadata?.workDirectPhone || metadata?.otherPhone || metadata?.general?.phone || metadata?.contact?.phone || '',
            mobile: item.mobile || metadata?.mobile || '',
            workPhone: item.workPhone || metadata?.workDirectPhone || '',
            workDirectPhone: item.workPhone || metadata?.workDirectPhone || '',
            otherPhone: item.otherPhone || metadata?.otherPhone || '',
            companyPhone: item.companyPhone || '',
            primaryPhoneField: normalizePrimaryPhoneField(item.primaryPhoneField),
            additionalPhones: extractAdditionalPhones(metadata),
            address: getFirstServiceAddressAddress(account?.service_addresses) || metadata?.address || '',
            company: account?.name || metadata?.company || metadata?.general?.company || '',
            companyDomain: account?.domain || account?.metadata?.domain || account?.metadata?.general?.domain || metadata?.domain || metadata?.general?.domain || '',
            logoUrl: account?.logo_url || account?.metadata?.logo_url || account?.metadata?.logoUrl || '',
            status: item.status || 'Lead',
            lastContact: item.lastContactedAt || item.created_at || new Date().toISOString(),
            accountId: item.accountId || undefined,
            industry: account?.industry || undefined,
            title: item.title || metadata?.title || metadata?.job_title || (metadata as any)?.jobTitle || (metadata as any)?.general?.title || '',
            location: item.city ? `${item.city}, ${item.state || ''}` : (metadata?.city ? `${metadata.city}, ${metadata.state || ''}` : (account?.city ? `${account.city}, ${account.state || ''}` : (metadata?.address || account?.address || ''))),
            website: item.website || account?.domain || account?.metadata?.domain || account?.metadata?.general?.domain || metadata?.website || undefined,
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
    enabled: enabled && !loading && !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
  })
}

export function useContactsCount(searchQuery?: string, filters?: ContactFilters, listId?: string, enabled = true) {
  const { user, role, loading } = useAuth()
  const ownerScopeValues = buildOwnerScopeValues(user)

  return useQuery({
    queryKey: ['contacts-count', CONTACTS_QUERY_BUSTER, user?.id ?? user?.email ?? 'guest', role ?? 'unknown', searchQuery, filters, listId],
    queryFn: async () => {
      if (!enabled || loading) return 0
      if (!user) return 0

      // For count with filters on joined tables, we need to select something from the joined table
      // but only if industry or location filters are present.
      const needsAccountJoin = (filters?.industry && filters.industry.length > 0) || (filters?.location && filters.location.length > 0);

      let query = needsAccountJoin
        ? supabase.from('contacts').select('id, accounts!contacts_accountId_fkey!inner(industry, city, state)', { count: 'exact', head: true })
        : supabase.from('contacts').select('id', { count: 'exact', head: true });

      if (listId) {
        // Fetch targetIds from list_members first
        const { data: memberData, error: memberError } = await supabase
          .from('list_members')
          .select('targetId')
          .eq('listId', listId)
          .in('targetType', ['people', 'contact', 'contacts']);

        if (memberError) {
          console.error("Error fetching list members for count:", memberError);
          return 0;
        }

        const targetIds = memberData?.map(m => m.targetId).filter(Boolean) || [];
        if (targetIds.length === 0) return 0;

        query = query.in('id', targetIds);
      }

      // Admin and dev see all contacts; others filtered by ownerId
      if (role !== 'admin' && role !== 'dev' && ownerScopeValues.length > 0) {
        query = query.in('ownerId', ownerScopeValues)
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,firstName.ilike.%${searchQuery}%,lastName.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,mobile.ilike.%${searchQuery}%,workPhone.ilike.%${searchQuery}%,otherPhone.ilike.%${searchQuery}%`);
      }

      // Apply column filters
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters?.title && filters.title.length > 0) {
        query = query.in('title', filters.title);
      }

      if (filters?.industry && filters.industry.length > 0) {
        query = query.filter('accounts.industry', 'in', `(${filters.industry.map((i: string) => `"${i}"`).join(',')})`);
      }

      if (filters?.location && filters.location.length > 0) {
        const conditions = filters.location.flatMap((loc: string) => [
          `city.ilike.%${loc}%`,
          `state.ilike.%${loc}%`
        ]).join(',');
        query = query.or(conditions, { foreignTable: 'accounts' });
      }

      const { count, error } = await query
      if (error) {
        if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
          return 0
        }
        console.error("Supabase error fetching contacts count:", {
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
        .select(CONTACT_DETAIL_SELECT)
        .eq('id', id)
        .single()

      if (error) return null

      const typedData = data as ContactRow

      // Fetch list membership separately to avoid join errors
      const { data: listMembership } = await supabase
        .from('list_members')
        .select(`
          listId,
          lists!list_members_listid_fkey (
            name
          )
        `)
        .eq('targetId', id)
        .in('targetType', ['people', 'contact', 'contacts'])
        .maybeSingle()

      const listName = (listMembership as any)?.lists?.name || undefined

      let account = Array.isArray(typedData.accounts) ? typedData.accounts[0] : typedData.accounts
      const metadata = normalizeMetadata(typedData.metadata)

      // Fallback: If no account linked but metadata has company name, try to find it
      if (!account) {
        const companyName = metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName
        if (companyName) {
          const { data: foundAccount } = await supabase
            .from('accounts')
            .select('id, name, domain, logo_url, metadata, city, state, industry, address, electricity_supplier, annual_usage, current_rate, contract_end_date, service_addresses, description, phone')
            .ilike('name', companyName)
            .limit(1)
            .maybeSingle()

          if (foundAccount) {
            account = foundAccount
            typedData.accountId = foundAccount.id // logical link for the UI
          }
        }
      }

      const fName = typedData.firstName || typedData.first_name || typedData.firstname || typedData.FirstName
      const lName = typedData.lastName || typedData.last_name || typedData.lastname || typedData.LastName

      const fullName = buildContactName({
        firstName: fName,
        lastName: lName,
        rawName: typedData.name,
        email: typedData.email || '',
        companyCandidate: account?.name
      })

      return {
        id: typedData.id,
        name: fullName,
        avatarUrl: resolveContactPhotoUrl(typedData, metadata),
        email: typedData.email || '',
        notes: typedData.notes || '',
        phone: typedData.phone || typedData.mobile || typedData.workPhone || typedData.otherPhone || '',
        company: account?.name || '',
        companyDomain: account?.domain || account?.metadata?.domain || account?.metadata?.general?.domain || undefined,
        logoUrl: account?.logo_url || account?.metadata?.logo_url || account?.metadata?.logoUrl || '',
        status: typedData.status || 'Lead',
        lastContact: typedData.lastContactedAt || new Date().toISOString(),

        // Detail fields (title and LinkedIn from contact row or metadata e.g. bulk import)
        firstName: fName,
        lastName: lName,
        title: typedData.title || metadata?.job_title || metadata?.title || undefined,
        companyName: account?.name,
        city: typedData.city || account?.city,
        state: typedData.state || account?.state,
        location: typedData.city ? `${typedData.city}, ${typedData.state || ''}` : (account?.city ? `${account.city}, ${account.state || ''}` : (account?.address || '')),
        industry: account?.industry,
        linkedinUrl: typedData.linkedinUrl || metadata?.linkedin_url || undefined,
        website: account?.domain || account?.metadata?.domain || account?.metadata?.general?.domain,
        accountId: typedData.accountId || undefined,
        linkedAccountId: typedData.accountId || undefined,

        // Enhanced account details
        electricitySupplier: account?.electricity_supplier,
        annualUsage: account?.annual_usage,
        currentRate: account?.current_rate,
        contractEnd: account?.contract_end_date,
        serviceAddresses: account?.service_addresses,
        accountDescription: account?.description,

        // Location
        address: getFirstServiceAddressAddress(account?.service_addresses) || '',

        // List Membership
        listName: listName,

        // Phone fields (company phone: always prefill from account when account has phone)
        mobile: typedData.mobile || '',
        workDirectPhone: typedData.workPhone || '',
        otherPhone: typedData.otherPhone || '',
        companyPhone: typedData.companyPhone || account?.phone || '',
        primaryPhoneField: normalizePrimaryPhoneField(typedData.primaryPhoneField),
        additionalPhones: extractAdditionalPhones(metadata),
        metadata
      } as ContactDetail
    },
    enabled: !!id && !loading && !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (newContact: Omit<Contact, 'id'> & { id?: string }) => {
      // Basic insert - handling linked account is more complex in UI, assuming ID provided if linked
      const dbContact = {
        id: newContact.id || crypto.randomUUID(),
        name: newContact.name,
        email: newContact.email,
        phone: newContact.phone,
        mobile: newContact.mobile,
        workPhone: newContact.workPhone,
        otherPhone: newContact.otherPhone,
        companyPhone: newContact.companyPhone,
        status: newContact.status,
        accountId: newContact.accountId || null,
        ownerId: user?.email || null,
        city: (newContact as any).city || null,
        state: (newContact as any).state || null,
        metadata: {
          company: newContact.company, // Fallback if no account ID
          domain: newContact.companyDomain,
          ...newContact.metadata
        }
      }

      const { data, error } = await supabase
        .from('contacts')
        .insert(dbContact)
        .select()
        .single()

      if (error) {
        console.error('Supabase insert error (contact):', error)
        throw error
      }
      return { id: data.id, ...newContact }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }
  })
}

export function useUpsertContact() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (contact: Omit<Contact, 'id'> & { id?: string }) => {
      // 1. Try to find existing contact by email or name+company if ID is missing
      let existingId = contact.id;

      if (!existingId) {
        if (contact.email) {
          const { data: existing } = await supabase
            .from('contacts')
            .select('id, metadata')
            .eq('email', contact.email)
            .maybeSingle();

          if (existing) {
            existingId = existing.id;
          }
        }

        // Fallback: Try to find by first name, last name, and company if no email match found
        if (!existingId && contact.firstName && contact.lastName && contact.company) {
          const { data: nameMatches } = await supabase
            .from('contacts')
            .select('id, metadata')
            .ilike('firstName', contact.firstName)
            .ilike('lastName', contact.lastName);

          if (nameMatches && nameMatches.length > 0) {
            // Filter by company name in metadata
            const companyMatch = nameMatches.find(m => {
              const existingCompany = m.metadata?.company || m.metadata?.companyName;
              return existingCompany && existingCompany.toLowerCase() === contact.company.toLowerCase();
            });

            if (companyMatch) {
              existingId = companyMatch.id;
            }
          }
        }
      }

      // --- ACCOUNT LINKING LOGIC ---
      // If accountId is not provided but company name exists, find or create account
      let finalAccountId = contact.accountId;

      if (!finalAccountId && contact.company) {
        const { data: matchingAccount } = await supabase
          .from('accounts')
          .select('id')
          .ilike('name', contact.company)
          .maybeSingle();

        if (matchingAccount) {
          finalAccountId = matchingAccount.id;
        } else {
          // No matching account: create a new one with the company name
          const newAccountId = crypto.randomUUID();
          const now = new Date().toISOString();
          const { error: insertAccountError } = await supabase
            .from('accounts')
            .insert({
              id: newAccountId,
              name: contact.company,
              domain: '',
              industry: '',
              description: '',
              logo_url: null,
              phone: null,
              linkedin_url: null,
              service_addresses: [],
              contract_end_date: null,
              employees: null,
              city: null,
              state: null,
              address: null,
              ownerId: user?.email || null,
              metadata: { import_source: 'contact_upsert', import_batch: now },
              createdAt: now,
              updatedAt: now,
            });
          if (!insertAccountError) {
            finalAccountId = newAccountId;
          }
        }
      }

      const dbContact: any = {
        name: contact.name,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        workPhone: contact.workPhone,
        otherPhone: contact.otherPhone,
        companyPhone: contact.companyPhone,
        status: contact.status,
        accountId: finalAccountId || null,
        updatedAt: new Date().toISOString()
      };

      if ((contact as any).city) dbContact.city = (contact as any).city;
      if ((contact as any).state) dbContact.state = (contact as any).state;

      if (!existingId) {
        dbContact.id = crypto.randomUUID();
        dbContact.ownerId = user?.email || null;
        dbContact.metadata = {
          company: contact.company,
          domain: contact.companyDomain,
          ...contact.metadata
        };

        const { data, error } = await supabase
          .from('contacts')
          .insert(dbContact)
          .select()
          .single();

        if (error) throw error;
        return { id: data.id, ...contact, _isNew: true };
      } else {
        // Merge metadata for enrichment
        const { data: current } = await supabase
          .from('contacts')
          .select('metadata, accountId')
          .eq('id', existingId)
          .single();

        // If contact doesn't have accountId yet but has company name, find or create account
        if (!current?.accountId && !finalAccountId && contact.company) {
          const { data: matchingAccount } = await supabase
            .from('accounts')
            .select('id')
            .ilike('name', contact.company)
            .maybeSingle();

          if (matchingAccount) {
            finalAccountId = matchingAccount.id;
            dbContact.accountId = finalAccountId;
          } else {
            const newAccountId = crypto.randomUUID();
            const now = new Date().toISOString();
            const { error: insertAccountError } = await supabase
              .from('accounts')
              .insert({
                id: newAccountId,
                name: contact.company,
                domain: '',
                industry: '',
                description: '',
                logo_url: null,
                phone: null,
                linkedin_url: null,
                service_addresses: [],
                contract_end_date: null,
                employees: null,
                city: null,
                state: null,
                address: null,
                ownerId: user?.email || null,
                metadata: { import_source: 'contact_upsert', import_batch: now },
                createdAt: now,
                updatedAt: now,
              });
            if (!insertAccountError) {
              finalAccountId = newAccountId;
              dbContact.accountId = finalAccountId;
            }
          }
        }

        dbContact.metadata = {
          ...(current?.metadata || {}),
          company: contact.company || current?.metadata?.company,
          domain: contact.companyDomain || current?.metadata?.domain,
          ...contact.metadata
        };

        const { data, error } = await supabase
          .from('contacts')
          .update(dbContact)
          .eq('id', existingId)
          .select()
          .single();

        if (error) throw error;
        return { id: data.id, ...contact, _isNew: false };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
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
      if (updates.city !== undefined) dbUpdates.city = updates.city
      if (updates.state !== undefined) dbUpdates.state = updates.state
      if (updates.linkedinUrl !== undefined) dbUpdates.linkedinUrl = updates.linkedinUrl
      if (updates.mobile !== undefined) dbUpdates.mobile = updates.mobile
      if (updates.workDirectPhone !== undefined) dbUpdates.workPhone = updates.workDirectPhone
      if (updates.otherPhone !== undefined) dbUpdates.otherPhone = updates.otherPhone
      if (updates.companyPhone !== undefined) dbUpdates.companyPhone = updates.companyPhone
      if (updates.primaryPhoneField !== undefined) dbUpdates.primaryPhoneField = updates.primaryPhoneField
      if (updates.city !== undefined) dbUpdates.city = updates.city
      if (updates.state !== undefined) dbUpdates.state = updates.state
      if (updates.firstName !== undefined) dbUpdates.firstName = updates.firstName
      if (updates.lastName !== undefined) dbUpdates.lastName = updates.lastName

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

      return {
        id,
        ...updates,
        accountId: targetAccountId ?? updates.accountId,
        linkedAccountId: targetAccountId ?? updates.linkedAccountId ?? updates.accountId,
      }
    },
    onSuccess: (_, variables) => {
      queryClient.setQueriesData({ queryKey: ['contacts'] }, (old: any) =>
        patchContactListCache(old, variables)
      )
      queryClient.setQueriesData({ queryKey: ['contact'] }, (cached: any) =>
        patchContactDetailCache(cached, variables)
      )
      queryClient.setQueriesData({ queryKey: ['account-contacts'] }, (old: any) =>
        patchAccountContactsCache(old, variables)
      )

      if (variables.accountId || variables.linkedAccountId) {
        const linkedAccountId = variables.accountId || variables.linkedAccountId
        queryClient.setQueriesData({ queryKey: ['account'] }, (cached: any) => {
          if (!cached || cached.id !== linkedAccountId) return cached
          return {
            ...cached,
            name: variables.companyName ?? cached.name,
            companyPhone: variables.companyPhone ?? cached.companyPhone,
            electricitySupplier: variables.electricitySupplier ?? cached.electricitySupplier,
            annualUsage: variables.annualUsage ?? cached.annualUsage,
            currentRate: variables.currentRate ?? cached.currentRate,
            contractEnd: variables.contractEnd ?? cached.contractEnd,
            serviceAddresses: variables.serviceAddresses ?? cached.serviceAddresses,
          }
        })
        queryClient.setQueriesData({ queryKey: ['accounts'] }, (old: any) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page: any) => {
              if (!page || !Array.isArray(page.accounts)) return page
              return {
                ...page,
                accounts: page.accounts.map((account: any) =>
                  account.id === linkedAccountId
                    ? {
                        ...account,
                        name: variables.companyName ?? account.name,
                        companyPhone: variables.companyPhone ?? account.companyPhone,
                        annualUsage: variables.annualUsage ?? account.annualUsage,
                        currentRate: variables.currentRate ?? account.currentRate,
                        contractEnd: variables.contractEnd ?? account.contractEnd,
                      }
                    : account
                ),
              }
            }),
          }
        })
      }
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['contacts'] })
      const previousContacts = queryClient.getQueryData(['contacts'])

      queryClient.setQueryData(['contacts'], (old: any) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            contacts: page.contacts.filter((c: Contact) => c.id !== id)
          }))
        }
      })

      return { previousContacts }
    },
    onError: (err, id, context: any) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(['contacts'], context.previousContacts)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts-count'] })
    }
  })
}
