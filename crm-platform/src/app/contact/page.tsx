'use client'

import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, ArrowRight, Menu, X, Activity } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Contact() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-[#002FA7] selection:text-white">
      
      {/* HEADER */}
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
            <Link href="/crm-platform" className="hidden md:block text-sm font-medium text-zinc-400 hover:text-white transition-colors">
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

      {/* FULL SCREEN MENU OVERLAY */}
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

      {/* BACKGROUND TEXTURE */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" />

      {/* PAGE CONTENT */}
      <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32">
        
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20 relative z-10">
          
          {/* Left Column: The Statement */}
          <div className="flex flex-col justify-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8 }}
              className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-6"
            >
              Open a <br/> <span className="text-[#002FA7]">Channel.</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="text-xl text-zinc-400 leading-relaxed max-w-md"
            >
              We do not have a sales team. We have engineers. 
              When you call, you speak to the architects of the strategy, not a script.
            </motion.p>
          </div>

          {/* Right Column: The Interface Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-10 rounded-3xl relative group hover:border-[#002FA7]/50 transition-colors duration-500"
          >
            {/* Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#002FA7] to-purple-600 rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />

            <div className="space-y-12 relative z-10">
              
              {/* The Direct Line */}
              <div>
                <div className="flex items-center gap-3 mb-2 text-zinc-500 uppercase tracking-widest text-xs font-mono">
                  <Phone className="w-4 h-4" />
                  <span>Direct Uplink</span>
                </div>
                <a href="tel:+18178093367" className="block text-2xl md:text-4xl text-white font-bold tracking-tight hover:text-[#002FA7] transition-colors">
                  +1 (817) 809-3367
                </a>
              </div>

              {/* The Signal (Email) */}
              <div>
                <div className="flex items-center gap-3 mb-2 text-zinc-500 uppercase tracking-widest text-xs font-mono">
                  <Mail className="w-4 h-4" />
                  <span>Secure Signal</span>
                </div>
                <a href="mailto:signal@nodalpoint.io" className="block text-xl md:text-3xl text-white font-medium tracking-tight hover:text-[#002FA7] transition-colors">
                  signal@nodalpoint.io
                </a>
              </div>

              {/* The Coordinates */}
              <div>
                <div className="flex items-center gap-3 mb-2 text-zinc-500 uppercase tracking-widest text-xs font-mono">
                  <MapPin className="w-4 h-4" />
                  <span>Operations Base</span>
                </div>
                <p className="text-xl text-zinc-300">
                  ERCOT Region <br/>
                  <span className="text-zinc-500 text-sm">North Texas Operations Center</span>
                </p>
              </div>

            </div>

            {/* Bottom Action */}
            <div className="mt-12 pt-8 border-t border-white/5 relative z-10">
              <p className="text-zinc-500 text-sm mb-4">Ready to bypass the conversation?</p>
              <a href="/bill-debugger" className="flex items-center gap-2 text-white font-bold hover:gap-4 hover:text-[#002FA7] transition-all">
                Initiate Bill Debugger Upload <ArrowRight className="w-4 h-4" />
              </a>
            </div>

          </motion.div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 border-t border-zinc-800 relative z-10 w-full">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-8 px-6">
          <div className="bg-white p-3 rounded-3xl">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-12 w-auto" />
          </div>
          <p className="font-mono text-sm tracking-widest opacity-60">&copy; 2026 Nodal Point. All Systems Nominal.</p>
          
          {/* System Status Line */}
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
