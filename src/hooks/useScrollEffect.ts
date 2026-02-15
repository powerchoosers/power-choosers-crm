'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'

/**
 * Returns a value derived from scroll position, updating on scroll.
 * Used for header background etc. without causing layout.
 */
export function useScrollEffect<T>(fn: (scrollY: number) => T, initial: T): T {
  const [value, setValue] = useState<T>(initial)
  const fnRef = useRef(fn)

  useLayoutEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    const handler = () => setValue(fnRef.current(window.scrollY))
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return value
}
