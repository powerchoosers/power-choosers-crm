'use client'

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface DestructModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
}

const HOLD_DURATION_MS = 1500;
const TICK_MS = 16; // ~60fps for smooth progress

export default function DestructModal({ isOpen, onClose, onConfirm, count }: DestructModalProps) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const onConfirmRef = useRef(onConfirm);

  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      setIsHolding(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isHolding) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setProgress(0);
      return;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        onConfirmRef.current();
        setIsHolding(false);
        setProgress(0);
      }
    }, TICK_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isHolding]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="destruct-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div
            key="destruct-modal-content"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md bg-zinc-950 border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden"
          >
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 tracking-tight uppercase font-mono">
                Purge_Protocol
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <p className="text-zinc-400 text-sm leading-relaxed">
                You are about to purge <span className="text-white font-mono font-bold underline underline-offset-4 decoration-red-500/50">{count} {count === 1 ? 'Entity' : 'Entities'}</span> from the Grid. This action is <span className="text-red-500 font-bold italic uppercase">irreversible</span>.
              </p>
              <p className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
                System_Status: Awaiting_Final_Authorization
              </p>
            </div>

            {/* Action Area */}
            <div className="space-y-4">
              <div className="relative">
                <button
                  onMouseDown={() => setIsHolding(true)}
                  onMouseUp={() => setIsHolding(false)}
                  onMouseLeave={() => setIsHolding(false)}
                  onTouchStart={() => setIsHolding(true)}
                  onTouchEnd={() => setIsHolding(false)}
                  onTouchCancel={() => setIsHolding(false)}
                  className="w-full relative h-14 bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden group transition-all active:scale-[0.98] select-none"
                >
                  {/* Progress fill: left-to-right, pointer-events-none so button still receives events */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-red-500/30 pointer-events-none transition-[width] duration-75 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                  {/* Button content */}
                  <div className="absolute inset-0 flex items-center justify-center gap-3 pointer-events-none">
                    <span className="text-red-500 font-mono text-xs font-bold tracking-widest uppercase">
                      {progress > 0 ? `Authorizing... ${Math.round(progress)}%` : 'Hold to Execute'}
                    </span>
                  </div>
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 text-zinc-500 hover:text-white text-xs font-mono uppercase tracking-widest transition-colors"
              >
                Abort_Mission
              </button>
            </div>
          </div>

          {/* Footer Decoration */}
          <div className="h-1 bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
