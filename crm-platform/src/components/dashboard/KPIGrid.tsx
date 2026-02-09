'use client';

import { Gauge, Layers, Zap, Activity } from 'lucide-react';

// Placeholder — wire to useDashboardMetrics later
const METRICS = [
  {
    key: 'liability',
    label: 'LIABILITY_UNDER_MGMT',
    value: '45.2 GWh',
    sub: 'Annual volume protected',
    icon: Layers,
    pulse: false,
  },
  {
    key: 'positions',
    label: 'OPEN_POSITIONS',
    value: '7',
    sub: 'Contracts expiring in 90d',
    icon: Gauge,
    pulse: true, // Amber/rose when > 0
  },
  {
    key: 'velocity',
    label: 'OPERATIONAL_VELOCITY',
    value: '24',
    sub: 'Calls + emails (24h)',
    icon: Activity,
    pulse: false,
  },
  {
    key: 'volatility',
    label: 'GRID_VOLATILITY_INDEX',
    value: '42',
    sub: '0–100 market stress',
    icon: Zap,
    pulse: false,
    gauge: true, // < 30 green, > 70 red
  },
];

export function KPIGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {METRICS.map((m) => {
        const num = m.gauge ? parseInt(m.value, 10) : 0;
        const gaugeLow = m.gauge && num < 30;
        const gaugeHigh = m.gauge && num > 70;
        const Icon = m.icon;
        return (
          <div
            key={m.key}
            className="bg-zinc-950/50 backdrop-blur-xl border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.15em]">
                {m.label}
              </span>
              <div className="h-8 w-8 rounded-[14px] bg-white/5 border border-white/10 flex items-center justify-center">
                <Icon className="h-4 w-4 text-zinc-400" />
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span
                  className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${
                    m.pulse && parseInt(m.value, 10) > 0
                      ? 'text-amber-400'
                      : gaugeHigh
                        ? 'text-rose-400'
                        : gaugeLow
                          ? 'text-emerald-400'
                          : 'text-white'
                  }`}
                >
                  {m.value}
                </span>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  {m.sub}
                </span>
              </div>
              {m.pulse && parseInt(m.value, 10) > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              )}
              {m.gauge && (
                <div className="w-12 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      gaugeHigh ? 'bg-rose-500' : gaugeLow ? 'bg-emerald-500' : 'bg-amber-500/80'
                    }`}
                    style={{ width: `${Math.min(100, num)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
