import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { normalizeOwnerKey } from '@/lib/owner-display'
import type { OwnerDirectoryEntry } from '@/types/agents'

type OwnerDirectoryPayload = {
  generatedAt?: string
  owners?: OwnerDirectoryEntry[]
}

async function getAdminToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || (process.env.NODE_ENV === 'development' ? 'dev-bypass-token' : '')
}

export function useOwnerDirectory() {
  const { user, loading } = useAuth()

  const query = useQuery({
    queryKey: ['owner-directory', user?.id ?? user?.email ?? 'guest'],
    queryFn: async () => {
      if (loading || !user) return { generatedAt: null, owners: [] as OwnerDirectoryEntry[] }

      try {
        const token = await getAdminToken()
        const res = await fetch('/api/admin/owner-directory', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })

        if (!res.ok) {
          return { generatedAt: null, owners: [] as OwnerDirectoryEntry[] }
        }

        const payload = (await res.json()) as OwnerDirectoryPayload
        return {
          generatedAt: payload.generatedAt ?? null,
          owners: Array.isArray(payload.owners) ? payload.owners : [],
        }
      } catch (error) {
        console.error('Failed to load owner directory:', error)
        return { generatedAt: null, owners: [] as OwnerDirectoryEntry[] }
      }
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: (previousData) => previousData,
  })

  const ownerMap = useMemo(() => {
    const map = new Map<string, OwnerDirectoryEntry>()
    for (const owner of query.data?.owners || []) {
      const keys = new Set<string>([
        owner.key,
        ...(owner.aliases || []),
      ])

      for (const key of keys) {
        const normalized = normalizeOwnerKey(key)
        if (!normalized) continue
        if (!map.has(normalized)) {
          map.set(normalized, owner)
        }
      }
    }
    return map
  }, [query.data?.owners])

  const getOwner = useCallback((ownerId?: string | null) => {
    const key = normalizeOwnerKey(ownerId)
    if (!key) return null
    return ownerMap.get(key) ?? null
  }, [ownerMap])

  return {
    owners: query.data?.owners ?? [],
    ownerMap,
    getOwner,
    generatedAt: query.data?.generatedAt ?? null,
    isLoading: loading || query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
