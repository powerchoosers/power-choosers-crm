import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { AgentProgressReport, AgentProgressRow } from '@/types/agents'

type AgentProgressPayload = AgentProgressReport & {
  agents?: AgentProgressRow[]
}

async function getAdminToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || (process.env.NODE_ENV === 'development' ? 'dev-bypass-token' : '')
}

function canViewAgentProgress(role?: string | null, email?: string | null) {
  const normalizedEmail = String(email || '').toLowerCase().trim()
  return role === 'admin' || role === 'dev' || normalizedEmail === 'dev@nodalpoint.io'
}

export function useAgentProgress(ownerId?: string) {
  const { user, role, loading } = useAuth()

  return useQuery({
    queryKey: ['agent-progress', ownerId || 'all', user?.id ?? user?.email ?? 'guest', role ?? 'unknown'],
    queryFn: async () => {
      if (loading || !user || !canViewAgentProgress(role, user.email)) return null

      try {
        const token = await getAdminToken()
        const path = ownerId
          ? `/api/admin/agent-progress/${encodeURIComponent(ownerId)}`
          : '/api/admin/agent-progress'

        const res = await fetch(path, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })

        if (!res.ok) {
          let message = 'Failed to load agent progress'
          try {
            const payload = await res.json()
            if (payload && typeof payload.error === 'string') {
              message = payload.error
            }
          } catch {
            // Keep the generic message when the response body is not JSON.
          }
          throw new Error(message)
        }

        const payload = (await res.json()) as AgentProgressPayload
        if (ownerId) {
          const agent = (payload as { agent?: AgentProgressRow }).agent
          if (!agent) {
            throw new Error('Agent not found')
          }
          return { generatedAt: payload.generatedAt, totals: payload.totals, agents: [agent] } as AgentProgressReport
        }

        return {
          generatedAt: payload.generatedAt,
          totals: payload.totals,
          agents: Array.isArray(payload.agents) ? payload.agents : [],
        } satisfies AgentProgressReport
      } catch (error) {
        console.error('Failed to load agent progress:', error)
        throw error instanceof Error ? error : new Error('Failed to load agent progress')
      }
    },
    enabled: !loading && !!user && canViewAgentProgress(role, user.email),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: (previousData) => previousData,
  })
}
