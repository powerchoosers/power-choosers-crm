'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { WhoWeServeSection } from '@/components/landing/WhoWeServeSection'

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
              ERCOT scarcity charges, delivery fees, and supplier contract language make the true cost hard to see.
              The cheapest-looking rate is not always the cheapest result.
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
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">PROCESS</p>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-900">Review. Compare. Negotiate.</h2>
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
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">SHARE</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">Upload a bill, current contract, or supplier quote.</p>
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
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">We separate supply, delivery, and contract risk.</p>
            </div>

            {/* Step 03 */}
            <div className="reveal-on-scroll delay-200 border-l-2 border-[#002FA7]/20 pl-5 py-2 md:border-l-0 md:pl-0 md:py-0">
              <div className="flex items-center mb-6">
                <span className="font-mono text-3xl font-bold text-[#002FA7] shrink-0">03</span>
                <div className="hidden md:block ml-4 flex-1 h-px bg-zinc-200 relative overflow-hidden">
                  <div className="signal-connector-dot" style={{ animationDelay: '8s' }} />
                </div>
              </div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">NEGOTIATE</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">We bring back the best option and handle the paperwork.</p>
            </div>
          </div>
        </div>
      </section>

      <WhoWeServeSection compact />

      {/* FINAL CTA */}
      <section className="py-32 bg-[#F5F5F7] border-t border-zinc-100 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl px-6 mx-auto text-center reveal-on-scroll">
          <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">NEXT STEP</p>
          <h2 className="text-5xl md:text-7xl font-bold tracking-tighter text-black mb-8 leading-[1.1]">
            Ready to compare supplier options?
          </h2>
          <p className="text-xl text-zinc-700 font-medium mb-10 max-w-lg mx-auto">
            Upload a bill or supplier offer. We&apos;ll show the issue, the fit, and the next move.
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
              <span>Book a Strategy Call</span>
            </Link>
          </div>
        </div>
      </section>


      <LandingFooter />
    </>
  )
}
