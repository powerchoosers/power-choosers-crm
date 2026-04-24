'use client'

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
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
  { label: 'Overview', shortLabel: '01' },
  { label: 'Locations', shortLabel: '02' },
  { label: 'Texas grid', shortLabel: '03' },
  { label: 'Cost drivers', shortLabel: '04' },
  { label: 'Market context', shortLabel: '05' },
  { label: 'Bill range', shortLabel: '06' },
  { label: 'Controls', shortLabel: '07' },
  { label: 'Next steps', shortLabel: '08' },
]

const slideCount = slides.length
const eastCoastLogoUrl =
  'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/69a513e9b9ec58000139b51f/picture'
const nodalLogoUrl = '/images/nodalpoint-webicon.png'
const heroImage = '/briefings/east-coast-warehouse-ercot/ercot-hero.png'
const controlsImage = '/briefings/east-coast-warehouse-ercot/warehouse-controls.png'
const baytownImage = '/briefings/east-coast-warehouse-ercot/baytown-aerial.jpg'
const baytownBuildingSf = 321440
const planningEnergyRate = 0.085
const planningDemandRatePerKwMonth = 11

function calcAnnualKwh(perSf: number) {
  return perSf * baytownBuildingSf
}

function calcEnergyCost(annualKwh: number) {
  return annualKwh * planningEnergyRate
}

function calcDemandCost(peakKw: number) {
  return peakKw * planningDemandRatePerKwMonth * 12
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }

  if (value >= 10_000) {
    return `$${Math.round(value / 1000)}k`
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

const wholeCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatCurrencyWhole(value: number) {
  return wholeCurrencyFormatter.format(Math.round(value))
}

function formatMillionKwh(value: number) {
  return `${(value / 1_000_000).toFixed(1)}M kWh/yr`
}

function formatForwardPrice(value: number) {
  return `$${value.toFixed(2)}`
}

const heroMetrics = [
  {
    value: '8.5¢/kWh',
    label: 'Commercial planning reference',
    icon: DollarSign,
  },
  {
    value: '7.8¢/kWh',
    label: 'Houston industrial reference',
    icon: Gauge,
  },
  {
    value: '80% ratchet',
    label: 'CenterPoint demand ratchet',
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
    note: 'Current East Coast location for the company.',
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
    text: 'Texas is on ERCOT, so the market rules are different from the East Coast site.',
  },
  {
    icon: BadgeDollarSign,
    title: 'Supply can be competitive',
    text: 'You can choose a retail supplier, but the delivery utility still owns the wires and delivery charges.',
  },
  {
    icon: Warehouse,
    title: 'CenterPoint still matters',
    text: 'In Houston, CenterPoint is the utility name that appears on the delivery side of the bill.',
  },
  {
    icon: ShieldAlert,
    title: 'The bill is more than cents per kWh',
    text: 'Demand peaks, delivery rules, and ratchets can have a large impact on the total bill.',
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
    text: 'The highest 15-minute load can matter more than a normal week of use.',
  },
  {
    icon: TriangleAlert,
    title: 'Demand ratchet',
    text: 'A high peak can affect later Houston delivery bills.',
  },
  {
    icon: CloudLightning,
    title: 'Nodal congestion',
    text: 'Grid congestion can show up as a separate cost line. Custom pricing can help address how that risk is handled in the quote.',
  },
  {
    icon: CloudLightning,
    title: '4CP exposure',
    text: 'ERCOT transmission costs are tied to the four highest summer peaks.',
  },
]

const controlMoves = [
  {
    icon: Clock3,
    title: 'Stagger starts',
    text: 'Stagger major starts so the load does not jump all at once.',
  },
  {
    icon: Fan,
    title: 'Tune HVAC schedules',
    text: 'Use pre-cooling and setpoints to lower the load before the expensive hours.',
  },
  {
    icon: Warehouse,
    title: 'Control dock loads',
    text: 'Keep doors, lights, compressors, and other equipment from creating avoidable overlap.',
  },
  {
    icon: Settings2,
    title: 'Use the BAS on purpose',
    text: 'Schedules and alarms should help you stay ahead of the peak, not react after it happens.',
  },
]

const usageScenarios = [
  {
    label: 'Low / efficient',
    summary: 'good LED, minimal HVAC in the warehouse, average operating hours',
    annualKwh: calcAnnualKwh(8),
    annualKwhLabel: '8 kWh/SF-year',
    annualKwhRangeDisplay: '8 kWh/SF-year',
    annualKwhDisplay: formatMillionKwh(calcAnnualKwh(8)),
    energyCost: calcEnergyCost(calcAnnualKwh(8)),
    energyCostDisplay: '~$219k energy',
    energyRangeDisplay: '~$219k energy',
    demandKw: 250,
    demandCost: calcDemandCost(250),
    demandCostDisplay: '~$33k demand',
    demandRangeDisplay: '~$33k demand',
    totalCost: calcEnergyCost(calcAnnualKwh(8)) + calcDemandCost(250),
    totalCostDisplay: '~$252k total',
    totalRangeDisplay: '~$252k total',
  },
  {
    label: 'Typical busy DC',
    summary: 'extended hours, conditioned office, some ventilation and dock equipment',
    annualKwh: calcAnnualKwh(13.5),
    annualKwhLabel: '12-15 kWh/SF-year',
    annualKwhRangeDisplay: '3.9M-4.8M kWh/year',
    annualKwhDisplay: formatMillionKwh(calcAnnualKwh(13.5)),
    energyCost: calcEnergyCost(calcAnnualKwh(13.5)),
    energyCostDisplay: '~$369k energy',
    energyRangeDisplay: '~$329k-$410k energy',
    demandKw: 575,
    demandCost: calcDemandCost(575),
    demandCostDisplay: '~$76k demand',
    demandRangeDisplay: '~$66k-$86k demand',
    totalCost: calcEnergyCost(calcAnnualKwh(13.5)) + calcDemandCost(575),
    totalCostDisplay: '~$445k total',
    totalRangeDisplay: '~$395k-$496k total',
  },
  {
    label: 'High intensity',
    summary: 'more HVAC in warehouse zones, heavier equipment, some temp-controlled space',
    annualKwh: calcAnnualKwh(22.5),
    annualKwhLabel: '20-25 kWh/SF-year',
    annualKwhRangeDisplay: '6.4M-8.0M kWh/year',
    annualKwhDisplay: formatMillionKwh(calcAnnualKwh(22.5)),
    energyCost: calcEnergyCost(calcAnnualKwh(22.5)),
    energyCostDisplay: '~$615k energy',
    energyRangeDisplay: '~$546k-$683k energy',
    demandKw: 950,
    demandCost: calcDemandCost(950),
    demandCostDisplay: '~$125k demand',
    demandRangeDisplay: '~$106k-$158k demand',
    totalCost: calcEnergyCost(calcAnnualKwh(22.5)) + calcDemandCost(950),
    totalCostDisplay: '~$740k total',
    totalRangeDisplay: '~$652k-$841k total',
  },
] as const

const bloombergForwardCurve = [
  { month: 'May 26', price: 35.2 },
  { month: 'Jun 26', price: 38.04 },
  { month: 'Jul 26', price: 53.6 },
  { month: 'Aug 26', price: 78.77 },
  { month: 'Sep 26', price: 46.93 },
  { month: 'Oct 26', price: 34.62 },
  { month: 'Nov 26', price: 34.54 },
  { month: 'Dec 26', price: 39.8 },
  { month: 'Jan 27', price: 53.84 },
  { month: 'Feb 27', price: 52.14 },
  { month: 'Mar 27', price: 36.03 },
  { month: 'Apr 27', price: 35.12 },
] as const

const marketContextCards = [
  {
    icon: CloudLightning,
    eyebrow: 'Summer timing',
    value: '85,508 MW',
    label: 'ERCOT all-time peak demand record',
    text: 'ERCOT says June through September is the stress window. Demand usually peaks mid-to-late afternoon, and operating reserves are tightest in the evening as solar ramps down.',
    source: 'ERCOT summer page; peak demand records',
  },
  {
    icon: Zap,
    eyebrow: 'Load growth',
    value: '367,790 MW',
    label: 'ERCOT forecast by 2032',
    text: 'ERCOT’s latest preliminary long-term forecast projects 367,790 MW of demand in the ERCOT region by 2032. That is why the market is still pricing growth risk, not just today’s usage.',
    source: 'ERCOT Apr. 15, 2026 forecast',
  },
  {
    icon: Building2,
    eyebrow: 'Texas growth',
    value: '31.71M',
    label: 'Texas population in July 2025',
    text: 'Texas population reached 31.709 million in July 2025, up 8.8% since 2020. The governor’s office also lists 314 headquarters relocations announced from 2015 to 2024.',
    source: 'U.S. Census QuickFacts; Texas Governor',
  },
  {
    icon: Warehouse,
    eyebrow: 'Supply buildout',
    value: '18.8 GW',
    label: 'Texas utility-scale solar in Aug. 2024',
    text: 'EIA reported 18.8 GW of utility-scale solar in Texas in August 2024, and developers planned another 24 GW of solar additions in 2024 and 2025. Corporate PPAs help finance some of that buildout, but they do not remove the late-day summer peak.',
    source: 'EIA Today in Energy',
  },
] as const

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

function StatCard({
  icon: Icon,
  eyebrow,
  value,
  label,
  text,
  source,
}: {
  icon: ComponentType<{ className?: string }>
  eyebrow: string
  value: string
  label: string
  text: string
  source: string
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
            {eyebrow}
          </p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-[2rem]">
            {value}
          </div>
          <p className="mt-1 text-sm leading-6 text-zinc-300">{label}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-zinc-400">{text}</p>
      <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.28em] text-zinc-500">
        {source}
      </p>
    </div>
  )
}

function MarketCurveChart() {
  const chartWidth = 980
  const chartHeight = 420
  const chartLeft = 62
  const chartRight = 26
  const chartTop = 36
  const chartBottom = 76
  const plotWidth = chartWidth - chartLeft - chartRight
  const plotHeight = chartHeight - chartTop - chartBottom
  const minPrice = 30
  const maxPrice = 85
  const tickValues = [30, 40, 50, 60, 70, 80]

  const points = bloombergForwardCurve.map((point, index) => {
    const x =
      chartLeft + (index / (bloombergForwardCurve.length - 1)) * plotWidth
    const y =
      chartTop +
      (1 - (point.price - minPrice) / (maxPrice - minPrice)) * plotHeight

    return { ...point, x, y }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? 0} ${chartTop + plotHeight} L ${points[0]?.x ?? 0} ${chartTop + plotHeight} Z`

  const summerBandLeft = points[2].x - 16
  const summerBandRight = points[4].x + 16
  const winterBandLeft = points[8].x - 16
  const winterBandRight = points[9].x + 16

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.18))] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
            Bloomberg Houston load zone
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Wholesale forward curve in $/MWh. Retail offers sit on top of this
            once CenterPoint delivery, demand, and taxes are added.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-300">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
            Summer spike
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
            Winter bump
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
            Bloomberg
          </span>
        </div>
      </div>

      <svg viewBox="0 0 980 420" className="mt-4 h-[21rem] w-full" aria-hidden="true">
        <defs>
          <linearGradient id="market-curve-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,47,167,0.25)" />
            <stop offset="100%" stopColor="rgba(0,47,167,0)" />
          </linearGradient>
          <linearGradient id="market-curve-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5da4ff" />
            <stop offset="100%" stopColor="#002FA7" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="980" height="420" rx="24" fill="rgba(0,0,0,0.04)" />

        <rect
          x={summerBandLeft}
          y={chartTop}
          width={summerBandRight - summerBandLeft}
          height={plotHeight}
          rx="18"
          fill="rgba(0,47,167,0.07)"
        />
        <rect
          x={winterBandLeft}
          y={chartTop}
          width={winterBandRight - winterBandLeft}
          height={plotHeight}
          rx="18"
          fill="rgba(217,119,6,0.05)"
        />

        {tickValues.map((tick) => {
          const y =
            chartTop + (1 - (tick - minPrice) / (maxPrice - minPrice)) * plotHeight
          return (
            <g key={tick}>
              <line x1={chartLeft} x2={chartWidth - chartRight} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text
                x={24}
                y={y + 4}
                className="fill-zinc-500"
                fontSize="12"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                ${tick}
              </text>
            </g>
          )
        })}

        <path d={areaPath} fill="url(#market-curve-fill)" opacity="0.85" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#market-curve-line)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => {
          const isPeak = index === 3
          const isSummerBump = index === 2 || index === 3 || index === 4
          const isWinterBump = index === 8 || index === 9
          const labelY = point.price > 68 ? point.y + 20 : point.y - 12
          const labelFill = isPeak ? '#ffffff' : isSummerBump ? '#cfe1ff' : isWinterBump ? '#ffd8a5' : '#d4d4d8'

          return (
            <g key={point.month}>
              <circle
                cx={point.x}
                cy={point.y}
                r={isPeak ? 6.5 : 4.5}
                fill={isPeak ? '#ffffff' : '#7fb0ff'}
                stroke={isPeak ? '#002FA7' : 'none'}
                strokeWidth={isPeak ? 2 : 0}
              />
              <text
                x={point.x}
                y={labelY}
                textAnchor="middle"
                className={isPeak ? 'fill-white' : ''}
                fill={labelFill}
                fontSize="11"
                fontWeight="700"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {formatForwardPrice(point.price)}
              </text>
              <text
                x={point.x}
                y={chartTop + plotHeight + 24}
                textAnchor="middle"
                className="fill-zinc-500"
                fontSize="11"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {point.month}
              </text>
            </g>
          )
        })}

        <text
          x={points[3].x}
          y={points[3].y - 34}
          textAnchor="middle"
          className="fill-white"
          fontSize="12"
          fontWeight="700"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          Summer spike
        </text>
        <text
          x={points[8].x + 12}
          y={points[8].y - 22}
          textAnchor="start"
          className="fill-zinc-200"
          fontSize="12"
          fontWeight="700"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          Winter bump
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-500">
        <span>Source: Bloomberg user screenshot</span>
        <span>Wholesale only</span>
        <span>Retail bills add CenterPoint delivery, demand, and taxes</span>
      </div>
    </div>
  )
}

function MarketContextSlide() {
  return (
    <div className={slideShellClass('bg-[radial-gradient(circle_at_18%_16%,rgba(0,47,167,0.18),transparent_25%),radial-gradient(circle_at_86%_12%,rgba(255,255,255,0.05),transparent_20%)]')}>
      <div className="relative z-10 grid h-full gap-6 p-5 md:p-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex min-h-0 flex-col gap-5">
          <div className="max-w-2xl">
            <SectionLabel>Market context</SectionLabel>
            <SectionTitle>Why the Bloomberg curve jumps in summer.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4')}>
              This is wholesale Houston load-zone pricing from Bloomberg. The
              summer spike is the market pricing heat, tighter reserves, and
              faster load growth, not just a random swing in the chart.
            </p>
          </div>

          <MarketCurveChart />

          <div className="rounded-[26px] border border-[#002FA7]/35 bg-[#002FA7]/14 p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-blue-100/70">
              What Sean should hear
            </p>
            <p className="mt-2 text-[13px] leading-5 text-white md:text-sm md:leading-6">
              The curve is pricing the months when heat, big load, and the
              late-day solar drop all hit at the same time.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            {marketContextCards.map((card) => (
              <StatCard key={card.eyebrow} {...card} />
            ))}
          </div>

          <div className="rounded-[30px] border border-white/10 bg-black/55 p-4 backdrop-blur-md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                  Winter Storm Uri
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  20,000 MW of load shed at the peak.
                </p>
              </div>
              <div className="rounded-full border border-[#002FA7]/35 bg-[#002FA7]/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-blue-100">
                Feb. 2021
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              ERCOT also reported 52,277 MW of generation out at the worst
              point. That is the reason Texas still carries a reliability
              premium, even when the weather is normal.
            </p>
          </div>

          <div className="mt-auto rounded-[24px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[9px] leading-4 text-zinc-400">
              Sources: Bloomberg user screenshot; ERCOT summer page and Apr. 15, 2026 forecast; DOE data center demand; U.S. Census QuickFacts; Texas Governor relocation data; EIA Texas solar buildout; ERCOT Feb. 2021 hearing.
            </p>
          </div>
        </div>
      </div>
    </div>
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
                Texas energy will feel different from Sean&apos;s East Coast sites.
              </h1>
              <p className={cn(deckTextClass(), 'mt-5 max-w-xl')}>
                Baytown sits in ERCOT and CenterPoint territory. That changes
                how power is delivered, how demand is priced, and why the
                operating pattern matters as much as the supply rate.
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
                What to keep in mind
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base md:leading-7">
                Both New Jersey and Texas allow supply choice. The difference
                is the grid, the delivery utility, and the way peak demand can
                show up on the bill.
              </p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                These are planning references, not final pricing. The actual
                bill depends on load shape, term, and how the building runs.
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
                    ERCOT + CenterPoint changes the bill structure.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-blue-50/80">
                    A low energy rate does not always mean the lowest total bill
                    if the site peaks sharply.
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
              comparison is the East Coast base in New Jersey versus the Baytown
              site in Texas.
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
              Same company. Different grid, different utility rules, different
              cost drivers.
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
                  <p className="mt-1 text-sm text-white">Texas location</p>
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
              It is the grid operator. In Texas, you can shop the supply, but
              there is no PJM-style capacity market. The delivery utility still
              owns the wires, and the main bill risks are demand, delivery,
              4CP, and congestion.
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
              If the building peaks at the wrong time, the delivery charges can
              stay elevated after the month closes. That is the piece Sean needs
              to understand before talking pricing.
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
                  PJM vs. ERCOT
                </p>
                <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
                  <li>PJM has a separate capacity market that secures resources years ahead.</li>
                  <li>ERCOT is energy-only, with scarcity pricing and ancillary services instead.</li>
                  <li>PSE&amp;G bills can carry capacity and transmission obligations; Texas leans harder on demand and delivery.</li>
                </ul>
              </div>
              <div className="rounded-[24px] border border-[#002FA7]/35 bg-[#002FA7]/12 p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-blue-100/70">
                  Conversation line
                </p>
                <p className="mt-3 text-base leading-7 text-white">
                  That is why Texas can look cheaper on the headline rate but
                  still punish a spiky warehouse.
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
            <SectionTitle>The bill depends on more than the supply rate.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4')}>
              In Houston, the bill is shaped by more than one factor. Supply is
              one piece. Demand, delivery, nodal congestion, and ratchet
              charges can matter just as much as the headline rate.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {billDrivers.map((driver) => (
              <BulletCard key={driver.title} {...driver} />
            ))}
          </div>

          <div className="rounded-[26px] border border-white/10 bg-black/50 p-4 backdrop-blur-md">
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
              How the bill breaks down
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
              <FlowPill>Supply</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Delivery</FlowPill>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
              <FlowPill>Nodal congestion</FlowPill>
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
              Where custom pricing helps
            </p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Custom pricing</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Ask how nodal congestion and other site-specific charges are
                  handled in the quote.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Pass-through items</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Confirm which charges are fixed, variable, capped, or passed
                  through before comparing offers.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Better question</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Can we quote this around the site&apos;s real load pattern
                  instead of a generic warehouse average?
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BillRangeChart() {
  const chartMaxValue = 900000
  const chartTop = 38
  const chartBottom = 328
  const chartHeight = chartBottom - chartTop
  const barWidth = 164
  const barXs = [108, 368, 628]
  const tickValues = [0, 250000, 500000, 750000]

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.22))] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
            Annual planning bill
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Blue is energy. Amber is demand / TDSP.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-300">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
            Energy
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
            Demand / TDSP
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
            Total
          </span>
        </div>
      </div>

      <svg viewBox="0 0 900 460" className="mt-4 h-[31rem] w-full" aria-hidden="true">
        <defs>
          <linearGradient id="bill-chart-energy" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5da4ff" />
            <stop offset="100%" stopColor="#002FA7" />
          </linearGradient>
          <linearGradient id="bill-chart-demand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd28a" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="bill-chart-glow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,47,167,0.24)" />
            <stop offset="100%" stopColor="rgba(0,47,167,0)" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="900" height="460" fill="rgba(0,0,0,0.05)" rx="24" />

        {tickValues.map((tick) => {
          const y = chartBottom - (tick / chartMaxValue) * chartHeight
          return (
            <g key={tick}>
              <line x1="68" x2="860" y1={y} y2={y} stroke="rgba(255,255,255,0.10)" />
              <text
                x="34"
                y={y + 4}
                className="fill-zinc-500"
                fontSize="12"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {tick === 0 ? '$0' : `$${Math.round(tick / 1000)}k`}
              </text>
            </g>
          )
        })}

        {usageScenarios.map((scenario, index) => {
          const x = barXs[index]
          const totalHeight = (scenario.totalCost / chartMaxValue) * chartHeight
          const energyHeight = (scenario.energyCost / chartMaxValue) * chartHeight
          const demandHeight = (scenario.demandCost / chartMaxValue) * chartHeight
          const totalTopY = chartBottom - totalHeight
          const energyTopY = chartBottom - energyHeight

          return (
            <g key={scenario.label}>
              <rect
                x={x - 16}
                y={chartBottom - totalHeight - 18}
                width={barWidth + 32}
                height={totalHeight + 42}
                rx="24"
                fill="url(#bill-chart-glow)"
                opacity="0.75"
              />

              <rect
                x={x}
                y={energyTopY}
                width={barWidth}
                height={energyHeight}
                rx="20"
                fill="url(#bill-chart-energy)"
              />
              <rect
                x={x}
                y={totalTopY}
                width={barWidth}
                height={demandHeight}
                rx="20"
                fill="url(#bill-chart-demand)"
              />

              <text
                x={x + barWidth / 2}
                y={totalTopY - 18}
                textAnchor="middle"
                className="fill-white"
                fontSize="30"
                fontWeight="700"
                fontFamily="Inter, ui-sans-serif, system-ui"
              >
                {formatCompactCurrency(scenario.totalCost)}
              </text>
              <text
                x={x + barWidth / 2}
                y={totalTopY + 6}
                textAnchor="middle"
                className="fill-zinc-500"
                fontSize="12"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {scenario.totalRangeDisplay}
              </text>

              <text
                x={x + barWidth / 2}
                y={chartBottom + 28}
                textAnchor="middle"
                className="fill-white"
                fontSize="16"
                fontWeight="700"
                fontFamily="Inter, ui-sans-serif, system-ui"
              >
                {scenario.label}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartBottom + 48}
                textAnchor="middle"
                className="fill-zinc-400"
                fontSize="12"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {scenario.annualKwhDisplay}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartBottom + 67}
                textAnchor="middle"
                className="fill-zinc-500"
                fontSize="11"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {scenario.energyCostDisplay} + {scenario.demandCostDisplay}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function UsageSlide() {
  return (
    <div className={slideShellClass('bg-[radial-gradient(circle_at_15%_18%,rgba(0,47,167,0.18),transparent_24%),radial-gradient(circle_at_88%_12%,rgba(255,255,255,0.06),transparent_20%)]')}>
      <div className="relative z-10 grid h-full gap-6 p-5 md:p-8 lg:grid-cols-[0.94fr_1.06fr]">
        <div className="flex min-h-0 flex-col gap-5">
          <div className="max-w-2xl">
            <SectionLabel>Estimated usage</SectionLabel>
            <SectionTitle>The size of the building can turn into a very big annual bill.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4')}>
              Using the 321,440 SF Baytown building and your planning assumptions,
              the annual bill can land in a wide range depending on how much the
              site runs, how much it is conditioned, and how hard it peaks.
            </p>
          </div>

          <div className="grid gap-3">
            {usageScenarios.map((scenario) => (
              <div key={scenario.label} className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                      {scenario.annualKwhLabel}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                      {scenario.label}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      {scenario.summary}
                    </p>
                  </div>
                  <div className="rounded-full border border-[#002FA7]/30 bg-[#002FA7]/12 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-blue-100">
                    {scenario.totalRangeDisplay}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-zinc-300 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                      Usage
                    </p>
                    <p className="mt-1 text-white">{scenario.annualKwhRangeDisplay}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                      Energy
                    </p>
                    <p className="mt-1 text-white">{scenario.energyRangeDisplay}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-500">
                      Demand
                    </p>
                    <p className="mt-1 text-white">{scenario.demandRangeDisplay}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
              Simple rule
            </p>
            <p className="mt-2 text-sm leading-7 text-zinc-300 md:text-base">
              Every 100 kW of monthly peak demand at roughly $11 per kW is about{' '}
              {formatCurrencyWhole(calcDemandCost(100))}
              {' '}per month, or about{' '}
              {formatCurrencyWhole(calcDemandCost(100) * 12)}
              {' '}per year.
            </p>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">
              This is planning math. Final bills also depend on the exact delivery
              tariff, taxes, and any pass-through items in the contract.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                Bill graph
              </p>
              <p className="mt-2 text-xl font-semibold tracking-tight text-white">
                Energy and demand stack up fast.
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#7fb0ff]">
              <BarChart3 className="h-4 w-4" />
            </div>
          </div>

          <BillRangeChart />
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
            <SectionLabel>Operational levers</SectionLabel>
            <SectionTitle>Start with the load profile, then look at the rate.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4 max-w-xl')}>
              The fastest wins usually come from operations, not the spreadsheet.
              When the load curve is flatter, the pricing conversation becomes
              much cleaner.
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
                Flatten the load curve.
              </p>
            </div>
            <div className="rounded-full border border-[#002FA7]/35 bg-[#002FA7]/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-blue-100">
              Lower peak exposure
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
              <span>Lower load before peak</span>
              <span>Higher load during peak</span>
              <span>Lower bill later</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                Helpful habits
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                <li>Pre-cool before expensive hours</li>
                <li>Stagger equipment starts</li>
                <li>Watch summer peak days</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-500">
                Common pitfalls
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
            <SectionTitle>The more we know about how the site runs, the better the pricing discussion will be.</SectionTitle>
            <p className={cn(deckTextClass(), 'mt-4')}>
              The Baytown space is currently not occupied, so the current utility
              bill does not tell the full story. A bill from a similar site,
              along with the actual operating schedule, will give us a better
              starting point.
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
              What to send
            </p>
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm leading-7 text-zinc-300">
                To take a look at what we can do, I just need the hours and days
                of operation, the service address and ESID, the square footage
                of occupied space, the nature of the business, and a bill from a
                similar sized facility.
              </p>
              <p className="mt-3 text-sm leading-7 text-zinc-300">
                With that in hand, I can show where CenterPoint demand charges
                show up and which operating choices have the biggest impact.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-[#002FA7]/35 bg-[#002FA7]/14 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.34em] text-blue-100/70">
                  Takeaway
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-white">
                  Same business. Different utility rules. Fewer surprises once we
                  understand the operating profile.
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-200">
                Ready for discovery
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
  MarketContextSlide,
  UsageSlide,
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
                Texas energy briefing
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
