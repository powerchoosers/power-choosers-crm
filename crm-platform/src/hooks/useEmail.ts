import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Email } from './useEmails'

export function useEmail(id: string) {
  return useQuery({
    queryKey: ['email', id],
    queryFn: async () => {
      if (!id) return null
      const docRef = doc(db, 'emails', id)
      const docSnap = await getDoc(docRef)
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as Email
      }
      return null
    },
    enabled: !!id
  })
}
