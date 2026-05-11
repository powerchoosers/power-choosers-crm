import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ForensicRefreshProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  label?: string
}

export function ForensicRefresh({ loading, label = "REFRESH", className, ...props }: ForensicRefreshProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 text-zinc-500 hover:text-zinc-100 transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer outline-none",
        className
      )}
      {...props}
    >
      <RotateCcw className={cn("w-3 h-3", loading && "animate-spin")} strokeWidth={1.5} />
      <span className="font-mono text-[9px] uppercase tracking-[0.2em]">{label}</span>
    </button>
  )
}
