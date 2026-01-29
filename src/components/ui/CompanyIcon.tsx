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

export function CompanyIcon({ logoUrl, domain, name, size = 32, className }: CompanyIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  
  const faviconSrc = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}` : null
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
          "rounded-md bg-zinc-800 flex items-center justify-center text-zinc-400 border border-white/5 shrink-0", 
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
      className={cn("relative shrink-0", className)} 
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
            className="absolute inset-0 bg-white/5 animate-pulse rounded-md"
          />
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 0.95 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Image
          src={currentSrc}
          alt={`${name} logo`}
          fill
          className="object-cover rounded-md"
          onError={handleError}
          onLoad={() => setIsLoaded(true)}
        />
      </motion.div>
    </div>
  )
}
