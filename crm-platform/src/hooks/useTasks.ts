import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getCountFromServer, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'

export interface Task {
  id: string
  title: string
  description?: string
  priority: 'Low' | 'Medium' | 'High' | 'Sequence'
  status: 'Pending' | 'In Progress' | 'Completed'
  dueDate?: string // ISO date string
  dueTime?: string
  assignedTo?: string
  relatedTo?: string // Name of person or account
  relatedType?: 'Person' | 'Account'
  createdAt: string
}

const COLLECTION_NAME = 'tasks'
const PAGE_SIZE = 50

export function useTasks() {
  const queryClient = useQueryClient()

  const tasksQuery = useInfiniteQuery({
    queryKey: ['tasks'],
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        let q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
        
        if (pageParam) {
          q = query(q, startAfter(pageParam))
        }

        const snapshot = await getDocs(q)
        
        return {
          tasks: snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Task[],
          lastDoc: snapshot.docs?.at(-1) ?? null
        }
      } catch (error) {
        console.error('Error fetching tasks:', error)
        throw error
      }
    },
    getNextPageParam: (lastPage) => lastPage?.lastDoc || undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const addTaskMutation = useMutation({
    mutationFn: async (newTask: Omit<Task, 'id' | 'createdAt'>) => {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...newTask,
        createdAt: new Date().toISOString(),
        status: newTask.status || 'Pending',
        priority: newTask.priority || 'Medium'
      })
      return { id: docRef.id, ...newTask }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task created successfully')
    },
    onError: (error) => {
      console.error('Error adding task:', error)
      toast.error('Failed to create task')
    }
  })

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const docRef = doc(db, COLLECTION_NAME, id)
      await updateDoc(docRef, updates)
      return { id, ...updates }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task updated successfully')
    },
    onError: (error) => {
      console.error('Error updating task:', error)
      toast.error('Failed to update task')
    }
  })

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, COLLECTION_NAME, id))
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task deleted successfully')
    },
    onError: (error) => {
      console.error('Error deleting task:', error)
      toast.error('Failed to delete task')
    }
  })

  return {
    data: tasksQuery.data,
    isLoading: tasksQuery.isLoading,
    isError: tasksQuery.isError,
    fetchNextPage: tasksQuery.fetchNextPage,
    hasNextPage: tasksQuery.hasNextPage,
    isFetchingNextPage: tasksQuery.isFetchingNextPage,
    addTask: addTaskMutation.mutate,
    updateTask: updateTaskMutation.mutate,
    deleteTask: deleteTaskMutation.mutate
  }
}

export function useTasksCount() {
  return useQuery({
    queryKey: ['tasks-count'],
    queryFn: async () => {
      const baseQuery = collection(db, COLLECTION_NAME)
      const snapshot = await getCountFromServer(baseQuery)
      return snapshot.data().count
    },
    staleTime: 1000 * 60 * 5,
  })
}
