'use client'

import { useCallback, useEffect, useRef } from 'react'

const SCROLL_STORAGE_PREFIX = 'np_table_scroll_'

/**
 * Persists and restores scroll position for table list pages when navigating
 * to a detail page and back. Scrolls to top only after pagination page actually changes.
 *
 * @param storageKey - Unique key per page (pathname + search, e.g. '/network/people?page=2')
 * @param pageIndex - Current pagination page index. When this changes (e.g. after clicking prev/next), scrolls to top after the new page is shown.
 * @param isReady - When true, restore runs (after data has loaded). Pass !isLoading so we restore once the table has content.
 */
export function useTableScrollRestore(storageKey: string, pageIndex?: number, isReady?: boolean) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const storageKeyRef = useRef(storageKey)
  storageKeyRef.current = storageKey
  const prevPageIndexRef = useRef<number | null>(null)

  const saveScroll = useCallback(() => {
    if (typeof window === 'undefined') return
    const el = scrollContainerRef.current
    if (el && storageKeyRef.current) {
      try {
        sessionStorage.setItem(SCROLL_STORAGE_PREFIX + storageKeyRef.current, String(el.scrollTop))
      } catch (_) {}
    }
  }, [])

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Scroll to top only when pageIndex changes (user clicked prev/next), not on initial mount or when restoring from back
  useEffect(() => {
    if (typeof pageIndex !== 'number') return
    if (prevPageIndexRef.current !== null && prevPageIndexRef.current !== pageIndex) {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevPageIndexRef.current = pageIndex
  }, [pageIndex])

  // Restore scroll when returning from a detail page. Only run when isReady so the table has content (avoids clamp/reset).
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return
    if (isReady === false) return
    const key = SCROLL_STORAGE_PREFIX + storageKey
    let value: string | null = null
    try {
      value = sessionStorage.getItem(key)
    } catch (_) {}
    if (value === null) return
    const scrollTop = parseInt(value, 10)
    if (Number.isNaN(scrollTop) || scrollTop < 0) {
      try {
        sessionStorage.removeItem(key)
      } catch (_) {}
      return
    }
    try {
      sessionStorage.removeItem(key)
    } catch (_) {}
    // Apply after paint so the scroll container has its content and scrollHeight is correct
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current
        if (el) {
          el.scrollTop = Math.min(scrollTop, el.scrollHeight - el.clientHeight)
        }
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [storageKey, isReady])

  return { scrollContainerRef, saveScroll, scrollToTop }
}
