import React from 'react'
import { cn } from '@/lib/utils'

const frozenSelectCellBase =
  "sticky left-0 z-30 w-12 min-w-12 max-w-12 px-0 border-b border-white/5 transition-colors backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/50"
const frozenSelectCellIdle = "bg-zinc-950/60 group-hover:bg-white/[0.04]"
const frozenSelectCellActive = "bg-[#002FA7]/10 group-hover:bg-[#002FA7]/12"

const frozenNameCellBase =
  "sticky left-12 z-20 relative w-[18rem] min-w-[18rem] max-w-[18rem] px-0 overflow-visible border-b border-white/5 border-r border-white/5 shadow-[24px_0_42px_-28px_rgba(0,0,0,0.88)] after:content-[''] after:pointer-events-none after:absolute after:inset-y-0 after:-right-8 after:w-8 after:bg-gradient-to-r after:from-black/75 after:via-black/25 after:to-transparent transition-colors backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/50"
const frozenNameCellIdle = "bg-zinc-950/60 group-hover:bg-white/[0.04]"
const frozenNameCellActive = "bg-[#002FA7]/10 group-hover:bg-[#002FA7]/12"

const frozenHeaderSelectCellBase =
  "sticky left-0 z-50 w-12 min-w-12 max-w-12 px-0 border-b border-white/5 transition-colors bg-zinc-950/70 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/60"
const frozenHeaderNameCellBase =
  "sticky left-12 z-40 relative w-[18rem] min-w-[18rem] max-w-[18rem] px-0 overflow-visible border-b border-white/5 border-r border-white/5 shadow-[24px_0_42px_-28px_rgba(0,0,0,0.88)] after:content-[''] after:pointer-events-none after:absolute after:inset-y-0 after:-right-8 after:w-8 after:bg-gradient-to-r after:from-black/75 after:via-black/25 after:to-transparent transition-colors bg-zinc-950/70 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/60"

export function getFrozenSelectCellClass(isSelected: boolean) {
  return cn(
    frozenSelectCellBase,
    isSelected ? frozenSelectCellActive : frozenSelectCellIdle
  )
}

export function getFrozenNameCellClass(isSelected: boolean) {
  return cn(
    frozenNameCellBase,
    isSelected ? frozenNameCellActive : frozenNameCellIdle
  )
}

export function getFrozenSelectHeaderClass() {
  return frozenHeaderSelectCellBase
}

export function getFrozenNameHeaderClass() {
  return frozenHeaderNameCellBase
}

interface FrozenHoverTextProps {
  text: string
  className?: string
  revealClassName?: string
}

export function FrozenHoverText({
  text,
  className,
  revealClassName,
}: FrozenHoverTextProps) {
  return (
    <span className="group/frozen-text relative block min-w-0" title={text}>
      <span className={cn("block min-w-0 truncate", className)}>
        {text}
      </span>
      <span
        className={cn(
          "pointer-events-none absolute left-0 top-[calc(100%+0.35rem)] z-50 hidden max-w-[24rem] rounded-xl border border-[#002FA7]/20 bg-zinc-950/95 px-3 py-2 text-sm font-medium leading-5 text-zinc-100 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ring-1 ring-[#002FA7]/10 backdrop-blur-2xl whitespace-normal break-words group-hover/frozen-text:block",
          revealClassName
        )}
      >
        {text}
      </span>
    </span>
  )
}
