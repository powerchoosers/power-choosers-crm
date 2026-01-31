'use client'

import { useState, useEffect } from 'react'
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
}

export function CompanyIcon({ 
  logoUrl, 
  domain, 
  name, 
  size = 32, 
  className
}: CompanyIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  
  const faviconSrc = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null
  const currentSrc = (logoUrl && failedSrc !== logoUrl)
    ? logoUrl
    : (faviconSrc && failedSrc !== faviconSrc)
        ? faviconSrc
        : null

  // Reset loading state when source changes
  useEffect(() => {
    setIsLoaded(false)
  }, [currentSrc])

  const handleError = () => {
    if (currentSrc) setFailedSrc(currentSrc)
  }

  if (!currentSrc) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "rounded-[14px] nodal-glass bg-zinc-900/80 flex items-center justify-center text-zinc-400 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)] shrink-0", 
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
        "relative shrink-0 overflow-hidden nodal-glass bg-zinc-900/80 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)] rounded-[14px]",
        className
      )} 
      style={{ width: size, height: size }}
      title={name}
    >
      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/5 animate-pulse"
          />
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 0.95 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full h-full"
      >
        <Image
          src={currentSrc}
          alt={`${name} logo`}
          fill
          className="object-cover !rounded-[14px]"
          onError={handleError}
          onLoad={() => setIsLoaded(true)}
          unoptimized={currentSrc.includes('google.com')} // Don't re-optimize favicon service images
        />
      </motion.div>

      <div className="absolute inset-0 pointer-events-none rounded-[14px] ring-1 ring-white/20" />
    </div>
  )
}
