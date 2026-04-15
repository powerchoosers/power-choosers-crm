'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, Building2, Factory, Warehouse } from 'lucide-react'
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

/* ──────────────────────────────────────────────
   FORENSIC CASE ARCHIVE — three industry cases
   ────────────────────────────────────────────── */

interface CaseData {
  id: string
  icon: typeof Warehouse
  tabLabel: string
  tabSub: string
  title: string
  subtitle: string
  status: string
  statusNote: string
  summary: { label: string; value: string; note: string }[]
  findings: { label: string; value: string; detail: string }[]
  narrative: string
  narrativeDetail: string
  meta: string[]
  billTitle: string
  billSubtitle: string
  billTotal: string
  billHeaderBars: number[]
  billQuickStats: { label: string; value: string }[]
  billLineItems: { label: string; detail: string; amount: string }[]
  billLineTotal: string
  supplyPct: number
  deliveryPct: number
  otherPct: number
  consultantNote: {
    heading: string
    body: string
    action: string
  }
  roles: string[]
}

const CASES: CaseData[] = [
  {
    id: 'logistics',
    icon: Warehouse,
    tabLabel: 'Logistics Warehouse',
    tabSub: 'Delivery + demand exposure',
    title: 'Anonymized logistics warehouse',
    subtitle: 'A real bill review showing what the customer actually pays for.',
    status: 'Issue found',
    statusNote: 'Delivery + demand',
    summary: [
      { label: 'Current bill', value: '$3,735.44', note: 'anonymized logistics warehouse' },
      { label: 'Usage', value: '20,250 kWh', note: 'one billing period' },
      { label: 'Demand', value: '120 / 125 kW', note: 'actual / billed' },
      { label: 'Power factor', value: '91.6%', note: 'below 95% line' },
    ],
    findings: [
      { label: 'Main issue', value: 'Delivery + demand', detail: 'Not the supply price' },
      { label: 'Supply share', value: '48.8%', detail: 'fixed-price energy' },
      { label: 'Delivery share', value: '49.5%', detail: 'utility side' },
      { label: 'Demand gap', value: '5 kW', detail: '125 billed vs 120 current' },
    ],
    narrative: 'Delivery and demand are the bill levers.',
    narrativeDetail: 'The fixed-price supply side is stable. The account is paying more because delivery charges are almost as large as supply, billed demand is above the current peak, and power factor sits below 95%.',
    meta: ['Anonymized logistics account', 'Real bill', 'Texas / Oncor', 'Actual review'],
    billTitle: 'Logistics warehouse',
    billSubtitle: 'Sensitive header details are hidden. Line items stay visible.',
    billTotal: '$3,735.44',
    billHeaderBars: [66, 44],
    billQuickStats: [
      { label: 'Usage', value: '20,250 kWh' },
      { label: 'Demand', value: '120 / 125 kW' },
      { label: 'Power factor', value: '91.6%' },
    ],
    billLineItems: [
      { label: 'Base usage', detail: '20,250 kWh @ $0.0808412', amount: '$1,637.03' },
      { label: 'Distribution system charge', detail: '125 kW billed', amount: '$767.64' },
      { label: 'Transmission recovery factor', detail: '125 kW billed', amount: '$639.37' },
    ],
    billLineTotal: '$3,044.04',
    supplyPct: 48.8,
    deliveryPct: 49.5,
    otherPct: 1.7,
    consultantNote: {
      heading: 'Demand ratchet lock-in detected',
      body: 'Billed demand of 125 kW exceeds actual metered peak by 5 kW. This 80% ratchet floor has been setting the billing baseline for at least 4 months. Power factor at 91.6% triggers an additional penalty multiplier on delivery. Combined, these two mechanical issues add an estimated $180–220/month in avoidable charges — independent of the energy rate.',
      action: 'Recommend capacitor bank evaluation + demand response window analysis before next contract renewal.',
    },
    roles: ['Controller', 'CFO', 'Facilities', 'COO'],
  },
  {
    id: 'manufacturing',
    icon: Factory,
    tabLabel: 'Manufacturing Plant',
    tabSub: 'Demand ratchet exposure',
    title: 'Anonymized manufacturing facility',
    subtitle: 'A real bill review from a high-demand industrial account.',
    status: 'Critical finding',
    statusNote: 'Demand ratchet',
    summary: [
      { label: 'Current bill', value: '$18,442.17', note: 'anonymized manufacturing plant' },
      { label: 'Usage', value: '112,600 kWh', note: 'one billing period' },
      { label: 'Demand', value: '340 / 425 kW', note: 'actual / billed' },
      { label: 'Load factor', value: '36.4%', note: 'well below optimal' },
    ],
    findings: [
      { label: 'Main issue', value: 'Demand ratchet', detail: '85 kW phantom billing' },
      { label: 'Supply share', value: '42.1%', detail: 'index-plus energy' },
      { label: 'Delivery share', value: '54.7%', detail: 'utility + transmission' },
      { label: 'Ratchet gap', value: '85 kW', detail: '425 billed vs 340 actual' },
    ],
    narrative: 'The ratchet is the bill. Not the energy rate.',
    narrativeDetail: 'A single summer peak of 425 kW set the billing floor 8 months ago. The facility now runs at 340 kW but pays for 425 kW every month — an 80% demand ratchet built into the tariff. This adds roughly $1,400/month in structural overpayment that no rate negotiation can fix.',
    meta: ['Anonymized manufacturer', 'Real bill', 'Texas / CenterPoint', 'Actual review'],
    billTitle: 'Manufacturing facility',
    billSubtitle: 'Account identifiers redacted. Demand and usage line items intact.',
    billTotal: '$18,442.17',
    billHeaderBars: [72, 50],
    billQuickStats: [
      { label: 'Usage', value: '112,600 kWh' },
      { label: 'Demand', value: '340 / 425 kW' },
      { label: 'Load factor', value: '36.4%' },
    ],
    billLineItems: [
      { label: 'Energy charge', detail: '112,600 kWh @ $0.0689', amount: '$7,758.14' },
      { label: 'Demand charge — distribution', detail: '425 kW billed (ratchet)', amount: '$4,462.50' },
      { label: 'Transmission cost recovery', detail: '425 kW × 4CP allocator', amount: '$3,718.25' },
    ],
    billLineTotal: '$15,938.89',
    supplyPct: 42.1,
    deliveryPct: 54.7,
    otherPct: 3.2,
    consultantNote: {
      heading: '4CP coincident peak liability active',
      body: 'This facility\'s 425 kW summer peak coincided with at least one ERCOT 4CP interval last August. That single hour locked in a transmission cost allocation for the entire subsequent year. Current load factor of 36.4% indicates highly peaky operations — the facility pays for capacity it uses only briefly. The 85 kW ratchet gap represents ~$16,800/year in structural billing that persists regardless of rate.',
      action: 'Recommend 4CP curtailment protocol + load shifting analysis for June–September peak windows.',
    },
    roles: ['CFO', 'VP Operations', 'Plant Manager', 'Procurement'],
  },
  {
    id: 'commercial-re',
    icon: Building2,
    tabLabel: 'Commercial Office',
    tabSub: 'Pass-through fee exposure',
    title: 'Anonymized commercial office building',
    subtitle: 'A real bill review from a multi-tenant Class A office property.',
    status: 'Issue found',
    statusNote: 'Pass-through fees',
    summary: [
      { label: 'Current bill', value: '$8,917.63', note: 'anonymized office building' },
      { label: 'Usage', value: '54,300 kWh', note: 'one billing period' },
      { label: 'Demand', value: '195 / 210 kW', note: 'actual / billed' },
      { label: 'TDU charges', value: '$4,814.22', note: '54% of total bill' },
    ],
    findings: [
      { label: 'Main issue', value: 'Pass-through fees', detail: 'Hidden in contract' },
      { label: 'Supply share', value: '38.6%', detail: 'fixed-rate contract' },
      { label: 'Delivery share', value: '54.0%', detail: 'TDU + ancillary' },
      { label: 'Hidden fees', value: '$612.40', detail: 'ancillary + admin markup' },
    ],
    narrative: 'The "fixed rate" covers less than 39% of the bill.',
    narrativeDetail: 'The property manager locked in a competitive supply rate, but 54% of the invoice is TDU delivery charges that pass through unexamined. An additional $612 in ancillary service charges and REP admin fees are buried in contract pass-through language. The tenant reimbursement model amplifies this — every hidden dollar gets billed through to occupants.',
    meta: ['Anonymized office bldg', 'Real bill', 'Texas / Oncor', 'Actual review'],
    billTitle: 'Class A office building',
    billSubtitle: 'Tenant and management company details redacted.',
    billTotal: '$8,917.63',
    billHeaderBars: [58, 38],
    billQuickStats: [
      { label: 'Usage', value: '54,300 kWh' },
      { label: 'Demand', value: '195 / 210 kW' },
      { label: 'TDU total', value: '$4,814.22' },
    ],
    billLineItems: [
      { label: 'Energy charge', detail: '54,300 kWh @ $0.0633', amount: '$3,437.19' },
      { label: 'TDU delivery charges', detail: '210 kW billed demand', amount: '$3,412.80' },
      { label: 'Ancillary services + admin', detail: 'contract pass-through', amount: '$612.40' },
    ],
    billLineTotal: '$7,462.39',
    supplyPct: 38.6,
    deliveryPct: 54.0,
    otherPct: 7.4,
    consultantNote: {
      heading: 'Contract pass-through clause obscuring true cost',
      body: 'The REP contract contains a blanket pass-through clause covering "all ERCOT-related charges" without itemized disclosure. This allows $612.40/month in ancillary services and administrative fees to flow through without scrutiny. The property manager\'s fixed rate of $0.0633/kWh creates an illusion of cost control while 54% of the bill sits outside that rate entirely. For multi-tenant billing, this means occupants inherit delivery cost risk they can\'t see.',
      action: 'Recommend contract audit for pass-through specificity + TDU charge benchmarking against tariff schedule.',
    },
    roles: ['Property Manager', 'CFO', 'Asset Manager', 'Controller'],
  },
]

const BILL_OWNER_ROLES = ['Controller', 'CFO', 'Facilities', 'COO']

export function LandingSections() {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const [scrollY, setScrollY] = useState(0)
  const [activeCase, setActiveCase] = useState(0)

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
                  Live ERCOT price · /MWh
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
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">HOW_IT_WORKS</p>
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
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">UPLOAD</p>
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
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">COMPARE</p>
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
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">DECIDE</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">You get a clear report and a next move.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FORENSIC CASE ARCHIVE */}
      <section className="relative isolate overflow-hidden bg-[#FCFCFD] px-6 py-16 border-t border-zinc-100">
        <div aria-hidden className="absolute inset-0 bg-white/90 pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10">

          {/* Header */}
          <div className="max-w-3xl mb-10 reveal-on-scroll">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">FORENSIC CASE ARCHIVE</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter text-zinc-900">Real reviews. Real bills. Three verticals.</h2>
            <p className="text-base md:text-lg text-zinc-600 leading-relaxed mt-3">
              Every case below is an anonymized review from a live Texas commercial bill. Company names are hidden. The numbers — and the findings — are real.
            </p>
          </div>

          {/* Case Selector Tabs */}
          <div className="flex flex-col sm:flex-row gap-3 mb-10 reveal-on-scroll">
            {CASES.map((c, i) => {
              const Icon = c.icon
              const isActive = activeCase === i
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCase(i)}
                  className={`group flex items-center gap-3 px-5 py-3.5 rounded-2xl border transition-all duration-300 text-left flex-1 ${
                    isActive
                      ? 'border-[#002FA7]/30 bg-[#002FA7]/[0.04] shadow-sm'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                    isActive ? 'bg-[#002FA7]/10 text-[#002FA7]' : 'bg-zinc-100 text-zinc-400 group-hover:text-zinc-600'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold transition-colors duration-300 ${isActive ? 'text-zinc-900' : 'text-zinc-600'}`}>
                      {c.tabLabel}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-400 mt-0.5">{c.tabSub}</p>
                  </div>
                  {isActive && (
                    <div className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-[#002FA7]" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Active Case Content */}
          {(() => {
            const c = CASES[activeCase]
            return (
              <div key={c.id} className="grid grid-cols-1 lg:grid-cols-[1.12fr_0.88fr] gap-6 items-start animate-in fade-in duration-300">

                {/* LEFT: Report Card */}
                <div>
                  <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_30px_70px_-40px_rgba(0,0,0,0.35)]">
                    <div className="border-b border-zinc-100 bg-[linear-gradient(180deg,#ffffff,#fafafa)] px-5 py-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.32em] mb-1">Case file</p>
                        <h3 className="text-2xl font-semibold tracking-tight text-zinc-900">{c.title}</h3>
                        <p className="text-sm text-zinc-500 mt-1">{c.subtitle}</p>
                      </div>
                      <div className="shrink-0 rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-right shadow-sm">
                        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-400">Status</p>
                        <p className="text-base font-semibold text-zinc-900 mt-1">{c.status}</p>
                        <p className="text-[11px] text-zinc-500 mt-1">{c.statusNote}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 bg-[linear-gradient(180deg,#ffffff,#fbfbfd)] p-4 md:p-5 xl:grid-cols-[1.02fr_0.98fr]">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          {c.summary.map((item) => (
                            <div key={item.label} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                              <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">{item.label}</p>
                              <p className="mt-2 text-base md:text-lg font-semibold tracking-tight text-zinc-900">{item.value}</p>
                              <p className="mt-1 text-xs text-zinc-500">{item.note}</p>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
                          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">What the review found</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {c.findings.map((item) => (
                              <div key={item.label} className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                                <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">{item.label}</p>
                                <p className="mt-2 text-sm font-semibold text-zinc-900">{item.value}</p>
                                <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {/* Why it matters */}
                        <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-4">
                          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">Why it matters</p>
                          <p className="mt-2 text-lg md:text-xl font-semibold tracking-tight text-zinc-900 leading-[1.1]">
                            {c.narrative}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-zinc-600">
                            {c.narrativeDetail}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {c.roles.map((role) => (
                              <span key={role} className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 whitespace-nowrap">
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Consultant's Note */}
                        <div className="rounded-[1.5rem] border border-[#002FA7]/15 bg-[#002FA7]/[0.03] p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#002FA7]" />
                            <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">Consultant&apos;s note</p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-900 leading-snug">{c.consultantNote.heading}</p>
                          <p className="mt-2 text-[13px] leading-[1.6] text-zinc-600 font-mono">{c.consultantNote.body}</p>
                          <div className="mt-3 pt-3 border-t border-[#002FA7]/10">
                            <p className="text-[11px] text-[#002FA7] font-semibold uppercase tracking-widest">Recommended action</p>
                            <p className="mt-1 text-[13px] leading-relaxed text-zinc-700">{c.consultantNote.action}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 bg-[#F8F8FA] px-5 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-zinc-900">
                        Case {String(activeCase + 1).padStart(2, '0')} of {String(CASES.length).padStart(2, '0')}
                      </p>
                      <Link href="/bill-debugger" className="inline-flex items-center gap-2 font-bold font-mono text-[10px] text-[#002FA7] uppercase tracking-widest hover:gap-3 transition-all duration-200">
                        Review My Bill <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* RIGHT: Anonymized Source Bill */}
                <div className="pt-2 h-full flex flex-col">
                  <div className="flex flex-wrap justify-center gap-2 mb-4 text-center">
                    {c.meta.map((item) => (
                      <span key={item} className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500 whitespace-nowrap">
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_30px_70px_-40px_rgba(0,0,0,0.35)] flex-1 flex flex-col">
                    <div className="border-b border-zinc-100 bg-[linear-gradient(180deg,#ffffff,#fafafa)] px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.32em] mb-1">Anonymized source bill</p>
                          <h3 className="text-xl font-semibold tracking-tight text-zinc-900">{c.billTitle}</h3>
                          <p className="text-sm text-zinc-500 mt-1">{c.billSubtitle}</p>
                          <div className="mt-3 space-y-2">
                            {c.billHeaderBars.map((width, index) => (
                              <div
                                key={`redaction-${index}`}
                                className="h-3 rounded-full bg-zinc-200/80"
                                style={{ width: `${width}%` }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-right shadow-sm">
                          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-400">Current charges</p>
                          <p className="text-base font-semibold text-zinc-900 mt-1">{c.billTotal}</p>
                          <p className="text-[11px] text-zinc-500 mt-1">Invoice total</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {c.billQuickStats.map((item) => (
                          <div key={item.label} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2.5">
                            <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">{item.label}</p>
                            <p className="mt-2 text-sm font-semibold text-zinc-900">{item.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="h-3 rounded-full bg-zinc-200/80 overflow-hidden flex">
                          <div className="h-full bg-[#002FA7]" style={{ width: `${c.supplyPct}%` }} />
                          <div className="h-full bg-zinc-900/70" style={{ width: `${c.deliveryPct}%` }} />
                          <div className="h-full bg-zinc-300" style={{ width: `${c.otherPct}%` }} />
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                          <span>Supply {c.supplyPct}%</span>
                          <span>Delivery {c.deliveryPct}%</span>
                          <span>Other {c.otherPct}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[linear-gradient(180deg,#ffffff,#fbfbfd)] p-4 flex-1 flex flex-col gap-4">
                      <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">Top line items</p>
                          <p className="text-sm font-semibold text-zinc-900">{c.billLineTotal}</p>
                        </div>

                        <div className="mt-3 space-y-2">
                          {c.billLineItems.map((row) => (
                            <div key={row.label} className="flex items-start justify-between gap-4 border-b border-zinc-200/70 pb-2 last:border-0 last:pb-0">
                              <div>
                                <p className="text-sm font-medium text-zinc-900">{row.label}</p>
                                <p className="text-[11px] text-zinc-500 mt-0.5">{row.detail}</p>
                              </div>
                              <p className="text-sm font-semibold text-zinc-900 whitespace-nowrap">{row.amount}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[1.25rem] border border-[#002FA7]/15 bg-[#002FA7]/5 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">Current charges</p>
                          <p className="text-xl font-semibold tracking-tight text-zinc-900">{c.billTotal}</p>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                          The client sees the total and the main drivers without reading the full invoice.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

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
            Upload your bill. We&apos;ll show the issue, the risk, and the next move.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/bill-debugger"
              className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-xl hover:shadow-2xl"
            >
              <Activity className="w-5 h-5" />
              <span>Review My Bill</span>
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
