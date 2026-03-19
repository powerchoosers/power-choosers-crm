'use client'

import { useEffect, useRef, useState } from 'react'

type CursorTone = 'default' | 'interactive' | 'active'

const TEXT_INPUT_SELECTOR =
  'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea, [contenteditable="true"], [data-cursor="text"]'

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], [role="link"], label[for], summary, select, [data-cursor="action"], [tabindex]:not([tabindex="-1"])'

function resolveCursorTone(target: EventTarget | null, isPressed: boolean): CursorTone {
  if (!(target instanceof Element)) return 'default'
  if (target.closest(TEXT_INPUT_SELECTOR)) return 'default'
  if (target.closest(INTERACTIVE_SELECTOR)) return isPressed ? 'active' : 'interactive'
  return 'default'
}

export function NetworkCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const pressedRef = useRef(false)
  const [visible, setVisible] = useState(false)
  const [tone, setTone] = useState<CursorTone>('default')
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const supportsFinePointer =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    setEnabled(supportsFinePointer)
    if (!supportsFinePointer) return

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      if (!visible) setVisible(true)

      const node = cursorRef.current
      if (node) {
        node.style.left = `${event.clientX}px`
        node.style.top = `${event.clientY}px`
      }

      setTone(resolveCursorTone(event.target, pressedRef.current))
    }

    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      pressedRef.current = true
      setTone(resolveCursorTone(event.target, true))
    }

    const up = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      pressedRef.current = false
      setTone(resolveCursorTone(event.target, false))
    }

    const leaveWindow = (event: MouseEvent) => {
      if (!event.relatedTarget) {
        setVisible(false)
        pressedRef.current = false
      }
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
    }
  }, [visible])

  if (!enabled) return null

  return (
    <div
      ref={cursorRef}
      aria-hidden
      className={`network-cursor ${visible ? 'is-visible' : ''} tone-${tone}`}
    />
  )
}
