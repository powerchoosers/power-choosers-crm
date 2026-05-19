'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const frozenSelectCellBase =
  "!sticky !left-0 z-20 transform-gpu box-border w-10 min-w-10 max-w-10 px-0 border-b-0 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)] transition-colors backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/65"
const frozenSelectCellIdle = "bg-zinc-950/60 group-hover:bg-white/[0.04]"
const frozenSelectCellActive = "bg-[#002FA7]/10 group-hover:bg-[#002FA7]/12"

const frozenNameCellBase =
  "!sticky !left-10 z-30 transform-gpu box-border w-[18rem] min-w-[18rem] max-w-[18rem] px-0 overflow-visible border-r border-b-0 border-white/5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),18px_0_28px_-24px_rgba(0,0,0,0.72)] before:content-[''] before:pointer-events-none before:absolute before:inset-y-0 before:-right-6 before:w-6 before:bg-gradient-to-r before:from-black/70 before:via-black/20 before:to-transparent transition-colors backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/65"
const frozenNameCellIdle = "bg-zinc-950/60 group-hover:bg-white/[0.04]"
const frozenNameCellActive = "bg-[#002FA7]/10 group-hover:bg-[#002FA7]/12"

const frozenHeaderSelectCellBase =
  "!sticky !left-0 z-50 transform-gpu box-border w-10 min-w-10 max-w-10 px-0 overflow-visible transition-colors bg-zinc-950/70 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/65 after:content-[''] after:pointer-events-none after:absolute after:inset-y-0 after:-right-px after:w-px after:bg-zinc-950/70 after:backdrop-blur-md"
const frozenHeaderNameCellBase =
  "!sticky !left-10 z-40 transform-gpu box-border w-[18rem] min-w-[18rem] max-w-[18rem] px-2 overflow-visible border-r border-white/5 shadow-[18px_0_28px_-24px_rgba(0,0,0,0.72)] before:content-[''] before:pointer-events-none before:absolute before:inset-y-0 before:-right-6 before:w-6 before:bg-gradient-to-r before:from-black/70 before:via-black/20 before:to-transparent transition-colors bg-zinc-950/70 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/65"

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

export function getColumnAfterName(columnOrder?: string[]) {
  if (!columnOrder) return undefined
  const nameIndex = columnOrder.indexOf('name')
  if (nameIndex < 0) return undefined
  return columnOrder[nameIndex + 1]
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
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)

  useLayoutEffect(() => {
    const element = textRef.current
    if (!element) return

    const updateTruncation = () => {
      const next = element.scrollWidth > element.clientWidth + 1
      setIsTruncated((current) => (current === next ? current : next))
    }

    updateTruncation()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateTruncation)
      return () => window.removeEventListener('resize', updateTruncation)
    }

    const observer = new ResizeObserver(updateTruncation)
    observer.observe(element)

    return () => observer.disconnect()
  }, [text, className])

  return (
    <span
      className="group/frozen-text relative block min-w-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span ref={textRef} className={cn("block min-w-0 truncate", className)}>
        {text}
      </span>
      {isTruncated && isHovered && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-0 top-[calc(100%+0.35rem)] z-50 max-w-[24rem] rounded-xl border border-[#002FA7]/20 bg-zinc-950/95 px-3 py-2 text-sm font-medium leading-5 text-zinc-100 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ring-1 ring-[#002FA7]/10 backdrop-blur-2xl whitespace-normal break-words",
            revealClassName
          )}
        >
          {text}
        </span>
      )}
    </span>
  )
}
