import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getCountFromServer, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

export interface Account {
  id: string
  name: string
  industry: string
  domain: string
  logoUrl?: string
  companyPhone: string
  contractEnd: string
  sqft: string
  occupancy: string
  employees: string
  location: string
  updated: string
}

const COLLECTION_NAME = 'accounts'
const PAGE_SIZE = 50

export function useAccounts() {
  const { user, role, loading } = useAuth()

  return useInfiniteQuery({
    queryKey: ['accounts', user?.email ?? 'guest', role ?? 'unknown'],
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        if (loading) return { accounts: [], lastDoc: null };
        if (!user && !loading) return { accounts: [], lastDoc: null };

        const baseQuery = collection(db, COLLECTION_NAME);
        let q;

        // Apply ownership filter for non-admin users to comply with Firestore rules
        if (role !== 'admin' && user?.email) {
           q = query(baseQuery, where('ownerId', '==', user.email));
        } else if (role !== 'admin' && !user?.email) {
            // If role is not admin but email is missing (shouldn't happen if logged in), return empty
            return { accounts: [], lastDoc: null };
        } else {
            q = query(baseQuery);
        }

        q = query(q, limit(PAGE_SIZE));
        
        if (pageParam) {
          q = query(q, startAfter(pageParam));
        }

        const snapshot = await getDocs(q);
        
        if (snapshot.empty || !snapshot.docs) {
          return { accounts: [], lastDoc: null };
        }

        const accounts = snapshot.docs.map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            ...data,
            name: data.name || 'Unknown Account',
            industry: data.industry || '',
            domain: data.domain || '',
            logoUrl: data.logoUrl || data.logoURL || '',
            companyPhone: data.companyPhone || data.phone || '',
            contractEnd: data.contractEnd || '',
            sqft: data.sqft || '',
            occupancy: data.occupancy || '',
            employees: data.employees || '',
            location: data.location || (data.city ? `${data.city}, ${data.state || ''}` : '') || '',
            updated: data.updated || new Date().toISOString()
          }
        }) as Account[];

        return { 
          accounts, 
          lastDoc: snapshot.docs?.at(-1) ?? null
        };
      } catch (error) {
        console.error("Error fetching accounts from Firebase:", error);
        throw error;
      }
    },
    getNextPageParam: (lastPage) => lastPage?.lastDoc || undefined,
    enabled: !loading && !!user, // Only run query when user is loaded
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24,   // 24 hours
  })
}

export function useAccountsCount() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['accounts-count', user?.email ?? 'guest', role ?? 'unknown'],
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

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newAccount: Omit<Account, 'id'>) => {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newAccount)
      return { id: docRef.id, ...newAccount }
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
      const docRef = doc(db, COLLECTION_NAME, id)
      await updateDoc(docRef, updates)
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
      await deleteDoc(doc(db, COLLECTION_NAME, id))
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}
