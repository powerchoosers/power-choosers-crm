'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'

const GLYPHS = 'X7#@9'
const LOCK_MS = 110
const GLYPH_TICK_MS = 35

interface DecryptionTextProps {
  text: string
  className?: string
  /** Max characters to animate; rest renders immediately. Omit for full decrypt. */
  maxDecryptChars?: number
}

export function DecryptionText({ text, className, maxDecryptChars }: DecryptionTextProps) {
  const chars = useMemo(() => Array.from(text), [text])
  const [lockedCount, setLockedCount] = useState(0)
  const [glyphFrame, setGlyphFrame] = useState(0)
  const limit = maxDecryptChars ?? chars.length

  useEffect(() => {
    if (lockedCount >= limit) return
    const t = setInterval(() => setLockedCount((c) => Math.min(c + 1, limit)), LOCK_MS)
    return () => clearInterval(t)
  }, [limit, lockedCount])

  useEffect(() => {
    if (lockedCount >= limit) return
    const t = setInterval(() => setGlyphFrame((f) => f + 1), GLYPH_TICK_MS)
    return () => clearInterval(t)
  }, [limit, lockedCount])

  return (
    <span className={cn('font-mono text-sm text-zinc-300', className)}>
      {chars.map((char, i) => {
        const isLocked = i < lockedCount
        const glyph = GLYPHS[(glyphFrame + i) % GLYPHS.length]
        return (
          <span key={`${i}-${char}`} className="inline-block tabular-nums">
            {isLocked ? char : glyph}
          </span>
        )
      })}
    </span>
  )
}
