'use client'
import { Clock, Sun, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function TelemetryWidget({ location }: { location?: string }) {
  const [time, setTime] = useState('');
  
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

  const volatilityIndex = 84; // Mock value

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
            <Activity size={14} className="text-[#002FA7] animate-pulse" />
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
          High volatility detected in {location || 'LZ_NORTH'}. Real-time pricing exceeds $250/MWh.
        </p>
      </div>
    </div>
  );
}
