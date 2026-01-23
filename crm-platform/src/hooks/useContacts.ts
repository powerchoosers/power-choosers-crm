import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getCountFromServer, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore'
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
