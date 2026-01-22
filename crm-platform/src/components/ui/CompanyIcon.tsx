'use client'

import { useState, useEffect } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CompanyIconProps {
  logoUrl?: string
  domain?: string
  name: string
  size?: number
  className?: string
}

export function CompanyIcon({ logoUrl, domain, name, size = 32, className }: CompanyIconProps) {
  const [error, setError] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)

  useEffect(() => {
    // Reset state when props change
    setError(false)
    
    if (logoUrl) {
      setImageSrc(logoUrl)
    } else if (domain) {
      // Use Google Favicon service as a reliable fallback
      // sz=64 gives a higher quality icon (retina ready for 32px display)
      setImageSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`)
    } else {
      setImageSrc(null)
    }
  }, [logoUrl, domain, size])

  const handleError = () => {
    if (imageSrc === logoUrl && domain) {
      // If logoUrl failed, try domain favicon
      setImageSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`)
    } else {
      // If domain favicon also failed (or wasn't an option), show error state
      setError(true)
    }
  }

  if (!imageSrc || error) {
    return (
      <div 
        className={cn(
          "rounded-md bg-zinc-800 flex items-center justify-center text-zinc-400 border border-white/5 shrink-0", 
          className
        )}
        style={{ width: size, height: size }}
        title={name}
      >
        <Building2 size={size * 0.5} />
      </div>
    )
  }

  return (
    <div 
      className={cn("relative shrink-0", className)} 
      style={{ width: size, height: size }}
      title={name}
    >
      <img
        src={imageSrc}
        alt={`${name} logo`}
        className="w-full h-full object-cover rounded-md"
        onError={handleError}
        loading="lazy"
      />
    </div>
  )
}
