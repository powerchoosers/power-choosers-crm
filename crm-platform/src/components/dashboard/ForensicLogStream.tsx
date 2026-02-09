'use client';

import React from 'react';
import { Terminal } from 'lucide-react';

// Placeholder — wire to ai_insights / forensic_log / tasks later
const LOG_ENTRIES = [
  { id: '1', time: '10:42', action: 'ANALYSIS_COMPLETE', detail: '12th Man Tech Bill Audit -> Variance Found ($402).' },
  { id: '2', time: '10:45', action: 'SIGNAL_DETECTED', detail: 'Camp Fire Texas -> New CFO Hired.' },
  { id: '3', time: '10:38', action: 'PROTOCOL_TRIGGERED', detail: '4CP curtailment window opened for LZ_NORTH.' },
  { id: '4', time: '10:31', action: 'ANALYSIS_COMPLETE', detail: 'Nexus Logistics contract review -> Renewal opportunity.' },
  { id: '5', time: '10:22', action: 'SIGNAL_DETECTED', detail: 'Acme Corp -> Energy Manager role posted.' },
  { id: '6', time: '10:18', action: 'TASK_COMPLETE', detail: 'Follow-up email sent to Downtown Office Complex.' },
  { id: '7', time: '10:12', action: 'VOLATILITY_ALERT', detail: 'LZ_HOUSTON > $100 — 3 accounts in zone.' },
  { id: '8', time: '10:05', action: 'ANALYSIS_COMPLETE', detail: 'Big Steel Inc Bill Audit -> No variance.' },
];

export function ForensicLogStream() {
  return (
    <div className="nodal-void-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
            FORENSIC_LOG_STREAM
          </span>
        </div>
        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
          Placeholder — API pending
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto np-scroll p-4 space-y-1 bg-black/40 font-mono text-[11px]">
        {LOG_ENTRIES.map((entry) => (
          <div
            key={entry.id}
            className="flex gap-3 items-baseline py-1.5 border-b border-white/5 last:border-0 text-emerald-400/90 hover:text-emerald-300 transition-colors"
          >
            <span className="text-zinc-500 tabular-nums shrink-0">[{entry.time}]</span>
            <span className="text-amber-400/90 shrink-0">{entry.action}</span>
            <span className="text-zinc-400 truncate">{entry.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
