'use client'

import { useState, useEffect, useRef, useMemo, memo } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface CompanyIconProps {
  /** Account/company logo URL. Always prioritized; only when this is blank or fails do we use fallbacks. */
  logoUrl?: string
  /** Used for favicon/logo fallbacks when logoUrl is blank or has failed. */
  domain?: string
  name: string
  size?: number
  className?: string
  /** Override border radius (e.g. rounded-[8px] for small sizes so squircle is visible) */
  roundedClassName?: string
  /** When true, plays a brief "deleting" animation for visual feedback after purge. */
  isDeleting?: boolean
}

const DEFAULT_ROUNDED = 'rounded-[14px]'

/** Whether the URL is external (use native img to avoid Next Image CORS/timeouts). */
function isExternalUrl(src: string): boolean {
  try {
    return /^https?:\/\//i.test(src) || src.startsWith('//')
  } catch {
    return true
  }
}

/** Build ordered list of candidate URLs: logoUrl first, then domain-based fallbacks. */
function buildCandidateUrls(logoUrl: string | undefined, domain: string | undefined): string[] {
  const candidates: string[] = []
  if (logoUrl && logoUrl.trim()) {
    candidates.push(logoUrl.trim())
  }
  if (domain && domain.trim()) {
    const d = domain.trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()
    if (d) {
      // Clearbit company logos (often higher quality than favicons)
      candidates.push(`https://logo.clearbit.com/${d}`)
      // Google favicons
      candidates.push(`https://www.google.com/s2/favicons?domain=${d}&sz=128`)
      // DuckDuckGo favicons (reliable fallback when Google 404s)
      candidates.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico`)
    }
  }
  return candidates
}

const LOAD_TIMEOUT_MS = 4500
const PRIMARY_LOGO_TIMEOUT_MS = 8000

function CompanyIconInner({ 
  logoUrl, 
  domain, 
  name, 
  size = 32, 
  className,
  roundedClassName = DEFAULT_ROUNDED,
  isDeleting = false
}: CompanyIconProps) {
  const effectiveLogoUrl = (typeof logoUrl === 'string' && logoUrl.trim()) ? logoUrl.trim() : undefined
  const effectiveDomain = (typeof domain === 'string' && domain.trim()) ? domain.trim() : undefined

  const candidates = useMemo(
    () => buildCandidateUrls(effectiveLogoUrl, effectiveDomain),
    [effectiveLogoUrl, effectiveDomain]
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

  const propsKey = `${effectiveLogoUrl ?? ''}|${effectiveDomain ?? ''}`

  useEffect(() => {
    if (propsKey !== propsKeyRef.current) {
      propsKeyRef.current = propsKey
      setFailedSet(new Set())
    }
  }, [propsKey])

  useEffect(() => {
    if (currentSrc === null) return

    const srcChanged = lastSrcRef.current !== currentSrc
    if (srcChanged) {
      lastSrcRef.current = currentSrc
      setIsLoaded(false)
      setRetryCount(0)
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    const isPrimaryLogo = candidates[0] === currentSrc
    const timeoutMs = isPrimaryLogo ? PRIMARY_LOGO_TIMEOUT_MS : LOAD_TIMEOUT_MS
    timeoutRef.current = setTimeout(() => {
      setFailedSet((prev) => new Set(prev).add(currentSrc))
    }, timeoutMs)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [currentSrc])

  const handleError = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (retryCount < 1) {
      setRetryCount((c) => c + 1)
      return
    }
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
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={
          isDeleting
            ? { scale: 0.88, opacity: 0.6, transition: { duration: 0.35, ease: 'easeOut' } }
            : { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } }
        }
        className={cn(
          'nodal-glass bg-zinc-900/80 flex items-center justify-center text-zinc-400 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)] shrink-0',
          roundedClassName,
          className,
          isDeleting && 'ring-2 ring-red-500/70'
        )}
        style={{ width: size, height: size }}
        title={name}
      >
        <Building2 size={size * 0.5} />
      </motion.div>
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
    <motion.div
      layout
      className={cn(
        'relative shrink-0 overflow-hidden nodal-glass bg-zinc-900/80 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)]',
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
        {isExternalUrl(currentSrc) ? (
          <img
            src={currentSrc}
            {...imgCommon}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <img src={currentSrc} {...imgCommon} loading="lazy" decoding="async" />
        )}
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
  )
}

export const CompanyIcon = memo(CompanyIconInner)
