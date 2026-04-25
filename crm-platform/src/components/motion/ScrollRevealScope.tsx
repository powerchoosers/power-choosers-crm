'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ScrollRevealScopeProps {
  children: ReactNode
  className?: string
}

/**
 * Reuses the site's shared `.reveal-on-scroll` animation pattern.
 * Any descendant with that class gets activated as it enters the viewport.
 */
export function ScrollRevealScope({ children, className }: ScrollRevealScopeProps) {
  const scopeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return

    const targets = Array.from(scope.querySelectorAll<HTMLElement>('.reveal-on-scroll'))
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    )

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={scopeRef} className={cn(className)}>
      {children}
    </div>
  )
}
