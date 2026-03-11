import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'
import type { EmailIdentity } from './useEmailIdentityMap'

export function useContactIdentityMapByIds(contactIds: Array<string | null | undefined>) {
  const { user, role, loading } = useAuth()

  const normalizedIds = useMemo(() => {
    return Array.from(new Set((contactIds || []).map((id) => String(id || '').trim()).filter(Boolean))).sort()
  }, [contactIds])

  return useQuery({
    queryKey: ['contact-identity-map-by-id', normalizedIds, user?.id, role],
    queryFn: async () => {
      if (!normalizedIds.length) return {} as Record<string, EmailIdentity>
      if (!user && role !== 'admin') return {} as Record<string, EmailIdentity>

      const map: Record<string, EmailIdentity> = {}
      const selectClause = 'id, email, name, firstName, lastName, accountId, ownerId, metadata, accounts(name, domain, logo_url)'

      const { data, error } = await supabase
        .from('contacts')
        .select(selectClause)
        .in('id', normalizedIds)

      if (error) throw error

      for (const row of data || []) {
        const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts
        const displayName =
          row.name ||
          [row.firstName, row.lastName].filter(Boolean).join(' ').trim() ||
          row.email

        map[row.id] = {
          id: row.id,
          email: row.email,
          displayName,
          firstName: row.firstName || undefined,
          lastName: row.lastName || undefined,
          accountId: row.accountId || null,
          accountName: account?.name || null,
          accountDomain: account?.domain || null,
          accountLogoUrl: account?.logo_url || null,
          avatarUrl: resolveContactPhotoUrl(row) || null,
        }
      }

      return map
    },
    enabled: !loading && normalizedIds.length > 0 && !!(user || role === 'admin'),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previousData) => previousData,
  })
}
