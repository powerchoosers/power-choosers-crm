'use client';

import React, { useState } from 'react';
import { Radar, AlertTriangle, Zap, Plus, Phone } from 'lucide-react';

type TabId = 'recon' | 'monitor';

interface ReconSignal {
  id: string;
  time: string;
  label: 'INTENT_DETECTED' | 'GROWTH_EVENT' | 'PHYSICS_ANOMALY';
  message: string;
  entity?: string;
}

interface MonitorSignal {
  id: string;
  time: string;
  label: 'HIGH_VELOCITY_INTEREST' | 'VOLATILITY_EXPOSURE' | 'CHURN_RISK';
  message: string;
  type: 'risk' | 'opportunity';
}

// Placeholder data — replace with API later
const RECON_PLACEHOLDER: ReconSignal[] = [
  { id: '1', time: '10:42:01', label: 'INTENT_DETECTED', message: 'Acme Corp is hiring Energy Manager (LZ_NORTH).', entity: 'Acme Corp' },
  { id: '2', time: '10:38:22', label: 'GROWTH_EVENT', message: 'Nexus Logistics secured Series B — load expansion likely.', entity: 'Nexus Logistics' },
  { id: '3', time: '10:31:15', label: 'PHYSICS_ANOMALY', message: 'Unidentified large load detected in LZ_WEST near wind farm.', entity: null },
  { id: '4', time: '10:18:44', label: 'INTENT_DETECTED', message: 'Big Steel Inc posted Facilities Director role.', entity: 'Big Steel Inc' },
];

const MONITOR_PLACEHOLDER: MonitorSignal[] = [
  { id: '1', time: '10:45:33', label: 'VOLATILITY_EXPOSURE', message: 'Client #4421 — 4CP exposure detected (LZ_NORTH).', type: 'risk' },
  { id: '2', time: '10:41:02', label: 'HIGH_VELOCITY_INTEREST', message: 'Billy Ragland opened proposal 4× in 10 minutes.', type: 'opportunity' },
  { id: '3', time: '10:29:11', label: 'CHURN_RISK', message: 'Champion at Big Steel Inc has departed.', type: 'risk' },
  { id: '4', time: '10:22:55', label: 'VOLATILITY_EXPOSURE', message: 'ERCOT LZ_HOUSTON > $100 — 3 accounts in zone.', type: 'risk' },
];

export function SignalMatrix() {
  const [activeTab, setActiveTab] = useState<TabId>('recon');

  return (
    <div className="nodal-glass rounded-2xl flex flex-col h-full min-h-[420px] border border-white/5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="p-4 pb-3 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <h3 className="text-[11px] font-mono text-zinc-400 uppercase tracking-[0.2em]">
            ACTIVE_TELEMETRY // LIVE_SIGNALS
          </h3>
        </div>
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
        {activeTab === 'recon' && (
          <>
            {RECON_PLACEHOLDER.map((s) => (
              <div
                key={s.id}
                className="group flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all"
              >
                <div className="w-8 h-8 rounded-[14px] bg-zinc-900/80 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Radar className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono text-zinc-500 tabular-nums uppercase tracking-wider">
                    [{s.time}] {s.label}
                  </p>
                  <p className="text-xs text-zinc-200 mt-0.5 font-mono leading-snug">{s.message}</p>
                </div>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-[9px] font-mono text-zinc-300 hover:text-white hover:border-[#002FA7]/50 transition-all uppercase tracking-widest flex-shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  INGEST_NODE
                </button>
              </div>
            ))}
          </>
        )}
        {activeTab === 'monitor' && (
          <>
            {MONITOR_PLACEHOLDER.map((s) => (
              <div
                key={s.id}
                className="group flex items-start gap-3 p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all"
              >
                <div
                  className={`w-8 h-8 rounded-[14px] border flex items-center justify-center flex-shrink-0 ${
                    s.type === 'risk'
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

      <div className="p-3 border-t border-white/5 flex justify-between items-center text-[9px] font-mono text-zinc-600 uppercase tracking-widest flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
          Stream_Active
        </span>
        <span className="text-zinc-600">Placeholder data — API wiring pending</span>
      </div>
    </div>
  );
}
