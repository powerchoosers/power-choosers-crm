'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Menu, X, Activity, ArrowRight, FileText, ShieldAlert, Zap, Cpu } from 'lucide-react'

export default function TechnicalDocs() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('abstract')

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0px -50% 0px' }
    )

    const sections = document.querySelectorAll('section[id]')
    sections.forEach((section) => observer.observe(section))

    return () => sections.forEach((section) => observer.unobserve(section))
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-zinc-900 font-sans selection:bg-[#002FA7] selection:text-white overflow-x-hidden">
      
      {/* HEADER (Heads-Up Display) - Consistent with other pages */}
      <header id="main-header" className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-white/80 backdrop-blur-xl h-16 shadow-sm' : 'bg-transparent h-20 md:h-24'}`}>
        <div className="w-full px-4 md:px-8 h-full flex items-center justify-between">
          {/* 1. Identity */}
          <Link href="/" className="z-50 flex items-center gap-2 cursor-pointer">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-10 w-auto" />
            <span className="font-bold text-xl tracking-tighter text-black">
              Nodal <span className="text-[#002FA7]">Point</span>
            </span>
          </Link>
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

      {/* Full Screen Menu Overlay */}
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

      {/* BACKGROUND TEXTURE: The "Digital Grain" */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" />

      <main className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:grid md:grid-cols-12 gap-8 md:gap-12 pt-32 md:pt-40 relative z-10 w-full">
        {/* Sidebar Navigation (Desktop) */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="hidden md:block col-span-3 sticky top-40 self-start space-y-8"
        >
          <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-6">Documentation</h4>
          <ul className="space-y-4 text-sm font-medium text-zinc-600">
            <li 
              onClick={() => scrollToSection('abstract')} 
              className={`pl-4 cursor-pointer border-l-2 transition-all ${activeSection === 'abstract' ? 'text-[#002FA7] border-[#002FA7]' : 'hover:text-black border-transparent hover:border-zinc-300'}`}
            >
              1.0 System Architecture
            </li>
            <li 
              onClick={() => scrollToSection('ratchet')} 
              className={`pl-4 cursor-pointer border-l-2 transition-all ${activeSection === 'ratchet' ? 'text-[#002FA7] border-[#002FA7]' : 'hover:text-black border-transparent hover:border-zinc-300'}`}
            >
              2.0 The Ratchet Vulnerability
            </li>
            <li 
              onClick={() => scrollToSection('4cp')} 
              className={`pl-4 cursor-pointer border-l-2 transition-all ${activeSection === '4cp' ? 'text-[#002FA7] border-[#002FA7]' : 'hover:text-black border-transparent hover:border-zinc-300'}`}
            >
              3.0 4CP Mitigation
            </li>
            <li 
              onClick={() => scrollToSection('algorithm')} 
              className={`pl-4 cursor-pointer border-l-2 transition-all ${activeSection === 'algorithm' ? 'text-[#002FA7] border-[#002FA7]' : 'hover:text-black border-transparent hover:border-zinc-300'}`}
            >
              4.0 Ingestion Protocol
            </li>
          </ul>
        </motion.div>

        {/* MAIN CONTENT */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="col-span-12 md:col-span-9 space-y-24 pb-40 w-full"
        >
          
          {/* Header */}
          <section id="abstract" className="scroll-mt-32">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl md:text-7xl font-bold tracking-tighter mb-6 break-words">
                Forensic Analysis <br/> <span className="text-zinc-400">Methodology v1.0</span>
              </h1>
              <p className="text-lg md:text-xl text-zinc-600 max-w-2xl leading-relaxed">
                We do not guess. We measure. This document outlines the mathematical framework used by Nodal Point to identify and eliminate structural waste in commercial energy profiles.
              </p>
            </motion.div>

            <div className="mt-12 p-4 md:p-8 bg-white rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-mono text-zinc-400 uppercase tracking-widest mb-4">System Architecture</h3>
              <p className="text-lg text-zinc-800 leading-relaxed">
                The Texas energy market is not a commodity market; it is a volatility market. Standard brokerage treats electricity like a fixed-rate subscription. This is a fundamental error.
              </p>
              <p className="text-lg text-zinc-800 leading-relaxed mt-4">
                Nodal Point treats your load profile as a dynamic data set. We engineer against the three primary vectors of cost leakage: <strong className="text-black">4CP Capacity Tags</strong>, <strong className="text-black">Demand Ratchet Penalties</strong>, and <strong className="text-black">Scarcity Pricing Adders</strong>.
              </p>
            </div>
          </section>

          {/* Section 2: Ratchet */}
          <section id="ratchet" className="scroll-mt-32">
            <div className="mb-8">
              <span className="text-[#002FA7] font-mono text-xs tracking-widest uppercase mb-2 block">Vector 1</span>
              <h2 className="text-3xl font-bold">The Ratchet Vulnerability</h2>
            </div>
            <div className="bg-white p-4 md:p-8 rounded-2xl border border-zinc-200 shadow-sm w-full">
              <div className="flex items-start gap-4 mb-6">
                <ShieldAlert className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-lg mb-2">The &ldquo;Ghost Capacity&rdquo; Problem</h3>
                  <p className="text-zinc-600 leading-relaxed text-sm">
                    Most commercial tariffs include an <strong className="text-black">80% Demand Ratchet</strong>. 
                    If your facility spikes to <span className="font-mono bg-zinc-100 px-1 rounded text-sm">1,000 kW</span> for just one 15-minute interval, 
                    your billed demand floor is set at <span className="font-mono bg-zinc-100 px-1 rounded text-sm">800 kW</span> for the next 11 months.
                  </p>
                </div>
              </div>

              <div className="font-mono text-xs md:text-sm bg-[#1e1e1e] text-zinc-300 p-4 md:p-6 rounded-lg overflow-x-auto shadow-inner w-full">
                <p className="text-zinc-500 mb-2">{"// Calculating Phantom Load Cost"}</p>
                <div className="space-y-1 whitespace-pre-wrap break-words">
                  <p>const <span className="text-yellow-400">Actual_Load</span> = 500; <span className="text-zinc-500">{"// kW (What you used)"}</span></p>
                  <p>const <span className="text-red-400">Billed_Load</span> = 800; <span className="text-zinc-500">{"// kW (Ratchet Floor)"}</span></p>
                  <p>const <span className="text-[#002FA7]">Wasted_Spend</span> = (Billed_Load - Actual_Load) * Demand_Rate;</p>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-zinc-100">
                <h4 className="text-sm font-bold text-[#002FA7] mb-2">THE NODAL FIX</h4>
                <p className="text-zinc-600 text-sm">
                  We analyze the delta between Metered_Demand and Billed_Demand. If the variance exceeds 15%, we trigger a load-shedding protocol to reset the ratchet.
                </p>
              </div>
            </div>
          </section>

          {/* 4CP Section */}
          <section id="4cp" className="border-t border-zinc-200 pt-12 scroll-mt-32">
             <div className="flex items-baseline gap-4 mb-6">
              <span className="font-mono text-[#002FA7]">3.0</span>
              <h2 className="text-3xl font-bold">4CP Coincident Peaks</h2>
            </div>
            <p className="text-xl text-zinc-600 leading-relaxed mb-8">
              Your transmission costs are not based on volume. They are based on your presence on the grid during the 
              <span className="text-black font-semibold"> four most critical 15-minute intervals of the year</span>.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {['June', 'July', 'August', 'September'].map((month) => (
                <div key={month} className="p-4 bg-white border border-zinc-200 rounded-xl text-center group hover:border-[#002FA7] transition-colors">
                  <span className="block text-xs font-mono text-zinc-400 uppercase mb-1">Interval Scan</span>
                  <span className="block text-lg font-bold text-black group-hover:text-[#002FA7] transition-colors">{month}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100">
               <h4 className="text-sm font-bold text-[#002FA7] mb-2 flex items-center gap-2">
                 <Zap className="w-4 h-4" />
                 PREDICTIVE CURTAILMENT
               </h4>
               <p className="text-zinc-700">
                 Our predictive engine monitors grid reserve margins. We signal your facility to curtail load during these probable intervals, effectively deleting your transmission liability for the next calendar year.
               </p>
            </div>
          </section>

          {/* Algorithm Section */}
          <section id="algorithm" className="border-t border-zinc-200 pt-12 scroll-mt-32">
            <div className="flex items-baseline gap-4 mb-6">
              <span className="font-mono text-[#002FA7]">4.0</span>
              <h2 className="text-3xl font-bold">The Ingestion Protocol</h2>
            </div>
            
            <div className="bg-[#1e1e1e] rounded-2xl overflow-hidden shadow-2xl w-full">
              <div className="bg-[#2d2d2d] px-4 py-2 flex items-center gap-2 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                </div>
                <span className="text-xs font-mono text-zinc-400 ml-2">nodal_logic_core.ts</span>
              </div>
              <div className="p-6 md:p-8 font-mono text-xs md:text-sm text-zinc-300 overflow-x-auto">
                <div className="space-y-4">
                  <div>
                    <span className="text-zinc-500">{"// Nodal Point Logic Flow"}</span>
                  </div>
                  
                  <div>
                    <span className="text-purple-400">IF</span> (Real_Time_Price <span className="text-blue-400">&gt;</span> <span className="text-green-400">$2,000/MWh</span>) <span className="text-purple-400">AND</span> (Grid_Reserves <span className="text-blue-400">&lt;</span> <span className="text-green-400">3,000 MW</span>):<br/>
                    &nbsp;&nbsp;<span className="text-red-400">TRIGGER:</span> Economic_Load_Shed<br/>
                    &nbsp;&nbsp;<span className="text-yellow-400">STATUS:</span> Active_Avoidance
                  </div>

                  <div>
                    <span className="text-purple-400">ELSE IF</span> (Current_Demand <span className="text-blue-400">&gt;</span> <span className="text-green-400">80%_Historical_Peak</span>):<br/>
                    &nbsp;&nbsp;<span className="text-red-400">TRIGGER:</span> Ratchet_Warning<br/>
                    &nbsp;&nbsp;<span className="text-yellow-400">ACTION:</span> Peak_Shaving
                  </div>

                  <div>
                    <span className="text-purple-400">ELSE</span>:<br/>
                    &nbsp;&nbsp;<span className="text-yellow-400">STATUS:</span> Market_Float<br/>
                    &nbsp;&nbsp;<span className="text-green-400">ACTION:</span> Optimize_Baseload
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section - "The Steve Jobs Touch" */}
          <section className="border-t border-zinc-200 pt-20 pb-20 text-center">
            <h3 className="text-3xl md:text-5xl font-bold tracking-tighter mb-8">
              You have seen the math.<br/>Now see your data.
            </h3>
            <a href="/bill-debugger" className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-xl hover:shadow-2xl">
              <Activity className="w-5 h-5" />
              <span>Run Forensic Analysis</span>
            </a>
          </section>

        </motion.div>
      </main>

      {/* FOOTER - Consistent with other pages */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 px-6 border-t border-zinc-800 relative z-10">
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
