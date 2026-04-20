'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, ArrowRight, CalendarDays, Menu, TrendingUp, X } from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { useMarketPulse } from '@/hooks/useMarketPulse'
import { cn } from '@/lib/utils'

const MENU_ITEMS = [
  { label: 'Philosophy', href: '/philosophy' },
  { label: 'How it works', href: '/technical-docs' },
  { label: 'Market Data', href: '/market-data' },
  { label: 'Market Outlook', href: '/market-outlook' },
  { label: 'Contact', href: '/contact' },
] as const

type LoadZone = 'houston' | 'north' | 'south' | 'west'

type MarketPulseData = {
  prices?: Partial<Record<LoadZone, number>> & {
    hub_avg?: number
    south?: number
  }
  grid?: {
    reserves?: number
    actual_load?: number
  }
}

const ZONES: { key: LoadZone; label: string }[] = [
  { key: 'north', label: 'North (DFW)' },
  { key: 'houston', label: 'Houston' },
  { key: 'south', label: 'South' },
  { key: 'west', label: 'West' },
]

export default function MarketData() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [selectedZone, setSelectedZone] = useState<LoadZone>('north')
  const { data: marketData, isLoading, isError } = useMarketPulse()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const pulseData = marketData as MarketPulseData | undefined
  const prices = pulseData?.prices ?? {}
  const grid = pulseData?.grid ?? {}
  const currentPrice = isLoading ? null : (prices[selectedZone] ?? prices.hub_avg ?? prices.south ?? null)
  const reserves = grid.reserves ?? null
  const load = grid.actual_load ?? null

  const stressLabel = (() => {
    if (isLoading) return 'Loading'
    if (isError) return 'Offline'
    if (typeof reserves !== 'number') return 'Unknown'
    if (reserves < 2500) return 'Critical'
    if (reserves < 4500) return 'Tight'
    return 'Stable'
  })()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#002FA7] selection:text-white">
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled ? 'bg-zinc-950/80 backdrop-blur-xl h-16 shadow-sm' : 'bg-transparent h-24'
        }`}
      >
        <div className="w-full px-8 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <div className="bg-white p-1.5 rounded-xl">
              <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-8 w-auto" />
            </div>
            <span className="font-bold text-xl tracking-tighter text-white">
              Nodal <span className="text-[#002FA7]">Point</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 md:gap-6">
            <Link href="/portal" className="hidden md:block text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link
              href="/book"
              className="hidden md:flex items-center gap-2 border border-white/15 text-zinc-200 px-5 py-2.5 rounded-full text-sm font-medium hover:border-white/30 hover:bg-white/5 transition-all"
            >
              <CalendarDays className="w-4 h-4" />
              <span>Book a Strategy Call</span>
            </Link>
            <a
              href="/bill-debugger"
              className="hidden md:flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:scale-105 transition-all"
            >
              <Activity className="w-4 h-4" />
              <span>Review My Bill</span>
            </a>
            <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Menu className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${
          isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button onClick={() => setIsMenuOpen(false)} className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full">
          <X className="w-8 h-8 text-white" />
        </button>
        <div className="flex flex-col gap-8 text-center">
          {MENU_ITEMS.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setIsMenuOpen(false)}
              className={`text-4xl md:text-5xl font-light tracking-tight text-white hover:text-[#002FA7] transition-all duration-500 ${
                isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
              }`}
              style={{ transitionDelay: `${(i + 1) * 100}ms` }}
            >
              {item.label}
            </Link>
          ))}
          <div className={`mt-8 flex flex-col sm:flex-row gap-3 justify-center transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            <Link
              href="/book"
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 border border-white/15 text-zinc-200 px-6 py-3 rounded-full text-base font-medium hover:border-white/30 hover:bg-white/5 transition-all"
            >
              <CalendarDays className="w-4 h-4" />
              Book a Strategy Call
            </Link>
            <a
              href="/bill-debugger"
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 bg-[#002FA7] text-white px-6 py-3 rounded-full text-base font-medium hover:scale-105 transition-all"
            >
              <Activity className="w-4 h-4" />
              Review My Bill
            </a>
          </div>
        </div>
      </div>

      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:40px_40px] opacity-[0.03] pointer-events-none z-0" />

      <div className="pt-32 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="max-w-7xl mx-auto mb-12 border-b border-white/10 pb-8 mt-10 relative z-10"
        >
          <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">MARKET DATA</p>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 text-white">Live market data.</h1>
          <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed">
            See what ERCOT is doing right now, then decide whether the bill needs a closer look.
          </p>
        </motion.div>

        <section className="max-w-7xl mx-auto mb-14 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="p-8 md:p-10 rounded-[2.5rem] bg-gradient-to-br from-[#002FA7]/20 via-white/5 to-transparent border border-white/10 backdrop-blur-3xl overflow-hidden"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div>
                  <div className="text-[#002FA7] font-mono text-xs uppercase tracking-[0.3em] font-bold">Current snapshot</div>
                  <h2 className="text-3xl md:text-5xl font-bold tracking-tight mt-3">What the grid looks like now</h2>
                  <p className="text-zinc-400 mt-3 max-w-xl">
                    We use this to explain whether the current market looks calm, tight, or worth acting on.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Stress</div>
                  <div className={cn('text-2xl font-bold mt-1', stressLabel === 'Critical' ? 'text-rose-400' : stressLabel === 'Tight' ? 'text-amber-400' : 'text-emerald-400')}>
                    {stressLabel}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  Choose the utility zone you want to check
                </span>
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10 w-fit">
                  {ZONES.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setSelectedZone(key)}
                      className={cn(
                        'px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all',
                        selectedZone === key
                          ? 'bg-[#002FA7] text-white shadow-[0_0_20px_rgba(0,47,167,0.4)]'
                          : 'text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                <Metric label="Current price" value={currentPrice != null ? `$${currentPrice.toFixed(2)}` : '---'} />
                <Metric label="System load" value={load != null ? `${(load / 1000).toFixed(1)} GW` : '---'} />
                <Metric label="Operating reserves" value={reserves != null ? `${(reserves / 1000).toFixed(1)} GW` : '---'} />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="p-8 md:p-10 rounded-[2.5rem] bg-[#1A1A1A]/40 border border-white/10 backdrop-blur-3xl"
            >
              <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-4 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" />
                Why it matters
              </div>
              <div className="space-y-4">
                <PlainInsight
                  title="High demand can push prices up"
                  text="When load is heavy and reserves are thin, the market tends to get more expensive."
                />
                <PlainInsight
                  title="A small bill issue can add up"
                  text="Even a small mismatch in charges matters when it repeats every month."
                />
                <PlainInsight
                  title="The next step should be obvious"
                  text="If the numbers look off, the right move is usually to review the bill or book a briefing."
                />
              </div>
            </motion.div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto pb-20 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Callout
              number="01"
              title="Watch the zone"
              text="Pick the area that matches the bill so the numbers stay relevant."
            />
            <Callout
              number="02"
              title="Read the context"
              text="Load and reserves tell you whether the market is calm or under pressure."
            />
            <Callout
              number="03"
              title="Act on the bill"
              text="If the market and the bill point to a problem, review the bill first."
            />
          </div>
        </section>

        <section className="px-6 pb-32 max-w-5xl mx-auto">
          <div className="bg-zinc-900 rounded-3xl p-12 md:p-16 text-center relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#002FA7]/20 rounded-full blur-[100px] pointer-events-none" />
            <div className="relative z-10">
              <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">NEXT STEP</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-white mb-4 leading-[1.1]">
                See the bill clearly.
              </h2>
              <p className="text-zinc-400 text-lg mb-10 max-w-xl mx-auto font-light leading-relaxed">
                We use market data to explain the bill, not to bury you in charts.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="/bill-debugger"
                  className="inline-flex items-center gap-3 bg-white text-zinc-900 px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl"
                >
                  Review My Bill
                  <ArrowRight className="w-5 h-5" />
                </a>
                <Link
                  href="/book"
                  className="inline-flex items-center gap-3 border border-white/20 text-white px-8 py-4 rounded-full font-bold text-lg hover:border-white/40 transition-all"
                >
                  <CalendarDays className="w-5 h-5" />
                  Book a Strategy Call
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      <LandingFooter />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
      <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest mb-2">{label}</p>
      <p className="font-mono text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

function PlainInsight({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-5">
      <p className="text-lg font-semibold text-white mb-2">{title}</p>
      <p className="text-sm text-zinc-400 leading-relaxed">{text}</p>
    </div>
  )
}

function Callout({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="reveal-on-scroll border-l-2 border-[#002FA7]/20 pl-5 py-2 md:py-0">
      <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">{number}</p>
      <p className="text-xl font-semibold text-white mb-2">{title}</p>
      <p className="text-zinc-400 text-sm leading-relaxed">{text}</p>
    </div>
  )
}
