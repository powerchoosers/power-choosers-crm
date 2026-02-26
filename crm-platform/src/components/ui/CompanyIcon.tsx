'use client'

import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { type ContactHealthScore } from '@/components/ui/ContactAvatar'

const HEALTH_DOT: Record<ContactHealthScore, { bg: string; shadow: string; label: string }> = {
  active: { bg: 'bg-emerald-500', shadow: 'shadow-[0_0_6px_rgba(16,185,129,0.8)]', label: 'Last touch <30d — Active' },
  warming: { bg: 'bg-amber-500', shadow: 'shadow-[0_0_6px_rgba(245,158,11,0.8)]', label: 'Last touch 30–90d — Warming' },
  cold: { bg: 'bg-rose-500', shadow: 'shadow-[0_0_6px_rgba(244,63,94,0.8)]', label: 'Last touch >90d — Cold' },
}

interface CompanyIconProps {
  /** Account/company logo URL. Always prioritized; only when this is blank or fails do we use fallbacks. */
  logoUrl?: string
  /** Safety fallback for snake_case metadata */
  logo_url?: string
  /** Used for favicon/logo fallbacks when logoUrl is blank or has failed. */
  domain?: string
  name: string
  size?: number
  className?: string
  /** Override border radius (e.g. rounded-[8px] for small sizes so squircle is visible) */
  roundedClassName?: string
  /** When true, plays a brief "deleting" animation for visual feedback after purge. */
  isDeleting?: boolean
  /** Raw metadata object for deep fallback resolution. */
  metadata?: any
  /**
   * Relationship health indicator — top-left corner of icon.
   * 'active' (<30d) → emerald | 'warming' (31–90d) → amber | 'cold' (>90d) → rose
   */
  healthScore?: ContactHealthScore
}

const DEFAULT_ROUNDED = 'rounded-[14px]'

/**
 * Build the candidate URL list.
 *
 * Rule: if a logo_url is explicitly stored, use ONLY that URL.
 * Domain-based fallbacks (Clearbit, favicons) are only used when no logo_url exists.
 * This ensures we always show the exact logo the user set, never a different one.
 */
function buildCandidateUrls(logoUrl: string | undefined, domain: string | undefined): string[] {
  // Explicit logo set → use it exclusively; don't mix in domain guesses
  if (logoUrl && logoUrl.trim()) {
    return [logoUrl.trim()]
  }

  // No explicit logo → derive from domain as best-effort
  if (domain && domain.trim()) {
    const d = domain.trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()
    if (d) {
      return [
        `https://logo.clearbit.com/${d}`,
        `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico`,
      ]
    }
  }

  return []
}

/** Timeout for secondary fallbacks (Clearbit, favicons) — skip quickly if they stall. */
const LOAD_TIMEOUT_MS = 5000

function CompanyIconInner({
  logoUrl,
  logo_url,
  domain,
  name,
  size = 32,
  className,
  roundedClassName = DEFAULT_ROUNDED,
  isDeleting = false,
  metadata,
  healthScore,
}: CompanyIconProps) {
  const health = healthScore ? HEALTH_DOT[healthScore] : null
  // Prioritize direct props, then fallback to metadata paths
  const m = metadata || {}
  const activeLogoUrl = useMemo(() => {
    const candidate = (typeof logoUrl === 'string' && logoUrl.trim()) ? logoUrl.trim() :
      (typeof logo_url === 'string' && logo_url.trim()) ? logo_url.trim() :
        (m.logoUrl && typeof m.logoUrl === 'string' && m.logoUrl.trim() !== '') ? m.logoUrl.trim() :
          (m.logo_url && typeof m.logo_url === 'string' && m.logo_url.trim() !== '') ? m.logo_url.trim() :
            undefined;
    return candidate;
  }, [logoUrl, logo_url, m.logoUrl, m.logo_url]);

  const effectiveDomain = useMemo(() => {
    const candidate = (typeof domain === 'string' && domain.trim()) ? domain.trim() :
      (m.domain && typeof m.domain === 'string' && m.domain.trim() !== '') ? m.domain.trim() :
        undefined;
    return candidate;
  }, [domain, m.domain]);

  const candidates = useMemo(
    () => buildCandidateUrls(activeLogoUrl, effectiveDomain),
    [activeLogoUrl, effectiveDomain]
  )

  const [failedSet, setFailedSet] = useState<Set<string>>(() => new Set())
  const [isLoaded, setIsLoaded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSrcRef = useRef<string | null>(null)
  const propsKeyRef = useRef<string>('')

  const currentSrc = useMemo(() => {
    const next = candidates.find((url) => !failedSet.has(url)) ?? null
    return next
  }, [candidates, failedSet])

  const propsKey = `${activeLogoUrl ?? ''}|${effectiveDomain ?? ''}`

  useEffect(() => {
    if (propsKey !== propsKeyRef.current) {
      const isInitial = propsKeyRef.current === ''
      propsKeyRef.current = propsKey
      if (!isInitial) {
        // Reset failure state ONLY if the source identifiers actually changed
        // This prevents flickering on minor prop updates that don't change the origin
        setFailedSet(new Set())
        setIsLoaded(false)
      }
    }
  }, [propsKey])

  useEffect(() => {
    if (currentSrc === null) return

    const srcChanged = lastSrcRef.current !== currentSrc
    if (srcChanged) {
      const isInitial = lastSrcRef.current === null
      lastSrcRef.current = currentSrc
      if (!isInitial) {
        setIsLoaded(false)
        setRetryCount(0)
      }
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // Stored logo_url: no timeout — let it load; onerror fires if it genuinely 404/403s.
    // Domain-derived fallbacks (Clearbit, favicon): 5s cutoff to skip stalled guesses quickly.
    const isStoredLogo = candidates.length === 1
    if (!isStoredLogo) {
      timeoutRef.current = setTimeout(() => {
        setFailedSet((prev) => new Set(prev).add(currentSrc))
      }, LOAD_TIMEOUT_MS)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [currentSrc, candidates])

  const handleError = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    // Definitive browser failure: immediately move to next candidate
    if (currentSrc) {
      setFailedSet((prev) => new Set(prev).add(currentSrc))
    }
  }

  const handleLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsLoaded(true)
  }

  if (!currentSrc) {
    return (
      <div className="relative inline-block shrink-0">
        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={
            isDeleting
              ? { scale: 0.88, opacity: 0.6, transition: { duration: 0.35, ease: 'easeOut' } }
              : { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } }
          }
          className={cn(
            'nodal-glass bg-zinc-900/80 flex items-center justify-center text-zinc-400 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)]',
            roundedClassName,
            className,
            isDeleting && 'ring-2 ring-red-500/70'
          )}
          style={{ width: size, height: size }}
          title={name}
        >
          <Building2 size={size * 0.5} />
        </motion.div>
        {health && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.12 }}
            className={cn(
              'absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900',
              health.bg,
              health.shadow
            )}
            title={health.label}
          />
        )}
      </div>
    )
  }

  const imgCommon = {
    alt: `${name} logo`,
    className: cn('object-cover', roundedClassName),
    onError: handleError,
    onLoad: handleLoad,
    style: { width: '100%', height: '100%', objectFit: 'cover' as const },
  }

  return (
    <div className="relative inline-block shrink-0">
      <motion.div
        layout
        className={cn(
          'relative overflow-hidden nodal-glass bg-zinc-900/80 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)]',
          roundedClassName,
          className
        )}
        style={{ width: size, height: size }}
        title={name}
        animate={
          isDeleting
            ? { scale: 0.88, opacity: 0.6, transition: { duration: 0.35, ease: 'easeOut' } }
            : { scale: 1, opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } }
        }
      >
        <AnimatePresence mode="wait">
          {!isLoaded && (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-white/5 flex items-center justify-center"
            >
              <Building2 size={size * 0.4} className="text-zinc-700" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          initial={false}
          animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 0.98 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute inset-0 w-full h-full"
        >
          <img
            src={currentSrc}
            {...imgCommon}
            loading="lazy"
            decoding="async"
          />
        </motion.div>

        <div className={cn('absolute inset-0 pointer-events-none ring-1 ring-white/20', roundedClassName)} />
        <AnimatePresence>
          {isDeleting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('absolute inset-0 pointer-events-none ring-2 ring-red-500/70', roundedClassName)}
            />
          )}
        </AnimatePresence>
      </motion.div>
      {health && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.12 }}
          className={cn(
            'absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900',
            health.bg,
            health.shadow
          )}
          title={health.label}
        />
      )}
    </div>
  )
}

export const CompanyIcon = memo(CompanyIconInner)
