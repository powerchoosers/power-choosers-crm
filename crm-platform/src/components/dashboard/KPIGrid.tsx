'use client';

import { Gauge, Layers, Zap, Activity } from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useEffect, useState } from 'react';

export function KPIGrid() {
  const { data: metrics, isLoading } = useDashboardMetrics();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Format values with loading fallbacks
  // During hydration (not mounted), always show the fallback to match server render
  const isHydrating = !mounted || isLoading;

  const liabilityValue = isHydrating
    ? '—'
    : metrics?.liabilityKWh != null
      ? `${metrics.liabilityKWh.toLocaleString('en-US')} kWh`
      : '0 kWh';

  const positionsValue = isHydrating
    ? '—'
    : metrics?.openPositions?.toString() ?? '0';

  const velocityValue = isHydrating
    ? '—'
    : metrics?.operationalVelocity?.toString() ?? '0';

  const volatilityValue = isHydrating
    ? '—'
    : metrics?.gridVolatilityIndex?.toString() ?? '0';

  const volatilityNum = isHydrating ? 0 : (metrics?.gridVolatilityIndex ?? 0);
  const gaugeLow = !isHydrating && volatilityNum < 30;
  const gaugeHigh = !isHydrating && volatilityNum > 70;

  const METRICS = [
    {
      key: 'liability',
      label: 'LIABILITY_UNDER_MGMT',
      value: liabilityValue,
      sub: 'Annual volume protected',
      icon: Layers,
      pulse: false,
    },
    {
      key: 'positions',
      label: 'OPEN_POSITIONS',
      value: positionsValue,
      sub: 'Contracts expiring in 90d',
      icon: Gauge,
      pulse: true, // Amber/rose when > 0
    },
    {
      key: 'velocity',
      label: 'OPERATIONAL_VELOCITY',
      value: velocityValue,
      sub: 'Calls + emails (24h)',
      icon: Activity,
      pulse: false,
    },
    {
      key: 'volatility',
      label: 'GRID_VOLATILITY_INDEX',
      value: volatilityValue,
      sub: '0–100 market stress',
      icon: Zap,
      pulse: false,
      gauge: true, // < 30 green, > 70 red
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {METRICS.map((m) => {
        const num = m.gauge ? (typeof volatilityNum === 'number' ? volatilityNum : parseInt(m.value, 10) || 0) : 0;
        const positionsNum = m.key === 'positions' ? parseInt(m.value, 10) || 0 : 0;
        const Icon = m.icon;
        return (
          <div
            key={m.key}
            className="nodal-void-card p-5 hover:border-white/10 transition-colors relative overflow-hidden group"
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
                  className={`text-2xl font-mono font-semibold tabular-nums tracking-tight ${isLoading
                    ? 'text-zinc-500'
                    : m.pulse && positionsNum > 0
                      ? 'text-amber-400'
                      : m.gauge && gaugeHigh
                        ? 'text-rose-400'
                        : m.gauge && gaugeLow
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
              {m.pulse && positionsNum > 0 && !isLoading && (
                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              )}
              {m.gauge && !isLoading && (
                <div className="w-12 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${gaugeHigh ? 'bg-rose-500' : gaugeLow ? 'bg-emerald-500' : 'bg-amber-500/80'
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
