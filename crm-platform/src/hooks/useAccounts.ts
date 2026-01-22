import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore'
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

export function useAccounts() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['accounts', user?.email, role],
    queryFn: async () => {
      try {
        let q = query(collection(db, COLLECTION_NAME));

        // Apply ownership filter for non-admin users to comply with Firestore rules
        if (role !== 'admin' && user?.email) {
           q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.email));
        } else if (role !== 'admin' && !user?.email) {
            // If role is not admin but email is missing (shouldn't happen if logged in), return empty
            // or let it fail if not logged in
            if (!loading) return [];
        }

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          return [];
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

        // Client-side sort to avoid Firestore composite index requirements
        return accounts.sort((a, b) => a.name.localeCompare(b.name));
      } catch (error) {
        console.error("Error fetching accounts from Firebase:", error);
        throw error;
      }
    },
    enabled: !loading && !!user, // Only run query when user is loaded
    staleTime: 1000 * 60 * 60 * 8, // 8 hours
    gcTime: 1000 * 60 * 60 * 24,   // 24 hours
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newAccount: Omit<Account, 'id'>) => {
      // Placeholder for now, similar to useContacts
      // const docRef = await addDoc(collection(db, COLLECTION_NAME), newAccount)
      // return { id: docRef.id, ...newAccount }
      return { id: Math.random().toString(), ...newAccount }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })
}
