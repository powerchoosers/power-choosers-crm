import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  FileText,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { SupplierTicker, SUPPLIER_LOGOS } from '@/components/landing/SupplierTicker'
import { ScrollRevealScope } from '@/components/motion/ScrollRevealScope'

export const metadata: Metadata = {
  title: 'No More Energy Surprises | Nodal Point Bill Review',
  description:
    'Upload your Texas commercial energy bill before you sign another supplier offer. Nodal Point reviews supply, delivery, demand, and contract risk with no supplier switch required.',
  alternates: { canonical: 'https://nodalpoint.io/forensic-review' },
  openGraph: {
    title: 'No More Energy Surprises',
    description:
      'Upload your bill before you sign another supplier offer. No supplier switch required.',
    url: 'https://nodalpoint.io/forensic-review',
  },
}

const reviewItems = [
  {
    icon: TriangleAlert,
    label: 'Demand charge warning',
    copy: 'Recent usage shows the account may be exposed to a demand charge increase.',
    iconColor: 'text-amber-500',
    badgeColor: 'bg-amber-50 border-amber-200 text-amber-700',
  },
  {
    icon: ShieldCheck,
    label: 'Contract risk flagged',
    copy: 'Current terms may include pass-through exposure or unfavorable escalators.',
    iconColor: 'text-red-500',
    badgeColor: 'bg-red-50 border-red-200 text-red-700',
  },
  {
    icon: ArrowRight,
    label: 'Next move identified',
    copy: 'Benchmark the current offer before you lock in the wrong structure.',
    iconColor: 'text-[#002FA7]',
    badgeColor: 'bg-blue-50 border-blue-200 text-[#002FA7]',
  },
] as const

const proofRows = [
  { label: 'Supply', value: '$18,354', pct: '64.4%', width: '64%', color: 'bg-[#002FA7]' },
  { label: 'Delivery (TDSP)', value: '$10,187', pct: '35.6%', width: '36%', color: 'bg-zinc-300' },
] as const

const statItems = [
  { value: '900+', label: 'Accounts reviewed' },
  { value: '$42M+', label: 'Hidden exposure found' },
  { value: '4CP', label: 'Season: Jun – Sep 2026' },
  { value: '100%', label: 'Supplier neutral' },
] as const

const trustPoints = [
  {
    icon: Zap,
    label: 'ERCOT-specific analysis',
    copy: 'Built around TDSP delivery charges, 4CP coincident peak exposure, and scarcity adder risk — not generic utility math.',
  },
  {
    icon: ShieldCheck,
    label: 'Supplier neutral',
    copy: 'The goal is the right structure, not a switch. Bad offers get benchmarked and rejected before they become your liability.',
  },
  {
    icon: LockKeyhole,
    label: 'Private by design',
    copy: 'Your bill identifies the cost drivers. We prepare the review. No public sharing, no supplier referrals without your consent.',
  },
] as const

export default function BillReviewLandingPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 font-sans antialiased">
      <LandingHeader />
      <ScrollRevealScope>
        {/* ── HERO ── */}
        <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 pt-20 pb-16 md:pt-32">
        {/* Dot matrix — absolute so it stays inside the hero only */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          aria-hidden
          style={{
            backgroundImage: 'radial-gradient(#002FA7 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            opacity: 0.1,
          }}
        />

          <div className="relative z-10 mx-auto max-w-7xl w-full grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">

          {/* Left — copy */}
            <div className="max-w-xl">
            {/* Season urgency badge */}
              <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 reveal-on-scroll">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-700">
                4CP season opens June 2026 — act before peak exposure locks in
              </span>
            </div>

              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[#002FA7] reveal-on-scroll delay-100">
              Commercial energy bill review
            </p>

              <h1 className="text-5xl sm:text-6xl lg:text-[4.25rem] font-bold tracking-[-0.07em] leading-[1.02] text-zinc-900">
                <span className="word-reveal" style={{ animationDelay: '0ms' }}>No</span>{' '}
                <span className="word-reveal" style={{ animationDelay: '40ms' }}>More</span>{' '}
                <span className="word-reveal" style={{ animationDelay: '80ms' }}>Energy</span>
                <br />
                <span className="text-[#002FA7]">
                  <span className="word-reveal" style={{ animationDelay: '120ms' }}>Surprises.</span>
                </span>
              </h1>

              <p className="mt-6 text-lg leading-8 text-zinc-600 max-w-lg reveal-on-scroll delay-100">
              Upload your bill before you sign another supplier offer. We separate the real cost
              drivers from the noise — so you can see whether the deal actually fits.
            </p>

              <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[#002FA7] reveal-on-scroll delay-200">
              <ShieldCheck className="h-4 w-4" />
              <span>No supplier switch required.</span>
            </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-4 reveal-on-scroll delay-300">
              <Link
                href="/bill-debugger?source=ad-landing"
                className="inline-flex items-center justify-center gap-2 px-6 md:px-8 py-4 bg-[#002FA7] text-white rounded-full text-base md:text-lg font-medium hover:scale-105 hover:bg-blue-800 transition-all duration-300 shadow-lg shadow-blue-900/20"
              >
                <Activity className="h-5 w-5" />
                Review My Bill
              </Link>
              <Link
                href="/book?from=/forensic-review"
                className="inline-flex items-center justify-center gap-2 px-6 md:px-8 py-4 border border-zinc-400 bg-white/60 text-zinc-700 rounded-full text-base md:text-lg font-medium hover:border-zinc-900 hover:text-zinc-900 hover:bg-white transition-all duration-300 shadow-sm"
              >
                <CalendarDays className="h-5 w-5" />
                Book a Strategy Call
              </Link>
            </div>

              {/* Trust micro-chips — match home page pill style */}
              <div className="mt-7 flex flex-wrap items-center gap-2.5 reveal-on-scroll delay-500">
                {[
                  { icon: LockKeyhole, label: 'Secure upload' },
                  { icon: Check, label: 'No obligation' },
                  { icon: Check, label: 'Texas commercial only' },
                ].map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-600 shadow-sm"
                  >
                    <item.icon className="h-3 w-3 text-[#002FA7]" />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — forensic card */}
            <div className="w-full reveal-on-scroll delay-300">
              <div className="rounded-3xl border border-zinc-200/50 bg-white shadow-xl overflow-hidden">

              {/* Card header */}
              <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-500">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Bill Analysis</p>
                    <p className="font-mono text-xs text-zinc-500">May 1 – May 31, 2026</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-700">
                  ✓ Analysis complete
                </span>
              </div>

              <div className="grid sm:grid-cols-2">
                {/* Cost breakdown */}
                <div className="border-b border-zinc-100 p-6 sm:border-b-0 sm:border-r sm:border-zinc-100">
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">
                    Cost breakdown
                  </p>

                  {/* Donut */}
                  <div className="mt-5 flex items-center gap-5">
                    <div
                      className="relative h-28 w-28 shrink-0 rounded-full p-5"
                      style={{ background: 'conic-gradient(#002FA7 0 64%, #e4e4e7 64% 100%)' }}
                    >
                      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner">
                        <span className="text-[10px] text-zinc-400">Total</span>
                        <span className="mt-0.5 font-mono text-base font-bold text-zinc-900">
                          $28,541
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3">
                      {proofRows.map((row) => (
                        <div key={row.label}>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${row.color}`} />
                              <span className="text-zinc-600">{row.label}</span>
                            </div>
                            <span className="font-mono font-medium text-zinc-900">{row.value}</span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-zinc-100">
                            <div className={`h-1 rounded-full ${row.color}`} style={{ width: row.width }} />
                          </div>
                          <p className="mt-0.5 text-right font-mono text-[10px] text-zinc-400">{row.pct}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Effective rate */}
                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-center gap-3">
                      <CircleDollarSign className="h-4 w-4 shrink-0 text-zinc-400" />
                      <div className="flex-1">
                        <p className="text-xs text-zinc-500">All-in effective rate</p>
                        <p className="font-mono text-lg font-bold text-zinc-900">10.43 ¢/kWh</p>
                      </div>
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] text-red-600">
                        FLAGGED
                      </span>
                    </div>
                  </div>
                </div>

                {/* Findings */}
                <div className="divide-y divide-zinc-100">
                  {reviewItems.map((item) => (
                    <div key={item.label} className="group flex items-start gap-3 p-5">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white ${item.badgeColor}`}>
                        <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-zinc-900">
                          {item.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{item.copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card footer */}
              <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-3">
                <span className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
                  <FileText className="h-3.5 w-3.5" />
                  May_2026_Statement.pdf
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  Reviewed before renewal
                </span>
              </div>
              </div>
            </div>
          </div>
        </section>

      <SupplierTicker
        label="Supplier partnerships — we benchmark across all of them"
        logos={SUPPLIER_LOGOS}
      />



      {/* ── SOCIAL PROOF STRIP ── */}
        <section className="border-y border-zinc-100 bg-white py-10 px-6">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
            {statItems.map((s, index) => (
              <div key={s.label} className={`text-center reveal-on-scroll ${index === 0 ? '' : index === 1 ? 'delay-100' : index === 2 ? 'delay-200' : 'delay-300'}`}>
              <p className="font-mono text-2xl font-bold text-[#002FA7] sm:text-3xl">{s.value}</p>
              <p className="mt-1 text-xs text-zinc-500 uppercase tracking-widest font-mono">{s.label}</p>
            </div>
            ))}
          </div>
        </section>

      {/* ── WHAT HAPPENS AFTER UPLOAD ── */}
        <section className="bg-[#F5F5F7] border-t border-zinc-100 px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 reveal-on-scroll">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#002FA7] mb-3">
              What happens after upload
            </p>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-900 max-w-2xl">
              A cleaner read before the wrong contract becomes your problem.
            </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {trustPoints.map((point, index) => (
              <div
                key={point.label}
                className={`rounded-3xl border border-zinc-200/50 bg-white p-8 shadow-sm hover:shadow-md transition-shadow duration-300 reveal-on-scroll ${index === 0 ? '' : index === 1 ? 'delay-100' : 'delay-200'}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50">
                  <point.icon className="h-5 w-5 text-[#002FA7]" />
                </div>
                <h3 className="mt-5 text-base font-semibold tracking-tight text-zinc-900">
                  {point.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{point.copy}</p>
              </div>
              ))}
            </div>
          </div>
        </section>

      {/* ── BOTTOM CTA ── */}
        <section className="py-32 bg-[#F5F5F7] border-t border-zinc-100 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3 reveal-on-scroll">
            4CP Season Opens June 2026
          </p>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tighter text-zinc-900 mb-6 leading-[1.05]">
            Find out what your bill is actually costing you.
          </h2>
            <p className="text-lg text-zinc-600 leading-7 mb-10 max-w-xl mx-auto reveal-on-scroll delay-100">
            Accounts entering ERCOT&apos;s four coincident peak months without a clear picture of
            their demand ratchet exposure carry liability they don&apos;t have to. A 15-minute
            review changes that.
          </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 reveal-on-scroll delay-200">
            <Link
              href="/bill-debugger?source=ad-landing-bottom"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#002FA7] text-white rounded-full text-lg font-medium hover:scale-105 hover:bg-blue-800 transition-all duration-300 shadow-lg shadow-blue-900/20"
            >
              <Activity className="h-5 w-5" />
              Review My Bill
            </Link>
            <Link
              href="/book?from=/forensic-review-bottom"
              className="inline-flex items-center gap-2 px-8 py-4 border border-zinc-400 bg-white/60 text-zinc-700 rounded-full text-lg font-medium hover:border-zinc-900 hover:text-zinc-900 hover:bg-white transition-all duration-300 shadow-sm"
            >
              <CalendarDays className="h-5 w-5" />
              Book a Strategy Call
            </Link>
            </div>
            <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400 reveal-on-scroll delay-300">
            +1 (817) 809-3367 · signal@nodalpoint.io · ERCOT Region, North Texas
          </p>
          </div>
        </section>
      </ScrollRevealScope>

      <LandingFooter />
    </main>
  )
}
