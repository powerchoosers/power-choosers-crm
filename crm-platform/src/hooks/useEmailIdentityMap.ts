import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { resolveContactPhotoUrl } from '@/lib/contactAvatar'

export interface EmailIdentity {
  id: string
  email: string
  displayName: string
  firstName?: string
  lastName?: string
  accountId?: string | null
  accountName?: string | null
  accountDomain?: string | null
  accountLogoUrl?: string | null
  avatarUrl?: string | null
}

export function extractEmailAddress(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const angle = raw.match(/<\s*([^>]+)\s*>/)
  const email = angle?.[1] || raw
  return email.trim().toLowerCase()
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function useEmailIdentityMap(addresses: string[]) {
  const { user, loading } = useAuth()

  const normalized = useMemo(() => {
    const dedup = new Set<string>()
    for (const a of addresses || []) {
      const email = extractEmailAddress(a)
      if (email) dedup.add(email)
    }
    return Array.from(dedup).sort()
  }, [addresses])

  return useQuery({
    // Note: role intentionally excluded from queryKey — RLS enforces access control
    // at the DB level, so we don't need role-based client branching. Removing role
    // from the key eliminates a race condition where the query fires before
    // AuthContext.fetchProfile() resolves role to 'admin', causing contacts owned
    // by email-format ownerIds (e.g. l.patterson@nodalpoint.io) to be missed.
    queryKey: ['email-identity-map', normalized, user?.id],
    queryFn: async () => {
      if (!normalized.length) return {} as Record<string, EmailIdentity>
      if (!user) return {} as Record<string, EmailIdentity>

      const map: Record<string, EmailIdentity> = {}
      const chunks = chunk(normalized, 100)

      const emailOrFilter = (emails: string[]) =>
        emails.map((e) => `email.ilike.${e}`).join(',')

      const selectClause = 'id, email, name, firstName, lastName, accountId, ownerId, metadata, accounts(name, domain, logo_url)'

      for (const c of chunks) {
        // Single query — RLS SELECT policy handles row-level visibility.
        // Admin: sees all contacts. Agent: sees own + null-owner contacts.
        const { data, error } = await supabase
          .from('contacts')
          .select(selectClause)
          .or(emailOrFilter(c))

        if (error) throw error

        for (const row of data || []) {
          const key = extractEmailAddress(row.email)
          if (!key) continue
          const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts
          const displayName =
            row.name ||
            [row.firstName, row.lastName].filter(Boolean).join(' ').trim() ||
            row.email
          map[key] = {
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
    enabled: !loading && normalized.length > 0 && !!user,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previousData) => previousData,
  })
}
