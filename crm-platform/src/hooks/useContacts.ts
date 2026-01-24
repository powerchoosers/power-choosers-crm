import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  companyDomain?: string
  logoUrl?: string
  status: 'Lead' | 'Customer' | 'Churned'
  lastContact: string
  accountId?: string
}

export type ContactDetail = Contact & {
  firstName?: string
  lastName?: string
  title?: string
  companyName?: string
  city?: string
  state?: string
  industry?: string
  linkedinUrl?: string
  website?: string
  notes?: string
  linkedAccountId?: string
  // Enhanced account details for dossier
  electricitySupplier?: string
  annualUsage?: string
  currentRate?: string
  contractEnd?: string
  serviceAddresses?: any[]
  accountDescription?: string
}

const PAGE_SIZE = 50

export function useContacts() {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['contacts', user?.email ?? 'guest', role ?? 'unknown'],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (loading) return { contacts: [], nextCursor: null };
        if (!user && !loading) return { contacts: [], nextCursor: null };

        let query = supabase
          .from('contacts')
          .select('*, accounts(name, domain, logo_url)', { count: 'exact' });

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
        if (!data) return { contacts: [], nextCursor: null };

        const contacts = data.map(item => {
          // Handle Supabase join result (it returns an object, not array, for single FK)
          const account = Array.isArray(item.accounts) ? item.accounts[0] : item.accounts as any; 
          
          return { 
            id: item.id, 
            name: item.name || (item.firstName ? `${item.firstName} ${item.lastName || ''}`.trim() : 'Unknown'),
            email: item.email || '',
            phone: item.phone || item.mobile || item["workPhone"] || '',
            company: account?.name || item.metadata?.company || '',
            companyDomain: account?.domain || item.metadata?.domain || '',
            logoUrl: account?.logo_url || '',
            status: item.status || 'Lead',
            lastContact: item["lastContactedAt"] || item.created_at || new Date().toISOString(),
            accountId: item["accountId"]
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

export function useContactsCount() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['contacts-count', user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (loading) return 0
      if (!user) return 0

      let query = supabase.from('contacts').select('*', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
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
    queryKey: ['contact', id, user?.email ?? 'guest'],
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
            service_addresses, description
          )
        `)
        .eq('id', id)
        .single()

      if (error) return null

      const account = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts as any;
      const firstName = data["firstName"] as string | undefined
      const lastName = data["lastName"] as string | undefined

      return {
        id: data.id,
        ...data,
        name: data.name || (firstName ? `${firstName} ${lastName || ''}`.trim() : 'Unknown'),
        email: data.email || '',
        phone: data.phone || data["mobile"] || '',
        company: account?.name || data.metadata?.company || '',
        companyDomain: account?.domain || data.metadata?.domain || undefined,
        logoUrl: account?.logo_url || '',
        status: (data.status as Contact['status'] | undefined) || 'Lead',
        lastContact: data["lastContactedAt"] || new Date().toISOString(),
        
        // Detail fields
        firstName,
        lastName,
        title: data["title"],
        companyName: account?.name || data.metadata?.company,
        city: account?.city || data.metadata?.city,
        state: account?.state || data.metadata?.state,
        industry: account?.industry,
        linkedinUrl: data["linkedinUrl"],
        website: account?.domain || data.metadata?.website,
        linkedAccountId: data["accountId"],
        
        // Enhanced account details
        electricitySupplier: account?.electricity_supplier,
        annualUsage: account?.annual_usage,
        currentRate: account?.current_rate,
        contractEnd: account?.contract_end_date,
        serviceAddresses: account?.service_addresses,
        accountDescription: account?.description
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
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const dbUpdates: any = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.email !== undefined) dbUpdates.email = updates.email
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone
      if (updates.status !== undefined) dbUpdates.status = updates.status
      if (updates.accountId !== undefined) dbUpdates.accountId = updates.accountId
      
      dbUpdates.updatedAt = new Date().toISOString()

      const { error } = await supabase
        .from('contacts')
        .update(dbUpdates)
        .eq('id', id)

      if (error) throw error
      return { id, ...updates }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
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
