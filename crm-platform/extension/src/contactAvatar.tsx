'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '../../src/lib/utils'

export type ContactHealthScore = 'active' | 'warming' | 'cold'

interface ContactAvatarProps {
  name: string
  photoUrl?: string | null
  size?: number
  className?: string
  textClassName?: string
  showTargetBadge?: boolean
  showListBadge?: boolean
  healthScore?: ContactHealthScore
  healthLoading?: boolean
}

const HEALTH_DOT: Record<ContactHealthScore, { bg: string; shadow: string; label: string }> = {
  active: { bg: 'bg-emerald-500', shadow: 'shadow-[0_0_6px_rgba(16,185,129,0.8)]', label: 'Last touch <30d — Active' },
  warming: { bg: 'bg-amber-500', shadow: 'shadow-[0_0_6px_rgba(245,158,11,0.8)]', label: 'Last touch 30–90d — Warming' },
  cold: { bg: 'bg-rose-500', shadow: 'shadow-[0_0_6px_rgba(244,63,94,0.8)]', label: 'Last touch >90d — Cold' },
}

export function ContactAvatar({
  name,
  photoUrl,
  size = 32,
  className,
  textClassName,
  showTargetBadge = false,
  showListBadge = false,
  healthScore,
  healthLoading = false,
}: ContactAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    setImageFailed(false)
    setImageLoaded(false)
  }, [photoUrl])

  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const resolvedInitials = initials || '?'
  const showPhoto = Boolean(photoUrl && !imageFailed)

  const showBadge = showListBadge || showTargetBadge
  const health = healthScore ? HEALTH_DOT[healthScore] : null

  return (
    <div className="relative inline-block">
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'rounded-[14px]',
          'relative nodal-glass flex items-center justify-center border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)] overflow-hidden shrink-0 bg-zinc-900/80',
          className
        )}
        style={{ width: size, height: size }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {showPhoto && imageLoaded ? (
            <motion.img
              key={`photo-${photoUrl}`}
              src={photoUrl || ''}
              alt={name}
              loading="lazy"
              initial={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="w-full h-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <motion.span
              key={`initials-${name}-${photoUrl || 'none'}`}
              initial={{ opacity: 0.75, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className={cn(
                'font-semibold text-white/90 tracking-tighter',
                size > 48 ? 'text-xl' : size > 32 ? 'text-sm' : 'text-[10px]',
                textClassName
              )}
            >
              {resolvedInitials}
            </motion.span>
          )}
        </AnimatePresence>

        {showPhoto && !imageLoaded && (
          <img
            src={photoUrl || ''}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        )}
      </motion.div>

      <div className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5">
        <AnimatePresence mode="wait">
          {healthLoading && !health && (
            <motion.div
              key="spinner"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.15 }}
              className="w-2.5 h-2.5 rounded-full border border-zinc-600 border-t-zinc-400 animate-spin"
              style={{ animationDuration: '0.8s' }}
            />
          )}
          {health && (
            <motion.div
              key={healthScore}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.25, 1], opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              className={cn(
                'w-2.5 h-2.5 rounded-full border-2 border-zinc-900 shrink-0',
                health.bg,
                health.shadow
              )}
              title={health.label}
            />
          )}
        </AnimatePresence>
      </div>

      {showBadge && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
          className={cn(
            'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 shrink-0',
            showListBadge
              ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
              : 'bg-zinc-100 shadow-[0_0_8px_rgba(255,255,255,0.4)]'
          )}
          title={showListBadge ? 'In list' : 'In Target List'}
        />
      )}
    </div>
  )
}
