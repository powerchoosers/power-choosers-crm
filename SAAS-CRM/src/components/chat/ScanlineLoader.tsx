'use client'

import { motion } from 'framer-motion'

/** Klein Blue horizontal scan line for "thinking" state inside textarea. */
export function ScanlineLoader() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
      <motion.div
        className="absolute left-0 right-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#002FA7] to-transparent"
        style={{ boxShadow: '0 0 12px rgba(0, 47, 167, 0.6)' }}
        animate={{ top: ['0%', '100%', '0%'] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <span className="absolute bottom-2 left-2 text-[10px] font-mono text-[#002FA7] uppercase tracking-widest opacity-90 animate-pulse">
        // COMPILING_GRID_DATA...
      </span>
    </div>
  )
}
