'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'

export interface MarketTelemetryRow {
  created_at: string
  timestamp?: string
  prices: {
    houston?: number
    north?: number
    south?: number
    west?: number
    hub_avg?: number
  }
}

/** Chart point: one per row, oldest-first for Recharts. Zone colors match Infrastructure page. */
export interface ERCOTHistoryChartPoint {
  date: string
  label: string
  hub_avg: number | null
  north: number | null
  houston: number | null
  west: number | null
  south: number | null
}

const HISTORY_LIMIT = 500

export function useMarketTelemetryHistory() {
  const query = useQuery({
    queryKey: ['market-telemetry-history'],
    queryFn: async (): Promise<MarketTelemetryRow[]> => {
      const { data, error } = await supabase
        .from('market_telemetry')
        .select('created_at, timestamp, prices')
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT)

      if (error) throw error
      return (data ?? []) as MarketTelemetryRow[]
    },
    staleTime: 2 * 60 * 1000,
  })

  /** Chart-ready: oldest first, with short date label */
  const chartData: ERCOTHistoryChartPoint[] = useMemo(() => {
    const rows = (query.data ?? []) as MarketTelemetryRow[]
    const reversed = [...rows].reverse()
    return reversed.map((r) => {
      const d = r.created_at ? new Date(r.created_at) : null
      const label = d
        ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—'
      const p = r.prices ?? {}
      return {
        date: r.created_at,
        label,
        hub_avg: typeof p.hub_avg === 'number' ? p.hub_avg : null,
        north: typeof p.north === 'number' ? p.north : null,
        houston: typeof p.houston === 'number' ? p.houston : null,
        west: typeof p.west === 'number' ? p.west : null,
        south: typeof p.south === 'number' ? p.south : null,
      }
    })
  }, [query.data])

  return {
    data: query.data ?? [],
    chartData,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
