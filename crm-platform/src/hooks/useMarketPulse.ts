import { useQuery } from '@tanstack/react-query'

export interface MarketPulseData {
  prices: {
    houston: number
    north: number
    south?: number
    west?: number
    hub_avg?: number
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
  }
}

const FETCH_TIMEOUT_MS = 15000 // 15s so we don't hang if backend is down or slow

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

export function useMarketPulse() {
  return useQuery<MarketPulseData>({
    queryKey: ['market-pulse'],
    queryFn: async () => {
      const [priceRes, gridRes] = await Promise.all([
        fetchWithTimeout('/api/market/ercot?type=prices'),
        fetchWithTimeout('/api/market/ercot?type=grid')
      ])
      
      if (!priceRes.ok || !gridRes.ok) {
        console.error('Market fetch error:', { 
          priceStatus: priceRes.status, 
          gridStatus: gridRes.status 
        });
        throw new Error('error in read')
      }
      
      const priceContentType = priceRes.headers.get('content-type')
      const gridContentType = gridRes.headers.get('content-type')
      
      if (!priceContentType?.includes('application/json') || !gridContentType?.includes('application/json')) {
        console.error('Market fetch non-JSON response:', { 
          priceType: priceContentType, 
          gridType: gridContentType 
        });
        throw new Error('error in read')
      }

      const priceData = await priceRes.json()
      const gridData = await gridRes.json()
      
      return {
        prices: priceData.prices ?? {},
        grid: gridData.metrics ?? {},
        timestamp: priceData.timestamp || gridData.timestamp || new Date().toISOString(),
        metadata: {
          price_source: priceData.source || priceData.metadata?.source,
          grid_source: gridData.source || gridData.metadata?.source,
          last_updated: new Date().toISOString()
        }
      }
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 min (price doesn't change that often)
    staleTime: 4 * 60 * 1000, // Consider data fresh for 4 min
    retry: 3, // Retry 3 times on transient 500s
    retryDelay: (attempt) => Math.min(2000 * Math.pow(2, attempt), 15000) // 2s, 4s, 8s then give up
  })
}
