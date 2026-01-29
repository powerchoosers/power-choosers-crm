'use client';

import React from 'react';
import { Bell } from 'lucide-react';

export function RecentAlerts() {
  const alerts = [
    { id: 1, message: 'High call volume detected in North Region.', time: '2 minutes ago' },
    { id: 2, message: 'Grid volatility protocol triggered for Austin Cluster.', time: '14 minutes ago' },
    { id: 3, message: 'Unusual load spike detected: Client_ID #4421.', time: '42 minutes ago' },
    { id: 4, message: '4CP window closing in 15 minutes. Initiate curtailment.', time: '1 hour ago' },
    { id: 5, message: 'New market intelligence report available for ERCOT.', time: '3 hours ago' },
  ];

  return (
    <div className="nodal-glass p-6 rounded-2xl flex flex-col h-full border border-white/5 relative overflow-hidden group">
      {/* Top light source catch */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white tracking-tight">System Alerts</h3>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">Real-time Telemetry</p>
        </div>
        <div className="h-8 w-8 rounded-full bg-zinc-900/50 border border-white/5 flex items-center justify-center">
          <Bell className="w-4 h-4 text-zinc-400" />
        </div>
      </div>

      <div className="space-y-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 np-scroll flex-1">
        {alerts.map((alert) => (
          <div 
            key={alert.id} 
            className="flex gap-4 items-start p-3 rounded-xl hover:bg-white/[0.02] transition-colors cursor-default group/item border border-transparent hover:border-white/5"
          >
            <div className="w-2 h-2 mt-2 rounded-full bg-signal animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.6)] group-hover/item:shadow-[0_0_12px_rgba(0,47,167,0.8)] transition-all flex-shrink-0" />
            <div>
              <p className="text-sm text-zinc-300 group-hover/item:text-zinc-100 transition-colors leading-relaxed">{alert.message}</p>
              <p className="text-[10px] text-zinc-500 mt-1 font-mono tabular-nums uppercase tracking-widest">{alert.time}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
          Stream_Active
        </div>
        <div className="flex items-center gap-1 hover:text-white cursor-pointer transition-colors">
          Clear_Logs
        </div>
      </div>
    </div>
  );
}
