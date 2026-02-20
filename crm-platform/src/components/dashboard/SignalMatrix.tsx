'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Radar, AlertTriangle, Zap, Plus, Phone, MapPin, UserCheck, FileText, TrendingUp, Building2, RefreshCw, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

type TabId = 'recon' | 'monitor';

type SignalType = 'new_location' | 'exec_hire' | 'energy_rfp' | 'sec_filing' | 'expansion';

interface IntelSignal {
  id: string;
  signal_type: SignalType;
  headline: string;
  summary?: string;
  entity_name?: string;
  entity_domain?: string;
  crm_account_id?: string | null;
  crm_match_type?: 'exact_domain' | 'fuzzy_name' | 'none';
  crm_match_score?: number;
  source_url?: string;
  relevance_score?: number;
  created_at: string;
  accounts?: { id: string; name: string; domain?: string } | null;
}

interface MonitorSignal {
  id: string;
  time: string;
  label: 'HIGH_VELOCITY_INTEREST' | 'VOLATILITY_EXPOSURE' | 'CHURN_RISK';
  message: string;
  type: 'risk' | 'opportunity';
}

// Monitor tab stays as useful static placeholders (real CRM data wiring is future phase)
const MONITOR_SIGNALS: MonitorSignal[] = [
  { id: '1', time: '08:00', label: 'VOLATILITY_EXPOSURE', message: 'Check accounts with contracts expiring in 60 days for 4CP exposure.', type: 'risk' },
  { id: '2', time: '07:30', label: 'HIGH_VELOCITY_INTEREST', message: 'Review Apollo signals for recently-enriched target accounts.', type: 'opportunity' },
  { id: '3', time: '07:00', label: 'CHURN_RISK', message: 'Track executive changes at existing accounts — champion departures signal risk.', type: 'risk' },
];

const SIGNAL_CONFIG: Record<SignalType, { icon: React.ReactNode; label: string; color: string; bg: string; border: string }> = {
  new_location: {
    icon: <MapPin className="w-4 h-4" />,
    label: 'NEW_LOCATION',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  exec_hire: {
    icon: <UserCheck className="w-4 h-4" />,
    label: 'EXEC_HIRE',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
  },
  energy_rfp: {
    icon: <FileText className="w-4 h-4" />,
    label: 'ENERGY_RFP',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  sec_filing: {
    icon: <TrendingUp className="w-4 h-4" />,
    label: 'SEC_FILING',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  expansion: {
    icon: <Building2 className="w-4 h-4" />,
    label: 'EXPANSION',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
  },
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function SignalMatrix() {
  const [activeTab, setActiveTab] = useState<TabId>('recon');
  const [signals, setSignals] = useState<IntelSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchSignals = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/intelligence/signals?type=recon&limit=20');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSignals(data.signals || []);
      setLastUpdated(data.last_updated || new Date().toISOString());
    } catch (err: any) {
      setError('Signal feed offline');
      console.error('[SignalMatrix] fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const handleIngestNode = (signal: IntelSignal) => {
    if (signal.crm_account_id) {
      router.push(`/network/accounts/${signal.crm_account_id}`);
    } else {
      // Future: open Apollo enrichment modal for new prospect
      window.open(
        `https://www.google.com/search?q=${encodeURIComponent((signal.entity_name || '') + ' Texas energy')}`,
        '_blank'
      );
    }
  };

  return (
    <div className="nodal-void-card flex flex-col h-full min-h-[420px] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Header */}
      <div className="p-4 pb-3 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <h3 className="text-[11px] font-mono text-zinc-400 uppercase tracking-[0.2em]">
            ACTIVE_TELEMETRY // LIVE_SIGNALS
          </h3>
        </div>
        <button
          onClick={() => fetchSignals(true)}
          disabled={isRefreshing}
          className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/10 bg-black/30 text-zinc-500 hover:text-white hover:border-[#002FA7]/50 hover:bg-[#002FA7]/10 transition-all disabled:opacity-40"
          title="Refresh signals"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 px-4 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('recon')}
          className={`
            px-4 py-3 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors
            ${activeTab === 'recon'
              ? 'border-white text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'}
          `}
        >
          RECONNAISSANCE
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('monitor')}
          className={`
            px-4 py-3 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors
            ${activeTab === 'monitor'
              ? 'border-white text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'}
          `}
        >
          ASSET_MONITOR
        </button>
      </div>

      {/* Stream content */}
      <div className="flex-1 overflow-y-auto np-scroll p-4 space-y-2">

        {/* RECONNAISSANCE TAB — Live AI Signals */}
        {activeTab === 'recon' && (
          <>
            {isLoading && (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5 animate-pulse">
                    <div className="w-8 h-8 rounded-[14px] bg-white/5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 bg-white/5 rounded w-24" />
                      <div className="h-3 bg-white/5 rounded w-full" />
                      <div className="h-3 bg-white/5 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && error && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest">{error}</span>
                <button onClick={() => fetchSignals()} className="text-[9px] font-mono text-zinc-500 hover:text-white uppercase tracking-widest underline">
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !error && signals.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                <Radar className="w-6 h-6 text-zinc-700" />
                <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">No_Signals_On_Record</span>
                <span className="text-[9px] font-mono text-zinc-700">Cron runs 3× daily — first scan pending</span>
              </div>
            )}

            <AnimatePresence>
              {!isLoading && signals.map((signal, idx) => {
                const cfg = SIGNAL_CONFIG[signal.signal_type] || SIGNAL_CONFIG.new_location;
                const inCRM = signal.crm_account_id && signal.crm_match_type !== 'none';

                return (
                  <motion.div
                    key={signal.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.25 }}
                    className="group flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all"
                  >
                    {/* Signal type icon */}
                    <div className={`w-8 h-8 rounded-[14px] border flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.border}`}>
                      <span className={cfg.color}>{cfg.icon}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-[10px] font-mono tabular-nums uppercase tracking-wider ${cfg.color}`}>
                          {cfg.label}
                        </p>
                        <span className="text-[9px] font-mono text-zinc-600 tabular-nums">
                          {formatRelativeTime(signal.created_at)}
                        </span>
                        {/* CRM match badge */}
                        {inCRM ? (
                          <span className="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            IN_CRM
                          </span>
                        ) : (
                          <span className="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#002FA7]/10 border border-[#002FA7]/30 text-[#4D88FF]">
                            NEW_PROSPECT
                          </span>
                        )}
                      </div>

                      {signal.entity_name && (
                        <p className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
                          {signal.entity_name}
                        </p>
                      )}

                      <p className="text-xs text-zinc-200 mt-0.5 font-mono leading-snug line-clamp-2">
                        {signal.headline}
                      </p>

                      {signal.summary && (
                        <p className="text-[10px] text-zinc-500 mt-1 font-mono leading-relaxed line-clamp-2 hidden group-hover:block">
                          {signal.summary}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleIngestNode(signal)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-[9px] font-mono text-zinc-300 hover:text-white hover:border-[#002FA7]/50 transition-all uppercase tracking-widest"
                        title={inCRM ? 'Open account dossier' : 'Research prospect'}
                      >
                        <Plus className="w-3 h-3" />
                        {inCRM ? 'OPEN_DOSSIER' : 'INGEST_NODE'}
                      </button>
                      {signal.source_url && (
                        <a
                          href={signal.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[9px] font-mono text-zinc-500 hover:text-zinc-300 transition-all uppercase tracking-widest"
                        >
                          <ExternalLink className="w-3 h-3" />
                          SOURCE
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}

        {/* ASSET_MONITOR TAB */}
        {activeTab === 'monitor' && (
          <>
            {MONITOR_SIGNALS.map((s) => (
              <div
                key={s.id}
                className="group flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all"
              >
                <div
                  className={`w-8 h-8 rounded-[14px] border flex items-center justify-center flex-shrink-0 ${s.type === 'risk'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-[#002FA7]/10 border-[#002FA7]/30'
                    }`}
                >
                  {s.type === 'risk' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Zap className="w-4 h-4 text-[#002FA7]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono tabular-nums uppercase tracking-wider text-zinc-500">
                    [{s.time}] {s.label}
                  </p>
                  <p className="text-xs text-zinc-200 mt-0.5 font-mono leading-snug">{s.message}</p>
                </div>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-[9px] font-mono text-zinc-300 hover:text-white hover:border-[#002FA7]/50 transition-all uppercase tracking-widest flex-shrink-0"
                >
                  <Phone className="w-3 h-3" />
                  INITIATE_CONTACT
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/5 flex justify-between items-center text-[9px] font-mono text-zinc-600 uppercase tracking-widest flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
          Stream_Active
        </span>
        <span className="text-zinc-700">
          {lastUpdated
            ? `Last_Scan: ${formatRelativeTime(lastUpdated)}`
            : 'Awaiting_First_Scan'}
        </span>
      </div>
    </div>
  );
}
