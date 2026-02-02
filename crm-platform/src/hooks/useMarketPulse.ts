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
      
      if (!priceRes.ok || !gridRes.ok) throw new Error('Failed to fetch market data')
      
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
    staleTime: 30 * 1000 // Consider data stale after 30 seconds
  })
}
