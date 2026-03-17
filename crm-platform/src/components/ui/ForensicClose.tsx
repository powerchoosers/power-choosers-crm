import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ForensicCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: number
}

export function ForensicClose({ className, size = 20, ...props }: ForensicCloseProps) {
  return (
    <button
      type="button"
      className={cn(
        "text-zinc-500 hover:text-zinc-100 transition-all duration-300 transform hover:scale-110 active:scale-95 flex items-center justify-center p-1 cursor-pointer outline-none",
        className
      )}
      {...props}
      title={props.title || "Close"}
    >
      <X size={size} strokeWidth={1.5} />
    </button>
  )
}
