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
          The Texas Grid is<br />
          Designed to Confuse.
        </h1>
        <p className="text-xl md:text-2xl text-zinc-600 font-light tracking-tight mb-12 max-w-2xl mx-auto">
          We view complexity as a design flaw. We fixed it.
        </p>
        <div>
          <Link
            href="/bill-debugger"
            className="animate-subtle-pulse inline-flex items-center gap-2 px-6 md:px-8 py-4 bg-[#002FA7] text-white rounded-full text-base md:text-lg font-medium hover:scale-105 hover:bg-blue-800 transition-all duration-300 shadow-lg shadow-blue-900/20 group whitespace-nowrap"
          >
            <span>[ Debug My Bill ]</span>
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
      {/* BACKGROUND TEXTURE: The "Digital Grain" */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.1] pointer-events-none z-0" aria-hidden />
    </section>
  )
}
