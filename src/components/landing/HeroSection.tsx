import Link from 'next/link'
import { Activity, CalendarDays } from 'lucide-react'

const SIGNAL_POINTS = [
  { label: 'BILL REVIEW', sub: 'START' },
  { label: 'SUPPLIER PARTNERSHIPS', sub: 'COMPARE' },
  { label: 'RATE NEGOTIATION', sub: 'HANDLE' },
  { label: 'PAPERWORK', sub: 'DONE' },
  { label: 'PLAN FIT', sub: 'MATCHED' },
] as const

/**
 * Server-rendered hero section so the LCP element (H1) is in the initial HTML
 * and does not wait for React hydration or motion. Improves LCP significantly.
 */
export function HeroSection() {
  return (
    <section
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden pt-20 md:pt-32"
      aria-label="Hero"
    >
      <div className="max-w-7xl mx-auto text-center z-10">
        <h1 className="mx-auto max-w-7xl text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-[-0.07em] leading-[1.02] mb-6 text-zinc-900 break-words">
          <span className="word-reveal" style={{ animationDelay: '0ms' }}>Commercial</span>
          {' '}
          <span className="word-reveal" style={{ animationDelay: '40ms' }}>energy</span>
          {' '}
          <span className="word-reveal" style={{ animationDelay: '80ms' }}>procurement</span>
          <br />
          <span className="word-reveal" style={{ animationDelay: '120ms' }}>that</span>
          {' '}
          <span className="text-[#002FA7]">
            <span className="word-reveal" style={{ animationDelay: '160ms' }}>fits</span>
            {' '}
            <span className="word-reveal" style={{ animationDelay: '200ms' }}>the</span>
            {' '}
            <span className="word-reveal" style={{ animationDelay: '240ms' }}>business.</span>
          </span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-600 font-normal tracking-tight leading-8 mb-10 max-w-2xl mx-auto">
          We help Texas businesses review their bill, compare supplier offers through our supplier partnerships, negotiate competitive rates, handle the paperwork, and recommend the plan that fits the business.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/bill-debugger"
            className="animate-subtle-pulse inline-flex items-center gap-2 px-6 md:px-8 py-4 bg-[#002FA7] text-white rounded-full text-base md:text-lg font-medium hover:scale-105 hover:bg-blue-800 transition-all duration-300 shadow-lg shadow-blue-900/20 group whitespace-nowrap"
          >
            <Activity className="w-5 h-5" />
            <span>Review My Bill</span>
          </Link>
          <Link
            href="/book"
            className="inline-flex items-center gap-2 px-6 md:px-8 py-4 border border-zinc-400 bg-white/60 text-zinc-700 rounded-full text-base md:text-lg font-medium hover:border-zinc-900 hover:text-zinc-900 hover:bg-white transition-all duration-300 whitespace-nowrap shadow-sm"
          >
            <CalendarDays className="w-5 h-5" />
            <span>Book a Strategy Call</span>
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {SIGNAL_POINTS.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-2 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-600 shadow-sm"
            >
              <span className="text-[#002FA7]">{item.label}</span>
              <span className="text-zinc-400">{item.sub}</span>
            </span>
          ))}
        </div>
      </div>
      {/* BREATHING ORB: Ambient signal presence */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0" aria-hidden>
        <div
          className="hero-breathe-orb w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,47,167,0.20) 0%, transparent 65%)' }}
        />
      </div>
      {/* BACKGROUND TEXTURE: The "Digital Grain" */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" aria-hidden />
    </section>
  )
}
