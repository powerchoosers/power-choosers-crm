import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface MarketPulseData {
  prices: {
    houston: number
    north: number
    south?: number
    west?: number
    hub_avg?: number
  }
  transmission_rates?: {
    houston: number
    north: number
    south: number
    west: number
  }
  grid: {
    actual_load: number
    forecast_load: number
    total_capacity: number
    reserves: number
    scarcity_prob: number
    wind_gen?: number
    pv_gen?: number
    frequency?: number
  }
  timestamp: string
  metadata: {
    price_source?: string
    grid_source?: string
    last_updated: string
    source?: 'live' | 'market_telemetry'
  }
}

const FETCH_TIMEOUT_MS = 25000 // 25s so backend/ERCOT have time to respond

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

async function fetchLiveFromApi(): Promise<MarketPulseData> {
  const [priceRes, gridRes] = await Promise.all([
    fetchWithTimeout('/api/market/ercot?type=prices'),
    fetchWithTimeout('/api/market/ercot?type=grid')
  ])

  if (!priceRes.ok || !gridRes.ok) {
    console.error('Market fetch error:', { priceStatus: priceRes.status, gridStatus: gridRes.status })
    throw new Error('error in read')
  }

  const priceContentType = priceRes.headers.get('content-type')
  const gridContentType = gridRes.headers.get('content-type')
  if (!priceContentType?.includes('application/json') || !gridContentType?.includes('application/json')) {
    console.error('Market fetch non-JSON response:', { priceType: priceContentType, gridType: gridContentType })
    throw new Error('error in read')
  }

  const priceData = await priceRes.json()
  const gridData = await gridRes.json()
  return {
    prices: priceData.prices ?? {},
    transmission_rates: priceData.transmission_rates ?? {
      houston: 0.6597,
      north: 0.7234,
      south: 0.5821,
      west: 0.8943
    },
    grid: gridData.metrics ?? {},
    timestamp: priceData.timestamp || gridData.timestamp || new Date().toISOString(),
    metadata: {
      price_source: priceData.source || priceData.metadata?.source,
      grid_source: gridData.source || gridData.metadata?.source,
      last_updated: new Date().toISOString(),
      source: 'live'
    }
  }
}

async function fetchLastKnownFromSupabase(): Promise<MarketPulseData> {
  const { data, error } = await supabase
    .from('market_telemetry')
    .select('prices, grid, timestamp, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'No market_telemetry row')
  }

  const meta = (data.metadata as Record<string, unknown>) ?? {}
  return {
    prices: (data.prices as MarketPulseData['prices']) ?? {},
    transmission_rates: (meta.transmission_rates as MarketPulseData['transmission_rates']) ?? {
      houston: 0.6597,
      north: 0.7234,
      south: 0.5821,
      west: 0.8943
    },
    grid: (data.grid as MarketPulseData['grid']) ?? {},
    timestamp: (data.timestamp as string) ?? new Date(data.created_at as string).toISOString(),
    metadata: {
      price_source: (meta.price_source as string) ?? undefined,
      grid_source: (meta.grid_source as string) ?? undefined,
      last_updated: (meta.last_updated as string) ?? new Date(data.created_at as string).toISOString(),
      source: 'market_telemetry'
    }
  }
}

export function useMarketPulse() {
  return useQuery<MarketPulseData>({
    queryKey: ['market-pulse'],
    queryFn: async () => {
      try {
        return await fetchLiveFromApi()
      } catch (apiError) {
        console.warn('Market pulse: live API failed, using last saved from Supabase:', apiError)
        return await fetchLastKnownFromSupabase()
      }
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(2000 * Math.pow(2, attempt), 10000)
  })
}
