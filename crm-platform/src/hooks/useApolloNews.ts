import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ApolloNewsSignal {
  id: string
  title: string
  url: string
  domain: string
  snippet: string
  published_at: string | null
  event_categories?: string[]
}

interface NewsResponse {
  signals: ApolloNewsSignal[]
  _source?: string
  _resolved?: boolean
}

async function fetchNews(domain: string): Promise<ApolloNewsSignal[]> {
  const params = new URLSearchParams({ domain })
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/apollo/news?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  })
  if (!res.ok) return []
  const data = (await res.json()) as NewsResponse
  return data.signals ?? []
}

/**
 * Fetches Apollo company news for a given domain (e.g. from account.domain or contact website).
 * Use for ComposeModal context and GeminiChat company-news panel when on contact/account dossier.
 */
export function useApolloNews(domain: string | undefined) {
  return useQuery({
    queryKey: ['apollo-news', domain ?? ''],
    queryFn: () => fetchNews(domain!),
    enabled: !!domain?.trim(),
    staleTime: 1000 * 60 * 5, // 5 min
  })
}
