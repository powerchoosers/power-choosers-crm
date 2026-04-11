'use client'

import { startTransition, useEffect, useState } from 'react'

export function useDeferredHydration(delayMs = 120) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return
      startTransition(() => {
        setReady(true)
      })
    }, delayMs)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [delayMs])

  return ready
}
