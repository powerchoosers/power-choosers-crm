'use client'

import { cn } from '@/lib/utils'
import { formatSignalPercent, getSignalTone } from '@/lib/contact-signals'

interface SignalStrengthBadgeProps {
  score?: number | null
  className?: string
}

export function SignalStrengthBadge({ score, className }: SignalStrengthBadgeProps) {
  if (score == null || !Number.isFinite(score)) return null

  const tone = getSignalTone(score)
  const width = Math.max(0, Math.min(100, Math.round(score)))

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border bg-black/30 px-2 py-1 shadow-sm backdrop-blur-sm',
        tone.trackClass,
        className
      )}
      aria-label={`Signal strength ${formatSignalPercent(score)}`}
    >
      <span className={cn('font-mono text-[10px] tabular-nums tracking-[0.12em]', tone.textClass)}>
        {formatSignalPercent(score)}
      </span>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn('h-full rounded-full transition-all duration-500 ease-out', tone.fillClass)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

