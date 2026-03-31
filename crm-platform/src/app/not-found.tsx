import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nodal Point | Page Not Found',
  description: 'The page you requested could not be found.',
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col items-center justify-center px-6 relative overflow-hidden selection:bg-[#002FA7]">

      {/* Background dot grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.07]"
        style={{ backgroundImage: 'radial-gradient(#002FA7 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#002FA7]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 text-center max-w-lg">

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">PAGE_NOT_FOUND // 404</span>
        </div>

        {/* Headline */}
        <h1 className="text-7xl md:text-9xl font-bold tracking-tighter text-white/10 mb-2 select-none">
          404
        </h1>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-4">
          Page not found.
        </h2>
        <p className="text-zinc-500 text-base leading-relaxed mb-10 max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-[#002FA7] text-white px-6 py-3 rounded-full text-sm font-medium hover:scale-105 transition-transform"
          >
            Return Home
          </Link>
          <Link
            href="/bill-debugger"
            className="inline-flex items-center gap-2 border border-white/10 text-zinc-400 px-6 py-3 rounded-full text-sm font-medium hover:border-white/20 hover:text-white transition-all"
          >
            Review My Bill
          </Link>
        </div>

        {/* Footer micro-copy */}
        <p className="mt-16 font-mono text-[10px] text-zinc-700 uppercase tracking-widest">
          NODAL POINT // COMMERCIAL ENERGY // NORTH TEXAS
        </p>

      </div>
    </div>
  )
}
