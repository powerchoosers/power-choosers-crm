'use client'

import { useMemo } from 'react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { useMarketPulse, type MarketPulseData } from '@/hooks/useMarketPulse'
import { useEIARetailTexas, type EIARetailRow } from '@/hooks/useEIA'
import { cn } from '@/lib/utils'

const ZONES = [
  { id: 'houston', label: 'LZ_HOUSTON' },
  { id: 'north', label: 'LZ_NORTH' },
  { id: 'south', label: 'LZ_SOUTH' },
  { id: 'west', label: 'LZ_WEST' },
] as const

function priceColor(price: number) {
  if (price >= 1000) return 'text-rose-500'
  if (price > 100) return 'text-amber-500'
  return 'text-white'
}

export default function TelemetryPage() {
  const { data: marketData, isLoading: marketLoading, isError: marketError } = useMarketPulse()
  const { data: eiaData, isLoading: eiaLoading, isError: eiaError } = useEIARetailTexas()

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
                  'rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl p-4',
                  price != null && price >= 1000 && 'border-rose-500/50 animate-pulse'
                )}
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

      {/* ROW 2: Grid Physics Monitor */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          Grid Physics Monitor
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              LOAD_VELOCITY
            </div>
            <div className="mt-2 font-mono tabular-nums text-zinc-200">
              {marketLoading ? '—' : `${Math.round(grid.actual_load ?? 0).toLocaleString()} MW`}
            </div>
            <div className="text-[9px] font-mono text-zinc-600">Actual Load</div>
            <div className="mt-1 font-mono tabular-nums text-zinc-400 text-sm">
              {marketLoading ? '—' : `${Math.round(grid.total_capacity ?? 0).toLocaleString()} MW`} capacity
            </div>
          </div>
          <div
            className={cn(
              'rounded-2xl border backdrop-blur-xl p-4',
              grid.reserves != null && grid.reserves < 3000
                ? 'border-rose-500/30 bg-rose-500/10'
                : 'border-white/10 bg-zinc-900/40'
            )}
          >
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              RESERVE_GAP
            </div>
            <div className="text-[9px] font-mono text-zinc-600 mt-0.5">Physical Headroom</div>
            <div className="mt-1 text-xl font-mono tabular-nums text-zinc-200">
              {marketLoading ? '—' : `${Math.round(grid.reserves ?? 0).toLocaleString()} MW`}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              RENEWABLE_VECTOR
            </div>
            <div className="text-[9px] font-mono text-zinc-600 mt-0.5">Intermittent Generation</div>
            <div className="mt-1 font-mono tabular-nums text-zinc-200">
              Wind: {marketLoading ? '—' : `${Math.round(grid.wind_gen ?? 0).toLocaleString()} MW`}
            </div>
            <div className="font-mono tabular-nums text-zinc-400 text-sm">
              PV: {marketLoading ? '—' : `${Math.round(grid.pv_gen ?? 0).toLocaleString()} MW`}
            </div>
          </div>
        </div>
      </section>

      {/* ROW 3: Macro Trend Log (EIA) */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          Macro Trend Log
        </h2>
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl overflow-hidden">
          {eiaError ? (
            <div className="p-6 text-center font-mono text-amber-500 text-sm">CONNECTION_LOST</div>
          ) : eiaLoading ? (
            <div className="p-6 text-center font-mono text-zinc-500 text-sm">Loading…</div>
          ) : eiaRows.length === 0 ? (
            <div className="p-6 text-center font-mono text-zinc-500 text-sm">No data</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider py-3 px-4">
                      PERIOD
                    </th>
                    <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider py-3 px-4">
                      SECTOR
                    </th>
                    <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider py-3 px-4">
                      RATE (¢/kWh)
                    </th>
                    <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider py-3 px-4">
                      VARIANCE
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eiaRows.flatMap((row) => [
                    <tr key={`${row.period}-COM`} className="border-b border-white/5">
                      <td className="py-2 px-4 font-mono text-zinc-300 tabular-nums text-sm">
                        {row.period}
                      </td>
                      <td className="py-2 px-4 font-mono text-zinc-400 text-sm">Commercial</td>
                      <td className="py-2 px-4 font-mono tabular-nums text-zinc-200">
                        {row.COM != null ? row.COM.toFixed(2) : '—'}
                      </td>
                      <td className="py-2 px-4 font-mono tabular-nums text-sm">
                        {row.comVar != null ? (
                          <span className={row.comVar >= 0 ? 'text-amber-500' : 'text-emerald-500'}>
                            {row.comVar >= 0 ? '+' : ''}{row.comVar.toFixed(2)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>,
                    <tr key={`${row.period}-IND`} className="border-b border-white/5">
                      <td className="py-2 px-4 font-mono text-zinc-300 tabular-nums text-sm">
                        {row.period}
                      </td>
                      <td className="py-2 px-4 font-mono text-zinc-400 text-sm">Industrial</td>
                      <td className="py-2 px-4 font-mono tabular-nums text-zinc-200">
                        {row.IND != null ? row.IND.toFixed(2) : '—'}
                      </td>
                      <td className="py-2 px-4 font-mono tabular-nums text-sm">
                        {row.indVar != null ? (
                          <span className={row.indVar >= 0 ? 'text-amber-500' : 'text-emerald-500'}>
                            {row.indVar >= 0 ? '+' : ''}{row.indVar.toFixed(2)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>,
                  ])}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
