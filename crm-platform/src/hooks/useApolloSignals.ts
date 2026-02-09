import { useQuery } from '@tanstack/react-query'
import { useAccount } from './useAccounts'

export interface ApolloSignal {
  id: string
  title: string
  url: string
  domain: string
  snippet: string
  published_at: string | null
  event_categories: string[]
}

interface NewsResponse {
  signals: ApolloSignal[]
  _resolved?: boolean
}

async function fetchSignals(domain: string): Promise<ApolloSignal[]> {
  const params = new URLSearchParams({ domain })
  const res = await fetch(`/api/apollo/news?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return []
  const data = (await res.json()) as NewsResponse
  return data.signals ?? []
}

/**
 * Fetches Target Signal Stream (Apollo news/signals) for the given account.
 * Resolves account -> domain -> Apollo news. Disabled when no accountId or no domain.
 */
export function useApolloSignals(accountId: string | undefined) {
  const { data: account } = useAccount(accountId ?? '')
  const domain = account?.domain?.trim()

  return useQuery({
    queryKey: ['apollo-signals', accountId ?? '', domain ?? ''],
    queryFn: () => fetchSignals(domain!),
    enabled: !!domain && !!accountId,
    staleTime: 1000 * 60 * 5, // 5 min
  })
}
