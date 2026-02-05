'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Activity, Menu, X } from 'lucide-react'
import { useScrollEffect } from '@/hooks/useScrollEffect'

const MENU_ITEMS = [
  { label: 'The Philosophy', href: '/philosophy' },
  { label: 'The Methodology', href: '/technical-docs' },
  { label: 'Market Data', href: '/market-data' },
  { label: 'Contact', href: '/contact' },
] as const

export function LandingHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isScrolled = useScrollEffect((y) => y > 50, false)

  return (
    <>
      <header
        id="main-header"
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${isScrolled ? 'bg-white/80 backdrop-blur-xl h-16' : 'bg-transparent h-24'}`}
      >
        <div className="w-full px-8 h-full flex items-center justify-between">
          <div className="z-50 flex items-center gap-2 cursor-pointer">
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
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/network"
              className="hidden md:block text-sm font-medium text-zinc-500 hover:text-black transition-colors"
            >
              Sign In
            </Link>
            <a
              href="/bill-debugger"
              className="hidden md:flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40"
            >
              <Activity className="w-4 h-4" />
              <span>Run Analysis</span>
            </a>
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 text-black stroke-[1.5]" />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 bg-white/10 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden={!isMenuOpen}
      >
        <button
          type="button"
          onClick={() => setIsMenuOpen(false)}
          className="absolute top-8 right-8 p-2 hover:bg-black/5 rounded-full"
          aria-label="Close menu"
        >
          <X className="w-8 h-8 text-black stroke-[1.5]" />
        </button>
        <div className="flex flex-col gap-8 text-center">
          {MENU_ITEMS.map((item, i) => (
            <a
              key={item.label}
              href={item.href}
              className={`menu-item text-4xl md:text-5xl font-light tracking-tight text-black hover:text-[#002FA7] transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} delay-${(i + 1) * 100}`}
            >
              {item.label}
            </a>
          ))}
          <div className={`mt-8 md:hidden transition-all duration-500 delay-500 menu-item ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            <a
              href="/bill-debugger"
              className="flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-lg font-medium hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 inline-flex"
            >
              <Activity className="w-5 h-5" />
              <span>Run Analysis</span>
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
