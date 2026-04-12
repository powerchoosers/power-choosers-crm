import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { OwnerDirectoryEntry } from '@/types/agents'

type OwnerBadgeOwner = Pick<OwnerDirectoryEntry, 'displayName' | 'kind'>

interface OwnerBadgeProps {
  owner?: OwnerBadgeOwner | null
  className?: string
}

export function OwnerBadge({ owner, className }: OwnerBadgeProps) {
  const label = owner?.displayName?.trim() || 'Unassigned'
  const isUnassigned = owner?.kind === 'unassigned' || label === 'Unassigned'

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-6 max-w-[14rem] rounded-full border px-2.5 font-mono text-[10px] font-medium leading-none tracking-[0.08em] shadow-none',
        isUnassigned
          ? 'border-white/10 bg-white/[0.03] text-zinc-500'
          : 'border-[#002FA7]/35 bg-[#002FA7]/10 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        className
      )}
    >
      <span className="block min-w-0 truncate">{label}</span>
    </Badge>
  )
}
