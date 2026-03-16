'use client';

import { Gauge, Layers, Zap, Activity, X, ChevronRight } from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useExpiringAccounts, type ExpiringAccount } from '@/hooks/useExpiringAccounts';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { CompanyIcon } from '@/components/ui/CompanyIcon';

// ─── Expiring Accounts Drill-Down Panel ──────────────────────────────────────

function ExpiringPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: accounts = [], isLoading } = useExpiringAccounts(true);

  // Esc to close
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const urgencyColor = (days: number) => {
    if (days <= 30) return 'text-rose-400';
    if (days <= 60) return 'text-amber-400';
    return 'text-zinc-400';
  };

  const urgencyBorder = (days: number) => {
    if (days <= 30) return 'border-rose-500/20 bg-rose-500/5';
    if (days <= 60) return 'border-amber-500/20 bg-amber-500/5';
    return 'border-white/5 bg-white/[0.02]';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="absolute top-0 left-0 w-72 z-[100] bg-[#050505] border border-white/10 flex flex-col rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
    >
      {/* Compact header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400">
            90D_EXPIRY
          </span>
          <span className="text-[9px] font-mono text-zinc-600 tabular-nums">
            {isLoading ? '—' : `(${accounts.length})`}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Scrollable account list */}
      <div className="overflow-y-auto np-scroll max-h-72">
        {isLoading && (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 px-2 py-2 rounded-lg border border-white/5 animate-pulse">
                <div className="w-7 h-7 rounded-lg bg-white/5 flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-2.5 bg-white/5 rounded w-2/3" />
                  <div className="h-2 bg-white/[0.03] rounded w-1/3" />
                </div>
                <div className="h-2.5 w-8 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && accounts.length === 0 && (
          <div className="flex items-center justify-center py-6 px-4">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">No_Contracts_In_90D</span>
          </div>
        )}

        {!isLoading && accounts.length > 0 && (
          <div className="p-2 space-y-1">
            {accounts.map((acct: ExpiringAccount, idx: number) => (
              <motion.div
                key={acct.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.18 }}
                onClick={() => { router.push(`/network/accounts/${acct.id}`); onClose(); }}
                className={`group flex items-center gap-2.5 px-2 py-2 rounded-lg border transition-all cursor-pointer hover:border-white/20 hover:bg-white/[0.04] ${urgencyBorder(acct.daysLeft)}`}
              >
                <CompanyIcon
                  logoUrl={acct.logo_url ?? undefined}
                  domain={acct.domain ?? undefined}
                  name={acct.name}
                  size={28}
                  className="w-7 h-7 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-100 truncate">{acct.name}</p>
                  {acct.industry && (
                    <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider truncate">
                      {acct.industry}
                    </p>
                  )}
                </div>
                <span className={`text-xs font-mono font-semibold tabular-nums flex-shrink-0 ${urgencyColor(acct.daysLeft)}`}>
                  {acct.daysLeft}D
                </span>
                <ChevronRight className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── KPIGrid ─────────────────────────────────────────────────────────────────

export function KPIGrid() {
  const { data: metrics, isLoading } = useDashboardMetrics();
  const [mounted, setMounted] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const positionsNum = isHydrating ? 0 : (metrics?.openPositions ?? 0);

  const METRICS = [
    {
      key: 'liability',
      label: 'LIABILITY_UNDER_MGMT',
      value: liabilityValue,
      sub: 'Annual volume protected',
      icon: Layers,
      pulse: false,
      clickable: false,
    },
    {
      key: 'positions',
      label: 'OPEN_POSITIONS',
      value: positionsValue,
      sub: 'Contracts expiring in 90d',
      icon: Gauge,
      pulse: true, // Amber/rose when > 0
      clickable: true,
    },
    {
      key: 'velocity',
      label: 'OPERATIONAL_VELOCITY',
      value: velocityValue,
      sub: 'Calls + emails (24h)',
      icon: Activity,
      pulse: false,
      clickable: false,
    },
    {
      key: 'volatility',
      label: 'GRID_VOLATILITY_INDEX',
      value: volatilityValue,
      sub: '0–100 market stress',
      icon: Zap,
      pulse: false,
      gauge: true, // < 30 green, > 70 red
      clickable: false,
    },
  ];

  return (
    <div className="relative">
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {METRICS.map((m) => {
        const num = m.gauge ? (typeof volatilityNum === 'number' ? volatilityNum : parseInt(m.value, 10) || 0) : 0;
        const Icon = m.icon;
        const isPositions = m.key === 'positions';

        return (
          <div
            key={m.key}
            className={`nodal-void-card p-5 transition-colors relative overflow-hidden group ${m.clickable && positionsNum > 0 && !isLoading
                ? 'hover:border-amber-500/30 cursor-pointer'
                : 'hover:border-white/10'
              }`}
            onClick={() => {
              if (m.clickable && positionsNum > 0 && !isLoading && !expiryOpen) {
                setExpiryOpen(true);
              }
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="flex items-start justify-between">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.15em]">
                {m.label}
              </span>
              <div className={`h-8 w-8 rounded-[14px] flex items-center justify-center transition-all ${isPositions && positionsNum > 0 && !isLoading
                  ? 'bg-amber-500/10 border border-amber-500/30 group-hover:bg-amber-500/20'
                  : 'bg-white/5 border border-white/10'
                }`}>
                <Icon className={`h-4 w-4 ${isPositions && positionsNum > 0 && !isLoading ? 'text-amber-400' : 'text-zinc-400'}`} />
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
                <div className="flex flex-col items-end gap-1">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                  <span className="text-[8px] font-mono text-amber-500/60 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                    tap to view
                  </span>
                </div>
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

    {/* Expiry Panel — spans the full KPI grid row, not a single card */}
    <AnimatePresence>
      {expiryOpen && (
        <ExpiringPanel onClose={() => setExpiryOpen(false)} />
      )}
    </AnimatePresence>
    </div>
  );
}
