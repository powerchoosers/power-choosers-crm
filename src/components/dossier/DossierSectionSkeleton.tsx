'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface DossierSectionSkeletonProps {
  title: string
  rows?: number
  className?: string
  variant?: 'module' | 'void'
}

export function DossierSectionSkeleton({
  title,
  rows = 4,
  className,
  variant = 'module',
}: DossierSectionSkeletonProps) {
  const shellClassName = variant === 'void'
    ? 'nodal-void-card border border-white/5 rounded-2xl p-4'
    : 'nodal-module-glass nodal-monolith-edge rounded-2xl p-4'

  return (
    <div className={cn(shellClassName, className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          {title}
        </h3>
        <Skeleton className="h-7 w-7 rounded-xl" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton
            key={`${title}-${index}`}
            className={cn(
              index === 0 ? 'h-14' : index === rows - 1 ? 'h-10 w-5/6' : 'h-10',
            )}
          />
        ))}
      </div>
    </div>
  )
}
