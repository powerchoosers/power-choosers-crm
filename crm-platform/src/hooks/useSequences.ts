import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getCountFromServer, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'

export interface Sequence {
  id: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'draft'
  steps: SequenceStep[]
  createdAt: unknown
  updatedAt?: unknown
}

export interface SequenceStep {
  id: string
  type: 'email' | 'call' | 'task'
  delayDays: number
  content?: string
  subject?: string // For emails
}

const COLLECTION_NAME = 'sequences'
const PAGE_SIZE = 50

export function useSequences() {
  const queryClient = useQueryClient()

  const sequencesQuery = useInfiniteQuery({
    queryKey: ['sequences'],
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        let q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
        
        if (pageParam) {
          q = query(q, startAfter(pageParam))
        }

        const snapshot = await getDocs(q)
        
        return {
          sequences: snapshot.docs.map(doc => {
            const data = doc.data()
            return {
              id: doc.id,
              status: 'draft', // Default status
              ...data,
              steps: data.steps || [] // Ensure steps is always an array
            }
          }) as Sequence[],
          lastDoc: snapshot.docs?.at(-1) ?? null
        }
      } catch (error: unknown) {
        console.error('Error fetching sequences:', error)
        const errorCode = typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined

        // Fallback if index is missing
        if (errorCode === 'failed-precondition') {
           const q = query(collection(db, COLLECTION_NAME), limit(PAGE_SIZE))
           const snapshot = await getDocs(q)
           return {
             sequences: snapshot.docs.map(doc => ({
               id: doc.id,
               status: 'draft',
               ...doc.data(),
               steps: doc.data().steps || []
             })) as Sequence[],
             lastDoc: null // Pagination might be broken without index, but better than crashing
           }
        }
        throw error
      }
    },
    getNextPageParam: (lastPage) => lastPage?.lastDoc || undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const addSequenceMutation = useMutation({
    mutationFn: async (newSequence: Omit<Sequence, 'id' | 'createdAt'>) => {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...newSequence,
        createdAt: new Date(),
        status: newSequence.status || 'draft',
        steps: newSequence.steps || []
      })
      return { id: docRef.id, ...newSequence }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] })
      toast.success('Sequence created successfully')
    },
    onError: (error) => {
      console.error('Error adding sequence:', error)
      toast.error('Failed to create sequence')
    }
  })

  const updateSequenceMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Sequence> & { id: string }) => {
      const docRef = doc(db, COLLECTION_NAME, id)
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date()
      })
      return { id, ...updates }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] })
      toast.success('Sequence updated successfully')
    },
    onError: (error) => {
      console.error('Error updating sequence:', error)
      toast.error('Failed to update sequence')
    }
  })

  const deleteSequenceMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, COLLECTION_NAME, id))
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] })
      toast.success('Sequence deleted successfully')
    },
    onError: (error) => {
      console.error('Error deleting sequence:', error)
      toast.error('Failed to delete sequence')
    }
  })

  return {
    data: sequencesQuery.data,
    isLoading: sequencesQuery.isLoading,
    isError: sequencesQuery.isError,
    fetchNextPage: sequencesQuery.fetchNextPage,
    hasNextPage: sequencesQuery.hasNextPage,
    isFetchingNextPage: sequencesQuery.isFetchingNextPage,
    addSequence: addSequenceMutation.mutate,
    updateSequence: updateSequenceMutation.mutate,
    deleteSequence: deleteSequenceMutation.mutate
  }
}

export function useSequencesCount() {
  return useQuery({
    queryKey: ['sequences-count'],
    queryFn: async () => {
      const baseQuery = collection(db, COLLECTION_NAME)
      const snapshot = await getCountFromServer(baseQuery)
      return snapshot.data().count
    },
    staleTime: 1000 * 60 * 5,
  })
}
