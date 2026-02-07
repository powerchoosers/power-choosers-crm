'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface AccountListMembership {
  id: string
  listId: string
  listName: string
  targetId: string
  targetType: string
  addedAt: string
}

const ACCOUNT_TARGET_TYPES = ['account', 'accounts', 'company', 'companies'] as const

/**
 * Hook to fetch all lists that an account belongs to
 */
export function useAccountListMemberships(accountId: string | undefined) {
  return useQuery({
    queryKey: ['account-list-memberships', accountId],
    queryFn: async () => {
      if (!accountId) return []

      const { data: memberships, error: membershipsError } = await supabase
        .from('list_members')
        .select('id, listId, targetId, targetType, addedAt')
        .eq('targetId', accountId)
        .in('targetType', [...ACCOUNT_TARGET_TYPES])

      if (membershipsError) {
        console.error('Error fetching account list memberships:', membershipsError)
        throw membershipsError
      }

      if (!memberships || memberships.length === 0) return []

      const listIds = memberships.map(m => m.listId)
      const { data: lists, error: listsError } = await supabase
        .from('lists')
        .select('id, name')
        .in('id', listIds)

      if (listsError) {
        console.error('Error fetching lists:', listsError)
        throw listsError
      }

      return memberships.map(membership => {
        const list = lists?.find(l => l.id === membership.listId)
        return {
          id: membership.id,
          listId: membership.listId,
          listName: list?.name || 'Unknown List',
          targetId: membership.targetId,
          targetType: membership.targetType,
          addedAt: membership.addedAt
        } as AccountListMembership
      })
    },
    enabled: !!accountId,
    staleTime: 1000 * 60 * 5,
  })
}

/**
 * Hook to add an account to a list
 */
export function useAddAccountToList() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ accountId, listId }: { accountId: string; listId: string }) => {
      const memberId = crypto.randomUUID()

      const { data, error } = await supabase
        .from('list_members')
        .insert({
          id: memberId,
          listId,
          targetId: accountId,
          targetType: 'account',
          addedAt: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('Account is already in this list')
        }
        throw error
      }

      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['account-list-memberships', variables.accountId] })
      queryClient.invalidateQueries({ queryKey: ['targets'] })
      queryClient.invalidateQueries({ queryKey: ['target', variables.listId] })
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'account' && q.queryKey[1] === variables.accountId })
    },
    onError: (error: Error) => {
      console.error('Error adding account to list:', error)
      toast.error(error.message || 'Failed to add account to list')
    }
  })
}

/**
 * Hook to remove an account from a list
 */
export function useRemoveAccountFromList() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ accountId, membershipId }: { accountId: string; membershipId: string }) => {
      const { error } = await supabase
        .from('list_members')
        .delete()
        .eq('id', membershipId)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['account-list-memberships', variables.accountId] })
      queryClient.invalidateQueries({ queryKey: ['targets'] })
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'account' && q.queryKey[1] === variables.accountId })
      queryClient.invalidateQueries({ queryKey: ['target'] })
    },
    onError: (error: Error) => {
      console.error('Error removing account from list:', error)
      toast.error('Failed to remove account from list')
    }
  })
}
