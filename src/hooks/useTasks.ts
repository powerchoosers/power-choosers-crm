import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

export interface Task {
  id: string
  title: string
  description?: string
  priority: 'Low' | 'Medium' | 'High' | 'Protocol'
  status: 'Pending' | 'In Progress' | 'Completed'
  dueDate?: string // ISO date string
  dueTime?: string
  assignedTo?: string
  relatedTo?: string // Name of person or account
  relatedType?: 'Person' | 'Account'
  contactId?: string
  accountId?: string
  ownerId?: string
  createdAt: string
  updatedAt?: string
  metadata?: Record<string, unknown> | null
}

const PAGE_SIZE = 50

export function useTasks(searchQuery?: string) {
  const { user, role, loading } = useAuth()
  const queryClient = useQueryClient()

  const tasksQuery = useInfiniteQuery({
    queryKey: ['tasks', user?.email, role, searchQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (loading || !user) return { tasks: [], nextCursor: null }

        let query = supabase
          .from('tasks')
          .select('*', { count: 'exact' })
        
        if (role !== 'admin' && user.email) {
          query = query.eq('ownerId', user.email)
        }

        if (searchQuery) {
          query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        }

        const from = pageParam * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error, count } = await query
          .range(from, to)
          .order('createdAt', { ascending: false })
        
        if (error) throw error
        
        return {
          tasks: (data || []) as Task[],
          nextCursor: count && (pageParam + 1) * PAGE_SIZE < count ? pageParam + 1 : null
        }
      } catch (error: unknown) {
        console.error('Error fetching tasks:', error)
        throw error
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })

  const addTaskMutation = useMutation({
    mutationFn: async (newTask: Omit<Task, 'id' | 'createdAt'>) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...newTask,
          ownerId: user?.email,
          createdAt: new Date().toISOString(),
          status: newTask.status || 'Pending',
          priority: newTask.priority || 'Medium'
        })
        .select()
        .single()
      
      if (error) throw error
      return data as Task
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
      const { data, error } = await supabase
        .from('tasks')
        .update({
          ...updates,
          updatedAt: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data as Task
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
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)
      
      if (error) throw error
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

export function useTasksCount(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['tasks-count', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user) return 0

      let query = supabase.from('tasks').select('*', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
      }

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
      }

      const { count, error } = await query
      if (error) {
        console.error("Error fetching tasks count:", error)
        return 0
      }
      return count || 0
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSearchTasks(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['tasks-search', queryTerm, user?.email, role],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase.from('tasks').select('*')

        if (role !== 'admin' && user.email) {
          query = query.eq('ownerId', user.email)
        }

        query = query.or(`title.ilike.%${queryTerm}%,description.ilike.%${queryTerm}%`)

        const { data, error } = await query.limit(10)

        if (error) {
          console.error("Search error:", error)
          return []
        }

        return data as Task[]
      } catch (err) {
        console.error("Search hook error:", err)
        return []
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}
