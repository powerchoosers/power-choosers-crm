'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Activity, CalendarDays } from 'lucide-react'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'

export default function Philosophy() {
  return (
    <div className="bg-[#F5F5F7] min-h-screen relative overflow-hidden font-sans selection:bg-[#002FA7] selection:text-white">
      <LandingHeader />

      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none" />

      <section className="min-h-[70vh] md:min-h-screen pt-24 md:pt-40 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="max-w-6xl mx-auto text-center"
        >
          <h1 className="text-5xl md:text-8xl font-bold tracking-tighter text-black leading-[0.9] mb-8 break-words">
            Complexity hides cost.
            <br />
            <span className="text-[#002FA7]">Plain language exposes it.</span>
          </h1>
          <p className="text-xl md:text-2xl text-zinc-500 max-w-3xl mx-auto font-medium tracking-normal">
            Nodal Point exists to make electricity bills easier to understand, easier to trust, and easier to act on.
          </p>
        </motion.div>
      </section>

      <section className="py-12 md:py-40 px-6">
        <div className="max-w-5xl mx-auto space-y-16 md:space-y-40">
          <Principle number="01" title="Show the biggest number first" text="A CFO should see the main cost driver in seconds, not after a long walk through the page." />
          <Principle number="02" title="Use plain business language" text="We remove jargon when it slows the decision down. The page should sound like a person, not a system log." />
          <Principle number="03" title="Make the next step obvious" text="Once the issue is clear, the page should point to one action: review the bill, book a briefing, or move on." />
        </div>
      </section>

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
                We built this after seeing too many businesses pay more than they needed to because the bill was hard to read.
              </p>
              <p className="text-lg text-zinc-500 leading-relaxed max-w-2xl">
                The problem is usually not a single mistake. It is a stack of small charges, contract terms, and timing issues that are easy to miss when the bill is crowded.
              </p>
              <p className="text-lg text-zinc-500 leading-relaxed max-w-2xl">
                Our job is to pull those pieces apart, explain them in plain English, and show the business owner what matters next.
              </p>
              <p className="text-base font-mono text-zinc-400 tracking-widest uppercase">
                Texas businesses &mdash; ERCOT market &mdash; Est. 2024
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 md:py-40 px-6 bg-zinc-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.08] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="text-center z-10 px-6 relative"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-tighter text-white mb-4 break-words max-w-4xl mx-auto">
            A clean bill review should feel simple, not theatrical.
          </h2>
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-12">NODAL_POINT_PRINCIPLE</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/bill-debugger"
              className="group inline-flex items-center gap-2 bg-[#002FA7] text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-lg shadow-blue-900/20"
            >
              <Activity className="w-5 h-5" />
              <span>Review My Bill</span>
            </Link>
            <Link
              href="/book"
              className="inline-flex items-center gap-2 px-6 md:px-8 py-4 border border-white/20 text-white rounded-full text-base md:text-lg font-medium hover:border-white/40 transition-all duration-300 whitespace-nowrap"
            >
              <CalendarDays className="w-5 h-5" />
              <span>Book a Strategy Call</span>
            </Link>
          </div>
        </motion.div>
      </section>

      <LandingFooter />
    </div>
  )
}

function Principle({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="border-t border-zinc-300 pt-10 grid grid-cols-1 md:grid-cols-12 gap-8"
    >
      <div className="md:col-span-2">
        <span className="text-sm font-mono text-[#002FA7] tracking-widest">{number}</span>
      </div>
      <div className="md:col-span-10">
        <h3 className="text-4xl md:text-6xl font-bold tracking-tighter text-black mb-6 break-words">
          {title}
        </h3>
        <p className="text-xl md:text-2xl text-zinc-500 font-medium leading-tight max-w-4xl">
          {text}
        </p>
      </div>
    </motion.div>
  )
}
