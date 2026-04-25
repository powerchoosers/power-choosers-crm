'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, ArrowRight, CalendarDays, Clock, Menu, TrendingUp, X } from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { useMarketPulse } from '@/hooks/useMarketPulse'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

type LoadZone = 'houston' | 'north' | 'south' | 'west'

type MarketPulseData = {
  prices?: Partial<Record<LoadZone, number>> & {
    hub_avg?: number
    south?: number
  }
  grid?: {
    reserves?: number
    actual_load?: number
    wind_gen?: number
    pv_gen?: number
  }
}

type BriefingSection = {
  title: string
  content: string
}

type MarketBriefing = {
  id: string
  headline: string
  summary: string
  sections: BriefingSection[]
  generated_at: string
}

const ZONES: { key: LoadZone; label: string }[] = [
  { key: 'north', label: 'North (DFW)' },
  { key: 'houston', label: 'Houston' },
  { key: 'south', label: 'South' },
  { key: 'west', label: 'West' },
]

const MENU_ITEMS = [
  { label: 'Forensic Review', href: '/forensic-review' },
  { label: 'Who We Serve', href: '/who-we-serve' },
  { label: 'Market Intelligence', href: '/market-data' },
  { label: 'Contact', href: '/contact' },
] as const

// ── ERCOT Benchmark Thresholds ──
// Based on real ERCOT operating data:
// Prices: Normal $20-60/MWh, Elevated $60-150, High $150-300, Extreme $300+
// System Load: Winter 30-50 GW, Shoulder 35-55 GW, Summer 50-75 GW, Record ~85 GW
// Reserves: Comfortable >7 GW, Adequate 4.5-7 GW, Tight 2.5-4.5 GW, Critical <2.5 GW

function getPriceContext(price: number | null): { label: string; color: string; pct: number; description: string } {
  if (price == null) return { label: 'Unavailable', color: 'bg-zinc-600', pct: 0, description: 'Price data not available' }
  if (price <= 30) return { label: 'Low', color: 'bg-emerald-500', pct: 15, description: 'Below average — good conditions for variable-rate customers' }
  if (price <= 60) return { label: 'Normal', color: 'bg-emerald-400', pct: 30, description: 'Typical wholesale range — no unusual market pressure' }
  if (price <= 100) return { label: 'Elevated', color: 'bg-amber-400', pct: 50, description: 'Above average — demand is pushing prices up' }
  if (price <= 200) return { label: 'High', color: 'bg-orange-500', pct: 70, description: 'Significantly above normal — grid is under pressure' }
  if (price <= 500) return { label: 'Very High', color: 'bg-red-500', pct: 85, description: 'Well above normal — typically caused by low reserves or extreme demand' }
  return { label: 'Extreme', color: 'bg-red-600', pct: 98, description: 'Near or at price cap — emergency grid conditions' }
}

function getLoadContext(loadMW: number | null): { label: string; color: string; pct: number; description: string } {
  if (loadMW == null) return { label: 'Unavailable', color: 'bg-zinc-600', pct: 0, description: 'Load data not available' }
  const loadGW = loadMW / 1000
  if (loadGW <= 35) return { label: 'Light', color: 'bg-emerald-500', pct: 20, description: 'Low demand — overnight or mild weather conditions' }
  if (loadGW <= 50) return { label: 'Moderate', color: 'bg-emerald-400', pct: 40, description: 'Normal business-hours demand — nothing unusual' }
  if (loadGW <= 60) return { label: 'Active', color: 'bg-amber-400', pct: 55, description: 'Above-average demand — likely a warm afternoon' }
  if (loadGW <= 70) return { label: 'Heavy', color: 'bg-orange-500', pct: 72, description: 'High demand — air conditioning is driving the grid hard' }
  if (loadGW <= 80) return { label: 'Very Heavy', color: 'bg-red-500', pct: 88, description: 'Near-peak demand — approaching record territory' }
  return { label: 'Record Territory', color: 'bg-red-600', pct: 98, description: 'At or near all-time demand records — grid under maximum stress' }
}

function getReservesContext(reservesMW: number | null): { label: string; color: string; pct: number; description: string } {
  if (reservesMW == null) return { label: 'Unavailable', color: 'bg-zinc-600', pct: 0, description: 'Reserve data not available' }
  const reservesGW = reservesMW / 1000
  // Reserves gauge is INVERTED — lower is worse
  if (reservesGW >= 10) return { label: 'Comfortable', color: 'bg-emerald-500', pct: 90, description: 'Plenty of spare capacity — the grid has a large safety buffer' }
  if (reservesGW >= 7) return { label: 'Adequate', color: 'bg-emerald-400', pct: 70, description: 'Healthy buffer — no immediate concerns' }
  if (reservesGW >= 4.5) return { label: 'Moderate', color: 'bg-amber-400', pct: 50, description: 'Buffer is shrinking — conditions could tighten if demand rises' }
  if (reservesGW >= 3) return { label: 'Tight', color: 'bg-orange-500', pct: 30, description: 'Low safety margin — prices tend to spike in this range' }
  if (reservesGW >= 2) return { label: 'Very Tight', color: 'bg-red-500', pct: 15, description: 'Dangerously low — grid operator may issue conservation alerts' }
  return { label: 'Critical', color: 'bg-red-600', pct: 5, description: 'Emergency territory — rolling outages become possible' }
}

export default function MarketData() {
  const [selectedZone, setSelectedZone] = useState<LoadZone>('north')
  const { data: marketData, isLoading, isError } = useMarketPulse()
  const [briefing, setBriefing] = useState<MarketBriefing | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Fetch latest briefing from Supabase
  useEffect(() => {
    async function fetchBriefing() {
      try {
        const { data, error } = await supabase
          .from('market_briefings')
          .select('id, headline, summary, sections, generated_at')
          .order('generated_at', { ascending: false })
          .limit(1)
          .single()

        if (!error && data) {
          setBriefing(data as MarketBriefing)
        }
      } catch {
        // Briefing is optional enrichment
      } finally {
        setBriefingLoading(false)
      }
    }
    fetchBriefing()
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

  const priceCtx = getPriceContext(currentPrice)
  const loadCtx = getLoadContext(load)
  const reservesCtx = getReservesContext(reserves)

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#002FA7] selection:text-white">
      <header
        id="main-header"
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled ? 'bg-[#0a0a0a]/80 backdrop-blur-xl h-16 shadow-sm border-b border-white/5' : 'bg-transparent h-24'
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
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsMenuOpen(false)
        }}
      >
        <button onClick={() => setIsMenuOpen(false)} className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full">
          <X className="w-8 h-8 text-white" />
        </button>
        <div className="flex flex-col gap-8 text-center pointer-events-auto">
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
          <div className={`mt-8 flex flex-col sm:flex-row gap-3 justify-center transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`} style={{ transitionDelay: '500ms' }}>
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
          <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">MARKET INTELLIGENCE</p>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 text-white">What the grid looks like right now.</h1>
          <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed">
            Live ERCOT data translated into plain English. See whether the market is calm, tight, or worth acting on.
          </p>
        </motion.div>

        <section className="max-w-7xl mx-auto mb-14 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="p-8 md:p-10 rounded-[2.5rem] bg-zinc-950/80 border border-white/10 backdrop-blur-xl overflow-hidden"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div>
                  <div className="text-[#002FA7] font-mono text-xs uppercase tracking-[0.3em] font-bold">Current snapshot</div>
                  <h2 className="text-3xl md:text-5xl font-bold tracking-tight mt-3">Grid conditions</h2>
                  <p className="text-zinc-400 mt-3 max-w-xl">
                    These three numbers tell you whether electricity is cheap or expensive right now, and why.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Grid stress</div>
                  <div className={cn('text-2xl font-bold mt-1', stressLabel === 'Critical' ? 'text-rose-400' : stressLabel === 'Tight' ? 'text-amber-400' : 'text-emerald-400')}>
                    {stressLabel}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  Choose your area to see local pricing
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

              <div className="grid grid-cols-1 gap-5 mt-8">
                <MetricGauge
                  label="Wholesale electricity price"
                  value={currentPrice != null ? `$${currentPrice.toFixed(2)}/MWh` : '---'}
                  context={priceCtx}
                  explainer="This is what electricity costs on the open market right now. Your retail rate is based on this plus delivery charges and margins."
                />
                <MetricGauge
                  label="Total grid demand"
                  value={load != null ? `${(load / 1000).toFixed(1)} GW` : '---'}
                  context={loadCtx}
                  explainer="How much electricity Texas is using right now. Higher demand means less spare capacity and higher prices."
                />
                <MetricGauge
                  label="Safety buffer (reserves)"
                  value={reserves != null ? `${(reserves / 1000).toFixed(1)} GW` : '---'}
                  context={reservesCtx}
                  explainer="Spare generating capacity available. Below 3 GW, prices tend to spike. Below 2 GW, conservation alerts may be issued."
                  inverted
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="p-8 md:p-10 rounded-[2.5rem] bg-zinc-950/60 border border-white/10 backdrop-blur-xl"
            >
              <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-4 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" />
                Why it matters
              </div>
              <div className="space-y-4">
                <PlainInsight
                  title="What these numbers mean for you"
                  text={`Right now the grid is ${stressLabel === 'Stable' ? 'running smoothly with plenty of spare capacity' : stressLabel === 'Tight' ? 'under pressure — reserves are low enough that prices tend to rise' : stressLabel === 'Critical' ? 'in a danger zone — prices are likely spiking and conservation may be requested' : 'being measured'}. ${currentPrice != null ? (currentPrice > 100 ? 'Wholesale prices are above normal, which means variable-rate customers are paying more than usual right now.' : currentPrice > 60 ? 'Prices are slightly elevated but still within a manageable range.' : 'Prices are in normal territory — no unusual market pressure.') : ''}`}
                />
                <PlainInsight
                  title="Fixed vs. variable rate"
                  text="If you're on a fixed rate, these numbers don't change your monthly bill — but they tell you whether it's a good time to renew. If you're on a variable or indexed plan, today's market conditions are directly affecting what you pay."
                />
                <PlainInsight
                  title="What you can do about it"
                  text="If the numbers look high, the right move is usually to review your current bill and contract structure. A fixed rate during expensive months prevents surprises. A poorly timed renewal during a calm market could mean locking in a good deal."
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── MARKET BRIEFING ── */}
        <section className="max-w-7xl mx-auto mb-14 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="rounded-[2.5rem] bg-zinc-950/60 border border-white/10 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-8 md:px-10 pt-8 md:pt-10 pb-4">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    Market Overview
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                    {briefingLoading ? (
                      <span className="inline-block w-80 h-8 bg-zinc-800 rounded-lg animate-pulse" />
                    ) : briefing ? (
                      briefing.headline
                    ) : (
                      'Market overview coming soon'
                    )}
                  </h2>
                </div>
                {briefing && (
                  <div className="hidden md:flex items-center gap-2 text-zinc-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-mono text-[10px] uppercase tracking-widest">
                      {new Date(briefing.generated_at).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'America/Chicago',
                      })} CT
                    </span>
                  </div>
                )}
              </div>

              {briefingLoading ? (
                <div className="space-y-4 pb-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="w-48 h-4 bg-zinc-800 rounded animate-pulse" />
                      <div className="w-full h-3 bg-zinc-800/60 rounded animate-pulse" />
                      <div className="w-5/6 h-3 bg-zinc-800/60 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : briefing ? (
                <div className="space-y-0 divide-y divide-white/5">
                  {briefing.summary && (
                    <p className="text-base text-zinc-300 leading-relaxed pb-6">
                      {briefing.summary}
                    </p>
                  )}
                  {briefing.sections.map((section, i) => (
                    <div key={i} className="py-6">
                      <h3 className="text-lg font-semibold text-white mb-3">{section.title}</h3>
                      <div className="text-sm text-zinc-400 leading-7 whitespace-pre-line">
                        {section.content}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm pb-6">
                  The market overview is generated twice daily. Check back soon for the latest analysis.
                </p>
              )}
            </div>
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto pb-20 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Callout
              number="01"
              title="Pick your area"
              text="Different zones in Texas have different prices. Choose the area closest to your business to see what's relevant."
            />
            <Callout
              number="02"
              title="Read the gauges"
              text="Green means calm. Yellow means watch it. Red means the grid is under pressure and prices are likely high."
            />
            <Callout
              number="03"
              title="Act on what you see"
              text="If conditions look expensive, review your bill and contract. If they look calm, it might be the right time to lock in a new rate."
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
                Market data tells you what electricity costs. A bill review tells you whether you&apos;re paying more than you should.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="/bill-debugger"
                  className="inline-flex items-center gap-3 bg-white text-zinc-900 px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl"
                >
                  <Activity className="w-5 h-5" />
                  Review My Bill
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

// ── Components ──

function MetricGauge({
  label,
  value,
  context,
  explainer,
  inverted = false,
}: {
  label: string
  value: string
  context: { label: string; color: string; pct: number; description: string }
  explainer: string
  inverted?: boolean
}) {
  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-5 hover:border-white/10 transition-all duration-300">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="font-mono text-3xl font-bold text-white">{value}</p>
        </div>
        <span className={cn(
          'px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest',
          context.label === 'Low' || context.label === 'Light' || context.label === 'Comfortable' || context.label === 'Adequate'
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
            : context.label === 'Normal' || context.label === 'Moderate'
            ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/20'
            : context.label === 'Elevated' || context.label === 'Active'
            ? 'bg-amber-400/15 text-amber-400 border border-amber-400/20'
            : context.label === 'High' || context.label === 'Heavy' || context.label === 'Tight'
            ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
            : context.label === 'Unavailable'
            ? 'bg-zinc-700/30 text-zinc-500 border border-zinc-600/20'
            : 'bg-red-500/15 text-red-400 border border-red-500/20'
        )}>
          {context.label}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${context.pct}%` }}
          transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1], delay: 0.3 }}
          className={cn('h-full rounded-full', context.color)}
        />
        {/* Threshold markers for reserves */}
        {inverted && (
          <>
            {/* 3 GW danger line (~20% of 15GW max) */}
            <div className="absolute top-0 bottom-0 left-[20%] w-px bg-red-500/40" title="3 GW — price spike zone" />
            {/* 4.5 GW caution line (~30%) */}
            <div className="absolute top-0 bottom-0 left-[30%] w-px bg-amber-500/30" title="4.5 GW — caution zone" />
          </>
        )}
      </div>

      {/* Context description */}
      <p className="text-xs text-zinc-400 leading-5">{context.description}</p>
      <p className="text-[11px] text-zinc-600 leading-5 mt-1">{explainer}</p>
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
