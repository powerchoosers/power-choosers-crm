'use client'

import { motion, AnimatePresence } from 'framer-motion';
import { Radar, GitMerge, Sparkles, Trash2, X, PhoneCall } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface BulkActionDeckProps {
  selectedCount: number;
  totalAvailable: number;
  selectionLabel?: string;
  onClear: () => void;
  onAction: (action: string) => void;
  onSelectCount?: (count: number) => void;
  onPowerDial?: () => void;
}

export default function BulkActionDeck({
  selectedCount,
  totalAvailable,
  selectionLabel = 'NODE',
  onClear,
  onAction,
  onSelectCount,
  onPowerDial,
}: BulkActionDeckProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(selectedCount.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setInputValue(selectedCount.toString());
  }, [selectedCount]);

  const handleInputSubmit = () => {
    const newCount = parseInt(inputValue);
    if (!isNaN(newCount) && newCount > 0 && onSelectCount) {
      onSelectCount(Math.min(newCount, totalAvailable));
    }
    setIsEditing(false);
  };

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div 
          key="bulk-action-deck"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50"
        >
        <div className="nodal-void-card nodal-monolith-edge p-2 pr-6 flex items-center gap-6 whitespace-nowrap">
          
          {/* 1. THE COUNTER & CLEAR */}
          <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2 border border-white/5">
            <div className="flex items-center gap-2">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={handleInputSubmit}
                  onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
                  className="w-12 bg-white/10 border border-[#002FA7]/50 rounded px-1 font-mono text-xs text-white outline-none text-center"
                />
              ) : (
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsEditing(true)}
                  className="font-mono text-xs text-white font-bold tabular-nums hover:text-white transition-colors"
                >
                  {selectedCount.toString().padStart(2, '0')}
                </motion.button>
              )}
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                {selectedCount === 1 ? selectionLabel : `${selectionLabel}S`} SELECTED
              </span>
            </div>
            <button 
              onClick={onClear} 
              className="ml-2 text-zinc-600 hover:text-white transition-colors border-l border-white/10 pl-3"
              aria-label="Clear Selection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* 2. THE TACTICAL ACTIONS */}
          <div className="flex items-center gap-2">
            {onPowerDial && (
              <button
                type="button"
                onClick={onPowerDial}
                className="group inline-flex items-center gap-2 rounded-xl border border-[#002FA7]/25 bg-[#002FA7]/12 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-white transition-all hover:bg-[#002FA7]/20"
              >
                <PhoneCall className="w-4 h-4 text-zinc-100" />
                POWER_DIAL
              </button>
            )}
            <ActionButton icon={<Radar className="w-4 h-4" />} label="ADD_TO_TARGET" onClick={() => onAction('list')} />
            <ActionButton icon={<GitMerge className="w-4 h-4" />} label="INITIATE_PROTOCOL" onClick={() => onAction('sequence')} />
            <ActionButton icon={<Sparkles className="w-4 h-4" />} label="ENRICH_DATA" onClick={() => onAction('enrich')} />
          </div>

          {/* 3. THE NUCLEAR OPTION */}
          <div className="w-px h-8 bg-white/10" />
          
          <button 
            onClick={() => onAction('delete')}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-300 transition-all hover:bg-red-500/10 hover:text-red-100 hover:border-red-500/25"
          >
            <Trash2 className="w-4 h-4 text-zinc-400 transition-colors group-hover:text-red-300" />
            PURGE_PROTOCOL
          </button>

        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-300 transition-all hover:bg-white/[0.06] hover:text-white"
    >
      <span className="flex h-4 w-4 items-center justify-center text-zinc-400">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
