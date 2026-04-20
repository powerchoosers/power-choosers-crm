'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Activity, ArrowRight, Mail, Menu, Phone, Send, X, MapPin, CalendarDays } from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'

const MENU_ITEMS = [
  { label: 'Philosophy', href: '/philosophy' },
  { label: 'How it works', href: '/technical-docs' },
  { label: 'Market Data', href: '/market-data' },
  { label: 'Market Outlook', href: '/market-outlook' },
  { label: 'Contact', href: '/contact' },
] as const

export default function Contact() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [formState, setFormState] = useState({ name: '', company: '', email: '', message: '' })
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormStatus('sending')

    try {
      const res = await fetch('/api/contact-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      })

      if (!res.ok) throw new Error('Failed to send message')
      setFormStatus('sent')
    } catch {
      setFormStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-[#002FA7] selection:text-white">
      <header
        id="main-header"
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled ? 'bg-zinc-950/80 backdrop-blur-xl h-16 shadow-sm' : 'bg-transparent h-24'
        }`}
      >
        <div className="w-full px-8 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <div className="bg-white p-1.5 rounded-xl">
              <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-8 w-auto" />
            </div>
            <span className="font-bold text-xl tracking-tighter text-white">
              Nodal <span className="text-[#002FA7]">Point</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 md:gap-6">
            <Link href="/portal" className="hidden md:block text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link
              href="/book"
              className="hidden md:flex items-center gap-2 border border-white/15 text-zinc-200 px-5 py-2.5 rounded-full text-sm font-medium hover:border-white/30 hover:bg-white/5 transition-all"
            >
              <CalendarDays className="w-4 h-4" />
              <span>Book a Strategy Call</span>
            </Link>
            <a
              href="/bill-debugger"
              className="hidden md:flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:scale-105 transition-all"
            >
              <Activity className="w-4 h-4" />
              <span>Review My Bill</span>
            </a>
            <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Menu className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${
          isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button onClick={() => setIsMenuOpen(false)} className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full">
          <X className="w-8 h-8 text-white" />
        </button>
        <div className="flex flex-col gap-8 text-center">
          {MENU_ITEMS.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setIsMenuOpen(false)}
              className={`text-4xl md:text-5xl font-light tracking-tight text-white hover:text-[#002FA7] transition-all duration-500 ${
                isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
              }`}
              style={{ transitionDelay: `${(i + 1) * 100}ms` }}
            >
              {item.label}
            </Link>
          ))}
          <div className={`mt-8 flex flex-col sm:flex-row gap-3 justify-center transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
            <Link
              href="/book"
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 border border-white/15 text-zinc-200 px-6 py-3 rounded-full text-base font-medium hover:border-white/30 hover:bg-white/5 transition-all"
            >
              <CalendarDays className="w-4 h-4" />
              Book a Strategy Call
            </Link>
            <a
              href="/bill-debugger"
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 bg-[#002FA7] text-white px-6 py-3 rounded-full text-base font-medium hover:scale-105 transition-all"
            >
              <Activity className="w-4 h-4" />
              Review My Bill
            </a>
          </div>
        </div>
      </div>

      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" />

      <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20 relative z-10">
          <div className="flex flex-col justify-center">
            <motion.h1
              initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.8 }}
              className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-6"
            >
              Contact.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="text-xl text-zinc-400 leading-relaxed max-w-md"
            >
              Reach out if you want the bill reviewed, need help understanding a contract, or just want a straight answer.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="flex items-center gap-2 mt-5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">We respond within 24 hours · Mon – Fri</span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-10 rounded-3xl relative group hover:border-[#002FA7]/50 transition-colors duration-500"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-[#002FA7] to-purple-600 rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />

            <div className="space-y-12 relative z-10">
              <div>
                <div className="flex items-center gap-3 mb-2 text-zinc-500 uppercase tracking-widest text-xs font-mono">
                  <Phone className="w-4 h-4" />
                  <span>Direct line</span>
                </div>
                <a href="tel:+18178093367" className="block text-2xl md:text-4xl text-white font-bold tracking-tight hover:text-[#002FA7] transition-colors">
                  +1 (817) 809-3367
                </a>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-2 text-zinc-500 uppercase tracking-widest text-xs font-mono">
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </div>
                <a href="mailto:signal@nodalpoint.io" className="block text-xl md:text-3xl text-white font-medium tracking-tight hover:text-[#002FA7] transition-colors">
                  signal@nodalpoint.io
                </a>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-2 text-zinc-500 uppercase tracking-widest text-xs font-mono">
                  <MapPin className="w-4 h-4" />
                  <span>Location</span>
                </div>
                <p className="text-xl text-zinc-300">
                  North Texas
                  <br />
                  <span className="text-zinc-500 text-sm">ERCOT region</span>
                </p>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/5 relative z-10 space-y-4">
              <div>
                <p className="text-zinc-500 text-sm mb-2">Want to move faster?</p>
                <a href="/bill-debugger" className="flex items-center gap-2 text-white font-bold hover:gap-4 hover:text-[#002FA7] transition-all">
                  Review My Bill <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <div>
                <a href="/book" className="flex items-center gap-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
                  Or book a briefing <ArrowRight className="w-3 h-3 rotate-90" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <section id="contact-form" className="px-6 pb-20 relative z-10">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3">SEND_A_MESSAGE</p>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-8">Send a message.</h2>

            {formStatus === 'sent' ? (
              <div className="bg-zinc-900/50 border border-emerald-500/20 rounded-2xl p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <p className="font-mono text-sm text-emerald-400 uppercase tracking-widest mb-2">MESSAGE_RECEIVED</p>
                <p className="text-zinc-400 text-sm">We&apos;ll reply within 24 hours, Mon–Fri.</p>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Your name"
                    required
                    value={formState.name}
                    onChange={e => setFormState(s => ({ ...s, name: e.target.value }))}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-[#002FA7]/60 transition-colors"
                  />
                  <input
                    type="text"
                    placeholder="Company (optional)"
                    value={formState.company}
                    onChange={e => setFormState(s => ({ ...s, company: e.target.value }))}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-[#002FA7]/60 transition-colors"
                  />
                </div>
                <input
                  type="email"
                  placeholder="Work email"
                  required
                  value={formState.email}
                  onChange={e => setFormState(s => ({ ...s, email: e.target.value }))}
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-[#002FA7]/60 transition-colors"
                />
                <textarea
                  placeholder="Tell us what you need help with"
                  required
                  rows={4}
                  value={formState.message}
                  onChange={e => setFormState(s => ({ ...s, message: e.target.value }))}
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-[#002FA7]/60 transition-colors resize-none"
                />
                {formStatus === 'error' && (
                  <p className="text-rose-400 text-xs font-mono">MESSAGE_FAILED — if the form keeps failing, email us directly.</p>
                )}
                <button
                  type="submit"
                  disabled={formStatus === 'sending'}
                  className="flex items-center gap-2 bg-[#002FA7] text-white px-6 py-3 rounded-full text-sm font-medium hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  {formStatus === 'sending' ? 'Sending...' : 'Send message'}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
