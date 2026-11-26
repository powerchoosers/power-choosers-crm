'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Soft blur-and-rise as a block scrolls into view, once.
 *
 * Use it for a section's main block, or for a few siblings with a small `delay` step
 * (0.06-0.08s). Do not wrap every paragraph. Do not use it above the fold: content starts
 * hidden until JavaScript runs. For hero text use the CSS `np-enter` class instead.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  )
}
