import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

export interface Protocol {
  id: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'draft'
  steps: ProtocolStep[]
  bgvector?: {
    nodes: any[]
    edges: any[]
  }
  createdAt: string | Date
  updatedAt?: string | Date
  ownerId?: string
}

export interface ProtocolStep {
  id: string
  type: 'email' | 'call' | 'task'
  delayDays: number
  content?: string
  subject?: string // For emails
}

const PAGE_SIZE = 50

export function useProtocols(searchQuery?: string) {
  const { user, role, loading } = useAuth()
  const queryClient = useQueryClient()

  const protocolsQuery = useInfiniteQuery({
    queryKey: ['protocols', user?.email, role, searchQuery],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      try {
        if (loading || !user) return { protocols: [], nextCursor: null }

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
          protocols: (data || []).map(item => ({
            ...item,
            steps: item.steps || []
          })) as Protocol[],
          nextCursor: count && (pageParam + 1) * PAGE_SIZE < count ? pageParam + 1 : null
        }
      } catch (error: unknown) {
        console.error('Error fetching protocols:', error)
        throw error
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
  })

  const addProtocolMutation = useMutation({
    mutationFn: async (newProtocol: Omit<Protocol, 'id' | 'createdAt'>) => {
      const { data, error } = await supabase
        .from('sequences')
        .insert({
          ...newProtocol,
          id: crypto.randomUUID(),
          ownerId: user?.email,
          createdAt: new Date().toISOString(),
          status: newProtocol.status || 'draft',
          steps: newProtocol.steps || []
        })
        .select()
        .single()
      
      if (error) throw error
      return data as Protocol
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocols'] })
      toast.success('Protocol created successfully')
    },
    onError: (error) => {
      console.error('Error adding protocol:', error)
      toast.error('Failed to create protocol')
    }
  })

  const updateProtocolMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Protocol> & { id: string }) => {
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
      return data as Protocol
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocols'] })
      toast.success('Protocol updated successfully')
    },
    onError: (error) => {
      console.error('Error updating protocol:', error)
      toast.error('Failed to update protocol')
    }
  })

  const deleteProtocolMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sequences')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocols'] })
      toast.success('Protocol deleted successfully')
    },
    onError: (error) => {
      console.error('Error deleting protocol:', error)
      toast.error('Failed to delete protocol')
    }
  })

  return {
    data: protocolsQuery.data,
    isLoading: protocolsQuery.isLoading,
    isError: protocolsQuery.isError,
    fetchNextPage: protocolsQuery.fetchNextPage,
    hasNextPage: protocolsQuery.hasNextPage,
    isFetchingNextPage: protocolsQuery.isFetchingNextPage,
    addProtocol: addProtocolMutation.mutate,
    createProtocolAsync: addProtocolMutation.mutateAsync,
    updateProtocol: updateProtocolMutation.mutate,
    deleteProtocol: deleteProtocolMutation.mutate
  }
}

export function useProtocolsCount(searchQuery?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['protocols-count', user?.email, role, searchQuery],
    queryFn: async () => {
      if (loading || !user || !user.email) return 0

      try {
        let query = supabase.from('sequences').select('id', { count: 'exact', head: true })

        if (role !== 'admin') {
          query = query.eq('ownerId', user.email)
        }

        if (searchQuery) {
          query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
        }

        const { count, error } = await query
        if (error) {
          console.error("Supabase error fetching protocols count:", {
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
          console.error("Error fetching protocols count:", error.message || error)
        }
        return 0
      }
    },
    enabled: !loading && !!user && !!user?.email,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSearchProtocols(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['protocols-search', queryTerm, user?.email, role],
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

        return data as Protocol[]
      } catch (err) {
        console.error("Search hook error:", err)
        return []
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}
