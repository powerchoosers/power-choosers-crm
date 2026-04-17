import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { buildOwnerScopeValues } from '@/lib/owner-scope'
import { queryPredicateById } from '@/lib/queryKeys'
import { buildStatusIlikeClauses } from '@/lib/status-filters'
import {
  type ContactAdditionalPhone,
  type ContactPhoneBucket,
  type ContactSignalCollection,
  type ContactSignalEntry,
  formatPhoneBucketLabel,
  getSignalForValue,
  inferPhoneBucketFromText,
  normalizeSignalScore,
} from '@/lib/contact-signals'

export type { ContactAdditionalPhone } from '@/lib/contact-signals'

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
  additionalPhones?: ContactAdditionalPhone[]
  communicationSignals?: ContactSignalCollection | null
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
  additionalPhones?: ContactAdditionalPhone[]
  communicationSignals?: ContactSignalCollection | null
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
  apollo_revealed_phones?: Array<ContactAdditionalPhone | string>
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
  communicationSignals?: ContactSignalCollection | null
  importCommunicationSignals?: ContactSignalCollection | null
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
  createdAt?: string | null
  accounts?: AccountJoin | AccountJoin[] | null
}

const PAGE_SIZE = 50

const CONTACTS_QUERY_BUSTER = 'v5'
const ACCOUNT_CONTACTS_SELECT = 'id, name, ownerId, firstName, lastName, email, phone, mobile, workPhone, otherPhone, companyPhone, primaryPhoneField, title, accountId, lastContactedAt, metadata'
const CONTACT_SEARCH_SELECT = 'id, name, ownerId, email, firstName, lastName, accountId, metadata, accounts!contacts_accountId_fkey(name, domain, logo_url)'
const CONTACT_LIST_SELECT = 'id, name, ownerId, firstName, lastName, email, phone, mobile, workPhone, otherPhone, companyPhone, primaryPhoneField, status, createdAt, lastContactedAt, lastActivityAt, accountId, title, city, state, linkedinUrl, notes, metadata, accounts!contacts_accountId_fkey(name, domain, logo_url, metadata, industry, city, state, address, service_addresses)'
const CONTACT_DETAIL_SELECT = `
          id, name, ownerId, firstName, lastName,
          email, phone, mobile, workPhone, otherPhone, companyPhone, primaryPhoneField, status, createdAt,
          lastContactedAt, lastActivityAt, accountId, title, city, state, linkedinUrl, notes,
          metadata,
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

function normalizeSignalCollection(raw: unknown): ContactSignalCollection | null {
  if (!raw || typeof raw !== 'object') return null

  const source = raw as {
    emails?: unknown
    phones?: unknown
  }

  const normalizeEntry = (entry: unknown, kind: 'email' | 'phone'): ContactSignalEntry | null => {
    if (!entry || typeof entry !== 'object') return null
    const typed = entry as Record<string, unknown>
    const value = cleanText(typed.value)
    if (!value) return null
    const score = normalizeSignalScore(typed.score)
    return {
      kind,
      value,
      key: kind === 'phone' ? value.replace(/\D/g, '') : value.toLowerCase(),
      score: score ?? 0,
      label: cleanText(typed.label) || undefined,
      source: cleanText(typed.source) || undefined,
      field: cleanText(typed.field) || undefined,
      validation: cleanText(typed.validation) || undefined,
      derived: typeof typed.derived === 'boolean' ? typed.derived : score == null,
    }
  }

  const emails = Array.isArray(source.emails)
    ? source.emails.map((entry) => normalizeEntry(entry, 'email')).filter((entry): entry is ContactSignalEntry => !!entry)
    : []

  const phones = Array.isArray(source.phones)
    ? source.phones.map((entry) => normalizeEntry(entry, 'phone')).filter((entry): entry is ContactSignalEntry => !!entry)
    : []

  if (emails.length === 0 && phones.length === 0) return null

  return { emails, phones }
}

function getContactSignals(metadata: ContactMetadata | null | undefined): ContactSignalCollection | null {
  if (!metadata) return null
  return normalizeSignalCollection(metadata.communicationSignals || metadata.importCommunicationSignals)
}

function normalizePhoneDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function extractAdditionalPhones(
  metadata: ContactMetadata | null,
  signals?: ContactSignalCollection | null,
  excludedNumbers: Array<string | null | undefined> = []
): ContactAdditionalPhone[] {
  const out: ContactAdditionalPhone[] = []
  const seen = new Set<string>()
  const excludedDigits = new Set(
    excludedNumbers
      .map((value) => normalizePhoneDigits(value))
      .filter(Boolean)
  )
  const bucketCounts: Record<ContactPhoneBucket, number> = {
    mobile: 0,
    workDirectPhone: 0,
    otherPhone: 0,
    companyPhone: 0,
  }

  const addPhone = (
    number: string,
    type?: string,
    signal?: ContactSignalEntry | null,
    label?: string,
    bucketHint?: ContactPhoneBucket | null,
  ) => {
    const cleanedNumber = cleanText(number)
    const digits = normalizePhoneDigits(cleanedNumber)
    if (!digits) return
    const formattedNumber = formatPhoneNumber(cleanedNumber) || cleanedNumber
    const key = digits
    if (seen.has(key)) return
    if (excludedDigits.has(digits)) return
    seen.add(key)
    const bucket = bucketHint || inferPhoneBucketFromText(type, label, signal?.field, signal?.label, signal?.source)
    bucketCounts[bucket] += 1
    out.push({
      number: formattedNumber,
      type,
      label: cleanText(label) || formatPhoneBucketLabel(bucket, bucketCounts[bucket]),
      bucket,
      signalScore: signal?.score,
      signalLabel: signal?.label,
      signalSource: signal?.source,
      signalKind: signal?.kind === 'phone' ? 'phone' : undefined,
      signalDerived: signal?.derived,
    })
  }

  if (metadata && Array.isArray(metadata.apollo_revealed_phones)) {
    metadata.apollo_revealed_phones.forEach((entry) => {
      if (typeof entry === 'string') {
        addPhone(entry)
        return
      }
      if (!entry || typeof entry !== 'object') return
      const typed = entry as ContactAdditionalPhone
      const number = cleanText(typed.number)
      const type = cleanText(typed.type) || undefined
      addPhone(number, type, null, typed.label, typed.bucket || null)
    })
    return out
  }

  if (signals?.phones?.length) {
    signals.phones.forEach((entry) => {
      addPhone(entry.value, entry.label || entry.field, entry, entry.label, inferPhoneBucketFromText(entry.field, entry.label, entry.source))
    })
  }

  return out
}

function serializeAdditionalPhones(phones: ContactAdditionalPhone[] | null | undefined): ContactAdditionalPhone[] | undefined {
  if (!Array.isArray(phones)) return undefined

  return phones
    .map((phone) => {
      const number = formatPhoneNumber(phone.number)
      if (!number) return null
      return {
        number,
        type: cleanText(phone.type) || undefined,
        label: cleanText(phone.label) || undefined,
        bucket: phone.bucket,
        signalScore: phone.signalScore,
        signalLabel: cleanText(phone.signalLabel) || undefined,
        signalSource: cleanText(phone.signalSource) || undefined,
        signalKind: phone.signalKind,
        signalDerived: phone.signalDerived,
      } as ContactAdditionalPhone
    })
    .filter((phone): phone is ContactAdditionalPhone => !!phone)
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
        const signals = getContactSignals(metadata)
        const fName = row.firstName || ''
        const lName = row.lastName || ''
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
          additionalPhones: extractAdditionalPhones(metadata, signals, [row.phone, row.mobile, row.workPhone, row.otherPhone, row.companyPhone]),
          communicationSignals: signals,
          avatarUrl: resolveContactPhotoUrl(row, metadata),
          title: row.title || metadata?.job_title || metadata?.title || (metadata as any)?.jobTitle || (metadata as any)?.general?.title || '',
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

        if (!enabled || loading) {

          return { contacts: [], nextCursor: null };
        }
        if (!user && !loading) {

          return { contacts: [], nextCursor: null };
        }

        let query = supabase
          .from('contacts')
          .select(CONTACT_LIST_SELECT);

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
          const statusConditions = buildStatusIlikeClauses(filters.status)
          if (statusConditions.length > 0) {
            query = query.or(statusConditions.join(','))
          }
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

        const { data, error } = await query
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
          const signals = getContactSignals(metadata)

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
            additionalPhones: extractAdditionalPhones(metadata, signals, [item.phone, item.mobile, item.workPhone, item.otherPhone, item.companyPhone]),
            communicationSignals: signals,
            address: getFirstServiceAddressAddress(account?.service_addresses) || metadata?.address || '',
            company: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName || '',
            companyDomain: account?.domain || account?.metadata?.domain || account?.metadata?.general?.domain || metadata?.domain || metadata?.general?.domain || '',
            logoUrl: account?.logo_url || account?.metadata?.logo_url || account?.metadata?.logoUrl || '',
            status: item.status || 'Lead',
            lastContact: item.lastContactedAt || item.createdAt || item.created_at || new Date().toISOString(),
            accountId: item.accountId || undefined,
            industry: account?.industry || undefined,
            title: item.title || metadata?.title || metadata?.job_title || (metadata as any)?.jobTitle || (metadata as any)?.general?.title || '',
            location: item.city ? `${item.city}, ${item.state || ''}` : (metadata?.city ? `${metadata.city}, ${metadata.state || ''}` : (account?.city ? `${account.city}, ${account.state || ''}` : (metadata?.address || account?.address || ''))),
            website: item.website || account?.domain || account?.metadata?.domain || account?.metadata?.general?.domain || metadata?.website || undefined,
            metadata: metadata
          }
        }) as Contact[];

        const hasNextPage = data.length === PAGE_SIZE;


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
        const statusConditions = buildStatusIlikeClauses(filters.status)
        if (statusConditions.length > 0) {
          query = query.or(statusConditions.join(','))
        }
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
      const signals = getContactSignals(metadata)

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
        companyName: account?.name || metadata?.company || metadata?.companyName || metadata?.general?.company || metadata?.general?.companyName,
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
        additionalPhones: extractAdditionalPhones(metadata, signals, [typedData.phone, typedData.mobile, typedData.workPhone, typedData.otherPhone, typedData.companyPhone]),
        communicationSignals: signals,
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
        title: newContact.title || null,
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
          companyName: newContact.company,
          domain: newContact.companyDomain,
          ...newContact.metadata
        } as ContactMetadata
      }

      const serializedNewPhones = serializeAdditionalPhones(newContact.additionalPhones)
      if (serializedNewPhones !== undefined) {
        dbContact.metadata.apollo_revealed_phones = serializedNewPhones
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
        title: contact.title,
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
          companyName: contact.company,
          domain: contact.companyDomain,
          ...contact.metadata
        };

        const serializedPhones = serializeAdditionalPhones(contact.additionalPhones)
        if (serializedPhones !== undefined) {
          dbContact.metadata.apollo_revealed_phones = serializedPhones
        }

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
          companyName: contact.company || current?.metadata?.companyName || current?.metadata?.company,
          domain: contact.companyDomain || current?.metadata?.domain,
          ...contact.metadata
        };

        const serializedPhones = serializeAdditionalPhones(contact.additionalPhones)
        if (serializedPhones !== undefined) {
          dbContact.metadata.apollo_revealed_phones = serializedPhones
        }

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
    onMutate: async (updates) => {
      const contactPredicate = queryPredicateById('contact', updates.id)
      await queryClient.cancelQueries({ predicate: contactPredicate })
      const previousContactQueries = queryClient.getQueriesData({ predicate: contactPredicate })

      queryClient.setQueriesData({ predicate: contactPredicate }, (cached: any) =>
        patchContactDetailCache(cached, updates)
      )

      return { previousContactQueries }
    },
    onError: (err, updates, context) => {
      if (context?.previousContactQueries) {
        for (const [queryKey, value] of context.previousContactQueries) {
          queryClient.setQueryData(queryKey, value)
        }
      }
    },
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
      if (updates.additionalPhones !== undefined) {
        const { data: currentContact } = await supabase
          .from('contacts')
          .select('metadata')
          .eq('id', id)
          .single()

        const nextMetadata = normalizeMetadata(currentContact?.metadata) || {}
        nextMetadata.apollo_revealed_phones = serializeAdditionalPhones(updates.additionalPhones) || []
        dbUpdates.metadata = nextMetadata
      }
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
      const contactPredicate = queryPredicateById('contact', variables.id)
      queryClient.setQueriesData({ predicate: contactPredicate }, (cached: any) =>
        patchContactDetailCache(cached, variables)
      )

      if (variables.accountId || variables.linkedAccountId) {
        const linkedAccountId = variables.accountId || variables.linkedAccountId
        queryClient.setQueriesData({ queryKey: ['account', linkedAccountId] }, (cached: any) => {
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
        queryClient.invalidateQueries({ queryKey: ['account-contacts', linkedAccountId] })
      }

      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
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
