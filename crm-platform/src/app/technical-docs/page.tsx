'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, ArrowRight } from 'lucide-react'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'

const SECTIONS = [
  { id: 'overview', label: '1. Review the bill' },
  { id: 'compare', label: '2. Compare the numbers' },
  { id: 'result', label: '3. See the next step' },
] as const

export default function TechnicalDocs() {
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0px -55% 0px' }
    )

    const sections = document.querySelectorAll('section[id]')
    sections.forEach((section) => observer.observe(section))

    return () => sections.forEach((section) => observer.unobserve(section))
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (!element) return
    const headerOffset = 100
    const offsetPosition = element.getBoundingClientRect().top + window.scrollY - headerOffset
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-zinc-900 font-sans selection:bg-[#002FA7] selection:text-white">
      <LandingHeader />

      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" />

      <main className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:grid md:grid-cols-12 gap-8 md:gap-12 pt-32 md:pt-40 relative z-10 w-full">
        <aside className="hidden md:block col-span-3 sticky top-40 h-fit self-start">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-8"
          >
            <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-6">How it works</h4>
            <ul className="space-y-4 text-sm font-medium text-zinc-600">
              {SECTIONS.map((section) => (
                <li
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`pl-4 cursor-pointer border-l-2 transition-all ${
                    activeSection === section.id
                      ? 'text-[#002FA7] border-[#002FA7]'
                      : 'hover:text-black border-transparent hover:border-zinc-300'
                  }`}
                >
                  {section.label}
                </li>
              ))}
            </ul>
          </motion.div>
        </aside>

        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="col-span-12 md:col-span-9 space-y-24 pb-40 w-full"
        >
          <section id="overview" className="scroll-mt-32">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">HOW IT WORKS</p>
              <h1 className="text-4xl md:text-7xl font-bold tracking-tighter mb-6 break-words">
                Simple review.
                <br />
                <span className="text-zinc-400">Clear next step.</span>
              </h1>
              <p className="text-lg md:text-xl text-zinc-600 max-w-2xl leading-relaxed">
                We read the bill, compare it to the contract and market, and turn the result into a short summary a business leader can use.
              </p>
            </motion.div>
          </section>

          <section id="compare" className="scroll-mt-32">
            <div className="mb-8">
              <span className="text-[#002FA7] font-mono text-xs tracking-widest uppercase mb-2 block">What we compare</span>
              <h2 className="text-3xl font-bold">The bill, the contract, and the market</h2>
            </div>
            <div className="bg-white p-4 md:p-8 rounded-2xl border border-zinc-200 shadow-sm w-full space-y-4">
              <p className="text-zinc-600 leading-relaxed">
                The main goal is simple: find the largest cost driver first.
              </p>
              <ul className="space-y-3 text-zinc-700">
                <li className="flex gap-3">
                  <span className="font-mono text-[#002FA7]">01</span>
                  <span>We separate supply, delivery, and demand charges so the bill is easier to read.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-[#002FA7]">02</span>
                  <span>We compare those charges against the contract terms that created them.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-[#002FA7]">03</span>
                  <span>We check the market context so you know whether the bill is normal, high, or worth a deeper look.</span>
                </li>
              </ul>
            </div>
          </section>

          <section id="result" className="border-t border-zinc-200 pt-12 scroll-mt-32">
            <div className="mb-8">
              <span className="font-mono text-[#002FA7] text-xs tracking-widest uppercase mb-2 block">What you get</span>
              <h2 className="text-3xl font-bold">A short readout and a clear next move</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-white border border-zinc-200 rounded-xl">
                <p className="text-sm font-semibold text-zinc-900 mb-2">Plain-English summary</p>
                <p className="text-zinc-600 text-sm leading-relaxed">
                  We show the main issue without making you decode a page of jargon.
                </p>
              </div>
              <div className="p-5 bg-white border border-zinc-200 rounded-xl">
                <p className="text-sm font-semibold text-zinc-900 mb-2">Recommended next step</p>
                <p className="text-zinc-600 text-sm leading-relaxed">
                  If there is a meaningful issue, we point you to the most useful follow-up: review, briefing, or contract check.
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-zinc-200 pt-12 scroll-mt-32">
            <div className="mb-8">
              <span className="font-mono text-[#002FA7] text-xs tracking-widest uppercase mb-2 block">Best use</span>
              <h2 className="text-3xl font-bold">Built for people who need the answer fast</h2>
            </div>
            <div className="bg-[#1e1e1e] rounded-2xl overflow-hidden shadow-2xl w-full text-white">
              <div className="bg-[#2d2d2d] px-4 py-2 flex items-center gap-2 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-xs font-mono text-zinc-400 ml-2">review-summary.txt</span>
              </div>
              <div className="p-6 md:p-8 space-y-4">
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Output</div>
                <p className="text-zinc-300 leading-relaxed">
                  1. What changed on the bill.
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  2. Why it matters to the business.
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  3. What to do next.
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-zinc-200 pt-20 pb-20 text-center">
            <h3 className="text-3xl md:text-5xl font-bold tracking-tighter mb-8">
              You have the outline.
              <br />
              <span className="text-[#002FA7]">Now review the bill.</span>
            </h3>
            <a href="/bill-debugger" className="inline-flex items-center gap-3 bg-black text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-xl hover:shadow-2xl">
              <Activity className="w-5 h-5" />
              <span>Review My Bill</span>
            </a>
          </section>
        </motion.div>
      </main>

      <LandingFooter />
    </div>
  )
}
