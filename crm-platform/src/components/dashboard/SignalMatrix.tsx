'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Radar, AlertTriangle, Zap, Plus, Phone, MapPin, UserCheck, FileText, TrendingUp, Building2, RefreshCw, ExternalLink, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '@/store/uiStore';

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
  const { setRightPanelMode, setIngestionIdentifier, setIngestionSignal } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabId>('recon');
  const [selectedSignal, setSelectedSignal] = useState<IntelSignal | null>(null);
  const router = useRouter();

  const [isScraping, setIsScraping] = useState(false);

  // Fetch signals autonomously using TanStack Query
  const { data: qData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['market-recon-signals'],
    queryFn: async () => {
      // Add t param to force cache bust on Vercel Edge Cache during background refetches
      const res = await fetch(`/api/intelligence/signals?type=recon&limit=20&t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 300000, // Background poll every 5m as a fallback
    refetchOnWindowFocus: true, // Auto-update when returning to tab/dashboard
  });

  const signals: IntelSignal[] = qData?.signals || [];
  const lastUpdated = qData?.last_updated || null;
  const isRefreshing = isFetching && !isLoading;

  // Trigger Edge Function directly
  const triggerScrape = async () => {
    if (isScraping) return;
    setIsScraping(true);
    const toastId = toast.loading('Initiating deep recon scan...');
    try {
      const res = await fetch('/api/intelligence/trigger-scrape', {
        method: 'POST'
      });
      if (!res.ok) throw new Error(`Scrape trigger failed`);
      const data = await res.json();

      toast.success(`Scan complete. ${data.count || 0} new anomalies detected.`, { id: toastId });

      // Pull fresh data & animate refresh
      await refetch();
    } catch (err: any) {
      console.error('[SignalMatrix] manual scrape error:', err);
      toast.error('Scan failed to initialize.', { id: toastId });
    } finally {
      setIsScraping(false);
    }
  };

  const handleIngestNode = (signal: IntelSignal) => {
    if (signal.crm_account_id) {
      router.push(`/network/accounts/${signal.crm_account_id}?domain=${encodeURIComponent(signal.entity_domain || '')}`);
    } else {
      // Open the ingestion panel and pre-fill the domain
      setIngestionIdentifier(signal.entity_domain || signal.entity_name || '');
      setIngestionSignal(signal);
      setRightPanelMode('INGEST_ACCOUNT');
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
          onClick={triggerScrape}
          disabled={isScraping || isRefreshing}
          className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/10 bg-black/30 text-zinc-500 hover:text-white hover:border-[#002FA7]/50 hover:bg-[#002FA7]/10 transition-all disabled:opacity-40"
          title="Initiate Deep Scan"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(isScraping || isRefreshing) ? 'animate-spin' : ''}`} />
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
                <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest">{error.message}</span>
                <button onClick={() => refetch()} className="text-[9px] font-mono text-zinc-500 hover:text-white uppercase tracking-widest underline">
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
                    onClick={() => setSelectedSignal(signal)}
                    className="group flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all cursor-pointer relative overflow-hidden"
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
                        <p className="text-[10px] text-zinc-600 mt-1 font-mono leading-relaxed line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {signal.summary}
                        </p>
                      )}
                    </div>

                    {/* Hover indicator */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                      <ExternalLink className="w-3 h-3 text-[#002FA7]" />
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

      {/* Full Report Takeover Overlay */}
      <AnimatePresence>
        {selectedSignal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 z-[100] bg-[#050505] p-6 flex flex-col overflow-hidden"
          >
            {/* Expanded Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-[18px] border flex items-center justify-center ${SIGNAL_CONFIG[selectedSignal.signal_type]?.bg} ${SIGNAL_CONFIG[selectedSignal.signal_type]?.border}`}>
                  <span className={SIGNAL_CONFIG[selectedSignal.signal_type]?.color}>
                    {SIGNAL_CONFIG[selectedSignal.signal_type]?.icon}
                  </span>
                </div>
                <div>
                  <h4 className={`text-[11px] font-mono uppercase tracking-[0.2em] ${SIGNAL_CONFIG[selectedSignal.signal_type]?.color}`}>
                    {SIGNAL_CONFIG[selectedSignal.signal_type]?.label} // REPORT
                  </h4>
                  <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                    SIGNAL_DETECTED: {formatRelativeTime(selectedSignal.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSignal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Expander Content */}
            <div className="flex-1 overflow-y-auto np-scroll pr-2">
              <div className="space-y-6">
                <section>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest block mb-1.5">Headline</label>
                  <h2 className="text-lg font-mono text-white leading-tight">
                    {selectedSignal.headline}
                  </h2>
                </section>

                <div className="grid grid-cols-2 gap-4">
                  <section>
                    <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest block mb-1.5">Entity</label>
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      <p className="text-xs font-mono text-zinc-200">{selectedSignal.entity_name || 'NULL_ENTITY'}</p>
                      {selectedSignal.entity_domain && (
                        <p className="text-[10px] font-mono text-zinc-500 mt-1">{selectedSignal.entity_domain}</p>
                      )}
                    </div>
                  </section>
                  <section>
                    <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest block mb-1.5">Intelligence Status</label>
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      {selectedSignal.crm_account_id ? (
                        <div className="flex items-center gap-2 text-emerald-400">
                          <UserCheck className="w-3 h-3" />
                          <span className="text-[10px] font-mono uppercase tracking-widest">ACTIVE_RECORD</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[#4D88FF]">
                          <Radar className="w-3 h-3" />
                          <span className="text-[10px] font-mono uppercase tracking-widest">NEW_PROSPECT</span>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                <section>
                  <label className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest block mb-1.5">Narrative Analysis</label>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
                    <p className="text-xs font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap">
                      {selectedSignal.summary || 'Analytical summary pending full-text extraction.'}
                    </p>
                  </div>
                </section>
              </div>
            </div>

            {/* Actions Footer */}
            <div className={`mt-6 pt-6 border-t border-white/5 grid ${selectedSignal.source_url ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {selectedSignal.source_url && (
                <a
                  href={selectedSignal.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-white/5 border border-white/5 text-[10px] font-mono text-zinc-400 hover:text-white hover:border-white/20 transition-all uppercase tracking-widest"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Source
                </a>
              )}
              <button
                onClick={() => {
                  handleIngestNode(selectedSignal);
                  setSelectedSignal(null);
                }}
                className="flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#002FA7] text-white text-[10px] font-mono hover:bg-[#002FA7]/90 transition-all uppercase tracking-widest shadow-[0_0_20px_-5px_rgba(0,47,167,0.5)]"
              >
                <Plus className="w-3.5 h-3.5" />
                {selectedSignal.crm_account_id ? 'OPEN_DOSSIER' : 'INGEST_NODE'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
