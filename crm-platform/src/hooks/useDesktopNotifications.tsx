'use client'

import { useEffect, useRef } from 'react'
import { useNotificationCenter } from '@/hooks/useNotificationCenter'
import { showDesktopNotification } from '@/lib/desktop-notifications'

const STORAGE_KEY = 'np_desktop_missed_call_seen_v1'

function loadSeenIds() {
  if (typeof window === 'undefined') return new Set<string>()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()
    return new Set(parsed.map((value) => String(value)))
  } catch {
    return new Set<string>()
  }
}

function persistSeenIds(ids: Set<string>) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-200)))
  } catch {
    // Ignore persistence failures.
  }
}

export function useDesktopNotifications({ enabled = true }: { enabled?: boolean } = {}) {
  const { items, isLoading } = useNotificationCenter()
  const seenIdsRef = useRef<Set<string>>(new Set())
  const bootstrappedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    seenIdsRef.current = loadSeenIds()
  }, [enabled])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.nodalDesktop?.isDesktop) {
      return
    }

    if (isLoading) {
      return
    }

    if (!bootstrappedRef.current) {
      items.forEach((item) => {
        seenIdsRef.current.add(item.id)
      })
      persistSeenIds(seenIdsRef.current)
      bootstrappedRef.current = true
      return
    }

    const relevantItems = items.filter((item) => item.type === 'missed_call')
    if (relevantItems.length === 0) {
      return
    }

    const nextSeen = new Set(seenIdsRef.current)
    let didNotify = false

    relevantItems.forEach((item) => {
      if (nextSeen.has(item.id)) return
      nextSeen.add(item.id)
      didNotify = true
      void showDesktopNotification({
        title: item.title || 'Missed Call',
        body: item.message || 'A call needs follow-up.',
        link: item.link || null,
        kind: 'missed_call',
      })
    })

    if (didNotify) {
      seenIdsRef.current = nextSeen
      persistSeenIds(nextSeen)
    }
  }, [enabled, isLoading, items])
}
