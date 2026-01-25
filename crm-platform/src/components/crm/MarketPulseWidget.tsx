'use client'

import { Activity, TrendingUp, AlertTriangle } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function MarketPulseWidget() {
  const [prices, setPrices] = useState({
    houston: 24.50,
    north: 21.20,
    reserves: 3450
  })

  // Simulate price movement
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => ({
        houston: +(prev.houston + (Math.random() - 0.5)).toFixed(2),
        north: +(prev.north + (Math.random() - 0.5)).toFixed(2),
        reserves: Math.floor(prev.reserves + (Math.random() - 0.5) * 100)
      }))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

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
            <span className="text-sm font-mono font-medium text-white tabular-nums">${prices.houston}</span>
            <span className="text-[8px] font-mono text-zinc-600">MWh</span>
          </div>
        </div>
        <div className="p-3 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-1">
          <span className="text-[9px] font-mono text-zinc-500 uppercase">LZ_NORTH</span>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-mono font-medium text-white tabular-nums">${prices.north}</span>
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
          <span className="text-xs font-mono text-white tabular-nums">{prices.reserves} MW</span>
        </div>
        
        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#002FA7] transition-all duration-1000" 
            style={{ width: '65%' }}
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <AlertTriangle size={12} className="text-yellow-500/50" />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-tighter">Scarcity Probability: 4.2%</span>
        </div>
      </div>
    </div>
  )
}
