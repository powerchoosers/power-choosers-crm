'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowRight } from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'

const TICKER_ITEMS = [
  { label: 'ONCOR', sub: 'TDSP' },
  { label: 'CENTERPOINT', sub: 'TDSP' },
  { label: 'AEP TEXAS', sub: 'TDSP' },
  { label: 'TNMP', sub: 'TDSP' },
  { label: 'LUBBOCK LIGHT & POWER', sub: 'TDSP' },
  { label: 'TXU ENERGY', sub: 'REP' },
  { label: 'RELIANT', sub: 'REP' },
  { label: 'CONSTELLATION', sub: 'REP' },
  { label: 'DIRECT ENERGY', sub: 'REP' },
  { label: 'NRG', sub: 'REP' },
  { label: 'CHAMPION ENERGY', sub: 'REP' },
  { label: 'CIRRO ENERGY', sub: 'REP' },
  { label: 'GREEN MOUNTAIN', sub: 'REP' },
  { label: '100+ TARIFF STRUCTURES', sub: 'MAPPED' },
  { label: 'DEMAND RATCHET', sub: 'DECODED' },
  { label: 'SCARCITY ADDER', sub: 'TRACKED' },
  { label: 'PEAK DEMAND RISK', sub: 'TRACKED' },
]

const REPORT_SUMMARY = [
  { label: 'Annual spend', value: '$84,620', note: 'sample bill' },
  { label: 'Contract end', value: 'Nov 23, 2026', note: 'notice window' },
  { label: 'Delivery cost', value: '38%', note: 'structure' },
  { label: 'Supply rate', value: '8.6¢', note: 'market' },
]

const REPORT_FINDINGS = [
  { label: 'Proposed delivery', value: '$1,280', detail: '17% above baseline' },
  { label: 'Cycle phase', value: 'Q4 2026', detail: 'Renegotiate before notice date' },
  { label: 'Termination date', value: 'Nov 23, 2026', detail: 'Renegotiate before leverage fades' },
  { label: 'Peak demand risk', value: 'Medium', detail: 'Peak demand review needed' },
  { label: 'Demand ratchet', value: '80% FLOOR', detail: 'Minimum billing penalty active' },
]

const REPORT_META = ['Sample bill', 'March billing cycle', 'Texas / ERCOT', '1-page readout']

const BILL_OWNER_ROLES = ['Controller', 'CFO', 'Facilities', 'COO']

const REPORT_MEETING_ITEMS = [
  {
    label: 'Confirms the number',
    detail: 'The owner sees the same signal you see, with no back-and-forth.',
  },
  {
    label: 'Opens the services conversation',
    detail: 'The call shifts from explaining the bill to talking scope and fit.',
  },
  {
    label: 'Moves to the next step',
    detail: 'Proposal, renewal, or follow-up gets booked while the room is warm.',
  },
]

export function LandingSections() {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            const chartPath = entry.target.querySelector('.chart-path')
            if (chartPath) chartPath.classList.add('animate')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )
    const elements = document.querySelectorAll('.reveal-on-scroll')
    elements.forEach((el) => observerRef.current?.observe(el))
    const chartContainer = document.querySelector('.chart-path')?.closest('.reveal-on-scroll')
    if (chartContainer && observerRef.current) observerRef.current.observe(chartContainer)

    const counters = document.querySelectorAll('.counter')
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const counter = entry.target as HTMLElement
          const target = parseFloat(counter.getAttribute('data-target') || '0')
          const prefix = counter.getAttribute('data-prefix') || ''
          const suffix = counter.getAttribute('data-suffix') || ''
          const start = 0
          const duration = 2000
          const startTime = performance.now()
          const updateCounter = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const ease = 1 - (1 - progress) ** 4
            const current = start + (target - start) * ease
            counter.innerText =
              target % 1 === 0
                ? `${prefix}${Math.round(current)}${suffix}`
                : `${prefix}${current.toFixed(1)}${suffix}`
            if (progress < 1) requestAnimationFrame(updateCounter)
            else counter.innerText = `${prefix}${target}${suffix}`
          }
          requestAnimationFrame(updateCounter)
          counterObserver.unobserve(counter)
        })
      },
      { threshold: 0.5 }
    )
    counters.forEach((c) => counterObserver.observe(c))
    return () => {
      observerRef.current?.disconnect()
      counterObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setScrollY(window.scrollY || 0)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Live ERCOT price — fetch + animate on scroll into view
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [displayPrice, setDisplayPrice] = useState(0)
  const livePriceRef = useRef<HTMLDivElement>(null)
  const priceAnimatedRef = useRef(false)

  useEffect(() => {
    let mounted = true
    fetch('/api/market/ercot?type=prices')
      .then(r => r.ok ? r.json() : null)
      .then(data => { const p = data?.prices?.south; if (p != null && mounted) setLivePrice(p) })
      .catch(() => { })
      return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (livePrice == null || priceAnimatedRef.current) return
    const el = livePriceRef.current
    if (!el) return
    let cancelled = false
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !priceAnimatedRef.current) {
        priceAnimatedRef.current = true
        const start = performance.now()
        const animate = (now: number) => {
          if (cancelled) return
          const progress = Math.min((now - start) / 2000, 1)
          const ease = 1 - (1 - progress) ** 4
          setDisplayPrice(livePrice * ease)
          if (progress < 1) requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)
        obs.disconnect()
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => { cancelled = true; obs.disconnect() }
  }, [livePrice])

  const tickerParallax = Math.max(-36, Math.min(36, scrollY * 0.04))
  const tickerItemsLoop = [...TICKER_ITEMS, ...TICKER_ITEMS]

  return (
    <>
      {/* INTELLIGENCE COVERAGE TICKER */}
      <div className="bg-white border-y border-zinc-100 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6 pt-4 pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <div className="flex items-start gap-4 min-w-0 md:flex-1 md:pr-6">
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.38em] mb-1">
                  Market Map
                </p>
                <p className="text-sm text-zinc-700 leading-snug max-w-3xl">
                  TDSPs handle delivery. REPs set supply. That split is where most of the bill complexity hides.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end md:shrink-0 md:pl-2">
              <span className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 whitespace-nowrap">
                TDSP = delivery
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#002FA7]/10 text-[#002FA7] whitespace-nowrap">
                REP = supply
              </span>
            </div>
          </div>
        </div>

        <div className="relative border-t border-zinc-100 py-5 overflow-hidden">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

          <div
            className="will-change-transform"
            style={{ transform: `translate3d(${tickerParallax}px, 0, 0)` }}
          >
            <div className="flex gap-0 w-max" style={{ animation: 'ticker-scroll 72s linear infinite' }}>
              {tickerItemsLoop.map((item, i) => (
                <div key={`primary-${i}`} className="flex items-center shrink-0">
                  <div className="flex items-baseline gap-1.5 px-6 py-1 rounded-lg ticker-chip">
                    <span className="font-mono text-[11px] font-semibold text-zinc-800 tracking-widest uppercase whitespace-nowrap">
                      {item.label}
                    </span>
                    <span className="font-mono text-[9px] text-[#002FA7] tracking-widest uppercase whitespace-nowrap">
                      {item.sub}
                    </span>
                  </div>
                  <span className="text-zinc-200 text-xs select-none">·</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ACT 2: THE REALITY (The Problem) */}
      <section className="bg-[#F5F5F7] flex items-center justify-center px-6 py-20">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-6 reveal-on-scroll text-zinc-900">
              Complexity is a Tax.
            </h2>
            <p className="text-lg text-zinc-700 leading-relaxed mb-8 reveal-on-scroll delay-100">
              ERCOT scarcity charges, peak demand spikes, and volatility are features of the market design, not bugs.
              Suppliers bury these in &quot;pass-through&quot; fees.
            </p>
            <p className="text-xl font-medium text-zinc-900 reveal-on-scroll delay-200 border-l-2 border-[#002FA7] pl-4">
              You are paying for the noise.
            </p>
          </div>
          <div className="order-1 md:order-2 reveal-on-scroll delay-300">
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-200/50 aspect-video relative flex items-center justify-center overflow-hidden">
              <svg viewBox="0 0 400 225" className="w-full h-full text-[#002FA7]">
                <line x1="0" y1="190" x2="400" y2="190" stroke="#e4e4e7" strokeWidth="1" />
                <line x1="0" y1="100" x2="400" y2="100" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="4 4" />
                <path
                  id="volatilityPath"
                  className="chart-path"
                  d="M0,190 L30,190 C60,190 100,20 120,20 C140,20 150,190 180,190 C200,190 220,100 240,100 C260,100 270,190 300,190 L400,190"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text x="390" y="175" textAnchor="end" className="text-[10px] fill-zinc-400 font-mono tracking-widest uppercase">Stability</text>
                <text x="120" y="15" textAnchor="middle" className="text-[10px] fill-red-500 font-mono tracking-widest uppercase">Volatility Spike</text>
                {/* Live cursor dot — breathes after path draws */}
                <circle
                  className="chart-cursor-dot"
                  cx="395"
                  cy="190"
                  r="3.5"
                  fill="#002FA7"
                  style={{ filter: 'drop-shadow(0 0 5px rgba(0,47,167,0.9))' }}
                />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* WHY IT MATTERS */}
      <section className="py-24 bg-[#F5F5F7] border-t border-zinc-100 relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="max-w-4xl mb-14 reveal-on-scroll">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">WHY IT MATTERS</p>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-900">The numbers get expensive fast.</h2>
            <p className="text-lg text-zinc-600 leading-relaxed mt-5 max-w-2xl">
              In Texas commercial energy, small leaks do not stay small. One bad read on the bill becomes real money.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-10 md:justify-items-center">
            <div className="reveal-on-scroll flex flex-col items-center text-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 font-mono tabular-nums">
                $<span className="counter metric-counter" data-target="25" data-suffix="B+">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2">
                Texas commercial energy spend
              </div>
              <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
                Annually · Source: EIA
              </div>
            </div>

            <div ref={livePriceRef} className="reveal-on-scroll delay-100 flex flex-col items-center text-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 font-mono tabular-nums">
                ${livePrice == null ? (
                  <span className="animate-pulse text-zinc-300">--</span>
                ) : (
                  <span className="metric-live-value">{displayPrice.toFixed(2)}</span>
                )}
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2">
                ERCOT LZ_South spot price
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
                  Live signal · /MWh
                </div>
              </div>
            </div>

            <div className="reveal-on-scroll delay-200 flex flex-col items-center text-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 font-mono tabular-nums">
                <span className="counter metric-counter" data-target="40" data-suffix="%">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2">
                Of your bill that isn't usage
              </div>
              <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
                Demand charges · buried in delivery
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FORENSIC PROTOCOL: HOW IT WORKS */}
      <section className="bg-white flex items-center justify-center px-6 py-24 border-t border-zinc-100">
        <div className="max-w-5xl w-full mx-auto">

          {/* Header */}
          <div className="mb-16 reveal-on-scroll">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">FORENSIC_PROTOCOL</p>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-900">Three steps. No noise.</h2>
          </div>

          {/* Steps — number + connector + content unified per column */}
          <div className="grid grid-cols-1 md:grid-cols-3 md:gap-8">

            {/* Step 01 */}
            <div className="reveal-on-scroll border-l-2 border-[#002FA7]/20 pl-5 py-2 md:border-l-0 md:pl-0 md:py-0 mb-8 md:mb-0">
              <div className="flex items-center mb-6">
                <span className="font-mono text-3xl font-bold text-[#002FA7] shrink-0">01</span>
                <div className="hidden md:block ml-4 flex-1 h-px bg-zinc-200 relative overflow-hidden">
                  <div className="signal-connector-dot" style={{ animationDelay: '0s' }} />
                </div>
              </div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">SUBMIT</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">Upload your bill or PDF. Takes 30 seconds.</p>
            </div>

            {/* Step 02 */}
            <div className="reveal-on-scroll delay-100 border-l-2 border-[#002FA7]/20 pl-5 py-2 md:border-l-0 md:pl-0 md:py-0 mb-8 md:mb-0">
              <div className="flex items-center mb-6">
                <span className="font-mono text-3xl font-bold text-[#002FA7] shrink-0">02</span>
                <div className="hidden md:block ml-4 flex-1 h-px bg-zinc-200 relative overflow-hidden">
                  <div className="signal-connector-dot" style={{ animationDelay: '4s' }} />
                </div>
              </div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">ISOLATE</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">We separate delivery, supply, and contract risk.</p>
            </div>

            {/* Step 03 */}
            <div className="reveal-on-scroll delay-200 border-l-2 border-[#002FA7]/20 pl-5 py-2 md:border-l-0 md:pl-0 md:py-0">
              <div className="flex items-center mb-6">
                <span className="font-mono text-3xl font-bold text-[#002FA7] shrink-0">03</span>
                <div className="hidden md:block ml-4 flex-1 h-px bg-zinc-200 relative overflow-hidden">
                  <div className="signal-connector-dot" style={{ animationDelay: '8s' }} />
                </div>
              </div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">SIGNAL</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">You get a clear report and a next move.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="relative isolate overflow-hidden bg-[#FCFCFD] px-6 py-24 border-t border-zinc-100">
        <div aria-hidden className="absolute inset-0 bg-white/90 pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-2xl mb-14 reveal-on-scroll">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">PROOF</p>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-900">What the first report proves.</h2>
            <p className="text-lg text-zinc-600 leading-relaxed mt-5">
              Not another dashboard. A one-page readout the people who own the bill can scan in seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-start">
            <div className="reveal-on-scroll">
              <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_30px_70px_-40px_rgba(0,0,0,0.35)]">
                <div className="border-b border-zinc-100 bg-[linear-gradient(180deg,#ffffff,#fafafa)] px-6 py-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.32em] mb-1">Sample report</p>
                    <h3 className="text-2xl font-semibold tracking-tight text-zinc-900">Electricity Bill Readout</h3>
                    <p className="text-sm text-zinc-500 mt-1">For controllers, CFOs, facilities managers, and COOs</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {REPORT_META.map((item) => (
                        <span
                          key={item}
                          className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-white border border-zinc-100 text-zinc-500 whitespace-nowrap"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-[#002FA7]/20 bg-[#002FA7]/10 px-4 py-3 text-right shadow-sm">
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#002FA7]">Status</p>
                    <p className="text-lg font-semibold text-[#002FA7] mt-1">2 risks flagged</p>
                    <p className="text-xs text-[#002FA7]/70 mt-1">delivery and contract</p>
                  </div>
                </div>

                <div className="grid gap-4 bg-[linear-gradient(180deg,#ffffff,#fbfbfd)] p-5 md:p-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="h-full">
                    <div className="h-full rounded-[1.5rem] border border-[#002FA7]/12 bg-[#002FA7]/5 p-5 md:p-6 shadow-[0_12px_28px_-24px_rgba(0,47,167,0.35)] flex flex-col">
                      <div className="flex flex-col gap-6">
                        <div className="max-w-sm">
                          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">Annual spend</p>
                          <p className="mt-3 text-4xl md:text-[3.5rem] font-semibold tracking-tight text-zinc-900 font-mono">$84,620</p>
                          <p className="mt-2 text-sm text-zinc-600">The yearly bill tied to the current structure. Built for a fast executive read.</p>
                        </div>
                        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
                          <p className="mt-2 text-base md:text-lg font-semibold text-zinc-900 leading-tight">Cycle phase and term alert</p>
                          <p className="mt-1 text-xs text-zinc-500">2 data points need review</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {REPORT_SUMMARY.slice(1).map((item) => (
                          <div
                            key={item.label}
                            className={`rounded-xl border border-white/70 bg-white/80 px-4 py-3.5 flex flex-col justify-start ${
                              item.label === 'Contract end' ? 'sm:col-span-2' : ''
                            }`}
                          >
                            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-400 leading-none">
                              {item.label}
                            </p>
                            <p className="mt-2.5 text-[1.55rem] font-semibold leading-none tracking-tight text-zinc-900 whitespace-nowrap font-mono">
                              {item.value}
                            </p>
                            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[#002FA7] leading-none">
                              {item.note}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-400">Renewal / Delivery / Supply</p>
                          </div>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-100">
                          <div className="flex h-full w-full">
                            <div className="h-full w-[38%] bg-[#002FA7]" />
                            <div className="h-full w-[57%] bg-[#002FA7]/55" />
                            <div className="h-full w-[5%] bg-[#002FA7]/20" />
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                          <div><span className="block text-sm font-semibold tracking-tight text-zinc-900 font-mono">38%</span>DELIVERY</div>
                          <div><span className="block text-sm font-semibold tracking-tight text-zinc-900 font-mono">57%</span>SUPPLY</div>
                          <div><span className="block text-sm font-semibold tracking-tight text-zinc-900 font-mono">5%</span>TAX/FEES</div>
                        </div>
                      </div>

                    </div>
                  </div>

                  <div className="h-full">
                    <div className="h-full rounded-[1.5rem] border border-[#002FA7]/15 bg-[#002FA7]/5 p-5 md:p-6 shadow-[0_12px_28px_-24px_rgba(0,47,167,0.25)] flex flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">Recommended next move</p>
                        <span className="shrink-0 rounded-full border border-[#002FA7]/10 bg-white/80 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">
                          Priority
                        </span>
                      </div>
                      <p className="mt-3 text-[1.7rem] font-semibold tracking-tight text-zinc-900 leading-[1.05]">
                        Mitigate delivery charges
                      </p>
                      <p className="mt-1 text-[15px] font-normal leading-6 tracking-normal text-zinc-600">
                        Check them before the renewal window closes.
                      </p>
                      <div className="mt-5 rounded-2xl border border-white/70 bg-white/75 relative p-4 shadow-sm overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#002FA7]" />
                        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#002FA7] mb-1.5 pl-1.5">The Objective</p>
                        <p className="text-sm font-medium leading-relaxed text-zinc-900 pl-1.5">
                          Use the meeting to confirm the number and decide the next move.
                        </p>
                      </div>
                      <div className="mt-5 space-y-2 flex-1">
                        {REPORT_FINDINGS.map((item) => (
                          <div key={item.label} className="rounded-xl border border-white/70 bg-white/75 p-3">
                            <div className="flex items-center justify-between gap-4">
                              <p className="text-sm font-semibold text-zinc-900 whitespace-nowrap">{item.label}</p>
                              <p className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-[#002FA7] whitespace-nowrap text-right">{item.value}</p>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-500 pr-4">{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-100 bg-[#F8F8FA] px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-zinc-900">Primary Takeaway</p>
                  <Link href="/bill-debugger" className="inline-flex items-center gap-2 font-bold font-mono text-[10px] text-[#002FA7] uppercase tracking-widest hover:gap-3 transition-all duration-200">
                    Review my bill <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="reveal-on-scroll delay-100 pt-2">
              <div className="space-y-5">
                <div className="border-l-2 border-[#002FA7]/20 pl-4">
                  <p className="font-semibold text-zinc-900 text-base">Delivery charges separated</p>
                  <p className="text-zinc-500 text-sm leading-relaxed mt-1">
                    The bill stops reading like a wall of line items and starts reading like a cost story.
                  </p>
                </div>
                <div className="border-l-2 border-[#002FA7]/20 pl-4">
                  <p className="font-semibold text-zinc-900 text-base">Supplier pricing mapped</p>
                  <p className="text-zinc-500 text-sm leading-relaxed mt-1">
                    We line up the tariff structure against what you are actually being charged.
                  </p>
                </div>
                <div className="border-l-2 border-[#002FA7]/20 pl-4">
                  <p className="font-semibold text-zinc-900 text-base">Contract risk flagged</p>
                  <p className="text-zinc-500 text-sm leading-relaxed mt-1">
                    You see the issue before the money goes out.
                  </p>
                </div>
              </div>

              <div className="mt-10 space-y-8">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#002FA7]">Built for bill owners</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BILL_OWNER_ROLES.map((role) => (
                      <span key={role} className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 whitespace-nowrap">
                        {role}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-600">
                    If you approve the spend, explain the number, or sign the renewal, this report gives you the next move in plain English.
                  </p>
                </div>

                <div className="h-px w-full bg-zinc-100" />

                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#002FA7]">What it removes</p>
                  <div className="mt-4 space-y-3">
                    {['Line-item hunting', 'Supplier back-and-forth', 'A meeting to explain the bill'].map((item) => (
                      <div key={item} className="flex items-center gap-3 text-sm text-zinc-700">
                        <span className="font-mono text-zinc-400">—</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="h-px w-full bg-zinc-100" />

                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#002FA7]">What the meeting does</p>
                  <div className="mt-4 space-y-4">
                    {REPORT_MEETING_ITEMS.map((item) => (
                      <div key={item.label}>
                        <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-500">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="h-px w-full bg-zinc-100" />

                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#002FA7]">The Forensic Standard</p>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-600 italic border-l border-zinc-200 pl-4">
                    "Precision over presentation. We map 100+ retail tariff structures and real-time ERCOT telemetry to expose structural cost leakage. No opinions—just the math."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 bg-[#F5F5F7] border-t border-zinc-100 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl px-6 mx-auto text-center reveal-on-scroll">
          <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">FINAL STEP</p>
          <h2 className="text-5xl md:text-7xl font-bold tracking-tighter text-black mb-8 leading-[1.1]">
            Ready to see the bill clearly?
          </h2>
          <p className="text-xl text-zinc-700 font-medium mb-10 max-w-lg mx-auto">
            Upload your bill. We&apos;ll show the signal, the risk, and the next move.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/bill-debugger"
              className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-xl hover:shadow-2xl"
            >
              <Activity className="w-5 h-5" />
              <span>Review my bill</span>
            </a>
            <Link
              href="/book"
              className="inline-flex items-center gap-2 px-6 md:px-8 py-4 border border-zinc-400 bg-white/70 text-zinc-700 rounded-full text-base md:text-lg font-medium hover:border-zinc-900 hover:text-zinc-900 hover:bg-white transition-all duration-300 whitespace-nowrap shadow-sm"
            >
              <span>Book a Briefing</span>
            </Link>
          </div>
        </div>
      </section>


      <LandingFooter />
    </>
  )
}
