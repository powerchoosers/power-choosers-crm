'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type FieldSyncSeverity = 'identity' | 'secondary'

interface FieldSyncIndicatorProps {
  active: boolean
  isSaving: boolean
  severity?: FieldSyncSeverity
}

export function FieldSyncIndicator({
  active,
  isSaving,
  severity = 'identity'
}: FieldSyncIndicatorProps) {
  const base = 'flex-none rounded-full transition-all duration-200'
  const sizeClass = severity === 'identity' ? 'w-2.5 h-2.5' : 'w-2 h-2'
  const identityClasses = isSaving
    ? 'bg-[#002FA7] animate-pulse shadow-[0_0_12px_rgba(0,47,167,0.8)]'
    : 'bg-[#002FA7] shadow-[0_0_10px_rgba(0,47,167,0.6)] ring-1 ring-[#002FA7]/40'
  const secondaryClasses = isSaving
    ? 'bg-white/80 animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]'
    : 'bg-white/30 shadow-[0_0_6px_rgba(255,255,255,0.5)] ring-1 ring-white/20'

  const stateClass = severity === 'identity' ? identityClasses : secondaryClasses

  return (
    <AnimatePresence>
      {active && (
        <motion.span
          aria-hidden
          className={cn(base, sizeClass, stateClass)}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </AnimatePresence>
  )
}
