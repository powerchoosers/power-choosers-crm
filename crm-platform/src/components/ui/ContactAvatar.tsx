'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ContactAvatarProps {
  name: string
  size?: number
  className?: string
  textClassName?: string
  showTargetBadge?: boolean
}

export function ContactAvatar({ 
  name, 
  size = 32, 
  className, 
  textClassName,
  showTargetBadge = false
}: ContactAvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

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
      
      {/* Klein Blue Target Badge */}
      {showTargetBadge && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25, delay: 0.1 }}
          className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#002FA7] border-2 border-zinc-900 rounded-full shadow-[0_0_8px_rgba(0,47,167,0.6)]"
          title="In Target List"
        />
      )}
    </div>
  )
}
