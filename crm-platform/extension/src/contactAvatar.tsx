'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, type CSSProperties } from 'react'

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

const FORENSIC_EASE = [0.23, 1, 0.32, 1] as const

const HEALTH_DOT: Record<ContactHealthScore, { bg: string; shadow: string; label: string }> = {
  active: { bg: '#10b981', shadow: '0 0 6px rgba(16,185,129,0.8)', label: 'Last touch <30d — Active' },
  warming: { bg: '#f59e0b', shadow: '0 0 6px rgba(245,158,11,0.8)', label: 'Last touch 30–90d — Warming' },
  cold: { bg: '#f43f5e', shadow: '0 0 6px rgba(244,63,94,0.8)', label: 'Last touch >90d — Cold' },
}

function initialsFor(name: string) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return initials || '?'
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

  const showPhoto = Boolean(photoUrl && !imageFailed)
  const showBadge = showListBadge || showTargetBadge
  const health = healthScore ? HEALTH_DOT[healthScore] : null

  const sizeStyle: CSSProperties = { width: size, height: size }
  const rootStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0,
  }
  const avatarStyle: CSSProperties = {
    width: size,
    height: size,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(9, 9, 11, 0.8)',
    boxShadow: '0 0 10px rgba(0,0,0,0.5)',
  }
  const initialsStyle: CSSProperties = {
    fontSize: size > 48 ? 20 : size > 32 ? 13 : 10,
    fontWeight: 700,
    letterSpacing: '-0.05em',
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    ...(textClassName ? {} : {}),
  }
  const photoStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  }
  const badgeBase: CSSProperties = {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 999,
  }

  return (
    <div style={rootStyle} className={className}>
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1 }}
        style={avatarStyle}
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
              transition={{ duration: 0.28, ease: FORENSIC_EASE }}
              style={photoStyle}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <motion.span
              key={`initials-${name}-${photoUrl || 'none'}`}
              initial={{ opacity: 0.75, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: FORENSIC_EASE }}
              style={initialsStyle}
              className={textClassName}
            >
              {initialsFor(name)}
            </motion.span>
          )}
        </AnimatePresence>

        {showPhoto && !imageLoaded && (
          <img
            src={photoUrl || ''}
            alt=""
            aria-hidden="true"
            loading="lazy"
            style={{ ...photoStyle, position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        )}
      </motion.div>

      <div style={{ position: 'absolute', top: -2, left: -2, width: 10, height: 10 }}>
        <AnimatePresence mode="wait">
          {healthLoading && !health && (
            <motion.div
              key="spinner"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                border: '1px solid rgba(82,82,91,1)',
                borderTopColor: 'rgba(161,161,170,1)',
                animation: 'np-contact-spin 0.8s linear infinite',
              }}
            />
          )}
          {health && (
            <motion.div
              key={healthScore}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.25, 1], opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: FORENSIC_EASE }}
              title={health.label}
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                border: '2px solid #09090b',
                background: health.bg,
                boxShadow: health.shadow,
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {showBadge && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
          title={showListBadge ? 'In list' : 'In Target List'}
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: 999,
            border: '2px solid #09090b',
            background: showListBadge ? '#10b981' : '#e5e7eb',
            boxShadow: showListBadge ? '0 0 6px rgba(16,185,129,0.7)' : '0 0 8px rgba(255,255,255,0.4)',
          }}
        />
      )}
    </div>
  )
}
