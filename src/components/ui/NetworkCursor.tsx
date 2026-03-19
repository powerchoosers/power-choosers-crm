'use client'

import { useEffect, useRef, useState } from 'react'

const TEXT_INPUT_SELECTOR =
  'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea, [contenteditable="true"], [data-cursor="text"]'

export function NetworkCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const activeTextTargetRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const targetXRef = useRef(0)
  const targetYRef = useRef(0)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const supportsFinePointer =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    setEnabled(supportsFinePointer)
    if (!supportsFinePointer) return

    const schedulePaint = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const node = cursorRef.current
        if (!node) return
        node.style.transform = `translate3d(${targetXRef.current}px, ${targetYRef.current}px, 0) translate(-50%, -50%)`
      })
    }

    const showForTextTarget = (target: EventTarget | null) => {
      const nextTextTarget =
        target instanceof Element ? (target.closest(TEXT_INPUT_SELECTOR) as HTMLElement | null) : null
      const previousTextTarget = activeTextTargetRef.current

      if (previousTextTarget && previousTextTarget !== nextTextTarget) {
        previousTextTarget.style.removeProperty('cursor')
      }

      if (nextTextTarget && nextTextTarget !== previousTextTarget) {
        nextTextTarget.style.setProperty('cursor', 'none', 'important')
      }

      activeTextTargetRef.current = nextTextTarget

      const node = cursorRef.current
      if (!node) return
      node.classList.toggle('is-visible', !!nextTextTarget)
      node.classList.toggle('tone-text', !!nextTextTarget)
    }

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const isTextTarget = event.target instanceof Element && !!event.target.closest(TEXT_INPUT_SELECTOR)
      if (!isTextTarget) {
        showForTextTarget(null)
        return
      }

      targetXRef.current = event.clientX
      targetYRef.current = event.clientY
      showForTextTarget(event.target)
      schedulePaint()
    }

    const leaveWindow = (event: MouseEvent) => {
      if (event.relatedTarget) return
      showForTextTarget(null)
    }

    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('mouseout', leaveWindow)

    return () => {
      window.removeEventListener('pointermove', move)
      document.removeEventListener('mouseout', leaveWindow)

      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
      }

      if (activeTextTargetRef.current) {
        activeTextTargetRef.current.style.removeProperty('cursor')
        activeTextTargetRef.current = null
      }
    }
  }, [])

  if (!enabled) return null

  return <div ref={cursorRef} aria-hidden className="network-cursor tone-text" />
}
