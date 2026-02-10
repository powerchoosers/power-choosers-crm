'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ForensicDataPointProps {
  /** Text to display */
  value: string
  /** Raw text to copy (defaults to value) */
  copyValue?: string
  /** Optional small label above (e.g. "MOBILE") */
  label?: string
  className?: string
  /** Optional wrapper element class (e.g. for inline vs block) */
  valueClassName?: string
  /** If true, render as inline (span); otherwise div. Default false. */
  inline?: boolean
  /** Children to render instead of value (e.g. Link); copyValue still used for clipboard */
  children?: React.ReactNode
}

const COPIED_DURATION_MS = 2000

/**
 * Stealth copy: hover reveals a copy icon; click copies without triggering parent (e.g. Call button).
 * Use when dossier is in active (non-editing) mode so all editable fields are copyable.
 */
export function ForensicDataPoint({
  value,
  copyValue,
  label,
  className,
  valueClassName,
  inline = false,
  children
}: ForensicDataPointProps) {
  const [copied, setCopied] = useState(false)
  const toCopy = copyValue !== undefined && copyValue !== '' ? copyValue : value
  const isEmpty = !toCopy.trim()

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (isEmpty) return
      navigator.clipboard.writeText(toCopy).then(
        () => {
          setCopied(true)
          setTimeout(() => setCopied(false), COPIED_DURATION_MS)
        },
        () => {}
      )
    },
    [toCopy, isEmpty]
  )

  const Wrapper = inline ? 'span' : 'div'
  return (
    <Wrapper
      className={cn('group/dp relative flex items-center gap-2 w-full min-w-0', inline && 'inline-flex', className)}
    >
      {label && (
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest shrink-0">{label}</span>
      )}
      <span className={cn('min-w-0 truncate', valueClassName)}>
        {children !== undefined ? children : value || '—'}
      </span>
      {!isEmpty && (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'shrink-0 p-0.5 rounded transition-opacity duration-200 text-zinc-500 hover:text-white',
            'opacity-0 group-hover/dp:opacity-100 focus:opacity-100 focus:outline-none'
          )}
          title="Copy"
          aria-label="Copy"
        >
          {copied ? (
            <Check size={14} className="text-emerald-500" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      )}
    </Wrapper>
  )
}
