'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

interface CompanyIconProps {
  logoUrl?: string
  domain?: string
  name: string
  size?: number
  className?: string
  /** Override border radius (e.g. rounded-[8px] for small sizes so squircle is visible) */
  roundedClassName?: string
}

const DEFAULT_ROUNDED = 'rounded-[14px]'

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
  const [loadTimeout, setLoadTimeout] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const faviconSrc = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null
  const currentSrc = (logoUrl && failedSrc !== logoUrl)
    ? logoUrl
    : (faviconSrc && failedSrc !== faviconSrc)
        ? faviconSrc
        : null

  // Reset loading state when source changes and set timeout
  useEffect(() => {
    setIsLoaded(false)
    setLoadTimeout(false)
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // If we have a source, set a timeout to fallback if loading takes too long
    if (currentSrc) {
      timeoutRef.current = setTimeout(() => {
        console.warn(`Image load timeout for ${currentSrc}`)
        setLoadTimeout(true)
        setFailedSrc(currentSrc)
      }, 5000) // 5 second timeout
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
    }
    if (currentSrc) setFailedSrc(currentSrc)
  }
  
  const handleLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsLoaded(true)
    setLoadTimeout(false)
  }

  // Show fallback icon if no source available, or if load timed out
  if (!currentSrc || loadTimeout) {
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
        className="w-full h-full"
      >
        <Image
          src={currentSrc}
          alt={`${name} logo`}
          fill
          className={cn("object-cover", roundedClassName)}
          onError={handleError}
          onLoad={handleLoad}
          unoptimized={currentSrc.includes('google.com')} // Don't re-optimize favicon service images
        />
      </motion.div>

      <div className={cn("absolute inset-0 pointer-events-none ring-1 ring-white/20", roundedClassName)} />
    </div>
  )
}
