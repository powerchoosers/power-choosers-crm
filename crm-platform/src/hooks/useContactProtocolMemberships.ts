'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

export interface ContactProtocolMembership {
  id: string
  sequenceId: string
  sequenceName: string
  targetId: string
  targetType: string
  createdAt: string
}

/**
 * Fetch all sequences (protocols) a contact belongs to
 */
export function useContactProtocolMemberships(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-protocol-memberships', contactId],
    queryFn: async () => {
      if (!contactId) return []

      const { data: memberships, error: membershipsError } = await supabase
        .from('sequence_members')
        .select('id, sequenceId, targetId, targetType, createdAt')
        .eq('targetId', contactId)

      if (membershipsError) {
        console.error('Error fetching protocol memberships:', membershipsError)
        throw membershipsError
      }

      if (!memberships || memberships.length === 0) return []

      const sequenceIds = memberships.map(m => m.sequenceId).filter(Boolean)
      const { data: sequences, error: sequencesError } = await supabase
        .from('sequences')
        .select('id, name')
        .in('id', sequenceIds)

      if (sequencesError) {
        console.error('Error fetching sequences:', sequencesError)
        throw sequencesError
      }

      return memberships.map(m => {
        const seq = sequences?.find(s => s.id === m.sequenceId)
        return {
          id: m.id,
          sequenceId: m.sequenceId,
          sequenceName: seq?.name ?? 'Unknown',
          targetId: m.targetId,
          targetType: m.targetType,
          createdAt: m.createdAt
        } as ContactProtocolMembership
      })
    },
    enabled: !!contactId,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Add a contact to a protocol (sequence)
 */
export function useAddContactToProtocol() {
  const queryClient = useQueryClient()
  // We need the user ID for the RPC call
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ contactId, sequenceId }: { contactId: string; sequenceId: string }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('enroll_in_sequence', {
        sequence_id: sequenceId,
        contact_ids: [contactId],
        owner_id: user.id
      })

      if (error) {
        if (error.code === '23505') throw new Error('Contact is already in this protocol')
        console.error('RPC Error enrolling contact:', error)
        throw error
      }
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-protocol-memberships', variables.contactId] })
      queryClient.invalidateQueries({ queryKey: ['protocols'] })
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === variables.contactId })
      toast.success('Contact enrolled in protocol')
    },
    onError: (error: Error) => {
      console.error('Error adding contact to protocol:', error)
      toast.error(error.message || 'Failed to add contact to protocol')
    }
  })
}

/**
 * Remove a contact from a protocol
 */
export function useRemoveContactFromProtocol() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contactId, membershipId }: { contactId: string; membershipId: string }) => {
      const { error } = await supabase
        .from('sequence_members')
        .delete()
        .eq('id', membershipId)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-protocol-memberships', variables.contactId] })
      queryClient.invalidateQueries({ queryKey: ['protocols'] })
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === variables.contactId })
    },
    onError: (error: Error) => {
      console.error('Error removing contact from protocol:', error)
      toast.error('Failed to remove contact from protocol')
    }
  })
}

/**
 * Bulk enroll contacts in a protocol
 */
export function useEnrollContactsInProtocol() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ contactIds, sequenceId }: { contactIds: string[]; sequenceId: string }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('enroll_in_sequence', {
        sequence_id: sequenceId,
        contact_ids: contactIds,
        owner_id: user.id
      })

      if (error) {
        console.error('RPC Error enrolling contacts:', error)
        throw error
      }
      return data
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      variables.contactIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['contact-protocol-memberships', id] })
        queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'contact' && q.queryKey[2] === id })
      })
      queryClient.invalidateQueries({ queryKey: ['protocols'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(`${variables.contactIds.length} contact(s) enrolled in sequence`)
    },
    onError: (error: Error) => {
      console.error('Error enrolling contacts:', error)
      toast.error('Failed to enroll contacts')
    }
  })
}
