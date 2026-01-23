import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getCountFromServer, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  companyDomain?: string
  status: 'Lead' | 'Customer' | 'Churned'
  lastContact: string
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
  accountId?: string
  linkedAccountId?: string
}

const COLLECTION_NAME = 'contacts'
const PAGE_SIZE = 50

export function useContacts() {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['contacts', user?.email ?? 'guest', role ?? 'unknown'],
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        // If loading, return empty immediately to avoid unnecessary queries
        if (loading) return { contacts: [], lastDoc: null };
        
        // If no user and not loading (logged out), return empty
        if (!user && !loading) return { contacts: [], lastDoc: null };

        const baseQuery = collection(db, COLLECTION_NAME);
        let q;

        if (role !== 'admin' && user?.email) {
           q = query(baseQuery, where('ownerId', '==', user.email));
        } else if (role !== 'admin' && !user?.email) {
            // Should be covered by early returns, but just in case
            return { contacts: [], lastDoc: null };
        } else {
            q = query(baseQuery);
        }
        
        q = query(q, limit(PAGE_SIZE));
        
        if (pageParam) {
          q = query(q, startAfter(pageParam));
        }

        const snapshot = await getDocs(q);
        
        if (snapshot.empty || !snapshot.docs) {
          return { contacts: [], lastDoc: null };
        }

        const contacts = snapshot.docs.map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            ...data,
            name: data.name || (data.firstName ? `${data.firstName} ${data.lastName || ''}`.trim() : 'Unknown'),
            email: data.email || '',
            phone: data.phone || '',
            company: data.company || '',
            companyDomain: data.companyDomain || data.domain || '',
            status: data.status || 'Lead',
            lastContact: data.lastContact || new Date().toISOString()
          }
        }) as Contact[];
        
        return { 
          contacts, 
          lastDoc: snapshot.docs?.at(-1) ?? null
        };
      } catch (error) {
        console.error("Error fetching contacts from Firebase:", error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage?.lastDoc || undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24,   // 24 hours
  })
}

export function useContactsCount() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['contacts-count', user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (loading) return 0
      if (!user) return 0

      const baseQuery = collection(db, COLLECTION_NAME)

      if (role !== 'admin' && user.email) {
        const q = query(baseQuery, where('ownerId', '==', user.email))
        const snapshot = await getCountFromServer(q)
        return snapshot.data().count
      }

      if (role !== 'admin') return 0

      const snapshot = await getCountFromServer(baseQuery)
      return snapshot.data().count
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

      const docRef = doc(db, COLLECTION_NAME, id)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) return null

      const data = docSnap.data() as Record<string, unknown>
      const firstName = (data.firstName as string | undefined) ?? undefined
      const lastName = (data.lastName as string | undefined) ?? undefined

      return {
        id: docSnap.id,
        ...(data as object),
        name:
          (data.name as string | undefined) ||
          (firstName ? `${firstName} ${lastName || ''}`.trim() : 'Unknown'),
        email: (data.email as string | undefined) || '',
        phone: (data.phone as string | undefined) || '',
        company: (data.company as string | undefined) || (data.companyName as string | undefined) || '',
        companyDomain:
          (data.companyDomain as string | undefined) ||
          (data.domain as string | undefined) ||
          undefined,
        status: (data.status as Contact['status'] | undefined) || 'Lead',
        lastContact: (data.lastContact as string | undefined) || new Date().toISOString(),
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
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newContact)
      return { id: docRef.id, ...newContact }
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
      const docRef = doc(db, COLLECTION_NAME, id)
      await updateDoc(docRef, updates)
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
      await deleteDoc(doc(db, COLLECTION_NAME, id))
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }
  })
}
