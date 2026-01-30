'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ContactAvatarProps {
  name: string
  logoUrl?: string
  size?: number
  className?: string
  textClassName?: string
}

export function ContactAvatar({ name, logoUrl, size = 32, className, textClassName }: ContactAvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-2xl nodal-glass flex items-center justify-center border border-white/10 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.6)] overflow-hidden shrink-0 bg-zinc-900",
        className
      )}
      style={{ width: size, height: size }}
    >
      {logoUrl ? (
        <img 
          src={logoUrl} 
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=002FA7&color=fff`
          }}
        />
      ) : (
        <span className={cn(
          "font-semibold text-white/90 tracking-tighter",
          size > 48 ? "text-xl" : size > 32 ? "text-sm" : "text-[10px]",
          textClassName
        )}>
          {initials}
        </span>
      )}
    </motion.div>
  )
}
