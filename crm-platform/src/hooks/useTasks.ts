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
          .order('dueDate', { ascending: true, nullsFirst: false })
          .order('createdAt', { ascending: false })

        if (error) {
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            throw error;
          }
          throw error
        }

        return {
          tasks: (data || []) as Task[],
          nextCursor: count && (pageParam + 1) * PAGE_SIZE < count ? pageParam + 1 : null
        }
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('Abort') || error?.message === 'FetchUserError: Request was aborted') {
          throw error;
        }
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
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const priorityMap: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', protocol: 'Protocol', sequence: 'Protocol' }
      const rawPriority = (newTask.priority ?? 'Medium') as string
      const priority = priorityMap[String(rawPriority).toLowerCase()] ?? (rawPriority || 'Medium')
      const status = (newTask.status && ['Pending', 'In Progress', 'Completed'].includes(newTask.status)) ? newTask.status : 'Pending'
      const row = {
        id,
        title: newTask.title ?? 'Task',
        description: newTask.description ?? null,
        status,
        priority,
        dueDate: newTask.dueDate ?? null,
        contactId: newTask.contactId ?? null,
        accountId: newTask.accountId ?? null,
        ownerId: user?.email ?? null,
        createdAt: now,
        updatedAt: now,
        metadata: (newTask.metadata && typeof newTask.metadata === 'object') ? newTask.metadata : {}
      }
      const { data, error } = await supabase
        .from('tasks')
        .insert(row)
        .select()
        .single()

      if (error) throw error
      return { ...data, relatedTo: newTask.relatedTo, relatedType: newTask.relatedType } as Task
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Task created successfully')
    },
    onError: (error: unknown) => {
      const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : 'Failed to create task'
      console.error('Error adding task:', error)
      toast.error(msg)
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
    addTaskAsync: addTaskMutation.mutateAsync,
    updateTask: updateTaskMutation.mutate,
    deleteTask: deleteTaskMutation.mutate
  }
}

export function useTasksCount(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['tasks-count', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user || !user.email) return 0

      try {
        let query = supabase.from('tasks').select('id', { count: 'exact', head: true })

        if (role !== 'admin') {
          query = query.eq('ownerId', user.email)
        }

        if (searchQuery) {
          query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        }

        const { count, error } = await query
        if (error) {
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            return 0
          }
          console.error("Supabase error fetching tasks count:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          })
          throw error
        }
        return count || 0
      } catch (error: any) {
        if (error?.name !== 'AbortError' && error?.message !== 'Fetch is aborted') {
          console.error("Error fetching tasks count:", error.message || error)
        }
        return 0
      }
    },
    enabled: !loading && !!user && !!user?.email,
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
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            return []
          }
          console.error("Search error:", error)
          return []
        }

        return data as Task[]
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.message?.includes('Abort') || err?.message === 'FetchUserError: Request was aborted') {
          return []
        }
        console.error("Search hook error:", err)
        return []
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}

const ALL_PENDING_LIMIT = 500

/**
 * All pending (non-completed) tasks in the CRM, ordered by createdAt desc.
 * Used for global task pagination on dossier headers (e.g. "3/20" across all tasks).
 */
export function useAllPendingTasks() {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['tasks-all-pending', user?.email, role],
    queryFn: async () => {
      if (loading || !user) return { allPendingTasks: [], totalCount: 0 }

      try {
        let query = supabase
          .from('tasks')
          .select('*')
          .neq('status', 'Completed')
          .order('dueDate', { ascending: true, nullsFirst: false })
          .order('createdAt', { ascending: false })
          .limit(ALL_PENDING_LIMIT)

        if (role !== 'admin' && user.email) {
          query = query.eq('ownerId', user.email)
        }

        const { data, error } = await query

        if (error) {
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            return { allPendingTasks: [], totalCount: 0 }
          }
          throw error
        }

        const tasks = (data || []) as Task[]
        return { allPendingTasks: tasks, totalCount: tasks.length }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
          throw err
        }
        console.error('Error fetching all pending tasks:', err)
        return { allPendingTasks: [], totalCount: 0 }
      }
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 2,
  })
}
