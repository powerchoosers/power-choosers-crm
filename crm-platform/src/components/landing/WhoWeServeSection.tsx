'use client'

import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Building,
  Building2,
  Factory,
  Hotel,
  Truck,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ScrollRevealScope } from '@/components/motion/ScrollRevealScope'

type Vertical = {
  title: string
  icon: LucideIcon
  summary: string
  focus: string
}

type ProofCard = {
  title: string
  bill: string
  usage: string
  issue: string
  action: string
  region: string
}

const VERTICALS: Vertical[] = [
  {
    title: 'Manufacturing',
    icon: Factory,
    summary: 'Long runs and ratchet floors can lock in cost.',
    focus: 'Peak windows / ratchets',
  },
  {
    title: 'Logistics & warehousing',
    icon: Truck,
    summary: 'Dock activity and delivery charges distort the bill.',
    focus: 'Dock spikes / delivery',
  },
  {
    title: 'Commercial real estate',
    icon: Building2,
    summary: 'Tenant recovery language can hide delivery cost.',
    focus: 'Pass-throughs / submetering',
  },
  {
    title: 'Hospitality',
    icon: Hotel,
    summary: 'Occupancy swings change the plan fast.',
    focus: 'Seasonality / HVAC',
  },
  {
    title: 'Office',
    icon: Building,
    summary: 'Base load and shared services need cleaner control.',
    focus: 'Base load / common areas',
  },
  {
    title: 'Restaurants',
    icon: UtensilsCrossed,
    summary: 'Kitchen peaks and late service move the meter.',
    focus: 'Kitchen load / late service',
  },
]

const PROOF_CARDS: ProofCard[] = [
  {
    title: 'Logistics warehouse',
    bill: '$3,735.44',
    usage: '20,250 kWh',
    issue: 'Delivery and demand charges were nearly half the bill.',
    action: 'Capacitor bank review plus demand-window analysis.',
    region: 'Oncor / Texas',
  },
  {
    title: 'Manufacturing facility',
    bill: '$18,442.17',
    usage: '112,600 kWh',
    issue: 'A demand ratchet was billing 85 kW above actual usage.',
    action: '4CP curtailment protocol and load shifting review.',
    region: 'CenterPoint / Texas',
  },
  {
    title: 'Commercial office building',
    bill: '$8,917.63',
    usage: '54,300 kWh',
    issue: 'Pass-through fees and TDU charges were hiding more than half the invoice.',
    action: 'Audit the contract language and delivery schedule.',
    region: 'Oncor / Texas',
  },
]

const COMMON_PATTERNS = [
  {
    title: 'Peak demand is usually the first leak.',
    summary:
      'Manufacturing lines, loading docks, kitchens, and HVAC spikes can lock in charges that outlast the busy hour that caused them.',
    signal: 'Demand / 4CP / ratchet',
  },
  {
    title: 'The contract can hide the real rate.',
    summary:
      'Pass-through language, delivery charges, and admin fees can make a quote look competitive while the invoice says something else.',
    signal: 'Pass-through / delivery / admin',
  },
  {
    title: 'The right plan depends on how the business runs.',
    summary:
      'Fixed, indexed, and hybrid offers behave differently once the schedule, peak load, and seasonal swings are real.',
    signal: 'Fixed / indexed / hybrid',
  },
] as const

export function WhoWeServeSection({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <section className="relative isolate overflow-hidden bg-[#FCFCFD] px-6 py-16 border-t border-zinc-100">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 reveal-on-scroll">
            <div className="max-w-3xl">
              <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">WHO WE SERVE</p>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter text-zinc-900">
                Built for Texas businesses with real load and real supplier choices.
              </h2>
              <p className="text-base md:text-lg text-zinc-600 leading-relaxed mt-3">
                Manufacturing, logistics, commercial real estate, hospitality, office, and restaurants. We read the bill, compare supplier offers, and match the plan to the business.
              </p>
            </div>
            <Link
              href="/who-we-serve"
              className="inline-flex items-center gap-2 self-start md:self-auto font-bold font-mono text-[10px] text-[#002FA7] uppercase tracking-widest hover:gap-3 transition-all duration-200"
            >
              See the full breakdown <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 reveal-on-scroll">
            {VERTICALS.map((item) => {
              const Icon = item.icon

              return (
                <div
                  key={item.title}
                  className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm transition-colors duration-200 hover:border-[#002FA7]/20"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-11 h-11 rounded-2xl bg-[#002FA7]/10 text-[#002FA7] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">Industry</p>
                      <h3 className="text-lg font-semibold text-zinc-900 mt-1">{item.title}</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-zinc-600">{item.summary}</p>
                  <p className="mt-3 text-[13px] leading-6 text-zinc-500">{item.focus}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  return (
    <ScrollRevealScope>
      <section className="relative isolate overflow-hidden bg-[#FCFCFD] px-6 pt-20 pb-20 md:pt-24 md:pb-28 border-t border-zinc-100">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.06] pointer-events-none" />
        <div aria-hidden className="absolute right-[-8rem] top-0 h-[28rem] w-[28rem] rounded-full bg-[#002FA7]/[0.08] blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-12 lg:gap-8 items-center">
            <div className="max-w-3xl">
              <p className="reveal-on-scroll font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">WHO WE SERVE</p>
              <h1 className="reveal-on-scroll delay-100 text-4xl md:text-7xl font-bold tracking-tighter text-black leading-[0.95] break-words">
                Texas businesses with real energy exposure.
              </h1>
              <p className="reveal-on-scroll delay-200 text-lg md:text-xl text-zinc-600 max-w-3xl leading-relaxed mt-6">
                We work with manufacturing, logistics, commercial real estate, hospitality, office, and restaurants. Each one has a different load pattern, so the contract and plan have to fit the business.
              </p>
              <div className="reveal-on-scroll delay-300 flex flex-col sm:flex-row items-start gap-4 mt-8">
                <Link
                  href="/bill-debugger"
                  className="inline-flex items-center gap-3 bg-[#002FA7] text-white px-8 py-4 rounded-full text-lg font-medium hover:scale-105 transition-transform shadow-xl shadow-blue-900/20"
                >
                  <Activity className="w-5 h-5" />
                  <span>Review My Bill</span>
                </Link>
                <Link
                  href="/book"
                  className="inline-flex items-center gap-2 px-6 md:px-8 py-4 bg-white border border-zinc-300 text-zinc-900 rounded-full text-base md:text-lg font-medium shadow-sm hover:border-zinc-400 hover:bg-zinc-50 transition-all duration-300 whitespace-nowrap"
                >
                  <CalendarDays className="w-5 h-5" />
                  <span>Book a Strategy Call</span>
                </Link>
              </div>
              <p className="reveal-on-scroll delay-500 mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-400">
                Built for ERCOT accounts with variable load and active supplier choice
              </p>
            </div>

            <div className="reveal-on-scroll delay-300 relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden border border-zinc-200/80 shadow-2xl shadow-black/5 bg-zinc-950">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#002FA7]/10 to-transparent mix-blend-screen z-10 pointer-events-none" />
              <img 
                src="/images/texas-tdsp-map.png" 
                alt="Texas TDSP Deregulated Electricity Areas Map" 
                className="absolute inset-0 w-full h-full object-cover object-center opacity-90" 
              />
              <div className="absolute bottom-4 left-4 z-20">
                <div className="bg-white/10 backdrop-blur-md border border-white/10 text-white/80 font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-full">
                  ERCOT Deregulated Zones
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 border-t border-zinc-200/80 pt-14">
            <div className="reveal-on-scroll max-w-3xl">
              <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">INDUSTRIES WE COVER</p>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter text-zinc-900">
                Coverage map
              </h2>
              <p className="text-base md:text-lg text-zinc-600 leading-relaxed mt-4">
                These are the accounts where load shape, contract language, and supplier choice actually change the answer.
              </p>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {VERTICALS.map((item, index) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.title}
                    className={`reveal-on-scroll ${
                      index === 0 ? '' : index === 1 ? 'delay-100' : index === 2 ? 'delay-200' : 'delay-300'
                    } rounded-[1.75rem] border border-zinc-200/70 bg-white/85 p-5 shadow-[0_18px_40px_-35px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors duration-200 hover:border-[#002FA7]/20`}
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="shrink-0 w-11 h-11 rounded-2xl bg-[#002FA7]/10 text-[#002FA7] flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">
                          {String(index + 1).padStart(2, '0')}
                        </p>
                        <h3 className="mt-1 text-base md:text-[17px] font-semibold tracking-tight leading-snug text-zinc-900">
                          {item.title}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-zinc-600">{item.summary}</p>
                        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">
                          {item.focus}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-white px-6 py-20 md:py-28 border-t border-zinc-100">
        <div className="max-w-7xl mx-auto grid gap-12 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-start">
          <div className="reveal-on-scroll max-w-md">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">WHAT CHANGES THE ANSWER</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter text-zinc-900">
              Different loads leak in different places.
            </h2>
            <p className="text-base md:text-lg text-zinc-600 leading-relaxed mt-4">
              We usually start with three things: how the account peaks, what the contract is really passing through, and whether the plan matches how the business actually operates.
            </p>
          </div>

          <div>
            {COMMON_PATTERNS.map((pattern, index) => (
              <article
                key={pattern.title}
                className={`reveal-on-scroll ${
                  index === 0 ? '' : index === 1 ? 'delay-100' : 'delay-200'
                } grid gap-6 py-8 border-t border-zinc-200 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_180px] lg:gap-10`}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#002FA7]/10 text-[#002FA7] font-mono text-xs font-semibold">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">Pattern</p>
                    <h3 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{pattern.title}</h3>
                  </div>
                </div>
                <p className="text-base md:text-lg leading-7 text-zinc-600">{pattern.summary}</p>
                <div className="lg:text-right">
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">Signal</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-700">{pattern.signal}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#FCFCFD] px-6 py-20 md:py-28 border-t border-zinc-100">
        <div className="max-w-7xl mx-auto">
          <div className="reveal-on-scroll max-w-3xl mb-10">
            <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-3">SELECTED REVIEWS</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tighter text-zinc-900">
              Three anonymized bills from real Texas accounts.
            </h2>
            <p className="text-base md:text-lg text-zinc-600 leading-relaxed mt-3">
              Company names are hidden. The numbers, charge patterns, and recommended actions are real.
            </p>
          </div>

          <div className="rounded-[2.5rem] border border-zinc-200 bg-white shadow-[0_30px_80px_-55px_rgba(0,0,0,0.35)] overflow-hidden">
            {PROOF_CARDS.map((card, index) => (
              <div
                key={card.title}
                className={`reveal-on-scroll ${
                  index === 0 ? '' : index === 1 ? 'delay-100' : 'delay-200'
                } grid gap-6 px-6 py-6 md:px-8 md:py-7 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,200px)] items-start border-t border-zinc-100 first:border-t-0 ${
                  index === 0 ? 'bg-[#002FA7]/[0.03]' : 'bg-white'
                }`}
              >
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#002FA7]">Case file</p>
                  {index === 0 && <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-500">Featured</p>}
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{card.title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{card.region}</p>
                </div>

                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">What changed</p>
                  <p className="mt-2 text-lg font-medium tracking-tight text-zinc-900 leading-tight">{card.issue}</p>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{card.action}</p>
                </div>

                <div className="lg:text-right">
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">Bill total</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{card.bill}</p>
                  <p className="mt-2 text-sm text-zinc-500">{card.usage}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </ScrollRevealScope>
  )
}
