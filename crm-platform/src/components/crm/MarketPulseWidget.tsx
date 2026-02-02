'use client'

import { Activity, TrendingUp, AlertTriangle } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function MarketPulseWidget() {
  const [prices, setPrices] = useState({
    houston: 24.50,
    north: 21.20,
    reserves: 3450,
    scarcity: 4.2,
    capacity: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMarketData() {
      try {
        // Fetch prices from ERCOT scraper
        const priceRes = await fetch('/api/market/ercot?type=prices')
        const priceData = await priceRes.json()

        // Fetch grid conditions for reserves
        const gridRes = await fetch('/api/market/ercot?type=grid')
        const gridData = await gridRes.json()

        if (priceData.prices) {
          setPrices(prev => ({
            ...prev,
            houston: priceData.prices.houston || prev.houston,
            north: priceData.prices.north || prev.north,
          }))
        }

        if (gridData.metrics) {
          setPrices(prev => ({
            ...prev,
            reserves: gridData.metrics.reserves ?? Math.floor(gridData.metrics.actual_load / 10),
            scarcity: gridData.metrics.scarcity_prob ?? +(Math.abs((gridData.metrics.forecast_load - gridData.metrics.actual_load) / 1000)).toFixed(1),
            capacity: gridData.metrics.total_capacity
          }))
        }
        
        setLoading(false)
      } catch (error) {
        console.error('Failed to fetch market data:', error)
      }
    }

    fetchMarketData()
    const interval = setInterval(fetchMarketData, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const reservePercentage = prices.capacity ? Math.min(100, Math.max(0, (prices.reserves / prices.capacity) * 100)) : 65;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Market Pulse</h3>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] font-mono text-green-500 uppercase tracking-widest">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-1">
          <span className="text-[9px] font-mono text-zinc-500 uppercase">LZ_HOUSTON</span>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-mono font-medium text-white tabular-nums">${prices.houston.toFixed(2)}</span>
            <span className="text-[8px] font-mono text-zinc-600">MWh</span>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-1">
          <span className="text-[9px] font-mono text-zinc-500 uppercase">LZ_NORTH</span>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-mono font-medium text-white tabular-nums">${prices.north.toFixed(2)}</span>
            <span className="text-[8px] font-mono text-zinc-600">MWh</span>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400">
            <TrendingUp size={14} className="text-[#002FA7]" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Grid Reserves</span>
          </div>
          <span className="text-xs font-mono text-white tabular-nums">{prices.reserves.toLocaleString()} MW</span>
        </div>
        
        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#002FA7] transition-all duration-1000" 
            style={{ width: `${reservePercentage}%` }}
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <AlertTriangle size={12} className="text-yellow-500/50" />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-tighter">Scarcity Probability: {prices.scarcity}%</span>
        </div>
      </div>
    </div>
  )
}
