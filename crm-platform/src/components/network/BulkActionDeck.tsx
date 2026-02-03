'use client'

import { motion, AnimatePresence } from 'framer-motion';
import { Radar, GitMerge, Sparkles, Trash2, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface BulkActionDeckProps {
  selectedCount: number;
  totalAvailable: number;
  onClear: () => void;
  onAction: (action: string) => void;
  onSelectCount?: (count: number) => void;
}

export default function BulkActionDeck({ selectedCount, totalAvailable, onClear, onAction, onSelectCount }: BulkActionDeckProps) {
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
        <div className="bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_0_50px_-10px_rgba(0,0,0,0.7)] p-2 pr-6 flex items-center gap-6 whitespace-nowrap">
          
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
                {selectedCount === 1 ? 'NODE' : 'NODES'} SELECTED
              </span>
            </div>
            <button 
              onClick={onClear} 
              className="ml-2 text-zinc-600 hover:text-white transition-colors border-l border-white/10 pl-3"
              title="Clear Selection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* 2. THE TACTICAL ACTIONS */}
          <div className="flex items-center gap-2">
            <ActionButton icon={<Radar className="w-4 h-4" />} label="ADD_TO_TARGET" onClick={() => onAction('list')} />
            <ActionButton icon={<GitMerge className="w-4 h-4" />} label="INITIATE_PROTOCOL" onClick={() => onAction('sequence')} />
            <ActionButton icon={<Sparkles className="w-4 h-4" />} label="ENRICH_DATA" onClick={() => onAction('enrich')} />
          </div>

          {/* 3. THE NUCLEAR OPTION */}
          <div className="w-px h-8 bg-white/10" />
          
          <button 
            onClick={() => onAction('delete')}
            className="group p-2 icon-button-forensic relative"
          >
            <Trash2 className="w-5 h-5 group-hover:text-red-500 transition-colors" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              PURGE_PROTOCOL
            </span>
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
      onClick={onClick}
      className="group relative p-2.5 icon-button-forensic flex items-center justify-center"
    >
      <div className="w-5 h-5 flex items-center justify-center">
        {icon}
      </div>
      {/* Tooltip */}
      <span className="absolute -top-10 left-1/2 -translate-x-1/2 w-max bg-black border border-white/10 px-2 py-1 text-[9px] font-mono text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {label}
      </span>
    </button>
  );
}
