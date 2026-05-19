'use client'

import { AnimatedCount } from '@/components/ui/AnimatedCount'
import { motion, AnimatePresence } from 'framer-motion'
import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { useMarketPulse, type MarketPulseData } from '@/hooks/useMarketPulse'
import { useMarketTelemetryHistory } from '@/hooks/useMarketTelemetryHistory'
import { useEIARetailTexas, type EIARetailRow } from '@/hooks/useEIA'
import { FourCPBattleStation } from '@/components/market/FourCPBattleStation'
import { cn } from '@/lib/utils'

/** Chart data point for EIA Commercial vs Industrial rates */
type EIAChartPoint = { period: string; commercial: number; industrial: number }

/** Glass tooltip for MACRO_VARIANCE_CHART */
function MacroVarianceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; dataKey?: string }>
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  const com = payload.find((p) => p.dataKey === 'commercial')?.value as number | undefined
  const ind = payload.find((p) => p.dataKey === 'industrial')?.value as number | undefined
  const variance = com != null && ind != null ? com - ind : null
  return (
    <div className="rounded-xl nodal-monolith-edge bg-zinc-950/80 px-3 py-2 backdrop-blur-xl shadow-xl">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="mt-1 flex gap-4 text-sm font-mono tabular-nums">
        <span className="text-white">COM {com != null ? com.toFixed(2) : '—'}¢</span>
        <span className="text-emerald-500">IND {ind != null ? ind.toFixed(2) : '—'}¢</span>
      </div>
      {variance != null && (
        <div className="mt-0.5 text-[10px] font-mono text-zinc-400">
          Variance: {variance >= 0 ? '+' : ''}{variance.toFixed(2)}¢
        </div>
      )}
    </div>
  )
}

/** Tooltip for ERCOT history chart */
function ERCOTHistoryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; dataKey?: string }>
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-xl nodal-monolith-edge bg-zinc-950/80 px-3 py-2 backdrop-blur-xl shadow-xl">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="mt-1 flex flex-col gap-0.5 text-sm font-mono tabular-nums">
        {payload.map((p) => (
          <span key={p.dataKey}>
            {p.dataKey === 'hub_avg' && 'HUB_AVG '}
            {p.dataKey === 'north' && 'LZ_NORTH '}
            {p.dataKey === 'houston' && 'LZ_HOUSTON '}
            {p.dataKey === 'west' && 'LZ_WEST '}
            {p.dataKey === 'south' && 'LZ_SOUTH '}
            {p.value != null ? `$${Math.round(p.value)}` : '—'} $/MWh
          </span>
        ))}
      </div>
    </div>
  )
}

/** Zone order and colors match Infrastructure page (Grid Telemetry panel). */
const ZONES = [
  { id: 'north', label: 'LZ_NORTH', color: '#002FA7' },
  { id: 'houston', label: 'LZ_HOUSTON', color: '#22c55e' },
  { id: 'west', label: 'LZ_WEST', color: '#f59e0b' },
  { id: 'south', label: 'LZ_SOUTH', color: '#ef4444' },
] as const

const TIMEFRAME_FILTERS = [
  { id: '7D', label: '7D', days: 7, hint: 'Last 7 days' },
  { id: '30D', label: '30D', days: 30, hint: 'Last 30 days' },
  { id: '90D', label: '90D', days: 90, hint: 'Last 90 days' },
  { id: 'ALL', label: 'ALL', days: null, hint: 'Full history' },
] as const

type TimeframeId = (typeof TIMEFRAME_FILTERS)[number]['id']

function priceColor(price: number) {
  if (price >= 1000) return 'text-rose-500'
  if (price > 100) return 'text-amber-500'
  return 'text-white'
}

export default function TelemetryPage() {
  const { data: marketData, isLoading: marketLoading, isError: marketError } = useMarketPulse()
  const { chartData: ercotHistoryChart, isLoading: ercotHistoryLoading, isError: ercotHistoryError } = useMarketTelemetryHistory()
  const { data: eiaData, isLoading: eiaLoading, isError: eiaError } = useEIARetailTexas()
  const [timeframe, setTimeframe] = useState<TimeframeId>('30D')

  const prices: MarketPulseData['prices'] = marketData?.prices ?? ({} as MarketPulseData['prices'])
  const grid: MarketPulseData['grid'] = marketData?.grid ?? ({} as MarketPulseData['grid'])
  const timestamp = marketData?.timestamp ?? ''

  const eiaRows = useMemo(() => {
    const catalog = (eiaData?.catalog ?? []) as EIARetailRow[]
    const comInd = catalog.filter((r) => r.sectorid === 'COM' || r.sectorid === 'IND')
    const byPeriod = new Map<string, { period: string; COM: number | null; IND: number | null }>()
    for (const r of comInd) {
      const p = byPeriod.get(r.period) ?? { period: r.period, COM: null, IND: null }
      const val = r.price != null ? parseFloat(r.price) : null
      if (r.sectorid === 'COM') p.COM = val
      else p.IND = val
      byPeriod.set(r.period, p)
    }
    const sorted = Array.from(byPeriod.values()).sort((a, b) => b.period.localeCompare(a.period))
    return sorted.map((row, i) => {
      const prev = sorted[i + 1]
      const comVar = row.COM != null && prev?.COM != null ? row.COM - prev.COM : null
      const indVar = row.IND != null && prev?.IND != null ? row.IND - prev.IND : null
      return { ...row, comVar, indVar }
    })
  }, [eiaData?.catalog])

  /** Chart-ready: oldest first for AreaChart */
  const eiaChartData: EIAChartPoint[] = useMemo(() => {
    return eiaRows
      .filter((r) => r.COM != null || r.IND != null)
      .map((r) => ({
        period: r.period,
        commercial: r.COM ?? 0,
        industrial: r.IND ?? 0,
      }))
      .reverse()
  }, [eiaRows])

  const filteredErcotHistoryChart = useMemo(() => {
    const filter = TIMEFRAME_FILTERS.find((item) => item.id === timeframe) ?? TIMEFRAME_FILTERS[1]
    if (filter.days == null) return ercotHistoryChart

    const latest = ercotHistoryChart.at(-1)
    if (!latest) return ercotHistoryChart

    const latestDate = new Date(latest.date)
    if (Number.isNaN(latestDate.getTime())) return ercotHistoryChart

    const cutoff = latestDate.getTime() - filter.days * 24 * 60 * 60 * 1000
    return ercotHistoryChart.filter((point) => {
      const pointDate = new Date(point.date)
      return !Number.isNaN(pointDate.getTime()) && pointDate.getTime() >= cutoff
    })
  }, [ercotHistoryChart, timeframe])

  const selectedTimeframe = TIMEFRAME_FILTERS.find((item) => item.id === timeframe) ?? TIMEFRAME_FILTERS[1]

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="MARKET TELEMETRY"
        description="Real-time Settlement Points & Grid Physics."
      />

      {/* Status: LIVE_FEED */}
      <div className="flex items-center gap-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">LIVE_FEED</span>
        {timestamp && (
          <span className="text-[10px] font-mono text-zinc-500 tabular-nums">{timestamp}</span>
        )}
      </div>

      {/* ROW 1: Zonal Settlement Array */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          Zonal Settlement Array
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ZONES.map((z) => {
            const raw = prices[z.id as keyof typeof prices]
            const price = typeof raw === 'number' ? raw : null
            return (
              <div
                key={z.id}
                className={cn(
                  'nodal-void-card p-4 border-l-4',
                  price != null && price >= 1000 && 'border-rose-500/50 animate-pulse'
                )}
                style={{ borderLeftColor: z.color }}
              >
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  {z.label}
                </div>
                <div
                  className={cn(
                    'text-2xl font-mono tabular-nums mt-1',
                    marketLoading ? 'text-zinc-600' : price != null ? priceColor(price) : 'text-zinc-500'
                  )}
                >
                  {marketLoading ? '—' : price != null ? `$${Math.round(price)}` : '—'}
                </div>
                <div className="text-[9px] font-mono text-zinc-600 mt-0.5">$/MWh</div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-600 uppercase">HUB_AVG</span>
          <span className="text-lg font-mono tabular-nums text-zinc-300">
            {marketLoading || prices.hub_avg == null ? '—' : `$${Math.round(prices.hub_avg)}`}
          </span>
          <span className="text-[9px] font-mono text-zinc-600">$/MWh</span>
        </div>
      </section>

      {/* ERCOT Price History (stored snapshots from market_telemetry) */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
              ERCOT Price History
            </h2>
            <p className="mt-1 text-[9px] font-mono text-zinc-600 max-w-xl">
              Historic settlement prices from the scheduled ERCOT snapshot job (7am, 12pm, 5pm, 10pm CT), plus archived daily backfill rows already stored in Supabase. The graph excludes the one-off manual trigger row.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-600">Range</span>
            <div className="inline-flex rounded-full border border-white/8 bg-white/[0.03] p-1 backdrop-blur-sm">
              {TIMEFRAME_FILTERS.map((item) => {
                const active = timeframe === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTimeframe(item.id)}
                    className={cn(
                      'relative rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition-all duration-300',
                      active
                        ? 'bg-[#002FA7] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_18px_rgba(0,47,167,0.22)]'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                    )}
                    aria-pressed={active}
                    title={item.hint}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
            <span className="text-[9px] font-mono text-zinc-600 tabular-nums">
              {filteredErcotHistoryChart.length.toString().padStart(3, '0')} pts
            </span>
          </div>
        </div>
        <div className="nodal-void-card overflow-hidden">
          {ercotHistoryError ? (
            <div className="p-6 text-center font-mono text-amber-500 text-sm">CONNECTION_LOST</div>
          ) : ercotHistoryLoading ? (
            <div className="h-64 rounded-2xl animate-pulse bg-black/40" />
          ) : filteredErcotHistoryChart.length === 0 ? (
            <div className="p-6 text-center font-mono text-zinc-500 text-sm">
              No history yet. Data is logged when market snapshots are saved (e.g. via Gemini).
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedTimeframe.id}
                className="p-4 h-64"
                initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredErcotHistoryChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'rgb(113 113 122)', fontSize: 9, fontFamily: 'monospace' }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: 'rgb(113 113 122)', fontSize: 10, fontFamily: 'monospace' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip content={<ERCOTHistoryTooltip />} />
                    <Line key={`hub-${selectedTimeframe.id}`} type="monotone" dataKey="hub_avg" stroke="#64748b" strokeWidth={2} dot={false} connectNulls name="HUB_AVG" isAnimationActive animationDuration={650} />
                    <Line key={`north-${selectedTimeframe.id}`} type="monotone" dataKey="north" stroke="#e4e4e7" strokeWidth={1.5} dot={false} connectNulls name="LZ_NORTH" isAnimationActive animationDuration={650} />
                    <Line key={`houston-${selectedTimeframe.id}`} type="monotone" dataKey="houston" stroke="#22c55e" strokeWidth={1.5} dot={false} connectNulls name="LZ_HOUSTON" isAnimationActive animationDuration={650} />
                    <Line key={`west-${selectedTimeframe.id}`} type="monotone" dataKey="west" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls name="LZ_WEST" isAnimationActive animationDuration={650} />
                    <Line key={`south-${selectedTimeframe.id}`} type="monotone" dataKey="south" stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls name="LZ_SOUTH" isAnimationActive animationDuration={650} />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </section>

      {/* ROW 2: Grid Physics Visualizer (Capacity Gauge) */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          Grid Physics Monitor
        </h2>
        {marketLoading ? (
          <div className="h-24 nodal-void-card animate-pulse bg-black/40" />
        ) : (
          <div
            className={cn(
              'nodal-void-card p-4',
              grid.reserves != null && grid.reserves < 3000 && 'border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
            )}
          >
            <div className="flex items-center justify-between gap-4 mb-2">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Capacity Gauge
              </span>
              <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                Load <AnimatedCount value={Math.round(grid.actual_load ?? 0)} /> / Capacity <AnimatedCount value={Math.round(grid.total_capacity ?? 0)} /> MW · Reserve <AnimatedCount value={Math.round(grid.reserves ?? 0)} /> MW
              </span>
            </div>
            <div className="relative h-10 w-full rounded-xl bg-black/40 overflow-hidden">
              {/* Fill: load as % of capacity (gradient blue → rose) */}
              <div
                className="absolute inset-y-0 left-0 rounded-xl bg-gradient-to-r from-[#002FA7] to-rose-500/80 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (grid.total_capacity ?? 0) > 0
                      ? ((grid.actual_load ?? 0) / (grid.total_capacity ?? 1)) * 100
                      : 0
                  )}%`,
                }}
              />
              {/* Reserve threshold marker (capacity - 3000 MW) */}
              {(grid.total_capacity ?? 0) > 3000 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-500/90 z-10"
                  style={{
                    left: `${((Math.max(0, (grid.total_capacity ?? 0) - 3000)) / (grid.total_capacity ?? 1)) * 100}%`,
                  }}
                  aria-label="Reserve threshold (Capacity - 3000 MW)"
                />
              )}
            </div>
            <div className="mt-2 flex justify-between text-[9px] font-mono text-zinc-600">
              <span>0</span>
              <span className="text-amber-500/80">Reserve threshold</span>
              <span>Capacity</span>
            </div>
            <div className="mt-3 flex gap-6 text-sm font-mono tabular-nums text-zinc-400">
              <span>Wind: <AnimatedCount value={Math.round(grid.wind_gen ?? 0)} /> MW</span>
              <span>PV: <AnimatedCount value={Math.round(grid.pv_gen ?? 0)} /> MW</span>
            </div>
          </div>
        )}
      </section>

      {/* ROW 2.5: 4CP Battle Station */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          4CP Coincident Peak Monitor
        </h2>
        <p className="text-[9px] font-mono text-zinc-600 max-w-xl">
          Real-time probability that the current hour will coincide with one of ERCOT's 4 highest-demand hours. These 4 hours determine next year's transmission cost liability.
        </p>
        <FourCPBattleStation />
      </section>

      {/* ROW 3: MACRO_VARIANCE_CHART (EIA Commercial vs Industrial) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
            Macro Variance (TX Retail ¢/kWh)
          </h2>
          <p className="mt-1 text-[9px] font-mono text-zinc-600 max-w-xl">
            EIA state-level average price (cents/kWh). Updates as EIA publishes; latest month may lag 1–2 months. This series is blended across utilities, so it is smoother than wholesale or single-bill summer spikes.
          </p>
        </div>
        <div className="nodal-void-card overflow-hidden">
          {eiaError ? (
            <div className="p-6 text-center font-mono text-amber-500 text-sm">CONNECTION_LOST</div>
          ) : eiaLoading ? (
            <div className="h-64 rounded-2xl animate-pulse bg-black/40" />
          ) : eiaChartData.length === 0 ? (
            <div className="p-6 text-center font-mono text-zinc-500 text-sm">No data</div>
          ) : (
            <div className="p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={eiaChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e4e4e7" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#e4e4e7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="none" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: 'rgb(113 113 122)', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  />
                  <YAxis
                    tick={{ fill: 'rgb(113 113 122)', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}¢`}
                  />
                  <Tooltip content={<MacroVarianceTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="commercial"
                    stroke="#e4e4e7"
                    strokeWidth={2}
                    fill="url(#colorBlue)"
                  />
                  <Area
                    type="monotone"
                    dataKey="industrial"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#colorGreen)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
