'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STATUS_MESSAGES = [
  '> ESTABLISHING_SECURE_UPLINK...',
  '> PARSING_GRID_TELEMETRY...',
  '> VERIFYING_SOURCE_INTEGRITY...',
  '> [ SIGNAL_LOCKED ]',
]
const CYCLE_MS = 800

export function NeuralLoader() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setMessageIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, CYCLE_MS)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex flex-col justify-center items-center w-full h-12 gap-3 py-2">
      <div className="w-full flex justify-center overflow-hidden px-4">
        <motion.div
          className="h-0.5 bg-[#002FA7] rounded-full min-w-[2px] origin-center"
          initial={{ width: '0%', scaleY: 1 }}
          animate={{
            width: '100%',
            scaleY: [1, 1.3, 1, 1.2, 1],
          }}
          transition={{
            width: { duration: 1, repeat: Infinity, repeatDelay: 0.4 },
            scaleY: { duration: 0.8, repeat: Infinity, repeatDelay: 0.1 },
          }}
          style={{ boxShadow: '0 0 12px rgba(0, 47, 167, 0.6)' }}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={messageIndex}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.2 }}
          className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest opacity-90"
        >
          {STATUS_MESSAGES[messageIndex]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
