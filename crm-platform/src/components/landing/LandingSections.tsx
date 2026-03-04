'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Activity, Layers, Users, ArrowRight } from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'

export function LandingSections() {
  const observerRef = useRef<IntersectionObserver | null>(null)

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

  return (
    <>
      {/* ACT 2: THE REALITY (The Problem) */}
      <section className="bg-[#F5F5F7] flex items-center justify-center px-6 py-20">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-6 reveal-on-scroll text-zinc-900">
              Complexity is a Tax.
            </h2>
            <p className="text-lg text-zinc-700 leading-relaxed mb-8 reveal-on-scroll delay-100">
              ERCOT scarcity adders, 4CP peaks, and volatility are features of the market design, not bugs.
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
              </svg>
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
                <div className="hidden md:block ml-4 flex-1 h-px bg-zinc-200" />
              </div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">SUBMIT</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">Upload your energy bill or PDF. Takes 30 seconds.</p>
            </div>

            {/* Step 02 */}
            <div className="reveal-on-scroll delay-100 border-l-2 border-[#002FA7]/20 pl-5 py-2 md:border-l-0 md:pl-0 md:py-0 mb-8 md:mb-0">
              <div className="flex items-center mb-6">
                <span className="font-mono text-3xl font-bold text-[#002FA7] shrink-0">02</span>
                <div className="hidden md:block ml-4 flex-1 h-px bg-zinc-200" />
              </div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">ISOLATE</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">Cost leakage isolated from supplier markup.</p>
            </div>

            {/* Step 03 */}
            <div className="reveal-on-scroll delay-200 border-l-2 border-[#002FA7]/20 pl-5 py-2 md:border-l-0 md:pl-0 md:py-0">
              <div className="flex items-center mb-6">
                <span className="font-mono text-3xl font-bold text-[#002FA7] shrink-0">03</span>
                <div className="hidden md:block ml-4 flex-1 h-px bg-zinc-200" />
              </div>
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em] font-bold mb-3">SIGNAL</p>
              <p className="text-zinc-600 text-sm leading-relaxed font-medium">Forensic report delivered. No noise.</p>
            </div>

          </div>

        </div>
      </section>

      {/* ACT 3: THE PHILOSOPHY (The Code) */}
      <section className="flex items-center justify-center px-6 py-24 bg-[#F5F5F7]">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="reveal-on-scroll group">
              <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mb-6 text-zinc-900 group-hover:bg-[#002FA7] group-hover:text-white transition-colors duration-300">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight mb-4 text-zinc-900">Signal Over Noise</h3>
              <p className="text-zinc-500 leading-relaxed">
                We reject 99% of contracts to find the one true signal. We filter out the market hysteria to find the mathematical optimum.
              </p>
            </div>
            <div className="reveal-on-scroll delay-100 group">
              <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mb-6 text-zinc-900 group-hover:bg-[#002FA7] group-hover:text-white transition-colors duration-300">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight mb-4 text-zinc-900">Deep Simplicity</h3>
              <p className="text-zinc-500 leading-relaxed">
                We engineer the complexity out of the grid so you don&apos;t feel it. Your bill becomes a dashboard, not a puzzle.
              </p>
            </div>
            <div className="reveal-on-scroll delay-200 group">
              <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mb-6 text-zinc-900 group-hover:bg-[#002FA7] group-hover:text-white transition-colors duration-300">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight mb-4 text-zinc-900">Human Intersection</h3>
              <p className="text-zinc-500 leading-relaxed">
                Technology alone is not enough. We provide experts leading experts. Algorithms find the price; humans define the strategy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ACT 4: THE PRODUCTS (The Tools) */}
      <section className="bg-[#F5F5F7] flex flex-col px-6 py-20 md:py-24 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/4 w-[800px] h-[800px] bg-[#002FA7]/15 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-400/20 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3 pointer-events-none" />
        <div className="max-w-7xl mx-auto w-full z-10 relative">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-20 text-center reveal-on-scroll text-zinc-900">
            The Product Suite.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card p-10 rounded-3xl reveal-on-scroll hover:shadow-2xl transition-shadow duration-300">
              <div className="text-xs font-mono text-[#002FA7] mb-4 tracking-widest uppercase">Diagnostic Tool</div>
              <h3 className="text-3xl font-semibold tracking-tight mb-4 text-zinc-900">True Cost Revealer</h3>
              <p className="text-zinc-500 mb-8">
                Exposing hidden TDU charges and &quot;pass-through&quot; leaks. We simulate your bill against 100+ supplier tariffs.
              </p>
              <div className="w-full mb-6 overflow-hidden rounded-xl border border-white/50">
                <Image src="/images/graph-scattered.jpg" alt="True Cost Revealer Visualization" width={400} height={225} className="w-full h-auto" />
              </div>
              <div className="pt-5 border-t border-zinc-200/60">
                <Link href="/bill-debugger" className="inline-flex items-center gap-2 text-[#002FA7] font-mono text-[10px] uppercase tracking-widest hover:gap-3 transition-all duration-200">
                  Run Analysis <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            <div className="glass-card p-10 rounded-3xl reveal-on-scroll delay-100 hover:shadow-2xl transition-shadow duration-300">
              <div className="text-xs font-mono text-[#002FA7] mb-4 tracking-widest uppercase">Strategic Core</div>
              <h3 className="text-3xl font-semibold tracking-tight mb-4 text-zinc-900">Future-Proof Engine</h3>
              <p className="text-zinc-500 mb-8">
                The 2026 Market Navigator. We forecast capacity markets and hedge against regulatory shifts before they happen.
              </p>
              <div className="w-full mb-6 overflow-hidden rounded-xl border border-white/50">
                <Image src="/images/line-graph.jpg" alt="Future-Proof Engine Visualization" width={400} height={225} className="w-full h-auto" />
              </div>
              <div className="pt-5 border-t border-zinc-200/60">
                <Link href="/market-outlook" className="inline-flex items-center gap-2 text-[#002FA7] font-mono text-[10px] uppercase tracking-widest hover:gap-3 transition-all duration-200">
                  View Market Outlook <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            <div className="glass-card p-10 rounded-3xl reveal-on-scroll delay-200 hover:shadow-2xl transition-shadow duration-300">
              <div className="text-xs font-mono text-[#002FA7] mb-4 tracking-widest uppercase">Management OS</div>
              <h3 className="text-3xl font-semibold tracking-tight mb-4 text-zinc-900">Energy Minimalism</h3>
              <p className="text-zinc-500 mb-8">
                Multi-site management unified into a single stream of truth. One dashboard. Zero noise.
              </p>
              <div className="w-full mb-6 overflow-hidden rounded-xl border border-white/50">
                <Image src="/images/centralization.jpg" alt="Energy Minimalism Visualization" width={400} height={225} className="w-full h-auto" />
              </div>
              <div className="pt-5 border-t border-zinc-200/60">
                <Link href="/book" className="inline-flex items-center gap-2 text-[#002FA7] font-mono text-[10px] uppercase tracking-widest hover:gap-3 transition-all duration-200">
                  Book a Briefing <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: THE OUTPUT (The Proof) */}
      <section className="py-32 bg-[#F5F5F7] border-t border-black/5 relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="p-8 rounded-3xl hover:bg-white/50 transition-colors duration-500 reveal-on-scroll flex flex-col items-center justify-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 drop-shadow-sm w-full text-center">
                <span className="counter" data-target="3.4" data-suffix="¢">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2 text-center">Avg. kWh reduction</div>
              <div className="text-zinc-700 font-medium text-center">We exploit the spread.</div>
            </div>
            <div className="p-8 rounded-3xl hover:bg-white/50 transition-colors duration-500 reveal-on-scroll delay-100 flex flex-col items-center justify-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 drop-shadow-sm w-full text-center">
                <span className="counter" data-target="124" data-prefix="$" data-suffix="M">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2 text-center">Scarcity premiums removed</div>
              <div className="text-zinc-700 font-medium text-center">Volatility is optional.</div>
            </div>
            <div className="p-8 rounded-3xl hover:bg-white/50 transition-colors duration-500 reveal-on-scroll delay-200 flex flex-col items-center justify-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 drop-shadow-sm w-full text-center">
                <span className="counter" data-target="99.9" data-suffix="%">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2 text-center">Uptime & Accuracy</div>
              <div className="text-zinc-700 font-medium text-center">We measure everything.</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white px-6 py-24 border-t border-zinc-100">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 reveal-on-scroll">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">FAQ</p>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-900">Common questions.</h2>
          </div>
          <div className="divide-y divide-zinc-100">

            <div className="py-8 grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 reveal-on-scroll">
              <p className="font-semibold text-zinc-900 text-lg tracking-tight leading-snug">
                What is a demand charge — and why do most businesses miss it?
              </p>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Demand charges are billed on your single highest 15-minute peak in the month — not your total usage. A 3-second spike can inflate your bill by 30–40%. Most businesses never see it because it's buried in delivery line items. We surface it immediately.
              </p>
            </div>

            <div className="py-8 grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 reveal-on-scroll">
              <p className="font-semibold text-zinc-900 text-lg tracking-tight leading-snug">
                What if I'm already locked into a contract?
              </p>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Most contracts have renegotiation windows or switch clauses the supplier won't volunteer. We identify them. Even mid-contract, we find recoverable margin — on the delivery side, the demand structure, or the rate class.
              </p>
            </div>

            <div className="py-8 grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 reveal-on-scroll">
              <p className="font-semibold text-zinc-900 text-lg tracking-tight leading-snug">
                How long does the analysis take?
              </p>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Upload your bill. Forensic report in under 60 seconds. No forms, no intake calls, no waiting. The signal is either there or it isn't — we tell you immediately.
              </p>
            </div>

            <div className="py-8 grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 reveal-on-scroll">
              <p className="font-semibold text-zinc-900 text-lg tracking-tight leading-snug">
                Do you cover all Texas suppliers?
              </p>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Yes. We've mapped 100+ ERCOT supplier tariff structures across all load zones. TXU, Reliant, Direct Energy, Constellation, and all major REPs operating in the South, Houston, North, and West zones.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 6: FINAL CTA (The Impulse) */}
      <section className="py-40 bg-white flex flex-col items-center justify-center text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl px-6 reveal-on-scroll">
          <h2 className="text-5xl md:text-7xl font-bold tracking-tighter text-black mb-8 leading-[1.1]">
            Stop paying for the noise.
          </h2>
          <p className="text-xl text-zinc-700 font-medium mb-10 max-w-lg mx-auto">
            The market is complex. Your strategy should be simple. Upload your bill. See the signal.
          </p>
          <a
            href="/bill-debugger"
            className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-xl hover:shadow-2xl"
          >
            <Activity className="w-5 h-5" />
            <span>Run Forensic Analysis</span>
          </a>
        </div>
      </section>

      <LandingFooter />
    </>
  )
}
