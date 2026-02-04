import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Target } from '@/types/targets'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

export function useTargets() {
  return useQuery({
    queryKey: ['targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('*, list_members!list_members_listid_fkey(count)')
      
      if (error) {
        if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
          throw error;
        }
        throw error
      }
      
      // Transform data to include count
      return (data as (Target & { list_members: { count: number }[] })[]).map((list) => ({
        ...list,
        count: list.list_members?.[0]?.count || 0
      })) as Target[]
    }
  })
}

export function useCreateTarget() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ name, kind }: { name: string; kind: string }) => {
      if (!user) throw new Error('User not authenticated')

      const newList = {
        id: crypto.randomUUID(),
        name,
        kind,
        ownerId: user.email,
        createdBy: user.email,
        createdAt: new Date().toISOString(),
        metadata: {}
      }

      const { data, error } = await supabase
        .from('lists')
        .insert(newList)
        .select()
        .single()

      if (error) throw error
      return data as Target
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets'] })
    },
    onError: (error) => {
      console.error('Error creating target list:', error)
      toast.error('Failed to create target list')
    }
  })
}

export function useTarget(id: string) {
  return useQuery({
    queryKey: ['target', id],
    queryFn: async () => {
      if (!id) return null
      
      const { data, error } = await supabase
        .from('lists')
        .select('*, list_members!list_members_listid_fkey(count)')
        .eq('id', id)
        .single()
      
      if (error) {
        if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
          throw error;
        }
        throw error
      }
      
      const target = data as (Target & { list_members: { count: number }[] })
      return {
        ...target,
        count: target.list_members?.[0]?.count || 0
      } as Target
    },
    enabled: !!id
  })
}

export function useSearchTargets(queryTerm: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['targets-search', queryTerm, user?.email, role],
    queryFn: async () => {
      if (!queryTerm || queryTerm.length < 2) return []
      if (loading || !user) return []

      try {
        let query = supabase.from('lists').select('*, list_members!list_members_listid_fkey(count)')

        if (role !== 'admin' && user.email) {
          query = query.eq('ownerId', user.email)
        }

        query = query.ilike('name', `%${queryTerm}%`)

        const { data, error } = await query.limit(10)

        if (error) {
          if (error.message?.includes('Abort') || error.message === 'FetchUserError: Request was aborted') {
            return []
          }
          console.error("Search error:", error)
          return []
        }

        return (data as (Target & { list_members: { count: number }[] })[]).map((list) => ({
          ...list,
          count: list.list_members?.[0]?.count || 0
        })) as Target[]
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('Abort') || error?.message === 'FetchUserError: Request was aborted') {
          return []
        }
        console.error("Search hook error:", error)
        return []
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}
