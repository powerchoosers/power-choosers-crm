import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore'
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

export function useContacts() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['contacts', user?.email, role],
    queryFn: async () => {
      try {
        let q = query(collection(db, COLLECTION_NAME));

        if (role !== 'admin' && user?.email) {
           q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.email));
        } else if (role !== 'admin' && !user?.email) {
            if (!loading) return [];
        }

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          return [];
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

        // Client-side sort to avoid Firestore composite index requirements
        return contacts.sort((a, b) => a.name.localeCompare(b.name));
      } catch (error) {
        console.error("Error fetching contacts from Firebase:", error);
        throw error;
      }
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 60 * 8, // 8 hours: Data is considered fresh for 8 hours
    gcTime: 1000 * 60 * 60 * 24,   // 24 hours: Keep in garbage collection/storage for 24 hours
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newContact: Omit<Contact, 'id'>) => {
      // const docRef = await addDoc(collection(db, COLLECTION_NAME), newContact)
      // return { id: docRef.id, ...newContact }
      return { id: Math.random().toString(), ...newContact }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }
  })
}
