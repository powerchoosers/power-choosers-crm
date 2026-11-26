'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

const NAV_ITEMS = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Who we serve', href: '/who-we-serve' },
  { label: 'Market data', href: '/market-data' },
  { label: 'Contact', href: '/contact' },
] as const

type Tone = 'light' | 'dark'

const EASE = [0.23, 1, 0.32, 1] as const

/** Height of the bar in px. The tone check samples the page just below the middle of it. */
const BAR_HEIGHT = 64

/**
 * Public-site header.
 *
 * The bar restyles itself for whatever is behind it: white text over any section marked
 * `data-header-tone="dark"`, dark text over everything else. `tone` is only the starting
 * value used for the first paint, so pass "dark" on pages that open with a dark section.
 */
export function LandingHeader({ tone: initialTone = 'light' }: { tone?: Tone }) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [tone, setTone] = useState<Tone>(initialTone)

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      setIsScrolled(window.scrollY > 8)
      const probe = BAR_HEIGHT / 2
      let next: Tone = 'light'
      document.querySelectorAll('[data-header-tone="dark"]').forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.top <= probe && rect.bottom > probe) next = 'dark'
      })
      setTone(next)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // Multi-step pages swap their content without scrolling, so also re-check when the
    // page changes height.
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(document.body)
    return () => {
      resizeObserver.disconnect()
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [pathname])

  useEffect(() => {
    setIsMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [isMenuOpen])

  // The open menu is always dark, so the bar above it is too.
  const dark = isMenuOpen || tone === 'dark'

  const focusRing = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${dark ? 'focus-visible:outline-white' : 'focus-visible:outline-[#002FA7]'}`
  const barSurface = isMenuOpen
    ? 'border-transparent bg-transparent'
    : isScrolled
      ? dark
        ? 'border-white/10 bg-zinc-950/55 backdrop-blur-xl backdrop-saturate-150'
        : 'border-zinc-950/[0.06] bg-white/70 backdrop-blur-xl backdrop-saturate-150 shadow-[0_1px_24px_-12px_rgba(0,0,0,0.25)]'
      : 'border-transparent bg-transparent'
  const linkColor = dark ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-950'
  const lineColor = dark ? 'bg-white' : 'bg-zinc-950'

  return (
    <>
      <header
        id="main-header"
        className={`fixed inset-x-0 top-0 z-50 h-16 border-b transition-[background-color,border-color,color,box-shadow] duration-300 ${barSurface} ${dark ? 'text-white' : 'text-zinc-950'}`}
      >
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-6 lg:px-10">
          <Link href="/" className={`flex items-center gap-2.5 rounded-md ${focusRing}`}>
            <Image
              src="/images/nodalpoint.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg bg-white p-0.5"
              priority
            />
            <span className="text-lg font-semibold tracking-[-0.02em]">Nodal Point</span>
          </Link>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`np-link rounded-sm py-1 text-sm font-medium transition-colors duration-200 ${active ? (dark ? 'text-white' : 'text-zinc-950') : linkColor} ${focusRing}`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/portal"
              className={`np-link hidden rounded-sm py-1 text-sm font-medium transition-colors duration-200 sm:block ${linkColor} ${focusRing}`}
            >
              Sign in
            </Link>
            <Link
              href="/bill-debugger"
              className={`hidden items-center rounded-[10px] bg-[#002FA7] px-4 py-2 text-sm font-medium text-white transition-[background-color,transform] duration-200 hover:bg-[#0a3fd1] active:scale-[0.97] sm:inline-flex ${focusRing}`}
            >
              Review my bill
            </Link>
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className={`relative -mr-2 h-10 w-10 rounded-md lg:hidden ${focusRing}`}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              {/* Two lines that cross into an X */}
              <span
                className={`absolute left-2.5 top-1/2 h-[1.5px] w-5 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${lineColor} ${isMenuOpen ? 'rotate-45' : '-translate-y-[4px]'}`}
              />
              <span
                className={`absolute left-2.5 top-1/2 h-[1.5px] w-5 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${lineColor} ${isMenuOpen ? '-rotate-45' : 'translate-y-[4px]'}`}
              />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen ? (
          <motion.div
            id="mobile-menu"
            key="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-40 flex flex-col bg-zinc-950/90 text-white backdrop-blur-2xl lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE }}
          >
            <nav className="flex flex-1 flex-col overflow-y-auto px-6 pb-10 pt-24" aria-label="Mobile">
              {[...NAV_ITEMS, { label: 'Sign in', href: '/portal' }].map((item, index) => (
                <motion.div
                  key={item.href}
                  initial={reduceMotion ? false : { opacity: 0, y: 18, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.45, delay: 0.06 + index * 0.055, ease: EASE }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    aria-current={pathname === item.href ? 'page' : undefined}
                    className="np-display block border-b border-white/10 py-4 text-3xl text-zinc-100 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                className="mt-8 flex flex-col gap-3"
                initial={reduceMotion ? false : { opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.45, delay: 0.06 + 5 * 0.055, ease: EASE }}
              >
                <Link
                  href="/bill-debugger"
                  onClick={() => setIsMenuOpen(false)}
                  className="inline-flex items-center justify-center rounded-[10px] bg-[#002FA7] px-6 py-3.5 text-base font-medium text-white transition-transform duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Review my bill
                </Link>
                <Link
                  href="/book"
                  onClick={() => setIsMenuOpen(false)}
                  className="inline-flex items-center justify-center rounded-[10px] border border-white/25 px-6 py-3.5 text-base font-medium transition-transform duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Book a call
                </Link>
              </motion.div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
