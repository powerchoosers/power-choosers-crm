'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ClosingCta } from '@/components/landing/ClosingCta'
import { PageHero } from '@/components/landing/PageHero'
import { PublicShell } from '@/components/landing/PublicShell'
import { Reveal } from '@/components/landing/Reveal'
import { OutlineLink, PrimaryLink, TextLink, focusOnLight } from '@/components/landing/ui'
import { useMarketPulse } from '@/hooks/useMarketPulse'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

type LoadZone = 'houston' | 'north' | 'south' | 'west'

type MarketPulseData = {
  prices?: Partial<Record<LoadZone, number>> & {
    hub_avg?: number
    south?: number
  }
  grid?: {
    reserves?: number
    actual_load?: number
    wind_gen?: number
    pv_gen?: number
  }
  timestamp?: string
  metadata?: {
    source?: 'live' | 'market_telemetry' | 'scraper'
  }
}

type BriefingSection = {
  title: string
  content: string
}

type MarketBriefing = {
  id: string
  headline: string
  summary: string
  sections: BriefingSection[]
  generated_at: string
}

type GaugeContext = { label: string; color: string; pct: number; description: string }

type StressLabel = 'Loading' | 'Offline' | 'Unknown' | 'Critical' | 'Tight' | 'Stable'

const EASE = [0.23, 1, 0.32, 1] as const

const ZONES: { key: LoadZone; label: string }[] = [
  { key: 'north', label: 'North (DFW)' },
  { key: 'houston', label: 'Houston' },
  { key: 'south', label: 'South' },
  { key: 'west', label: 'West' },
]

// ── ERCOT Benchmark Thresholds ──
// Based on real ERCOT operating data:
// Prices: Normal $20-60/MWh, Elevated $60-150, High $150-300, Extreme $300+
// System Load: Winter 30-50 GW, Shoulder 35-55 GW, Summer 50-75 GW, Record ~85 GW
// Reserves: Comfortable >7 GW, Adequate 4.5-7 GW, Tight 2.5-4.5 GW, Critical <2.5 GW

function getPriceContext(price: number | null): GaugeContext {
  if (price == null) return { label: 'Unavailable', color: 'bg-zinc-600', pct: 0, description: 'Price data is not available right now.' }
  if (price <= 30) return { label: 'Low', color: 'bg-emerald-500', pct: 15, description: 'Below average. Good conditions for customers on a variable rate.' }
  if (price <= 60) return { label: 'Normal', color: 'bg-emerald-400', pct: 30, description: 'The typical wholesale range. No unusual pressure on the market.' }
  if (price <= 100) return { label: 'Elevated', color: 'bg-amber-400', pct: 50, description: 'Above average. Demand is pushing prices up.' }
  if (price <= 200) return { label: 'High', color: 'bg-orange-500', pct: 70, description: 'Well above normal. The grid is under pressure.' }
  if (price <= 500) return { label: 'Very High', color: 'bg-red-500', pct: 85, description: 'Far above normal. Usually caused by low spare power or extreme demand.' }
  return { label: 'Extreme', color: 'bg-red-600', pct: 98, description: 'At or near the price cap. These are emergency grid conditions.' }
}

function getLoadContext(loadMW: number | null): GaugeContext {
  if (loadMW == null) return { label: 'Unavailable', color: 'bg-zinc-600', pct: 0, description: 'Demand data is not available right now.' }
  const loadGW = loadMW / 1000
  if (loadGW <= 35) return { label: 'Light', color: 'bg-emerald-500', pct: 20, description: 'Low demand. Usually overnight or in mild weather.' }
  if (loadGW <= 50) return { label: 'Moderate', color: 'bg-emerald-400', pct: 40, description: 'Normal business-hours demand. Nothing unusual.' }
  if (loadGW <= 60) return { label: 'Active', color: 'bg-amber-400', pct: 55, description: 'Above-average demand. Likely a warm afternoon.' }
  if (loadGW <= 70) return { label: 'Heavy', color: 'bg-orange-500', pct: 72, description: 'High demand. Air conditioning is driving the grid hard.' }
  if (loadGW <= 80) return { label: 'Very Heavy', color: 'bg-red-500', pct: 88, description: 'Near-peak demand, approaching record territory.' }
  return { label: 'Record Territory', color: 'bg-red-600', pct: 98, description: 'At or near all-time demand records. The grid is under maximum stress.' }
}

function getReservesContext(reservesMW: number | null): GaugeContext {
  if (reservesMW == null) return { label: 'Unavailable', color: 'bg-zinc-600', pct: 0, description: 'Spare power data is not available right now.' }
  const reservesGW = reservesMW / 1000
  // Reserves gauge is INVERTED: lower is worse
  if (reservesGW >= 10) return { label: 'Comfortable', color: 'bg-emerald-500', pct: 90, description: 'Plenty of spare power. The grid has a large safety buffer.' }
  if (reservesGW >= 7) return { label: 'Adequate', color: 'bg-emerald-400', pct: 70, description: 'A healthy buffer. No immediate concerns.' }
  if (reservesGW >= 4.5) return { label: 'Moderate', color: 'bg-amber-400', pct: 50, description: 'The buffer is shrinking. Conditions could tighten if demand rises.' }
  if (reservesGW >= 3) return { label: 'Tight', color: 'bg-orange-500', pct: 30, description: 'A low safety margin. Prices tend to spike in this range.' }
  if (reservesGW >= 2) return { label: 'Very Tight', color: 'bg-red-500', pct: 15, description: 'Dangerously low. The grid operator may issue conservation alerts.' }
  return { label: 'Critical', color: 'bg-red-600', pct: 5, description: 'Emergency territory. Rolling outages become possible.' }
}

/** Text colour that matches a gauge bar colour, readable on a light panel. */
function gaugeTextColor(barColor: string): string {
  if (barColor.includes('emerald')) return 'text-emerald-700'
  if (barColor.includes('amber')) return 'text-amber-700'
  if (barColor.includes('orange')) return 'text-orange-700'
  if (barColor.includes('red')) return 'text-red-700'
  return 'text-zinc-500'
}

const STRESS_SUMMARY: Record<StressLabel, string> = {
  Loading: 'Getting the latest reading from the Texas grid.',
  Offline: 'We cannot reach the live grid data right now. Please try again in a few minutes.',
  Unknown: 'The latest reading did not include spare power, so we cannot rate the grid.',
  Stable: 'There is plenty of spare power, so nothing unusual is pushing prices up.',
  Tight: 'Spare power is low. Prices tend to rise when this happens.',
  Critical: 'Spare power is very low. Prices are likely spiking and Texans may be asked to use less.',
}

function gridSentence(stress: StressLabel): string {
  if (stress === 'Stable') return 'Right now the grid is running smoothly with plenty of spare capacity.'
  if (stress === 'Tight') return 'Right now the grid is under pressure. Spare capacity is low enough that prices tend to rise.'
  if (stress === 'Critical') return 'Right now the grid is in a danger zone. Prices are likely spiking and conservation may be requested.'
  return 'Right now the grid is being measured.'
}

function priceSentence(price: number | null): string {
  if (price == null) return ''
  if (price > 100) return 'Wholesale prices are above normal, which means customers on a variable rate are paying more than usual right now.'
  if (price > 60) return 'Prices are slightly elevated but still within a manageable range.'
  return 'Prices are in normal territory, with no unusual market pressure.'
}

function formatCentralTime(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  })} CT`
}

export default function MarketData() {
  const [selectedZone, setSelectedZone] = useState<LoadZone>('north')
  const { data: marketData, isLoading, isError } = useMarketPulse()
  const [briefing, setBriefing] = useState<MarketBriefing | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)

  // Fetch latest briefing from Supabase
  useEffect(() => {
    async function fetchBriefing() {
      try {
        const { data, error } = await supabase
          .from('market_briefings')
          .select('id, headline, summary, sections, generated_at')
          .order('generated_at', { ascending: false })
          .limit(1)
          .single()

        if (!error && data) {
          setBriefing(data as MarketBriefing)
        }
      } catch {
        // Briefing is optional enrichment
      } finally {
        setBriefingLoading(false)
      }
    }
    fetchBriefing()
  }, [])

  const pulseData = marketData as MarketPulseData | undefined
  const prices = pulseData?.prices ?? {}
  const grid = pulseData?.grid ?? {}
  const currentPrice = isLoading ? null : (prices[selectedZone] ?? prices.hub_avg ?? prices.south ?? null)
  const reserves = grid.reserves ?? null
  const load = grid.actual_load ?? null

  const stressLabel: StressLabel = (() => {
    if (isLoading) return 'Loading'
    if (isError) return 'Offline'
    if (typeof reserves !== 'number') return 'Unknown'
    if (reserves < 2500) return 'Critical'
    if (reserves < 4500) return 'Tight'
    return 'Stable'
  })()

  const priceCtx = getPriceContext(currentPrice)
  const loadCtx = getLoadContext(load)
  const reservesCtx = getReservesContext(reserves)

  const readingTime = formatCentralTime(pulseData?.timestamp)
  const isSavedReading = pulseData?.metadata?.source === 'market_telemetry'
  const briefingTime = briefing ? formatCentralTime(briefing.generated_at) : null
  const selectedZoneLabel = ZONES.find((zone) => zone.key === selectedZone)?.label ?? ''

  const stressColor =
    stressLabel === 'Critical'
      ? 'text-rose-400'
      : stressLabel === 'Tight'
        ? 'text-amber-400'
        : stressLabel === 'Stable'
          ? 'text-emerald-400'
          : 'text-zinc-300'

  return (
    <PublicShell>
      <PageHero
        title="What the grid looks like right now."
        lead="Live numbers from ERCOT, the operator of the Texas power grid, in plain English. See whether the market is calm, tight, or worth acting on."
        aside={
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium text-zinc-400">Texas grid right now</p>
            <p className={cn('np-display mt-3 text-6xl transition-colors duration-300', stressColor)} aria-live="polite">
              <LiveValue value={stressLabel} />
            </p>
            <p className="mt-4 max-w-sm text-base leading-7 text-zinc-300">{STRESS_SUMMARY[stressLabel]}</p>
            <p className="mt-6 border-t border-white/10 pt-4 text-sm leading-6 text-zinc-400">
              Source: ERCOT.{' '}
              {readingTime ? (
                <>
                  {isSavedReading ? 'Last saved reading from' : 'Reading from'}{' '}
                  <span className="tabular-nums text-zinc-300">{readingTime}</span>.
                </>
              ) : null}{' '}
              Checked again every 5 minutes.
            </p>
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryLink href="/bill-debugger" surface="dark">
            Review my bill
          </PrimaryLink>
          <OutlineLink href="#live-numbers" surface="dark">
            See the live numbers
          </OutlineLink>
        </div>
      </PageHero>

      {/* ── LIVE NUMBERS ── */}
      <section id="live-numbers" className="scroll-mt-16 bg-white px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <Reveal>
            <h2 className="np-display text-4xl text-zinc-950 md:text-[3.25rem]">
              Three numbers behind the price of power.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-600">
              Together they tell you whether electricity is cheap or expensive right now, and why.
            </p>

            <div className="mt-10">
              <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Choose your area</h3>
              <p className="mt-2 max-w-lg text-base leading-7 text-zinc-600">
                Wholesale prices differ across Texas. Pick the area closest to your business (ERCOT
                calls these load zones). Demand and spare power are statewide.
              </p>
              <div className="mt-5 grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-4">
                {ZONES.map(({ key, label }) => {
                  const selected = selectedZone === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedZone(key)}
                      className={cn(
                        'rounded-[10px] border px-3 py-2.5 text-sm font-medium transition-colors duration-200 active:scale-[0.98]',
                        focusOnLight,
                        selected
                          ? 'border-[#002FA7] bg-[#002FA7] text-white'
                          : 'border-zinc-300 bg-white text-zinc-950 hover:border-zinc-950'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {isError ? (
              <p role="status" className="mt-8 max-w-lg rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-base leading-7 text-zinc-600">
                We cannot reach the live grid data right now. The numbers will fill in as soon as
                the connection is back.
              </p>
            ) : null}
          </Reveal>

          <Reveal delay={0.08} className="lg:pt-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 sm:px-8">
              <MetricGauge
                label={`Wholesale electricity price, ${selectedZoneLabel}`}
                value={currentPrice != null ? `$${currentPrice.toFixed(2)}` : '---'}
                unit={currentPrice != null ? 'per MWh' : undefined}
                note={
                  currentPrice != null
                    ? `About ${(currentPrice / 10).toFixed(1)} cents per kWh, before delivery charges and supplier margin.`
                    : undefined
                }
                context={priceCtx}
                explainer="What electricity costs on the open Texas market right now, in dollars per megawatt-hour (MWh). Divide by 10 for cents per kWh, the unit on your bill. Your own rate is based on this, plus delivery charges and margins."
                primary
              />
              <MetricGauge
                label="Total grid demand"
                value={load != null ? (load / 1000).toFixed(1) : '---'}
                unit={load != null ? 'GW' : undefined}
                context={loadCtx}
                explainer="How much electricity Texas is using right now, in gigawatts (GW). Higher demand means less spare capacity and higher prices."
              />
              <MetricGauge
                label="Spare power (operating reserves)"
                value={reserves != null ? (reserves / 1000).toFixed(1) : '---'}
                unit={reserves != null ? 'GW' : undefined}
                context={reservesCtx}
                explainer="Generating capacity that is ready but not being used. Below 3 GW, prices tend to spike. Below 2 GW, conservation alerts may be issued."
                inverted
              />
            </div>
            <p className="mt-5 text-sm leading-6 text-zinc-500">
              Source: ERCOT. Green means calm, amber means watch it, red means the grid is under
              pressure.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── WHY IT MATTERS ── */}
      <section className="bg-zinc-100 px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <h2 className="np-display max-w-2xl text-4xl text-zinc-950 md:text-[3.25rem]">
              What this means for your bill.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-3">
            <PlainInsight
              index={0}
              title="What these numbers mean for you"
              text={`${gridSentence(stressLabel)} ${priceSentence(currentPrice)}`}
            />
            <PlainInsight
              index={1}
              title="Fixed or variable rate"
              text="If you're on a fixed rate, these numbers don't change your monthly bill, but they tell you whether it's a good time to renew. If you're on a variable or indexed plan, today's market conditions directly affect what you pay."
            />
            <PlainInsight
              index={2}
              title="What you can do about it"
              text="If the numbers look high, the right move is usually to review your current bill and contract. A fixed rate through the expensive months prevents surprises. A calm market can be a good time to lock in a renewal."
            />
          </div>
        </div>
      </section>

      {/* ── MARKET BRIEFING ── */}
      <section className="bg-white px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <Reveal>
            <h2 className="np-display text-4xl text-zinc-950 md:text-[3.25rem]">Market overview</h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-600">
              A short written read on what is moving Texas power prices, generated twice daily.
            </p>
            {briefingTime ? (
              <p className="mt-4 text-sm text-zinc-500">
                Written <span className="tabular-nums">{briefingTime}</span>
              </p>
            ) : null}
          </Reveal>

          <Reveal delay={0.08} className="lg:pt-2">
            {briefingLoading ? (
              <div aria-busy="true" aria-label="Loading the market overview">
                <div className="h-7 w-3/4 animate-pulse rounded-md bg-zinc-200 motion-reduce:animate-none" />
                <div className="mt-8 space-y-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-4 w-48 animate-pulse rounded bg-zinc-200 motion-reduce:animate-none" />
                      <div className="h-3 w-full animate-pulse rounded bg-zinc-100 motion-reduce:animate-none" />
                      <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-100 motion-reduce:animate-none" />
                    </div>
                  ))}
                </div>
              </div>
            ) : briefing ? (
              <article>
                <h3 className="text-2xl font-semibold leading-8 tracking-[-0.02em] text-zinc-950">
                  {briefing.headline}
                </h3>
                {briefing.summary && (
                  <p className="mt-4 text-lg leading-8 text-zinc-600">{briefing.summary}</p>
                )}
                <div className="mt-8 border-t border-zinc-200">
                  {briefing.sections.map((section, i) => (
                    <div key={i} className="border-b border-zinc-200 py-6">
                      <h4 className="text-lg font-semibold tracking-[-0.01em] text-zinc-950">{section.title}</h4>
                      <div className="mt-2 whitespace-pre-line text-base leading-7 text-zinc-600">
                        {section.content}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">
                  Market overview coming soon
                </h3>
                <p className="mt-2 text-base leading-7 text-zinc-600">
                  The market overview is generated twice daily. Check back soon for the latest
                  analysis.
                </p>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* ── HOW TO USE ── */}
      <section className="bg-zinc-100 px-6 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="np-display max-w-2xl text-4xl text-zinc-950 md:text-[3.25rem]">
              How to use this page
            </h2>
            <TextLink href="/bill-debugger">Review my bill</TextLink>
          </Reveal>
          <ol className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-3">
            <Callout
              index={0}
              title="Pick your area"
              text="Different parts of Texas have different prices. Choose the area closest to your business to see what's relevant."
            />
            <Callout
              index={1}
              title="Read the gauges"
              text="Green means calm. Amber means watch it. Red means the grid is under pressure and prices are likely high."
            />
            <Callout
              index={2}
              title="Act on what you see"
              text="If conditions look expensive, review your bill and contract. If they look calm, it might be the right time to lock in a new rate."
            />
          </ol>
        </div>
      </section>

      <ClosingCta
        body={
          <>
            Market data tells you what electricity costs. A bill review tells you whether
            you&apos;re paying more than you should.
          </>
        }
      />
    </PublicShell>
  )
}

// ── Components ──

/** Text that eases in when its value changes. Static on first paint and for reduced motion. */
function LiveValue({ value }: { value: string }) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return <span>{value}</span>

  return (
    <AnimatePresence initial={false}>
      <motion.span
        key={value}
        className="inline-block"
        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  )
}

function MetricGauge({
  label,
  value,
  unit,
  note,
  context,
  explainer,
  inverted = false,
  primary = false,
}: {
  label: string
  value: string
  unit?: string
  note?: string
  context: GaugeContext
  explainer: string
  inverted?: boolean
  primary?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="border-b border-zinc-200 py-6 last:border-b-0 sm:py-8">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-medium text-zinc-950">{label}</h3>
        <span className={cn('flex shrink-0 items-center gap-2 text-sm font-semibold', gaugeTextColor(context.color))}>
          <span aria-hidden className={cn('h-2 w-2 rounded-full transition-colors duration-300', context.color)} />
          {context.label}
        </span>
      </div>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-zinc-950" aria-live="polite">
        <span
          className={
            primary
              ? 'np-display text-5xl [font-variant-numeric:lining-nums_tabular-nums] sm:text-6xl'
              : 'text-4xl font-semibold tracking-[-0.02em] tabular-nums'
          }
        >
          <LiveValue value={value} />
        </span>
        {unit ? <span className="text-base font-medium text-zinc-500">{unit}</span> : null}
      </p>
      {note ? <p className="mt-1 text-sm tabular-nums text-zinc-500">{note}</p> : null}

      {/* Gauge bar */}
      <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-zinc-200">
        {reduceMotion ? (
          <div className={cn('h-full rounded-full', context.color)} style={{ width: `${context.pct}%` }} />
        ) : (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${context.pct}%` }}
            transition={{ duration: 0.5, ease: EASE }}
            className={cn('h-full rounded-full transition-colors duration-300', context.color)}
          />
        )}
        {/* Threshold markers for reserves */}
        {inverted && (
          <>
            {/* 3 GW danger line (~20% of 15GW max) */}
            <div className="absolute bottom-0 left-[20%] top-0 w-px bg-red-500/60" title="3 GW: price spike zone" />
            {/* 4.5 GW caution line (~30%) */}
            <div className="absolute bottom-0 left-[30%] top-0 w-px bg-amber-500/60" title="4.5 GW: caution zone" />
          </>
        )}
      </div>

      <p className="mt-4 text-base leading-7 text-zinc-950">{context.description}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-500">{explainer}</p>
    </div>
  )
}

function PlainInsight({ index, title, text }: { index: number; title: string; text: string }) {
  return (
    <Reveal delay={index * 0.07} className="border-t-2 border-zinc-950 pt-5">
      <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{title}</h3>
      <p className="mt-2 text-base leading-7 text-zinc-600">{text}</p>
    </Reveal>
  )
}

function Callout({ index, title, text }: { index: number; title: string; text: string }) {
  return (
    <li>
      <Reveal delay={index * 0.07} className="border-t-2 border-zinc-950 pt-5">
        <span className="text-sm font-medium text-[#002FA7]">Step {index + 1}</span>
        <h3 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-zinc-950">{title}</h3>
        <p className="mt-2 text-base leading-7 text-zinc-600">{text}</p>
      </Reveal>
    </li>
  )
}
