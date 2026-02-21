'use client';

import React from 'react';
import { Terminal, Activity } from 'lucide-react';
import { useForensicLog } from '@/hooks/useForensicLog';
import { motion, AnimatePresence } from 'framer-motion';

export function ForensicLogStream() {
  const { logEntries } = useForensicLog();

  return (
    <div className="nodal-void-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
            FORENSIC_LOG_STREAM
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[#002FA7] animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-[#002FA7]" />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
            Stream_Active
          </span>
        </div>
      </div>
      <div className="h-64 overflow-y-auto np-scroll p-4 space-y-1 bg-black/40 font-mono text-[11px] relative">
        <AnimatePresence initial={false}>
          {logEntries.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-zinc-600 italic py-2"
            >
              Listening for network signals...
            </motion.div>
          ) : (
            logEntries.map((entry) => (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex gap-3 items-baseline py-1.5 border-b border-white/5 last:border-0 text-emerald-400/90 hover:text-emerald-300 transition-colors"
                title={entry.detail}
              >
                <span className="text-zinc-500 tabular-nums shrink-0">[{entry.time}]</span>
                <span className="text-amber-400/90 shrink-0">{entry.action}</span>
                <span className="text-zinc-400 truncate">{entry.detail}</span>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
