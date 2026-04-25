'use client'

import { useState } from 'react'

export type SupplierLogo = {
  src: string
  alt: string
  tall?: boolean
  darker?: boolean
}

export const SUPPLIER_LOGOS: SupplierLogo[] = [
  { src: '/images/suppiers/constellation.png', alt: 'Constellation', tall: true, darker: true },
  { src: '/images/suppiers/txu.png', alt: 'TXU Energy', tall: false, darker: false },
  { src: '/images/suppiers/nrg.png', alt: 'NRG', tall: false, darker: false },
  { src: '/images/suppiers/engie.png', alt: 'ENGIE', tall: false, darker: true },
  { src: '/images/suppiers/chariot.png', alt: 'Chariot Energy', tall: true, darker: false },
  { src: '/images/suppiers/shell.png', alt: 'Shell Energy', tall: false, darker: false },
  { src: '/images/suppiers/freepoint (1).png', alt: 'Freepoint Energy', tall: true, darker: false },
  { src: '/images/suppiers/gridmatic.png', alt: 'Gridmatic', tall: true, darker: false },
  { src: '/images/suppiers/ammper.png', alt: 'Ammper Power', tall: false, darker: true },
  { src: '/images/suppiers/apg&e.png', alt: 'APG&E', tall: false, darker: false },
]

interface SupplierTickerProps {
  label: string
  logos: SupplierLogo[]
  className?: string
}

export function SupplierTicker({ label, logos, className = '' }: SupplierTickerProps) {
  const loopedLogos = [...logos, ...logos]
  const [isPaused, setIsPaused] = useState(false)

  return (
    <section
      className={`relative overflow-hidden border-y border-zinc-100 bg-white py-7 ${className}`}
      onPointerEnter={() => setIsPaused(true)}
      onPointerLeave={() => setIsPaused(false)}
    >
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-24 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-24 bg-gradient-to-l from-white to-transparent" />

      <p className="mb-5 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-400">
        {label}
      </p>

      <div
        className="flex w-max gap-0 will-change-transform"
        style={{ animation: 'ticker-scroll 40s linear infinite', animationPlayState: isPaused ? 'paused' : 'running' }}
      >
        {loopedLogos.map((logo, index) => (
          <div key={`${logo.alt}-${index}`} className="flex shrink-0 items-center px-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo.src}
              alt={logo.alt}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className={`${logo.tall ? 'h-20' : 'h-14'} w-auto object-contain grayscale transition-all duration-300 ${
                logo.darker ? 'brightness-50' : 'brightness-75'
              } opacity-90 hover:grayscale-0 hover:brightness-100 hover:opacity-100`}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
