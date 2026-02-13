'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useEffect, useState } from 'react';

const DATA = [
  { time: '06:00', volume: 4, price: 32 },
  { time: '08:00', volume: 12, price: 28 },
  { time: '10:00', volume: 28, price: 85 },
  { time: '12:00', volume: 18, price: 45 },
  { time: '14:00', volume: 42, price: 120 },
  { time: '16:00', volume: 38, price: 95 },
  { time: '18:00', volume: 14, price: 52 },
  { time: '20:00', volume: 8, price: 38 },
];

export function ActivityChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  return (
    <div className="nodal-void-card p-6 h-full min-h-[380px] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-mono text-zinc-400 uppercase tracking-[0.2em]">
            RESPONSE_PHYSICS
          </h3>
          <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">
            Activity vs. ERCOT volatility (placeholder)
          </p>
        </div>
        <div className="flex items-center gap-4 text-[9px] font-mono uppercase tracking-widest text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-[#002FA7]" />
            Volume
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-0.5 bg-rose-500 rounded" />
            Price
          </span>
        </div>
      </div>
      <div className="h-[280px] w-full">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#52525b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#09090b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  fontSize: '10px',
                }}
                formatter={(value: number | undefined, name: string | undefined) => [
                  name === 'volume'
                    ? (value ?? 0)
                    : `$${value ?? 0}`,
                  name === 'volume' ? 'Volume' : 'Avg price',
                ]}
              />
              <Bar
                yAxisId="left"
                dataKey="volume"
                fill="#002FA7"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
                name="volume"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="price"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                name="price"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/[0.02] rounded-xl border border-white/[0.05]">
            <span className="text-[10px] font-mono text-zinc-600 animate-pulse uppercase tracking-widest">
              Initializing_Physics_Engine...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
