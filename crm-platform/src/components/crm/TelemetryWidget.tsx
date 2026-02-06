'use client'
import { Clock, Sun, Activity } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { calculateVolatilityIndex } from '@/lib/market-mapping';
import { useMarketPulse } from '@/hooks/useMarketPulse';

export default function TelemetryWidget({ location = 'LZ_NORTH' }: { location?: string }) {
  const [time, setTime] = useState('');
  const { data: marketData, isLoading, isError } = useMarketPulse();

  const metrics = useMemo(() => {
    const price = marketData?.prices
      ? (marketData.prices[location.toLowerCase().replace('lz_', '') as keyof typeof marketData.prices] ?? marketData.prices.north ?? 24.50)
      : 24.50;
    const reserves = marketData?.grid?.reserves ?? 3450;
    const capacity = marketData?.grid?.total_capacity ?? 85000;
    const scarcity = marketData?.grid?.scarcity_prob ?? 4.2;
    return { price, reserves, capacity, scarcity, loading: isLoading, error: isError };
  }, [marketData, location, isLoading, isError]);

  useEffect(() => {
    const updateTime = () => {
      setTime(new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Chicago'
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const volatilityIndex = calculateVolatilityIndex({
    price: metrics.price,
    reserves: metrics.reserves,
    capacity: metrics.capacity,
    scarcity: metrics.scarcity
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-2">
          <div className="flex items-center gap-2 text-zinc-500">
            <Clock size={12} />
            <span className="text-[10px] font-mono uppercase">Local Time</span>
          </div>
          <div className="text-sm font-mono font-medium text-zinc-200 tabular-nums">{time}</div>
        </div>
        <div className="p-3 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-2">
          <div className="flex items-center gap-2 text-zinc-500">
            <Sun size={12} />
            <span className="text-[10px] font-mono uppercase">Weather</span>
          </div>
          <div className="text-sm font-mono font-medium text-zinc-200">72°F Clear</div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl space-y-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2 text-zinc-400">
            <Activity size={14} className={metrics.loading ? "text-zinc-600" : "text-[#002FA7] animate-pulse"} />
            <span className="text-[10px] font-mono uppercase tracking-wider">Volatility Index</span>
          </div>
          <span className="text-xs font-mono text-[#002FA7] tabular-nums">{volatilityIndex}%</span>
        </div>
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden relative z-10">
          <div 
            className="h-full bg-[#002FA7] shadow-[0_0_15px_rgba(0,47,167,0.8)] transition-all duration-1000 ease-out" 
            style={{ width: `${volatilityIndex}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-widest relative z-10">
          <span>Stable</span>
          <span>Critical</span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed italic relative z-10">
          {volatilityIndex > 50 
            ? `High volatility detected in ${location}. Real-time pricing exceeds $100/MWh.`
            : `Market conditions in ${location} remain stable. No immediate scarcity risk detected.`}
        </p>
      </div>
    </div>
  );
}
