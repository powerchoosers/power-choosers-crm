import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { List } from '@/types/lists'

export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('*, list_members(count)')
      
      if (error) throw error
      
      // Transform data to include count
      return (data as (List & { list_members: { count: number }[] })[]).map((list) => ({
        ...list,
        count: list.list_members?.[0]?.count || 0
      })) as List[]
    }
  })
}
