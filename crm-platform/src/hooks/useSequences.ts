import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

export interface Sequence {
  id: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'draft'
  steps: SequenceStep[]
  createdAt: string | Date | any
  updatedAt?: string | Date | any
  ownerId?: string
}

export interface SequenceStep {
  id: string
  type: 'email' | 'call' | 'task'
  delayDays: number
  content?: string
  subject?: string // For emails
}

const PAGE_SIZE = 50

export function useSequences(searchQuery?: string) {
  const { user, role, loading } = useAuth()
  const queryClient = useQueryClient()

  const sequencesQuery = useInfiniteQuery({
    queryKey: ['sequences', user?.email, role, searchQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (loading || !user) return { sequences: [], nextCursor: null }

        let query = supabase
          .from('sequences')
          .select('*', { count: 'exact' })
        
        if (role !== 'admin' && user.email) {
          query = query.eq('ownerId', user.email)
        }

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        }

        const from = pageParam * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error, count } = await query
          .range(from, to)
          .order('createdAt', { ascending: false })
        
        if (error) throw error
        
        return {
          sequences: (data || []).map(item => ({
            ...item,
            steps: item.steps || []
          })) as Sequence[],
          nextCursor: count && (pageParam + 1) * PAGE_SIZE < count ? pageParam + 1 : null
        }
      } catch (error: any) {
        console.error('Error fetching sequences:', error)
        throw error
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })

  const addSequenceMutation = useMutation({
    mutationFn: async (newSequence: Omit<Sequence, 'id' | 'createdAt'>) => {
      const { data, error } = await supabase
        .from('sequences')
        .insert({
          ...newSequence,
          ownerId: user?.email,
          createdAt: new Date().toISOString(),
          status: newSequence.status || 'draft',
          steps: newSequence.steps || []
        })
        .select()
        .single()
      
      if (error) throw error
      return data as Sequence
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
      const { data, error } = await supabase
        .from('sequences')
        .update({
          ...updates,
          updatedAt: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data as Sequence
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
      const { error } = await supabase
        .from('sequences')
        .delete()
        .eq('id', id)
      
      if (error) throw error
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

export function useSequencesCount(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['sequences-count', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user) return 0

      let query = supabase.from('sequences').select('*', { count: 'exact', head: true })

      if (role !== 'admin' && user.email) {
        query = query.eq('ownerId', user.email)
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
      }

      const { count, error } = await query
      if (error) {
        console.error("Error fetching sequences count:", error)
        return 0
      }
      return count || 0
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSearchSequences(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['sequences-search', queryTerm, user?.email, role],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase.from('sequences').select('*')

        if (role !== 'admin' && user.email) {
          query = query.eq('ownerId', user.email)
        }

        query = query.or(`name.ilike.%${queryTerm}%,description.ilike.%${queryTerm}%`)

        const { data, error } = await query.limit(10)

        if (error) {
          console.error("Search error:", error)
          return []
        }

        return data as Sequence[]
      } catch (err) {
        console.error("Search hook error:", err)
        return []
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}

