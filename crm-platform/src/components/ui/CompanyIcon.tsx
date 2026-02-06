'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface CompanyIconProps {
  /** Account/company logo URL. Always prioritized; only when this is blank or fails do we use domain favicon. */
  logoUrl?: string
  /** Used only for favicon fallback when logoUrl is blank or has failed. */
  domain?: string
  name: string
  size?: number
  className?: string
  /** Override border radius (e.g. rounded-[8px] for small sizes so squircle is visible) */
  roundedClassName?: string
}

const DEFAULT_ROUNDED = 'rounded-[14px]'

/** Whether the URL is external (needs native img to avoid Next Image CORS/timeouts). */
function isExternalUrl(src: string): boolean {
  try {
    return /^https?:\/\//i.test(src) || src.startsWith('//')
  } catch {
    return true
  }
}

export function CompanyIcon({ 
  logoUrl, 
  domain, 
  name, 
  size = 32, 
  className,
  roundedClassName = DEFAULT_ROUNDED
}: CompanyIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Only use logoUrl when it's a non-empty string; otherwise treat as "no logo" and allow domain fallback
  const effectiveLogoUrl = (typeof logoUrl === 'string' && logoUrl.trim()) ? logoUrl.trim() : undefined
  const faviconSrc = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null
  const currentSrc = (effectiveLogoUrl && failedSrc !== effectiveLogoUrl)
    ? effectiveLogoUrl
    : (faviconSrc && failedSrc !== faviconSrc)
        ? faviconSrc
        : null

  // Reset loading state when source changes; timeout only marks this URL failed so next source (e.g. favicon) is tried
  useEffect(() => {
    setIsLoaded(false)
    setRetryCount(0)
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    if (currentSrc) {
      timeoutRef.current = setTimeout(() => {
        setFailedSrc(currentSrc)
      }, 8000)
    }
    
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
    if (currentSrc) setFailedSrc(currentSrc)
  }
  
  const handleLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsLoaded(true)
  }

  // Show fallback only when there is no source left to try
  if (!currentSrc) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "nodal-glass bg-zinc-900/80 flex items-center justify-center text-zinc-400 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)] shrink-0", 
          roundedClassName,
          className
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
    className: cn("object-cover", roundedClassName),
    onError: handleError,
    onLoad: handleLoad,
    style: { width: '100%', height: '100%', objectFit: 'cover' as const },
  }

  return (
    <div 
      className={cn(
        "relative shrink-0 overflow-hidden nodal-glass bg-zinc-900/80 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)]",
        roundedClassName,
        className
      )} 
      style={{ width: size, height: size }}
      title={name}
    >
      <AnimatePresence mode="wait">
        {!isLoaded && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center"
          >
            <Building2 size={size * 0.4} className="text-zinc-700" />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
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
          <img
            src={currentSrc}
            {...imgCommon}
            loading="lazy"
            decoding="async"
          />
        )}
      </motion.div>

      <div className={cn("absolute inset-0 pointer-events-none ring-1 ring-white/20", roundedClassName)} />
    </div>
  )
}
