'use client'

import { Activity, TrendingUp, AlertTriangle } from 'lucide-react'
import { useMarketPulse } from '@/hooks/useMarketPulse'

export default function MarketPulseWidget() {
  const { data: marketData, isLoading, isError } = useMarketPulse()

  const prices = {
    houston: marketData?.prices?.houston ?? 24.50,
    north: marketData?.prices?.north ?? 21.20,
    reserves: marketData?.grid?.reserves ?? 3450,
    scarcity: marketData?.grid?.scarcity_prob ?? 4.2,
    capacity: marketData?.grid?.total_capacity ?? 0
  }

  const reservePercentage = prices.capacity ? Math.min(100, Math.max(0, (prices.reserves / prices.capacity) * 100)) : 65;

  if (isLoading && !marketData) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 rounded-2xl bg-white/5 border border-white/5" />
          <div className="h-16 rounded-2xl bg-white/5 border border-white/5" />
        </div>
        <div className="h-32 rounded-2xl bg-white/5 border border-white/5" />
      </div>
    )
  }

  const isLastSaved = marketData?.metadata?.source === 'market_telemetry'

  return (
    <div className="space-y-4">
      {isLastSaved && (
        <p className="text-[10px] font-mono text-amber-500/80 uppercase tracking-wider">Last saved telemetry (live API unavailable)</p>
      )}
      {isError && !marketData && (
        <p className="text-[10px] font-mono text-rose-500/80 uppercase tracking-wider">Unable to load telemetry</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="px-3 !pt-[3px] !pb-[12px] rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-0.5">
          <span className="text-[9px] font-mono text-zinc-500 uppercase leading-none">LZ_HOUSTON</span>
          <div className="flex items-baseline gap-1 leading-none">
            <span className="text-sm font-mono font-medium text-white tabular-nums leading-none">${prices.houston.toFixed(2)}</span>
            <span className="text-[8px] font-mono text-zinc-600 leading-none">MWh</span>
          </div>
        </div>
        <div className="px-3 !pt-[3px] !pb-[12px] rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-0.5">
          <span className="text-[9px] font-mono text-zinc-500 uppercase leading-none">LZ_NORTH</span>
          <div className="flex items-baseline gap-1 leading-none">
            <span className="text-sm font-mono font-medium text-white tabular-nums leading-none">${prices.north.toFixed(2)}</span>
            <span className="text-[8px] font-mono text-zinc-600 leading-none">MWh</span>
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
