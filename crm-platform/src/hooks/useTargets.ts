import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Target } from '@/types/targets'
import { useAuth } from '@/context/AuthContext'

export function useTargets() {
  return useQuery({
    queryKey: ['targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('*, list_members(count)')
      
      if (error) throw error
      
      // Transform data to include count
      return (data as (Target & { list_members: { count: number }[] })[]).map((list) => ({
        ...list,
        count: list.list_members?.[0]?.count || 0
      })) as Target[]
    }
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
        let query = supabase.from('lists').select('*, list_members(count)')

        if (role !== 'admin' && user.email) {
          query = query.eq('ownerId', user.email)
        }

        query = query.ilike('name', `%${queryTerm}%`)

        const { data, error } = await query.limit(10)

        if (error) {
          console.error("Search error:", error)
          return []
        }

        return (data as (Target & { list_members: { count: number }[] })[]).map((list) => ({
          ...list,
          count: list.list_members?.[0]?.count || 0
        })) as Target[]
      } catch (err) {
        console.error("Search hook error:", err)
        return []
      }
    },
    enabled: queryTerm.length >= 2 && !loading && !!user,
    staleTime: 1000 * 60 * 1,
  })
}
