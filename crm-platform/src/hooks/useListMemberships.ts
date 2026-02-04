'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Hook to check which contacts from a given list are in any target lists
 * Returns a Set of contact IDs that are in target lists
 */
export function useContactsInTargetLists(contactIds: string[]) {
  return useQuery({
    queryKey: ['list-memberships', contactIds],
    queryFn: async () => {
      if (!contactIds || contactIds.length === 0) {
        return new Set<string>()
      }

      const { data, error } = await supabase
        .from('list_members')
        .select('targetId')
        .eq('targetType', 'CONTACT')
        .in('targetId', contactIds)

      if (error) {
        console.error('Error fetching list memberships:', error)
        return new Set<string>()
      }

      // Return a Set of unique contact IDs that are in any list
      return new Set(data?.map(item => item.targetId) || [])
    },
    enabled: contactIds && contactIds.length > 0,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  })
}

/**
 * Hook to check if a single contact is in any target lists
 */
export function useIsContactInTargetList(contactId: string | undefined) {
  return useQuery({
    queryKey: ['list-membership', contactId],
    queryFn: async () => {
      if (!contactId) return false

      const { data, error } = await supabase
        .from('list_members')
        .select('id')
        .eq('targetType', 'CONTACT')
        .eq('targetId', contactId)
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Error checking list membership:', error)
        return false
      }

      return !!data
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  })
}
