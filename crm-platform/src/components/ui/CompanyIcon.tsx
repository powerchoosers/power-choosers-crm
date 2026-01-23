'use client'

import { useState } from 'react'
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
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const faviconSrc = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}` : null
  const currentSrc = (logoUrl && failedSrc !== logoUrl)
    ? logoUrl
    : (faviconSrc && failedSrc !== faviconSrc)
        ? faviconSrc
        : null

  const handleError = () => {
    if (currentSrc) setFailedSrc(currentSrc)
  }

  if (!currentSrc) {
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
        src={currentSrc}
        alt={`${name} logo`}
        className="w-full h-full object-cover rounded-md"
        onError={handleError}
        loading="lazy"
      />
    </div>
  )
}
