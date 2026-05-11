import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'
import type { EmailIdentity } from './useEmailIdentityMap'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function useContactIdentityMapByIds(contactIds: Array<string | null | undefined>) {
  const { user, loading } = useAuth()

  const normalizedIds = useMemo(() => {
    return Array.from(new Set((contactIds || []).map((id) => String(id || '').trim()).filter(Boolean))).sort()
  }, [contactIds])

  return useQuery({
    // role excluded from queryKey — RLS enforces row-level access at the DB level
    queryKey: ['contact-identity-map-by-id', normalizedIds, user?.id],
    queryFn: async () => {
      if (!normalizedIds.length) return {} as Record<string, EmailIdentity>
      if (!user) return {} as Record<string, EmailIdentity>

      const map: Record<string, EmailIdentity> = {}
      const selectClause = 'id, email, name, firstName, lastName, accountId, ownerId, metadata, accounts(name, domain, logo_url)'
      const chunks = chunk(normalizedIds, 100)

      for (const ids of chunks) {
        const { data, error } = await supabase
          .from('contacts')
          .select(selectClause)
          .in('id', ids)

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
      }

      return map
    },
    enabled: !loading && normalizedIds.length > 0 && !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previousData) => previousData,
  })
}
