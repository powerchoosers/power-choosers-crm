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

/** Texas retail sales (COM + IND) last 12 months for Macro Trend Log. */
export function useEIARetailTexas() {
  const params = new URLSearchParams({
    route: 'electricity/retail-sales',
    data: '1',
    length: '12',
    frequency: 'monthly',
    'facets[stateid][]': 'TX',
    'data[]': 'price',
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
