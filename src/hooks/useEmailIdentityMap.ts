import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

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
  const { user, role, loading } = useAuth()

  const normalized = useMemo(() => {
    const dedup = new Set<string>()
    for (const a of addresses || []) {
      const email = extractEmailAddress(a)
      if (email) dedup.add(email)
    }
    return Array.from(dedup)
  }, [addresses])

  return useQuery({
    queryKey: ['email-identity-map', normalized, user?.id, role],
    queryFn: async () => {
      if (!normalized.length) return {} as Record<string, EmailIdentity>
      if (!user && role !== 'admin') return {} as Record<string, EmailIdentity>

      const map: Record<string, EmailIdentity> = {}
      const chunks = chunk(normalized, 100)

      const emailOrFilter = (emails: string[]) =>
        emails.map((e) => `email.ilike.${e}`).join(',')

      for (const c of chunks) {
        const selectClause = 'id, email, name, firstName, lastName, accountId, ownerId, accounts(name, domain, logo_url)'

        const querySets: any[] = []
        if (role === 'admin') {
          querySets.push(
            supabase
              .from('contacts')
              .select(selectClause)
              .or(emailOrFilter(c))
          )
        } else if (user?.id) {
          querySets.push(
            supabase
              .from('contacts')
              .select(selectClause)
              .eq('ownerId', user.id)
              .or(emailOrFilter(c))
          )
          querySets.push(
            supabase
              .from('contacts')
              .select(selectClause)
              .is('ownerId', null)
              .or(emailOrFilter(c))
          )
        }

        for (const query of querySets) {
          const { data, error } = await query
          if (error) throw error

          for (const row of data || []) {
            const key = extractEmailAddress(row.email)
            if (!key) continue
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
              accountName: row.accounts?.name || null,
              accountDomain: row.accounts?.domain || null,
              accountLogoUrl: row.accounts?.logo_url || null,
            }
          }
        }
      }

      return map
    },
    enabled: !loading && normalized.length > 0 && !!(user || role === 'admin'),
    staleTime: 1000 * 60 * 5,
  })
}
