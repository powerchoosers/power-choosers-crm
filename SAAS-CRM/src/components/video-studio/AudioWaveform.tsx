'use client'

import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

type AudioWaveformProps = {
  sourceUrl?: string | null
}

export function AudioWaveform({ sourceUrl }: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const waveRef = useRef<WaveSurfer | null>(null)

  useEffect(() => {
    if (!containerRef.current || !sourceUrl) return

    const wave = WaveSurfer.create({
      container: containerRef.current,
      url: sourceUrl,
      height: 72,
      waveColor: 'rgba(244,244,245,0.22)',
      progressColor: '#002FA7',
      cursorColor: '#f4f4f5',
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
    })

    waveRef.current = wave
    return () => {
      wave.destroy()
      waveRef.current = null
    }
  }, [sourceUrl])

  if (!sourceUrl) {
    return null
  }

  return <div ref={containerRef} className="rounded-2xl border border-white/10 bg-black/30 p-3" />
}
