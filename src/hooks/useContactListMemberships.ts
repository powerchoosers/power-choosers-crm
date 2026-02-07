'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface ContactListMembership {
  id: string
  listId: string
  listName: string
  targetId: string
  targetType: string
  addedAt: string
}

/**
 * Hook to fetch all lists that a contact belongs to
 */
export function useContactListMemberships(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-list-memberships', contactId],
    queryFn: async () => {
      if (!contactId) return []

      // First, get all list memberships for this contact
      const { data: memberships, error: membershipsError } = await supabase
        .from('list_members')
        .select('id, listId, targetId, targetType, addedAt')
        .eq('targetId', contactId)
        .in('targetType', ['people', 'contact', 'contacts'])

      if (membershipsError) {
        console.error('Error fetching list memberships:', membershipsError)
        throw membershipsError
      }

      if (!memberships || memberships.length === 0) return []

      // Then fetch the list details for each membership
      const listIds = memberships.map(m => m.listId)
      const { data: lists, error: listsError } = await supabase
        .from('lists')
        .select('id, name')
        .in('id', listIds)

      if (listsError) {
        console.error('Error fetching lists:', listsError)
        throw listsError
      }

      // Combine membership data with list names
      return memberships.map(membership => {
        const list = lists?.find(l => l.id === membership.listId)
        return {
          id: membership.id,
          listId: membership.listId,
          listName: list?.name || 'Unknown List',
          targetId: membership.targetId,
          targetType: membership.targetType,
          addedAt: membership.addedAt
        } as ContactListMembership
      })
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  })
}

/**
 * Hook to add a contact to a list
 */
export function useAddContactToList() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contactId, listId }: { contactId: string; listId: string }) => {
      const memberId = crypto.randomUUID()
      
      const { data, error } = await supabase
        .from('list_members')
        .insert({
          id: memberId,
          listId,
          targetId: contactId,
          targetType: 'contact',
          addedAt: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        // Handle unique constraint violation (already in list)
        if (error.code === '23505') {
          throw new Error('Contact is already in this list')
        }
        throw error
      }

      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-list-memberships', variables.contactId] })
      queryClient.invalidateQueries({ queryKey: ['targets'] })
      queryClient.invalidateQueries({ queryKey: ['target', variables.listId] })
      // People page orbs (useContactsInTargetLists) and StakeholderMap
      queryClient.invalidateQueries({ queryKey: ['list-memberships'] })
      // Contact dossier header badge (listName)
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === variables.contactId })
    },
    onError: (error: Error) => {
      console.error('Error adding contact to list:', error)
      toast.error(error.message || 'Failed to add contact to list')
    }
  })
}

/**
 * Hook to remove a contact from a list
 */
export function useRemoveContactFromList() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contactId, membershipId }: { contactId: string; membershipId: string }) => {
      const { error } = await supabase
        .from('list_members')
        .delete()
        .eq('id', membershipId)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-list-memberships', variables.contactId] })
      queryClient.invalidateQueries({ queryKey: ['targets'] })
      queryClient.invalidateQueries({ queryKey: ['list-memberships'] })
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === variables.contactId })
      queryClient.invalidateQueries({ queryKey: ['target'] })
    },
    onError: (error: Error) => {
      console.error('Error removing contact from list:', error)
      toast.error('Failed to remove contact from list')
    }
  })
}
