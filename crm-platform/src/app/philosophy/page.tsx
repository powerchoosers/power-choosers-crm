'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'

export default function Philosophy() {
  return (
    <div className="bg-[#F5F5F7] min-h-screen relative overflow-hidden font-sans selection:bg-[#002FA7] selection:text-white">

      <LandingHeader />

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

      {/* SECTION 3: THE ORIGIN */}
      <section className="py-20 md:py-40 px-6 bg-white border-t border-zinc-200">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="grid grid-cols-1 md:grid-cols-12 gap-8"
          >
            <div className="md:col-span-2">
              <span className="text-sm font-mono text-[#002FA7] tracking-widest">ORIGIN</span>
            </div>
            <div className="md:col-span-10 space-y-6">
              <p className="text-xl md:text-3xl text-zinc-700 font-medium leading-tight tracking-tight max-w-3xl">
                We started this because we watched business owners overpay for energy, year after year, while their suppliers stayed silent.
              </p>
              <p className="text-lg text-zinc-500 leading-relaxed max-w-2xl">
                ERCOT&apos;s complexity isn&apos;t accidental. Demand charges stay buried. Ratchet clauses go unexplained. 4CP peaks land without warning. Suppliers don&apos;t volunteer this information because confusion is profitable for them.
              </p>
              <p className="text-lg text-zinc-500 leading-relaxed max-w-2xl">
                We decided someone should fight back with data. Not with 50 contract options or a sales script — with forensic analysis, run by engineers, on the actual bill in front of you.
              </p>
              <p className="text-base font-mono text-zinc-400 tracking-widest uppercase">
                North Texas &mdash; ERCOT Region &mdash; Est. 2024
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* SECTION 4: THE ENDGAME */}
      <section className="h-[80vh] flex flex-col items-center justify-center bg-zinc-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.08] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="text-center z-10 px-6"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-tighter text-white mb-4 break-words max-w-3xl mx-auto">
            Every 15-minute peak you don&apos;t manage<br className="hidden md:block" /> is a cost your supplier is happy to collect.
          </h2>
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-12">Nodal Point Operating Principle</p>

          <Link href="/technical-docs" className="group inline-flex items-center gap-2 text-[#002FA7] text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
            <span>Read the Technical Documentation</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      </section>

      <LandingFooter />

    </div>
  )
}

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
  )
}
