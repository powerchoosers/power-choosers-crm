import Link from 'next/link'

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
      <div className="max-w-5xl mx-auto text-center z-10">
        <h1 className="text-5xl md:text-8xl font-semibold tracking-tighter leading-tight mb-8 text-zinc-900 break-words">
          <span className="word-reveal" style={{ animationDelay: '0ms' }}>Texas</span>
          {' '}
          <span className="word-reveal" style={{ animationDelay: '40ms' }}>electricity</span>
          {' '}
          <span className="word-reveal" style={{ animationDelay: '80ms' }}>bills</span>
          <br />
          <span className="word-reveal" style={{ animationDelay: '120ms' }}>hide</span>
          {' '}
          <span className="word-reveal" style={{ animationDelay: '160ms' }}>the</span>
          {' '}
          <span className="word-reveal" style={{ animationDelay: '200ms' }}>real</span>
          {' '}
          <span className="word-reveal" style={{ animationDelay: '240ms' }}>cost.</span>
        </h1>
        <p className="text-xl md:text-2xl text-zinc-600 font-light tracking-tight mb-12 max-w-2xl mx-auto">
          We turn delivery charges, supplier rates, and contract risk into a clear report for controllers, CFOs, and facilities teams.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/bill-debugger"
          className="animate-subtle-pulse inline-flex items-center gap-2 px-6 md:px-8 py-4 bg-[#002FA7] text-white rounded-full text-base md:text-lg font-medium hover:scale-105 hover:bg-blue-800 transition-all duration-300 shadow-lg shadow-blue-900/20 group whitespace-nowrap"
        >
          <span>Review My Bill</span>
          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          </Link>
          <Link
            href="/book"
            className="inline-flex items-center gap-2 px-6 md:px-8 py-4 border border-zinc-400 bg-white/60 text-zinc-700 rounded-full text-base md:text-lg font-medium hover:border-zinc-900 hover:text-zinc-900 hover:bg-white transition-all duration-300 whitespace-nowrap shadow-sm"
          >
            <span>Book a Briefing</span>
          </Link>
        </div>
      </div>
      {/* BREATHING ORB: Ambient signal presence */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0" aria-hidden>
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
