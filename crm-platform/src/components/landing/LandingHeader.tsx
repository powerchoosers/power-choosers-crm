'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Menu, X, Lock, CalendarDays } from 'lucide-react'
import { useScrollEffect } from '@/hooks/useScrollEffect'

const MENU_ITEMS = [
  { label: 'Forensic Review', href: '/forensic-review' },
  { label: 'Who We Serve', href: '/who-we-serve' },
  { label: 'Market Intelligence', href: '/market-data' },
  { label: 'Contact', href: '/contact' },
] as const

const MENU_BACKDROP_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.24,
      ease: [0.23, 1, 0.32, 1],
      when: 'beforeChildren',
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.16,
      ease: [0.23, 1, 0.32, 1],
    },
  },
} as const

const MENU_PANEL_VARIANTS = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.23, 1, 0.32, 1],
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.985,
    transition: {
      duration: 0.15,
      ease: [0.23, 1, 0.32, 1],
    },
  },
} as const

const MENU_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: [0.23, 1, 0.32, 1],
    },
  },
  exit: {
    opacity: 0,
    y: 6,
    transition: {
      duration: 0.12,
      ease: [0.23, 1, 0.32, 1],
    },
  },
} as const

export function LandingHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isScrolled = useScrollEffect((y) => y > 50, false)

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
              className="hidden md:flex items-center gap-2 border border-black/15 text-black px-5 py-2.5 rounded-full text-sm font-medium hover:bg-black/5 hover:border-black/30 transition-all"
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
              onClick={() => setIsMenuOpen(true)}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 text-black stroke-[1.5]" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen ? (
          <motion.div
            key="landing-menu"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={MENU_BACKDROP_VARIANTS}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/30 backdrop-blur-[20px]"
            aria-hidden={!isMenuOpen}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsMenuOpen(false)
            }}
          >
            <motion.button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="absolute top-8 right-8 p-2 hover:bg-black/5 rounded-full"
              aria-label="Close menu"
              variants={MENU_ITEM_VARIANTS}
            >
              <X className="w-8 h-8 text-black stroke-[1.5]" />
            </motion.button>
            <motion.div
              className="flex flex-col gap-8 text-center pointer-events-auto"
              variants={MENU_PANEL_VARIANTS}
            >
              {MENU_ITEMS.map((item) => (
                <motion.div key={item.label} variants={MENU_ITEM_VARIANTS}>
                  <Link
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="menu-item text-4xl md:text-5xl font-light tracking-tight text-black hover:text-[#002FA7] transition-colors duration-300"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center" variants={MENU_ITEM_VARIANTS}>
                <a
                  href="/book"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-center gap-2 border border-black/15 text-black px-6 py-3 rounded-full text-base font-medium hover:bg-black/5 hover:border-black/30 transition-all inline-flex"
                >
                  <CalendarDays className="w-4 h-4" />
                  Book a Strategy Call
                </a>
                <a
                  href="/bill-debugger"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-center gap-2 bg-[#002FA7] text-white px-6 py-3 rounded-full text-base font-medium hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 inline-flex"
                >
                  <Activity className="w-4 h-4" />
                  Review My Bill
                </a>
              </motion.div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
