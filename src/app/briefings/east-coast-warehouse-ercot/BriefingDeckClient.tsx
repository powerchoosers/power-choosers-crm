'use client'

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudLightning,
  DollarSign,
  Fan,
  Gauge,
  Settings2,
  ShieldAlert,
  TriangleAlert,
  Warehouse,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SlideTab = {
  label: string
  shortLabel: string
}

const slides: SlideTab[] = [
  { label: 'Cover', shortLabel: '01' },
  { label: 'Locations', shortLabel: '02' },
  { label: 'ERCOT', shortLabel: '03' },
  { label: 'Bill drivers', shortLabel: '04' },
  { label: 'Controls', shortLabel: '05' },
  { label: 'Next steps', shortLabel: '06' },
]

const slideCount = slides.length
const eastCoastLogoUrl =
  'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/69a513e9b9ec58000139b51f/picture'
const nodalLogoUrl = '/images/nodalpoint-webicon.png'
const heroImage = '/briefings/east-coast-warehouse-ercot/ercot-hero.png'
const controlsImage = '/briefings/east-coast-warehouse-ercot/warehouse-controls.png'
const baytownImage = '/briefings/east-coast-warehouse-ercot/baytown-aerial.jpg'

const heroMetrics = [
  {
    value: '8.5¢/kWh',
    label: 'Texas commercial benchmark',
    icon: DollarSign,
  },
  {
    value: '7.8¢/kWh',
    label: 'Houston industrial target',
    icon: Gauge,
  },
  {
    value: '80% ratchet',
    label: 'CenterPoint demand exposure',
    icon: TriangleAlert,
  },
]

const footprintChips = ['NY/NJ', 'PA', 'MD', 'SC', 'GA', 'TX']

const locationCards = [
  {
    eyebrow: 'East Coast base',
    title: 'Elizabeth, New Jersey',
    utility: 'PSE&G',
    market: 'PJM choice market',
    note: 'Current East Coast anchor for the company.',
    icon: Building2,
  },
  {
    eyebrow: 'Texas site',
    title: 'Baytown, Texas',
    utility: 'CenterPoint',
    market: 'ERCOT choice market',
    note: '9200 FM 1405, Baytown, TX 77523',
    icon: Warehouse,
  },
]

const ercotPoints = [
  {
    icon: Zap,
    title: 'ERCOT runs most of Texas',
    text: 'The grid operator is local to Texas, so the market rules are not the same as the East Coast site.',
  },
  {
    icon: BadgeDollarSign,
    title: 'Supply can be competitive',
    text: 'Customers can choose a retail supplier, but the delivery utility still owns the wires and delivery charge.',
  },
  {
    icon: Warehouse,
    title: 'CenterPoint still matters',
    text: 'In Houston, CenterPoint is the utility name that shows up on the delivery side of the bill.',
  },
  {
    icon: ShieldAlert,
    title: 'The bill is more than cents per kWh',
    text: 'Demand peaks, delivery rules, and ratchets can change the real cost a lot.',
  },
]

const billDrivers = [
  {
    icon: DollarSign,
    title: 'Energy rate',
    text: 'The price for the power you actually use.',
  },
  {
    icon: Gauge,
    title: 'Peak demand',
    text: 'The highest 15-minute load can matter more than a whole week of normal use.',
  },
  {
    icon: TriangleAlert,
    title: 'Demand ratchet',
    text: 'A bad peak can keep influencing later Houston delivery bills.',
  },
  {
    icon: CloudLightning,
    title: '4CP exposure',
    text: 'ERCOT transmission costs are tied to the four worst summer peaks.',
  },
]

const controlMoves = [
  {
    icon: Clock3,
    title: 'Stagger starts',
    text: 'Do not turn every load on at the same minute.',
  },
  {
    icon: Fan,
    title: 'Tune HVAC schedules',
    text: 'Use pre-cooling and setpoints to flatten the curve before expensive hours.',
  },
  {
    icon: Warehouse,
    title: 'Control dock loads',
    text: 'Keep doors, lights, compressors, and other equipment from fighting each other.',
  },
  {
    icon: Settings2,
    title: 'Use the BAS on purpose',
    text: 'Alarms and schedules should help you avoid the peak, not react after it happens.',
  },
]

const askList = [
  'Hours and days of operation',
  'Confirm service address and ESID',
  'Square footage of occupied space',
  'Nature of the business at the address',
  'Number of air conditioning units, if available',
  'A bill from a similar sized facility',
  'A bill from the current facility',
]

function slideNumber(value: number) {
  return `${String(value + 1).padStart(2, '0')} / ${String(slideCount).padStart(2, '0')}`
}

function slideButtonClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-mono uppercase tracking-[0.28em] transition-all',
    active
      ? 'border-[#002FA7]/60 bg-[#002FA7]/18 text-white shadow-[0_0_0_1px_rgba(0,47,167,0.25)]'
      : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-200',
  )
}

function slideShellClass(extra?: string) {
  return cn(
    'relative h-full w-full overflow-hidden rounded-[32px] border border-white/10 bg-[#07080d] shadow-[0_40px_120px_-50px_rgba(0,0,0,0.95)]',
    extra,
  )
}

function deckTextClass() {
  return 'text-zinc-300 leading-7 md:leading-8 text-[15px] md:text-[17px]'
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-mono uppercase tracking-[0.38em] text-zinc-500">
      {children}
    </p>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
      {children}
    </h2>
  )
}

function MetricCard({
  value,
  label,
  icon: Icon,
}: {
  value: string
  label: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] md:p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
          Benchmark
        </span>
        <Icon className="h-4 w-4 text-[#002FA7]" />
      </div>
      <div className="mt-4 text-xl font-semibold tracking-tight text-white md:text-3xl">
        {value}
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-400 md:text-sm md:leading-6">
        {label}
      </p>
    </div>
  )
}

function InfoCard({
  eyebrow,
  title,
  utility,
  market,
  note,
  icon: Icon,
}: {
  eyebrow: string
  title: string
  utility: string
  market: string
  note: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
            {eyebrow}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-white md:text-2xl">
            {title}
          </h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#002FA7]/15 text-[#7fb0ff]">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-zinc-300">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
          <span className="font-mono uppercase tracking-[0.28em] text-zinc-500">
            Utility
          </span>
          <span className="text-white">{utility}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
          <span className="font-mono uppercase tracking-[0.28em] text-zinc-500">
            Market
          </span>
          <span className="text-white">{market}</span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-400">{note}</p>
    </div>
  )
}

function BulletCard({
  icon: Icon,
  title,
  text,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  text: string
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#002FA7]/15 text-[#7fb0ff]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-semibold tracking-tight text-white">
            {title}
          </h4>
          <p className="mt-1 text-sm leading-6 text-zinc-400">{text}</p>
        </div>
      </div>
    </div>
  )
}

function FlowPill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-200">
      {children}
    </span>
  )
}

function CoverSlide() {
  return (
    <div className={slideShellClass('bg-[radial-gradient(circle_at_75%_10%,rgba(0,47,167,0.28),transparent_28%),radial-gradient(circle_at_0%_100%,rgba(255,255,255,0.06),transparent_28%)]')}>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%,rgba(0,0,0,0.35))] pointer-events-none" />
      <div className="relative z-10 flex h-full flex-col p-5 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
              <img
                src={nodalLogoUrl}
                alt="Nodal Point logo"
                className="h-7 w-7 rounded-full object-cover"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-300">
                Nodal Point
              </span>
            </div>
            <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 md:flex">
              <img
                src={eastCoastLogoUrl}
                alt="East Coast Warehouse & Distribution logo"
                className="h-6 w-24 object-contain"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-500">
                East Coast Warehouse & Distribution
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-[10px] font-mono uppercase tracking-[0.32em] text-zinc-500 sm:flex">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
              For Sean Bowe
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
              General Manager
            </span>
          </div>
        </div>

        <div className="grid flex-1 gap-6 pt-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch">
          <div className="flex h-full flex-col justify-between gap-6">
            <div className="max-w-2xl">
              <SectionLabel>Texas briefing</SectionLabel>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-6xl md:leading-[0.95]">
                Texas energy is not the same bill Sean sees on the East Coast.
              </h1>
              <p className={cn(deckTextClass(), 'mt-5 max-w-xl')}>
                Baytown sits in ERCOT and CenterPoint territory. That changes
                who delivers power, how peaks are billed, and why one bad
                operating day can cost more than the headline rate suggests.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
              {heroMetrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  value={metric.value}
                  label={metric.label}
                  icon={metric.icon}
                />
              ))}
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                Read this first
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base md:leading-7">
                Both New Jersey and Texas let customers choose supply. The
                difference is the grid, the delivery utility, and the way peak
                demand can keep showing up on the bill.
              </p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                Benchmarks are working targets, not guarantees. Final pricing
                depends on load shape, term, and how the building actually runs.
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-black/40">
            <img
              src={heroImage}
              alt="ERCOT market illustration for a Texas warehouse"
              className="h-full w-full object-cover object-center"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/10 bg-black/45 p-4 backdrop-blur-md">
                  <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                    Baytown
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    9200 FM 1405, Baytown, TX 77523
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    321,440 SF occupied space, ESID 1008901025005643360125.
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-[#002FA7]/18 p-4 backdrop-blur-md">
                  <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-blue-100/70">
                    Market signal
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    ERCOT + CenterPoint changes the cost story.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-blue-50/80">
                    The lowest energy rate does not mean the lowest total bill if
                    the building is spiky.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LocationSlide() {
  return (
    <div className={slideShellClass('bg-[radial-gradient(circle_at_15%_18%,rgba(0,47,167,0.14),transparent_28%),radial-gradient(circle_at_86%_0%,rgba(255,255,255,0.05),transparent_20%)]')}>
      <div className="relative z-10 grid h-full gap-6 p-5 md:p-8 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="flex min-h-0 flex-col gap-5">
          <div>
            <SectionLabel>Current footprint</SectionLabel>
            <SectionTitle>Two sites. Two different utility stories.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4 max-w-xl')}>
              East Coast Warehouse&apos;s official site shows locations across
              NY/NJ, PA, MD, SC, GA, and TX. For this conversation, the useful
              comparison is the East Coast base in New Jersey versus the new
              Baytown site in Texas.
            </p>
          </div>

          <div className="grid gap-3">
            {locationCards.map((card) => (
              <InfoCard key={card.title} {...card} />
            ))}
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
              Official footprint
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {footprintChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.28em] text-zinc-300"
                >
                  {chip}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Same company. Same product line. Different grid, different utility,
              different cost triggers.
            </p>
          </div>
        </div>

        <div className="relative min-h-[34rem] overflow-hidden rounded-[30px] border border-white/10 bg-black/35">
          <img
            src={baytownImage}
            alt="Aerial view of the Baytown Texas warehouse"
            className="h-full w-full object-cover object-center"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/24 to-transparent" />
          <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/45 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-300 backdrop-blur-md">
            Actual facility photo
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
            <div className="rounded-[24px] border border-white/10 bg-black/55 p-4 backdrop-blur-md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                    Baytown site
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    9200 FM 1405, Baytown, TX 77523
                  </h3>
                </div>
                <div className="rounded-full border border-[#002FA7]/35 bg-[#002FA7]/15 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-blue-100">
                  CenterPoint / ERCOT
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                    Space
                  </p>
                  <p className="mt-1 text-sm text-white">321,440 SF occupied</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                    ESID
                  </p>
                  <p className="mt-1 text-sm text-white">
                    1008901025005643360125
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                    Status
                  </p>
                  <p className="mt-1 text-sm text-white">New Texas site</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ErcotSlide() {
  return (
    <div className={slideShellClass('bg-black')}>
      <img
        src={heroImage}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/72 to-black/18" />

      <div className="relative z-10 grid h-full gap-6 p-5 md:p-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex min-h-0 flex-col justify-between gap-5">
          <div className="max-w-xl">
            <SectionLabel>ERCOT in plain English</SectionLabel>
            <SectionTitle>ERCOT runs most of Texas.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4')}>
              It is the grid operator. In choice areas, the supplier can change,
              but the delivery utility still owns the wires and the way the bill
              reacts to peaks.
            </p>

            <div className="mt-5 grid gap-3">
              {ercotPoints.map((point) => (
                <BulletCard key={point.title} {...point} />
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
              Bottom line
            </p>
            <p className="mt-2 text-sm leading-7 text-zinc-300 md:text-base">
              If the building peaks wrong, the bill can stay ugly after the month
              is over. That is the part Sean needs to understand before the first
              Texas quote lands.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 items-end">
          <div className="w-full rounded-[30px] border border-white/10 bg-black/50 p-4 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-3">
              <FlowPill>Supply</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Delivery</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Peak demand</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Taxes / fees</FlowPill>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                  What changed in Texas
                </p>
                <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
                  <li>Grid operator is ERCOT, not the East Coast market.</li>
                  <li>CenterPoint delivery charges still hit the bill.</li>
                  <li>One peak day can influence more than one month.</li>
                </ul>
              </div>
              <div className="rounded-[24px] border border-[#002FA7]/35 bg-[#002FA7]/12 p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-blue-100/70">
                  Conversation line
                </p>
                <p className="mt-3 text-base leading-7 text-white">
                  The cheapest rate in town does not help if the building is
                  peak-happy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BillDriversSlide() {
  return (
    <div className={slideShellClass('bg-black')}>
      <img
        src={controlsImage}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-58"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/18" />

      <div className="relative z-10 grid h-full gap-6 p-5 md:p-8 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="flex min-h-0 flex-col gap-5">
          <div className="max-w-2xl">
            <SectionLabel>What moves the bill</SectionLabel>
            <SectionTitle>A cheap rate does not fix a bad load shape.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4')}>
              In Houston, the bill is pushed by more than one thing. Supply is
              one piece. Demand, delivery, and ratchet exposure are the parts
              that surprise people who only look at the headline rate.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {billDrivers.map((driver) => (
              <BulletCard key={driver.title} {...driver} />
            ))}
          </div>

          <div className="rounded-[26px] border border-white/10 bg-black/50 p-4 backdrop-blur-md">
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
              Bill anatomy
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
              <FlowPill>Supply</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Delivery</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Demand / ratchet</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Taxes / fees</FlowPill>
              <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-500">
                = total bill
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 items-end">
          <div className="w-full rounded-[30px] border border-white/10 bg-black/55 p-4 backdrop-blur-md">
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
              Why controls matter
            </p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Start times</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  If everything starts together, demand jumps together.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">HVAC</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Pre-cooling and schedule control can flatten the expensive
                  hours without changing operations.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Dock doors and lights</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Small waste adds up fast in a big warehouse.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlSlide() {
  return (
    <div className={slideShellClass('bg-[radial-gradient(circle_at_15%_25%,rgba(0,47,167,0.16),transparent_25%),radial-gradient(circle_at_86%_15%,rgba(255,255,255,0.05),transparent_18%)]')}>
      <div className="relative z-10 grid h-full gap-6 p-5 md:p-8 lg:grid-cols-[1fr_1fr]">
        <div className="flex min-h-0 flex-col gap-5">
          <div>
            <SectionLabel>How to lower cost</SectionLabel>
            <SectionTitle>Reduce the spike before you chase the rate.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4 max-w-xl')}>
              The fastest wins usually come from operations, not the spreadsheet.
              If the load curve gets flatter, the supplier quote becomes easier
              to turn into a real bill.
            </p>
          </div>

          <div className="grid gap-3">
            {controlMoves.map((move) => (
              <BulletCard key={move.title} {...move} />
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4 rounded-[30px] border border-white/10 bg-black/50 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                Peak shape
              </p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-white">
                Make the load curve less pointy.
              </p>
            </div>
            <div className="rounded-full border border-[#002FA7]/35 bg-[#002FA7]/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-blue-100">
              Controls first
            </div>
          </div>

          <div className="relative min-h-[16rem] overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.3))] p-4">
            <div className="absolute inset-x-4 bottom-14 h-px bg-white/10" />
            <div className="absolute inset-x-4 bottom-24 h-px bg-white/10" />
            <svg
              viewBox="0 0 640 280"
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="peak-line" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#5da4ff" />
                  <stop offset="100%" stopColor="#002FA7" />
                </linearGradient>
                <linearGradient id="peak-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(0,47,167,0.45)" />
                  <stop offset="100%" stopColor="rgba(0,47,167,0)" />
                </linearGradient>
              </defs>
              <path
                d="M 0 225 L 50 210 L 100 192 L 150 195 L 200 168 L 250 182 L 300 138 L 350 112 L 400 152 L 450 170 L 500 155 L 550 180 L 600 166 L 640 173 L 640 280 L 0 280 Z"
                fill="url(#peak-fill)"
                opacity="0.9"
              />
              <path
                d="M 0 225 L 50 210 L 100 192 L 150 195 L 200 168 L 250 182 L 300 138 L 350 112 L 400 152 L 450 170 L 500 155 L 550 180 L 600 166 L 640 173"
                fill="none"
                stroke="url(#peak-line)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="350" cy="112" r="7" fill="#a8c9ff" />
            </svg>

            <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/55 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-300 backdrop-blur-md">
              Pre-cool before the peak
            </div>
            <div className="absolute right-5 top-5 rounded-full border border-[#002FA7]/35 bg-[#002FA7]/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.34em] text-blue-100 backdrop-blur-md">
              Peak held down
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-500">
              <span>Lower load early</span>
              <span>Higher load during peak</span>
              <span>Flatter bill later</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                Do
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                <li>Pre-cool before expensive hours</li>
                <li>Stagger equipment starts</li>
                <li>Watch summer peak days</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                Avoid
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                <li>Turning everything on at once</li>
                <li>Leaving dock doors open</li>
                <li>Trusting an empty-building bill</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AskSlide() {
  return (
    <div className={slideShellClass('bg-[radial-gradient(circle_at_0%_0%,rgba(0,47,167,0.18),transparent_24%),radial-gradient(circle_at_100%_100%,rgba(255,255,255,0.05),transparent_20%)]')}>
      <div className="relative z-10 grid h-full gap-6 p-5 md:p-8 lg:grid-cols-[1fr_0.98fr]">
        <div className="flex min-h-0 flex-col gap-5">
          <div className="max-w-2xl">
            <SectionLabel>What I need next</SectionLabel>
            <SectionTitle>Give me the operating facts and I can make the quote real.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4')}>
              The Baytown space is currently not occupied, so the current utility
              bill does not tell the full story. A similar-sized bill plus the
              real operating schedule will give us a much cleaner comparison.
            </p>
          </div>

          <div className="grid gap-3">
            {askList.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#7fb0ff]" />
                <p className="text-sm leading-6 text-zinc-200">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col justify-between gap-4 rounded-[30px] border border-white/10 bg-black/45 p-5 backdrop-blur-md">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
              Email ask
            </p>
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm leading-7 text-zinc-300">
                To take a look at what we can do, I just need to know the hours
                and days of operation, the service address and ESID, the square
                footage of occupied space, the nature of the business, and a
                bill from a similar sized facility.
              </p>
              <p className="mt-3 text-sm leading-7 text-zinc-300">
                If we can get that, we can discuss how CenterPoint demand
                penalties work so East Coast Warehouse does not get hit with a
                bill that looks normal on the surface but is expensive underneath.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#002FA7]/35 bg-[#002FA7]/14 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-blue-100/70">
                  Closing line
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-white">
                  Same business. Different bill. Smaller surprises if we get the
                  controls right.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-200">
                Ready for Sean
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const slideComponents = [
  CoverSlide,
  LocationSlide,
  ErcotSlide,
  BillDriversSlide,
  ControlSlide,
  AskSlide,
]

export function BriefingDeckClient() {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [direction, setDirection] = useState(1)
  const prefersReducedMotion = useReducedMotion()

  const goToSlide = (nextSlide: number) => {
    setDirection(nextSlide > currentSlide ? 1 : -1)
    setCurrentSlide(nextSlide)
  }

  const goPrevious = () => {
    setDirection(-1)
    setCurrentSlide((value) => (value - 1 + slideCount) % slideCount)
  }

  const goNext = () => {
    setDirection(1)
    setCurrentSlide((value) => (value + 1) % slideCount)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        goNext()
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        goPrevious()
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        goToSlide(0)
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        goToSlide(slideCount - 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentSlide])

  const ActiveSlide = slideComponents[currentSlide]

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050507] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1820px] flex-col gap-3 px-3 py-3 md:px-6 md:py-5">
        <header className="sticky top-3 z-50 flex flex-col gap-3 rounded-[24px] border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl md:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
                <img
                  src={nodalLogoUrl}
                  alt="Nodal Point logo"
                  className="h-7 w-7 rounded-full object-cover"
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-200">
                  Nodal Point
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
                <img
                  src={eastCoastLogoUrl}
                  alt="East Coast Warehouse & Distribution logo"
                  className="h-6 w-24 object-contain"
                />
                <span className="hidden truncate font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500 sm:block">
                  East Coast Warehouse & Distribution
                </span>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-300">
                Texas ERCOT briefing
              </div>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-auto">
              <button
                type="button"
                onClick={goPrevious}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:border-white/15 hover:bg-white/[0.08]"
                aria-label="Previous slide"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.34em] text-zinc-300">
                {slideNumber(currentSlide)}
              </div>
              <button
                type="button"
                onClick={goNext}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:border-white/15 hover:bg-white/[0.08]"
                aria-label="Next slide"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {slides.map((slide, index) => {
              const active = index === currentSlide
              return (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => goToSlide(index)}
                  className={slideButtonClass(active)}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="text-[#7fb0ff]">{slide.shortLabel}</span>
                  <span>{slide.label}</span>
                </button>
              )
            })}
          </div>
        </header>

        <main className="min-h-0 flex-1 pb-2 md:pb-0">
          <div className="relative h-full min-h-[calc(100svh-9.75rem)]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentSlide}
                className="absolute inset-0"
                initial={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: direction > 0 ? 64 : -64, filter: 'blur(10px)' }
                }
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: direction > 0 ? -64 : 64, filter: 'blur(10px)' }
                }
                transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }}
              >
                <ActiveSlide />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
