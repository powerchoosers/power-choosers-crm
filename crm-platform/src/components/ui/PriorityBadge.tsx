'use client'

import { cn } from '@/lib/utils'

/**
 * Matches dashboard TaskManagement priority styling:
 * text-[9px] px-1.5 py-0.5 rounded-sm font-mono uppercase tracking-tighter border
 * High → rose, Medium → amber, Low → zinc, Protocol/Sequence → blue (#002FA7)
 */
export function PriorityBadge({
  priority,
  className,
  labelStyle = 'suffix',
  completed = false,
}: {
  priority: string | undefined
  className?: string
  /** 'suffix' = "MEDIUM_PRIORITY", 'raw' = "Medium", 'short' = "MED" */
  labelStyle?: 'suffix' | 'raw' | 'short'
  /** When true: grey styling and line-through (e.g. completed task) */
  completed?: boolean
}) {
  const p = (priority ?? '').toLowerCase()
  const base = 'text-[9px] px-1.5 py-0.5 rounded-sm font-mono uppercase tracking-tighter border transition-colors duration-300'
  const style = completed
    ? 'bg-zinc-600/20 text-zinc-500 border-zinc-600/30 line-through'
    : p === 'high'
      ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
      : p === 'medium'
        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
        : p === 'low'
          ? 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
          : p === 'protocol' || p === 'sequence'
            ? 'bg-white/10 text-white border-white/20'
            : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'

  const label =
    labelStyle === 'suffix'
      ? p === 'high'
        ? 'HIGH_PRIORITY'
        : p === 'medium'
          ? 'MEDIUM_PRIORITY'
          : p === 'low'
            ? 'LOW_PRIORITY'
            : p === 'protocol' || p === 'sequence'
              ? 'PROTOCOL'
              : (priority ?? '—').toString().toUpperCase()
      : labelStyle === 'short'
        ? p === 'high'
          ? 'HIGH'
          : p === 'medium'
            ? 'MED'
            : p === 'low'
              ? 'LOW'
              : p === 'protocol' || p === 'sequence'
                ? 'PROTOCOL'
                : (priority ?? '—').toString().slice(0, 3).toUpperCase()
        : p === 'sequence'
          ? 'Protocol'
          : (priority ?? '—').toString()

  return (
    <span className={cn(base, style, className)}>
      {typeof label === 'string' ? label : ''}
    </span>
  )
}

/** Same color mapping for use on icon boxes / non-badge elements */
export function priorityColorClasses(priority: string | undefined): string {
  const p = (priority ?? '').toLowerCase()
  if (p === 'high') return 'bg-rose-500/10 text-rose-500'
  if (p === 'medium') return 'bg-amber-500/10 text-amber-500'
  if (p === 'low') return 'bg-zinc-500/10 text-zinc-500'
  if (p === 'protocol' || p === 'sequence') return 'bg-white/10 text-white'
  return 'bg-black/40 text-zinc-400'
}
