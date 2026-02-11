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
  /**
   * Compact mode for header names: no gap; copy icon slot expands on hover so
   * siblings (e.g. website/LinkedIn buttons) slide right to make room.
   */
  compact?: boolean
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
  children,
  compact = false
}: ForensicDataPointProps) {
  const [copied, setCopied] = useState(false)
  const toCopy = copyValue !== undefined && copyValue !== '' ? copyValue : value
  const isEmpty = !toCopy.trim()

  const handleCopy = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
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

  const handleCopyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleCopy(e)
      }
    },
    [handleCopy]
  )

  const Wrapper = inline ? 'span' : 'div'
  const copyControl = !isEmpty ? (
    <span
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={handleCopyKeyDown}
      className={cn(
        'cursor-pointer p-0.5 rounded text-zinc-500 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50',
        compact
          ? 'absolute right-0 top-1/2 -translate-y-1/2 transition-opacity duration-200 opacity-0 group-hover/dp:opacity-100 focus:opacity-100'
          : 'shrink-0 transition-opacity duration-200 opacity-0 group-hover/dp:opacity-100 focus:opacity-100'
      )}
      title="Copy"
      aria-label="Copy"
    >
      {copied ? (
        <Check size={14} className="text-emerald-500" />
      ) : (
        <Copy size={14} />
      )}
    </span>
  ) : null

  return (
    <Wrapper
      className={cn(
        'group/dp relative flex items-center gap-2',
        compact ? 'w-max max-w-full shrink-0' : 'w-full min-w-0',
        inline && 'inline-flex',
        className
      )}
    >
      {label && (
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest shrink-0">{label}</span>
      )}
      <span className={cn(compact ? 'shrink-0' : 'min-w-0 truncate', valueClassName)}>
        {children !== undefined ? children : value || '—'}
      </span>
      {compact ? (
        <span className="relative flex min-h-6 w-0 shrink-0 self-stretch items-center overflow-hidden transition-[width] duration-200 ease-out group-hover/dp:w-6">
          {copyControl}
        </span>
      ) : (
        copyControl
      )}
    </Wrapper>
  )
}
