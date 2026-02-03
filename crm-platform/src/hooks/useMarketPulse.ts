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

export function useMarketPulse() {
  return useQuery<MarketPulseData>({
    queryKey: ['market-pulse'],
    queryFn: async () => {
      const [priceRes, gridRes] = await Promise.all([
        fetch('/api/market/ercot?type=prices'),
        fetch('/api/market/ercot?type=grid')
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
        prices: priceData.prices,
        grid: gridData.metrics,
        timestamp: priceData.timestamp || gridData.timestamp,
        metadata: {
          price_source: priceData.source || priceData.metadata?.source,
          grid_source: gridData.source || gridData.metadata?.source,
          last_updated: new Date().toISOString()
        }
      }
    },
    refetchInterval: 60 * 1000, // Refetch every minute
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    retry: 2, // Retry twice before failing
    retryDelay: (attempt) => Math.min(attempt * 1000, 3000) // Staggered retry
  })
}
