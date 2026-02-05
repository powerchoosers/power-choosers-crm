'use client'

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Activity, Menu, X } from 'lucide-react'; // Ensure lucide-react is installed

export default function Philosophy() {
  const containerRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  
  // Parallax Logic
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div ref={containerRef} className="bg-[#F5F5F7] min-h-screen relative overflow-hidden font-sans selection:bg-[#002FA7] selection:text-white">
      
      {/* HEADER (Heads-Up Display) */}
      <header id="main-header" className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-white/80 backdrop-blur-xl h-16' : 'bg-transparent h-24'}`}>
        <div className="w-full px-8 h-full flex items-center justify-between">
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
            <Link href="/network"
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

      {/* BACKGROUND TEXTURE: The "Digital Grain" */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none" />

      {/* SECTION 1: THE DECLARATION */}
      <section className="min-h-[70vh] md:min-h-screen pt-24 md:pt-40 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="max-w-6xl mx-auto text-center"
        >
          <h1 className="text-5xl md:text-9xl font-bold tracking-tighter text-black leading-[0.9] mb-8 break-words">
            We view complexity <br/> as a <span className="text-[#002FA7]">tax.</span>
          </h1>
          <p className="text-xl md:text-2xl text-zinc-500 max-w-2xl mx-auto font-medium tracking-normal">
            The grid is designed to confuse. We redesigned the solution.
          </p>
        </motion.div>
      </section>

      {/* SECTION 2: THE LAWS (Scroll Reveal) */}
      <section className="py-12 md:py-40 px-6">
        <div className="max-w-5xl mx-auto space-y-16 md:space-y-40">
          
          <ManifestoPoint 
            number="01"
            title="Signal Over Noise."
            text="We do not send you 50 options. We reject 99% of contracts to find the mathematical optimum. We filter out the market hysteria."
          />
          
          <ManifestoPoint 
            number="02"
            title="Forensics, Not Sales."
            text="A broker wants to sign a deal. We want to dissect a load profile. If we cannot find a structural advantage, we do not present an offer."
          />
          
          <ManifestoPoint 
            number="03"
            title="The 4CP Obsession."
            text="Rate per kWh is a vanity metric. The real cost is in the demand charges. We engineer the volatility out of your bill."
          />

        </div>
      </section>

      {/* SECTION 3: THE ENDGAME */}
      <section className="h-[80vh] flex flex-col items-center justify-center bg-white border-t border-zinc-200 relative overflow-hidden">
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="text-center z-10 px-6"
        >
          <h2 className="text-3xl md:text-6xl font-bold tracking-tighter text-black mb-12 break-words">
            &ldquo;Simplicity is the <br/> ultimate sophistication.&rdquo;
          </h2>
          
          <Link href="/technical-docs" className="group inline-flex items-center gap-2 text-[#002FA7] text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
            <span>Read the Technical Documentation</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 px-6 border-t border-zinc-800 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-8">
          <div className="bg-white p-3 rounded-3xl">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-12 w-auto" />
          </div>
          <p className="font-mono text-sm tracking-widest opacity-60">&copy; 2026 Nodal Point. All Systems Nominal.</p>
        </div>
      </footer>

    </div>
  );
}

// The Component for the Points
function ManifestoPoint({ number, title, text }: { number: string, title: string, text: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="border-t border-zinc-300 pt-10 grid grid-cols-1 md:grid-cols-12 gap-8"
    >
      <div className="md:col-span-2">
        <span className="text-sm font-mono text-[#002FA7] tracking-widest">{number}</span>
      </div>
      <div className="md:col-span-10">
        <h3 className="text-4xl md:text-7xl font-bold tracking-tighter text-black mb-6 break-words">
          {title}
        </h3>
        <p className="text-xl md:text-3xl text-zinc-500 font-medium leading-tight max-w-4xl">
          {text}
        </p>
      </div>
    </motion.div>
  );
}
