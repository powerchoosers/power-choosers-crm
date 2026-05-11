'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const STAGGER_MS = 28
const FADE_DURATION = 0.12
const MAX_WORDS_STAGGER = 18

interface DecryptionTextProps {
  text: string
  className?: string
  /** Max words to reveal with stagger; rest appear at once. Default 18. */
  maxRevealWords?: number
}

/**
 * Modern computer-inspired text reveal: words fade in with a short stagger.
 * Fast, readable, no slow glyph cycle.
 */
export function DecryptionText({ text, className, maxRevealWords = MAX_WORDS_STAGGER }: DecryptionTextProps) {
  const tokens = useMemo(() => {
    const parts: string[] = []
    const re = /\s+/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
      parts.push(m[0])
      lastIndex = m.index + m[0].length
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts
  }, [text])

  const wordIndexByToken = useMemo(() => {
    const out: number[] = []
    let wi = 0
    for (const t of tokens) {
      out.push(/\S/.test(t) ? wi++ : -1)
    }
    return out
  }, [tokens])

  return (
    <span className={cn('font-sans text-sm text-zinc-300', className)}>
      {tokens.map((token, i) => {
        const wordIndex = wordIndexByToken[i]
        const isWord = wordIndex >= 0
        const shouldStagger = isWord && wordIndex < maxRevealWords
        const delay = shouldStagger ? (wordIndex * STAGGER_MS) / 1000 : 0

        if (shouldStagger) {
          return (
            <motion.span
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: FADE_DURATION, delay }}
              className="inline"
            >
              {token}
            </motion.span>
          )
        }
        return <span key={i}>{token}</span>
      })}
    </span>
  )
}
