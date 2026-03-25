'use client'

import { cn } from '@/lib/utils'

interface DottedEmptyStateProps {
  message: string
  className?: string
}

export function DottedEmptyState({ message, className }: DottedEmptyStateProps) {
  return (
    <div className={cn(
      'p-8 rounded-2xl border border-dashed border-white/5 bg-zinc-950/20 flex flex-col items-center justify-center gap-3',
      className
    )}>
      <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.3em] text-center">
        {message}
      </p>
    </div>
  )
}
