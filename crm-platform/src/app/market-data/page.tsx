'use client'

import { motion } from 'framer-motion';
import { AlertTriangle, Activity, Menu, X, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useMarketPulse } from '@/hooks/useMarketPulse';

export default function MarketData() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { data: marketData, isError, error } = useMarketPulse();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const displayPrice = marketData?.prices?.houston?.toFixed(2) || "24.15";

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-[#002FA7]">
      
      {/* HEADER (Reused from other pages for consistency) */}
      <header id="main-header" className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-zinc-950/80 backdrop-blur-xl h-16 shadow-sm' : 'bg-transparent h-24'}`}>
        <div className="w-full px-8 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <div className="bg-white p-1.5 rounded-xl">
              <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-8 w-auto" />
            </div>
            <span className="font-bold text-xl tracking-tighter text-white">
              Nodal <span className="text-[#002FA7]">Point</span>
            </span>
          </Link>

          <div className="flex items-center gap-6">
            <Link href="/network" className="hidden md:block text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <a href="/bill-debugger" className="hidden md:flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:scale-105 transition-all">
              <Activity className="w-4 h-4" />
              <span>Run Analysis</span>
            </a>
            <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Menu className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* FULL SCREEN MENU OVERLAY (Reused) */}
      <div className={`fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <button onClick={() => setIsMenuOpen(false)} className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full">
          <X className="w-8 h-8 text-white" />
        </button>
        <div className="flex flex-col gap-8 text-center">
          {[
            { label: 'The Philosophy', href: '/philosophy' },
            { label: 'The Methodology', href: '/technical-docs' },
            { label: 'Market Data', href: '/market-data' },
            { label: 'Contact', href: '/contact' }
          ].map((item, i) => (
             <a key={item.label} href={item.href}
             className={`text-4xl md:text-5xl font-light tracking-tight text-white hover:text-[#002FA7] transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} delay-${(i + 1) * 100}`}>
             {item.label}
           </a>
          ))}
        </div>
      </div>

      {/* BACKGROUND TEXTURE: The "Digital Grain" */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" />

      {/* PAGE CONTENT WRAPPER */}
      <div className="pt-32 px-6">

        {/* PAGE HEADER */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-7xl mx-auto mb-20 border-b border-white/10 pb-8 mt-10 relative z-10"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4">
            The Signal.
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            We do not sell energy. We audit inefficiency. <br/>
            Real-time telemetry from the ERCOT Nodal Market.
          </p>
        </motion.div>

        {/* THE GRID */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10"
        >
          
          {/* CARD 1: REAL TIME PRICE */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="col-span-1 md:col-span-2 p-10 rounded-3xl bg-zinc-900/50 border border-white/10 backdrop-blur-md relative overflow-hidden"
          >
            {isError ? (
              <div className="absolute top-6 right-6 flex items-center gap-2 text-rose-500 animate-pulse">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-mono uppercase tracking-widest">error in read</span>
              </div>
            ) : (
              <div className="absolute top-6 right-6 flex items-center gap-2 text-[#002FA7] animate-pulse">
                <span className="h-2 w-2 rounded-full bg-[#002FA7]"></span>
                <span className="text-xs font-mono uppercase tracking-widest">Live Feed</span>
              </div>
            )}
            
            <h3 className="text-zinc-500 font-mono text-sm uppercase tracking-widest mb-2">ERCOT System Lambda</h3>
            <div className="flex items-baseline gap-4">
              <span className="text-8xl font-bold tracking-tighter font-mono">${displayPrice}</span>
              <span className="text-xl text-zinc-500">/ MWh</span>
            </div>
            
            <div className="mt-8 h-32 w-full bg-gradient-to-t from-[#002FA7]/20 to-transparent rounded-xl border-b border-[#002FA7] relative">
               {/* Abstract Line Chart representation - The "Jagged Physics" Look */}
               <svg className="absolute bottom-0 left-0 w-full h-full" preserveAspectRatio="none">
                  <path d="M0,100 L100,80 L150,95 L200,90 L250,60 L300,50 L350,70 L400,50 L450,85 L500,80 L550,30 L600,20 L650,45 L700,20 L750,55 L800,60 L850,35 L900,40 L950,50 L1000,60 L1000,128 L0,128 Z" fill="url(#grad1)" fillOpacity="0.2" />
                  <path d="M0,100 L100,80 L150,95 L200,90 L250,60 L300,50 L350,70 L400,50 L450,85 L500,80 L550,30 L600,20 L650,45 L700,20 L750,55 L800,60 L850,35 L900,40 L950,50 L1000,60" stroke="#002FA7" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
                  <defs>
                      <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{stopColor:"#002FA7", stopOpacity:1}} />
                      <stop offset="100%" style={{stopColor:"#002FA7", stopOpacity:0}} />
                      </linearGradient>
                  </defs>
               </svg>
               <div className="absolute bottom-4 left-4 text-xs text-[#002FA7] font-mono">LZ_HOUSTON</div>
            </div>
          </motion.div>

          {/* CARD 2: THE THREAT LEVEL */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
            className="col-span-1 p-10 rounded-3xl bg-zinc-900/50 border border-white/10 backdrop-blur-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <h3 className="text-zinc-500 font-mono text-sm uppercase tracking-widest">Grid Stress Index</h3>
              </div>
              <div className="text-4xl font-bold text-white mb-2 uppercase tracking-tight">Nominal</div>
              <p className="text-sm text-zinc-400">Reserves are adequate. No scarcity pricing detected in the Day-Ahead Market.</p>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-500">Wind Output</span>
                <span className="text-white font-mono">12,450 MW</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Predicted Peak</span>
                <span className="text-white font-mono">58,000 MW</span>
              </div>
            </div>
          </motion.div>

          {/* CARD 3: THE 4CP INDICATOR */}
          <div 
            className="col-span-1 md:col-span-3 p-10 rounded-3xl bg-zinc-900/50 border border-white/10 backdrop-blur-md"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
              <div>
                <h3 className="text-zinc-500 font-mono text-sm uppercase tracking-widest mb-1">4CP Probability Window</h3>
                <h2 className="text-3xl font-bold">Transmission Liability Monitor</h2>
              </div>
              <button className="mt-4 md:mt-0 px-6 py-2 rounded-full bg-[#002FA7] hover:bg-blue-700 text-white font-medium text-sm transition-colors">
                View Forecast
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['June', 'July', 'August', 'September'].map((m) => (
                <div key={m} className="p-4 rounded-xl bg-black/20 border border-white/5 text-center">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{m}</div>
                  <div className="text-white font-mono text-lg">---</div>
                </div>
              ))}
            </div>
          </div>

        </motion.div>

        {/* CTA FOOTER */}
        <div className="text-center py-32">
          <p className="text-zinc-500 text-sm mb-6 max-w-sm mx-auto">
            You can&apos;t manage what you don&apos;t measure. Start your forensic audit now.
          </p>
          <a href="/bill-debugger" className="inline-flex items-center gap-2 bg-[#002FA7] text-white px-6 py-3 rounded-full text-sm font-medium hover:scale-105 transition-all shadow-lg shadow-blue-900/20">
            <Activity className="w-4 h-4" />
            <span>Initiate Bill Analysis</span>
          </a>
        </div>
      
      </div>

      {/* FOOTER - Consistent with other pages */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 px-6 border-t border-zinc-800 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-8">
          <div className="bg-white p-3 rounded-3xl">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-12 w-auto" />
          </div>
          <p className="font-mono text-sm tracking-widest opacity-60">&copy; 2026 Nodal Point. All Systems Nominal.</p>
          
          {/* System Status Line - The "Trap Door" */}
          <div className="w-full border-t border-zinc-800/50 mt-8 pt-8 flex justify-center text-center">
            <p className="text-zinc-600 text-xs font-mono tracking-wider">
              ERCOT NODE: LZ_HOUSTON // LATENCY: 24ms // CONNECTION: SECURE
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
