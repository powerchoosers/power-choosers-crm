'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ContactAvatarProps {
  name: string
  size?: number
  className?: string
  textClassName?: string
  /** @deprecated Use showListBadge for "in a list" indicator (green dot) */
  showTargetBadge?: boolean
  /** Green dot at top-right when contact belongs to a list (notification-style badge) */
  showListBadge?: boolean
}

export function ContactAvatar({ 
  name, 
  size = 32, 
  className, 
  textClassName,
  showTargetBadge = false,
  showListBadge = false
}: ContactAvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const showBadge = showListBadge || showTargetBadge

  return (
    <div className="relative inline-block">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "rounded-[14px]",
          "nodal-glass flex items-center justify-center border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)] overflow-hidden shrink-0 bg-zinc-900/80",
          className
        )}
        style={{ width: size, height: size }}
      >
        <span className={cn(
          "font-semibold text-white/90 tracking-tighter",
          size > 48 ? "text-xl" : size > 32 ? "text-sm" : "text-[10px]",
          textClassName
        )}>
          {initials}
        </span>
      </motion.div>
      
      {/* Green dot: contact belongs to a list (top-right, notification-style) */}
      {showBadge && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25, delay: 0.1 }}
          className={cn(
            "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 shrink-0",
            showListBadge
              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"
              : "bg-[#002FA7] shadow-[0_0_8px_rgba(0,47,167,0.6)]"
          )}
          title={showListBadge ? "In list" : "In Target List"}
        />
      )}
    </div>
  )
}
