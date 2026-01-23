import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'

export interface Sequence {
  id: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'draft'
  steps: SequenceStep[]
  createdAt: any
  updatedAt?: any
}

export interface SequenceStep {
  id: string
  type: 'email' | 'call' | 'task'
  delayDays: number
  content?: string
  subject?: string // For emails
}

const COLLECTION_NAME = 'sequences'

export function useSequences() {
  const queryClient = useQueryClient()

  const fetchSequences = async (): Promise<Sequence[]> => {
    try {
      // Note: Legacy data might not have createdAt, so we might need a fallback sort or index
      const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          status: 'draft', // Default status
          ...data,
          steps: data.steps || [] // Ensure steps is always an array
        }
      }) as Sequence[]
    } catch (error) {
      console.error('Error fetching sequences:', error)
      // Fallback if index is missing
      const snapshot = await getDocs(collection(db, COLLECTION_NAME))
      return snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          status: 'draft', // Default status
          ...data,
          steps: data.steps || [] // Ensure steps is always an array
        }
      }) as Sequence[]
    }
  }

  const sequencesQuery = useQuery({
    queryKey: ['sequences'],
    queryFn: fetchSequences,
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
    addSequence: addSequenceMutation.mutate,
    updateSequence: updateSequenceMutation.mutate,
    deleteSequence: deleteSequenceMutation.mutate
  }
}
