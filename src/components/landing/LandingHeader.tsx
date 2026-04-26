'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Activity, Menu, X, CalendarDays } from 'lucide-react'
import { useScrollEffect } from '@/hooks/useScrollEffect'

const MENU_ITEMS = [
  { label: 'Forensic Review', href: '/forensic-review' },
  { label: 'Who We Serve', href: '/who-we-serve' },
  { label: 'Market Intelligence', href: '/market-data' },
  { label: 'Contact', href: '/contact' },
] as const

export function LandingHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMenuRendered, setIsMenuRendered] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isScrolled = useScrollEffect((y) => y > 50, false)

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const openMenu = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setIsMenuRendered(true)
    requestAnimationFrame(() => setIsMenuOpen(true))
  }

  const closeMenu = () => {
    setIsMenuOpen(false)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setIsMenuRendered(false)
    }, 650)
  }

  return (
    <>
      <header
        id="main-header"
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${isScrolled ? 'bg-white/80 backdrop-blur-xl h-16 shadow-sm' : 'bg-transparent h-24'}`}
      >
        <div className="w-full px-8 h-full flex items-center justify-between">
          <Link href="/" className="z-50 flex items-center gap-2">
            <Image
              src="/images/nodalpoint.png"
              alt="Nodal Point Logo"
              width={120}
              height={40}
              className="h-10 w-auto"
              priority
            />
            <span className="font-bold text-xl tracking-tighter text-black">
              Nodal <span className="text-[#002FA7]">Point</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 md:gap-6">
            <a
              href="/portal"
              className="hidden md:flex items-center gap-2 border border-transparent text-black/80 hover:text-black hover:bg-black/5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
            >
              <span>Sign In</span>
            </a>
            <a
              href="/book"
              className="hidden md:flex items-center gap-2 bg-white border border-zinc-300 text-zinc-900 px-5 py-2.5 rounded-full text-sm font-medium shadow-sm hover:bg-zinc-50 hover:border-zinc-400 transition-all"
            >
              <CalendarDays className="w-4 h-4" />
              <span>Book a Strategy Call</span>
            </a>
            <a
              href="/bill-debugger"
              className="hidden md:flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40"
            >
              <Activity className="w-4 h-4" />
              <span>Review My Bill</span>
            </a>
            <button
              type="button"
              onClick={openMenu}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 text-black stroke-[1.5]" />
            </button>
          </div>
        </div>
      </header>

      {isMenuRendered ? (
        <div
          className={`fixed inset-0 z-50 bg-white/30 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${
            isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={!isMenuOpen}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeMenu()
          }}
        >
          <button
            type="button"
            onClick={closeMenu}
            className={`absolute top-8 right-8 p-2 hover:bg-black/5 rounded-full ${
              isMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            aria-label="Close menu"
            tabIndex={isMenuOpen ? 0 : -1}
          >
            <X className="w-8 h-8 text-black stroke-[1.5]" />
          </button>
          <div className={`flex flex-col gap-8 text-center ${isMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            {MENU_ITEMS.map((item, i) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={closeMenu}
                tabIndex={isMenuOpen ? 0 : -1}
                className={`menu-item text-4xl md:text-5xl font-light tracking-tight text-black hover:text-[#002FA7] transition-all duration-500 ${
                  isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
                }`}
                style={{ transitionDelay: `${(i + 1) * 100}ms` }}
              >
                {item.label}
              </Link>
            ))}
            <div className={`mt-8 flex flex-col sm:flex-row gap-3 justify-center transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`} style={{ transitionDelay: '500ms' }}>
              <Link
                href="/book"
                onClick={closeMenu}
                tabIndex={isMenuOpen ? 0 : -1}
                className="inline-flex items-center justify-center gap-2 bg-white border border-zinc-300 text-zinc-900 px-6 py-3 rounded-full text-base font-medium shadow-sm hover:bg-zinc-50 hover:border-zinc-400 transition-all"
              >
                <CalendarDays className="w-4 h-4" />
                Book a Strategy Call
              </Link>
              <Link
                href="/bill-debugger"
                onClick={closeMenu}
                tabIndex={isMenuOpen ? 0 : -1}
                className="inline-flex items-center justify-center gap-2 bg-[#002FA7] text-white px-6 py-3 rounded-full text-base font-medium hover:scale-105 transition-all"
              >
                <Activity className="w-4 h-4" />
                Review My Bill
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
