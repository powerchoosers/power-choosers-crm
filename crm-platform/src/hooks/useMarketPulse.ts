import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface MarketPulseData {
  prices: {
    houston: number
    north: number
    south: number
    west: number
    hub_avg: number
  }
  transmission_rates: {
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
    net_load?: number
  }
  timestamp: string
  metadata: {
    price_source: string
    grid_source: string
    last_updated: string
    source: 'live' | 'market_telemetry' | 'scraper'
  }
}

const FETCH_TIMEOUT_MS = 25000

// Oncor 2026 Q1 Fallback Rates (Consistent with market-data/page.tsx)
const FALLBACK_TRANSMISSION_RATES = {
  houston: 0.6597,
  north: 0.7234,
  south: 0.5821,
  west: 0.8943
};

function fetchWithTimeout(url: string, timeout: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

async function fetchLiveFromApi(): Promise<MarketPulseData> {
  // Use a slightly tighter timeout for the live API to trigger fallback quicker if ERCOT is slow
  const [priceRes, gridRes] = await Promise.all([
    fetchWithTimeout('/api/market/ercot?type=prices', 15000),
    fetchWithTimeout('/api/market/ercot?type=grid', 15000)
  ])

  if (!priceRes.ok || !gridRes.ok) {
    throw new Error(`API error: ${priceRes.status}/${gridRes.status}`)
  }

  const priceData = await priceRes.json()
  const gridData = await gridRes.json()

  const prices = priceData.prices || {}
  const hub_avg = priceData.prices?.hub_avg ??
    (((prices.houston || 0) + (prices.north || 0) + (prices.south || 0) + (prices.west || 0)) / 4);

  return {
    prices: {
      houston: prices.houston || 0,
      north: prices.north || 0,
      south: prices.south || 0,
      west: prices.west || 0,
      hub_avg: hub_avg || 0
    },
    transmission_rates: priceData.transmission_rates || FALLBACK_TRANSMISSION_RATES,
    grid: gridData.metrics || {},
    timestamp: priceData.timestamp || gridData.timestamp || new Date().toISOString(),
    metadata: {
      price_source: priceData.source || 'ERCOT API',
      grid_source: gridData.source || 'ERCOT API',
      last_updated: new Date().toISOString(),
      source: (priceData.source?.includes('Scraper') || gridData.source?.includes('Scraper')) ? 'scraper' : 'live'
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

  const meta = (data.metadata as Record<string, any>) ?? {}
  const prices = (data.prices as any) ?? {}

  return {
    prices: {
      houston: prices.houston || 0,
      north: prices.north || 0,
      south: prices.south || 0,
      west: prices.west || 0,
      hub_avg: prices.hub_avg || 0
    },
    transmission_rates: meta.transmission_rates || FALLBACK_TRANSMISSION_RATES,
    grid: (data.grid as any) || {},
    timestamp: (data.timestamp as string) || new Date(data.created_at).toISOString(),
    metadata: {
      price_source: meta.price_source || 'Supabase',
      grid_source: meta.grid_source || 'Supabase',
      last_updated: meta.last_updated || new Date(data.created_at).toISOString(),
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
    refetchInterval: 5 * 60 * 1000, // Sync every 5 mins
    staleTime: 4 * 60 * 1000,
    retry: 1,
    retryDelay: 2000
  })
}

