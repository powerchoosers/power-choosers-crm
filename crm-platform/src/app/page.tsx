'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Activity, ArrowRight, Layers, Menu, X, Users } from 'lucide-react'

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    // Animation Observer
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          
          // If it's the chart path, add the animate class
          const chartPath = entry.target.querySelector('.chart-path')
          if (chartPath) {
            chartPath.classList.add('animate')
          }
        }
      })
    }, {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px"
    })

    const elements = document.querySelectorAll('.reveal-on-scroll')
    elements.forEach((el) => observerRef.current?.observe(el))

    // Chart path specific observation
    const chartContainer = document.querySelector('.chart-path')?.closest('.reveal-on-scroll')
    if (chartContainer && observerRef.current) {
      observerRef.current.observe(chartContainer)
    }

    // Number counters
    const counters = document.querySelectorAll('.counter')
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
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
            
            // Ease out quart
            const ease = 1 - Math.pow(1 - progress, 4)
            
            const current = start + (target - start) * ease
            
            if (target % 1 === 0) {
              counter.innerText = `${prefix}${Math.round(current)}${suffix}`
            } else {
              counter.innerText = `${prefix}${current.toFixed(1)}${suffix}`
            }

            if (progress < 1) {
              requestAnimationFrame(updateCounter)
            } else {
               counter.innerText = `${prefix}${target}${suffix}`
            }
          }
          
          requestAnimationFrame(updateCounter)
          counterObserver.unobserve(counter)
        }
      })
    }, { threshold: 0.5 })

    counters.forEach(counter => counterObserver.observe(counter))

    return () => {
      observerRef.current?.disconnect()
      counterObserver.disconnect()
    }
  }, [])

  return (
    // Force light mode styles for the landing page to match original design
    <div className="bg-zinc-50 text-zinc-600 min-h-screen font-sans antialiased selection:bg-[#002FA7] selection:text-white overflow-x-hidden">
      
      {/* HEADER (Heads-Up Display) */}
      <header id="main-header" className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${isScrolled ? 'bg-white/80 backdrop-blur-xl h-16' : 'bg-transparent h-24'}`}>
        <div className="w-full px-8 h-full flex items-center justify-between">
          {/* 1. Identity */}
          <div className="z-50 flex items-center gap-2 cursor-pointer">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-10 w-auto" />
            <span className="font-bold text-xl tracking-tighter text-black">
              Nodal <span className="text-[#002FA7]">Point</span>
            </span>
          </div>
          {/* 2. The Action Cluster */}
          <div className="flex items-center gap-6">
            {/* The "Ghost" Link */}
            <Link href="/crm-platform"
              className="hidden md:block text-sm font-medium text-zinc-500 hover:text-black transition-colors">
              Sign In
            </Link>
            {/* The Primary Trigger */}
            <a href="/bill-debugger"
              className="hidden md:flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40">
              <Activity className="w-4 h-4" />
              <span>Run Analysis</span>
            </a>
            {/* The Hamburger */}
            <button 
                onClick={() => setIsMenuOpen(true)}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
            >
              <Menu className="w-6 h-6 text-black stroke-[1.5]" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. The Full Screen Menu Overlay */}
      <div 
        className={`fixed inset-0 z-50 bg-white/10 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Close Button */}
        <button 
            onClick={() => setIsMenuOpen(false)}
            className="absolute top-8 right-8 p-2 hover:bg-black/5 rounded-full"
        >
          <X className="w-8 h-8 text-black stroke-[1.5]" />
        </button>

        {/* Menu Content */}
        <div className="flex flex-col gap-8 text-center">
          {[
            { label: 'The Philosophy', href: '/philosophy' },
            { label: 'The Methodology', href: '/technical-docs' },
            { label: 'Market Data', href: '/market-data' },
            { label: 'Contact', href: '/contact' }
          ].map((item, i) => (
             <a key={item.label} href={item.href}
             className={`menu-item text-4xl md:text-5xl font-light tracking-tight text-black hover:text-[#002FA7] transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} delay-${(i + 1) * 100}`}>
             {item.label}
           </a>
          ))}

          {/* Mobile CTA inside menu */}
          <div className={`mt-8 md:hidden transition-all duration-500 delay-500 menu-item ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            <a href="/bill-debugger"
              className="flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-lg font-medium hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 inline-flex">
              <Activity className="w-5 h-5" />
              <span>Run Analysis</span>
            </a>
          </div>
        </div>
      </div>

      {/* ACT 1: THE HERO (The Hook) */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden pt-20 md:pt-32">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-5xl mx-auto text-center z-10"
        >
          <h1 className="text-5xl md:text-8xl font-semibold tracking-tighter leading-tight mb-8 text-zinc-900 break-words">
            The Texas Grid is<br />
            Designed to Confuse.
          </h1>
          <p className="text-xl md:text-2xl text-zinc-600 font-light tracking-tight mb-12 max-w-2xl mx-auto">
            We view complexity as a design flaw. We fixed it.
          </p>
          <div>
            <a href="/bill-debugger"
              className="animate-subtle-pulse inline-flex items-center gap-2 px-6 md:px-8 py-4 bg-[#002FA7] text-white rounded-full text-base md:text-lg font-medium hover:scale-105 hover:bg-blue-800 transition-all duration-300 shadow-lg shadow-blue-900/20 group whitespace-nowrap">
              <span>[ Debug My Bill ]</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </motion.div>

        {/* BACKGROUND TEXTURE: The "Digital Grain" */}
        <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" />
      </section>

      {/* ACT 2: THE REALITY (The Problem) */}
      <section className="bg-[#F5F5F7] flex items-center justify-center px-6 py-20">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

          {/* Text Content */}
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

          {/* Visual: Volatility Chart */}
          <div className="order-1 md:order-2 reveal-on-scroll delay-300">
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-zinc-200/50 aspect-video relative flex items-center justify-center overflow-hidden">
              <svg viewBox="0 0 400 225" className="w-full h-full text-[#002FA7]">
                {/* Grid Lines */}
                <line x1="0" y1="190" x2="400" y2="190" stroke="#e4e4e7" strokeWidth="1" />
                <line x1="0" y1="100" x2="400" y2="100" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="4 4" />

                {/* The "Spike" Line */}
                <path id="volatilityPath" className="chart-path"
                  d="M0,190 L30,190 C60,190 100,20 120,20 C140,20 150,190 180,190 C200,190 220,100 240,100 C260,100 270,190 300,190 L400,190"
                  fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

                {/* Labels */}
                <text x="390" y="175" textAnchor="end" className="text-[10px] fill-zinc-400 font-mono tracking-widest uppercase">Stability</text>
                <text x="120" y="15" textAnchor="middle" className="text-[10px] fill-red-500 font-mono tracking-widest uppercase">Volatility Spike</text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ACT 3: THE PHILOSOPHY (The Code) */}
      <section className="flex items-center justify-center px-6 py-24 bg-white">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

            {/* Value 1 */}
            <div className="reveal-on-scroll group">
              <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mb-6 text-zinc-900 group-hover:bg-[#002FA7] group-hover:text-white transition-colors duration-300">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight mb-4 text-zinc-900">Signal Over Noise</h3>
              <p className="text-zinc-500 leading-relaxed">
                We reject 99% of contracts to find the one true signal. We filter out the market hysteria to
                find the mathematical optimum.
              </p>
            </div>

            {/* Value 2 */}
            <div className="reveal-on-scroll delay-100 group">
              <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mb-6 text-zinc-900 group-hover:bg-[#002FA7] group-hover:text-white transition-colors duration-300">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight mb-4 text-zinc-900">Deep Simplicity</h3>
              <p className="text-zinc-500 leading-relaxed">
                We engineer the complexity out of the grid so you don&apos;t feel it. Your bill becomes a dashboard,
                not a puzzle.
              </p>
            </div>

            {/* Value 3 */}
            <div className="reveal-on-scroll delay-200 group">
              <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mb-6 text-zinc-900 group-hover:bg-[#002FA7] group-hover:text-white transition-colors duration-300">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight mb-4 text-zinc-900">Human Intersection</h3>
              <p className="text-zinc-500 leading-relaxed">
                Technology alone is not enough. We provide experts leading experts. Algorithms find the price;
                humans define the strategy.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ACT 4: THE PRODUCTS (The Tools) */}
      <section className="bg-[#F5F5F7] flex flex-col px-6 py-20 md:py-24 relative overflow-hidden">

        {/* Background Blobs for Glass Effect */}
        <div className="absolute top-1/2 left-1/4 w-[800px] h-[800px] bg-[#002FA7]/15 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-400/20 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto w-full z-10 relative">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-20 text-center reveal-on-scroll text-zinc-900">
            The Product Suite.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* Card 1 */}
            <div className="glass-card p-10 rounded-3xl reveal-on-scroll hover:shadow-2xl transition-shadow duration-300">
              <div className="text-xs font-mono text-[#002FA7] mb-4 tracking-widest uppercase">Diagnostic Tool</div>
              <h3 className="text-3xl font-semibold tracking-tight mb-4 text-zinc-900">True Cost Revealer</h3>
              <p className="text-zinc-500 mb-8">
                Exposing hidden TDU charges and &quot;pass-through&quot; leaks. We simulate your bill against 100+
                supplier tariffs.
              </p>
              <div className="w-full aspect-[4/3] mb-8 overflow-hidden rounded-xl border border-white/50">
                <img src="/images/prism.jpg" alt="True Cost Revealer Visualization" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Card 2 */}
            <div className="glass-card p-10 rounded-3xl reveal-on-scroll delay-100 hover:shadow-2xl transition-shadow duration-300">
              <div className="text-xs font-mono text-[#002FA7] mb-4 tracking-widest uppercase">Strategic Core</div>
              <h3 className="text-3xl font-semibold tracking-tight mb-4 text-zinc-900">Future-Proof Engine</h3>
              <p className="text-zinc-500 mb-8">
                The 2026 Market Navigator. We forecast capacity markets and hedge against regulatory shifts
                before they happen.
              </p>
              <div className="w-full aspect-[4/3] mb-8 overflow-hidden rounded-xl border border-white/50">
                <img src="/images/future-proof-engine.png" alt="Future-Proof Engine Visualization" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Card 3 */}
            <div className="glass-card p-10 rounded-3xl reveal-on-scroll delay-200 hover:shadow-2xl transition-shadow duration-300">
              <div className="text-xs font-mono text-[#002FA7] mb-4 tracking-widest uppercase">Management OS</div>
              <h3 className="text-3xl font-semibold tracking-tight mb-4 text-zinc-900">Energy Minimalism</h3>
              <p className="text-zinc-500 mb-8">
                Multi-site management unified into a single stream of truth. One dashboard. Zero noise.
              </p>
              <div className="w-full aspect-[4/3] mb-8 overflow-hidden rounded-xl border border-white/50">
                <img src="/images/energy-minimalism-v2.png" alt="Energy Minimalism Visualization" className="w-full h-full object-cover" />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 5: THE OUTPUT (The Proof) */}
      <section className="py-32 bg-[#F5F5F7] border-t border-black/5 relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">

            {/* Stat 1 */}
            <div className="p-8 rounded-3xl hover:bg-white/50 transition-colors duration-500 reveal-on-scroll flex flex-col items-center justify-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 drop-shadow-sm w-full text-center">
                <span className="counter" data-target="3.4" data-suffix="¢">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2 text-center">
                Avg. kWh reduction
              </div>
              <div className="text-zinc-700 font-medium text-center">
                We exploit the spread.
              </div>
            </div>

            {/* Stat 2 */}
            <div className="p-8 rounded-3xl hover:bg-white/50 transition-colors duration-500 reveal-on-scroll delay-100 flex flex-col items-center justify-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 drop-shadow-sm w-full text-center">
                <span className="counter" data-target="124" data-prefix="$" data-suffix="M">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2 text-center">
                Scarcity premiums removed
              </div>
              <div className="text-zinc-700 font-medium text-center">
                Volatility is optional.
              </div>
            </div>

            {/* Stat 3 */}
            <div className="p-8 rounded-3xl hover:bg-white/50 transition-colors duration-500 reveal-on-scroll delay-200 flex flex-col items-center justify-center">
              <div className="text-6xl md:text-8xl font-bold tracking-tighter text-[#002FA7] mb-4 drop-shadow-sm w-full text-center">
                <span className="counter" data-target="99.9" data-suffix="%">0</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 uppercase tracking-widest mb-2 text-center">
                Uptime & Accuracy
              </div>
              <div className="text-zinc-700 font-medium text-center">
                We measure everything.
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 6: FINAL CTA (The Impulse) */}
      <section className="py-40 bg-white flex flex-col items-center justify-center text-center relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-2xl px-6 reveal-on-scroll">
          <h2 className="text-5xl md:text-7xl font-bold tracking-tighter text-black mb-8 leading-[1.1]">
            Stop paying for the noise.
          </h2>
          <p className="text-xl text-zinc-700 font-medium mb-10 max-w-lg mx-auto">
            The market is complex. Your strategy should be simple.
            Upload your bill. See the signal.
          </p>

          <a href="/bill-debugger"
            className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-xl hover:shadow-2xl">
            <Activity className="w-5 h-5" />
            <span>Run Forensic Analysis</span>
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 px-6 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-8">
          <div className="bg-white p-3 rounded-3xl">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-12 w-auto" />
          </div>
          <p className="font-mono text-sm tracking-widest opacity-60">&copy; 2026 Nodal Point. All Systems Nominal.</p>
        </div>
      </footer>

    </div>
  )
}
