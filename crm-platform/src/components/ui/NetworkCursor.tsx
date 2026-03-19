'use client'

import { useEffect, useRef, useState } from 'react'

type CursorTone = 'default' | 'interactive' | 'active' | 'text'

const TEXT_INPUT_SELECTOR =
  'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea, [contenteditable="true"], [data-cursor="text"]'

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], [role="link"], label[for], summary, select, [data-cursor="action"], [tabindex]:not([tabindex="-1"])'

function resolveCursorTone(target: EventTarget | null, isPressed: boolean): CursorTone {
  if (!(target instanceof Element)) return 'default'
  if (target.closest(TEXT_INPUT_SELECTOR)) return 'text'
  if (target.closest(INTERACTIVE_SELECTOR)) return isPressed ? 'active' : 'interactive'
  return 'default'
}

export function NetworkCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const pressedRef = useRef(false)
  const toneRef = useRef<CursorTone>('default')
  const visibleRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const targetXRef = useRef(0)
  const targetYRef = useRef(0)
  const textTargetRef = useRef<HTMLElement | null>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const supportsFinePointer =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    setEnabled(supportsFinePointer)
    if (!supportsFinePointer) return

    const applyTone = (nextTone: CursorTone) => {
      const node = cursorRef.current
      if (!node || toneRef.current === nextTone) return
      node.classList.remove(`tone-${toneRef.current}`)
      node.classList.add(`tone-${nextTone}`)
      toneRef.current = nextTone
    }

    const applyVisibility = (isVisible: boolean) => {
      const node = cursorRef.current
      if (!node || visibleRef.current === isVisible) return
      node.classList.toggle('is-visible', isVisible)
      visibleRef.current = isVisible
    }

    const applyTextTarget = (target: EventTarget | null) => {
      const nextTextTarget =
        target instanceof Element ? (target.closest(TEXT_INPUT_SELECTOR) as HTMLElement | null) : null

      if (textTargetRef.current && textTargetRef.current !== nextTextTarget) {
        textTargetRef.current.style.removeProperty('cursor')
      }

      if (nextTextTarget && nextTextTarget !== textTargetRef.current) {
        nextTextTarget.style.setProperty('cursor', 'none', 'important')
      }

      textTargetRef.current = nextTextTarget
    }

    const schedulePaint = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const node = cursorRef.current
        if (!node) return
        node.style.transform = `translate3d(${targetXRef.current}px, ${targetYRef.current}px, 0) translate(-50%, -50%)`
      })
    }

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      targetXRef.current = event.clientX
      targetYRef.current = event.clientY
      applyVisibility(true)
      applyTextTarget(event.target)
      applyTone(resolveCursorTone(event.target, pressedRef.current))
      schedulePaint()
    }

    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      pressedRef.current = true
      applyTone(resolveCursorTone(event.target, true))
    }

    const up = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      pressedRef.current = false
      applyTone(resolveCursorTone(event.target, false))
    }

    const leaveWindow = (event: MouseEvent) => {
      if (event.relatedTarget) return
      applyVisibility(false)
      applyTone('default')
      pressedRef.current = false
      applyTextTarget(null)
    }

    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    document.addEventListener('mouseout', leaveWindow)

    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      document.removeEventListener('mouseout', leaveWindow)

      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
      }

      if (textTargetRef.current) {
        textTargetRef.current.style.removeProperty('cursor')
        textTargetRef.current = null
      }
    }
  }, [])

  if (!enabled) return null

  return <div ref={cursorRef} aria-hidden className="network-cursor tone-default" />
}
