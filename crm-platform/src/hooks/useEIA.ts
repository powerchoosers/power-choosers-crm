'use client'

import { useQuery } from '@tanstack/react-query'

export interface EIARetailRow {
  period: string
  stateid: string
  stateDescription: string
  sectorid: string
  sectorName: string
  price: string | null
  'price-units': string
}

export interface EIARetailResponse {
  route: string
  mode: string
  catalog: EIARetailRow[]
  metadata: { frequency?: string; total?: string }
}

/** Texas retail sales (COM + IND) last 3 years for Macro Variance chart. */
export function useEIARetailTexas() {
  const params = new URLSearchParams({
    route: 'electricity/retail-sales',
    data: '1',
    length: '216', // 36 months × 6 sectors per month (3 years)
    frequency: 'monthly',
    'facets[stateid][]': 'TX',
    'data[]': 'price',
    // Most recent first so "last 36 months" are the first 216 rows returned
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
  })
  return useQuery<EIARetailResponse>({
    queryKey: ['eia-retail-tx'],
    queryFn: async () => {
      const res = await fetch(`/api/market/eia?${params.toString()}`)
      if (!res.ok) throw new Error('EIA connection failed')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  })
}
