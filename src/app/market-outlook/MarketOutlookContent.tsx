'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'

const forwardCurveData = [
  { month: 'Apr 26', price: 34.79 },
  { month: 'May 26', price: 39.41 },
  { month: 'Jun 26', price: 43.08 },
  { month: 'Jul 26', price: 62.39 },
  { month: 'Aug 26', price: 91.43 },
  { month: 'Sep 26', price: 49.38 },
  { month: 'Oct 26', price: 41.66 },
  { month: 'Nov 26', price: 43.15 },
  { month: 'Dec 26', price: 48.51 },
  { month: 'Jan 27', price: 65.35 },
  { month: 'Feb 27', price: 62.25 },
  { month: 'Mar 27', price: 37.28 },
]

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-lg">
      <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="font-mono text-xl font-bold text-[#002FA7]">${payload[0].value.toFixed(2)}</p>
      <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest">/MWh</p>
    </div>
  )
}

export default function MarketOutlookContent() {
  const [liveData, setLiveData] = useState<any>(null)
  const [liveLoading, setLiveLoading] = useState(true)

  useEffect(() => {
    async function fetchLive() {
      try {
        const [pricesRes, gridRes] = await Promise.all([
          fetch('/api/market/ercot?type=prices'),
          fetch('/api/market/ercot?type=grid'),
        ])
        const prices = pricesRes.ok ? await pricesRes.json() : null
        const grid = gridRes.ok ? await gridRes.json() : null
        setLiveData({ prices, grid })
      } catch (error) {
        console.error('Live market fetch failed:', error)
      } finally {
        setLiveLoading(false)
      }
    }

    fetchLive()
  }, [])

  const southPrice = liveData?.prices?.prices?.south
  const actualLoad = liveData?.grid?.metrics?.actual_load
  const reserves = liveData?.grid?.metrics?.reserves
  const scarcityProb = liveData?.grid?.metrics?.scarcity_prob

  return (
    <div className="bg-zinc-50 text-zinc-900 min-h-screen font-sans antialiased selection:bg-[#002FA7] selection:text-white overflow-x-hidden">
      <LandingHeader />

      <section className="px-6 pt-20 pb-16 max-w-5xl mx-auto">
        <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">MARKET_OUTLOOK</p>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-zinc-900 mb-6 leading-[1.0]">
          Forward prices show
          <br />
          <span className="text-[#002FA7]">when to pay attention.</span>
        </h1>
        <p className="text-xl text-zinc-500 font-light max-w-2xl leading-relaxed">
          Use the curve to see where the market is expensive, where it cools off, and when a review makes sense.
        </p>
      </section>

      <section className="px-6 pb-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-1.5 h-1.5 rounded-full ${liveLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
          <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.3em]">
            {liveLoading ? 'FETCHING_LIVE_MARKET_DATA...' : 'LIVE_MARKET_DATA'}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'LZ_SOUTH / MWh', value: southPrice != null ? `$${southPrice.toFixed(2)}` : null, sub: 'Current spot price' },
            { label: 'System load', value: actualLoad != null ? `${(actualLoad / 1000).toFixed(1)} GW` : null, sub: 'Actual demand' },
            { label: 'Operating reserves', value: reserves != null ? `${(reserves / 1000).toFixed(1)} GW` : null, sub: 'Available capacity' },
            { label: 'Scarcity risk', value: scarcityProb != null ? `${scarcityProb}%` : null, sub: 'Probability index' },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-2xl border border-zinc-200/60 p-5">
              <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest mb-2">{item.label}</p>
              <p className={`font-mono text-2xl font-bold mb-1 ${liveLoading ? 'text-zinc-200 animate-pulse' : 'text-zinc-900'}`}>
                {liveLoading ? '——' : (item.value ?? '—')}
              </p>
              <p className="font-mono text-[9px] text-zinc-400">{item.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-16 max-w-5xl mx-auto">
        <div className="bg-white rounded-3xl border border-zinc-200/60 p-8 md:p-12 shadow-sm">
          <div className="flex items-start justify-between mb-10">
            <div>
              <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest mb-2">ERCOT SOUTH LOAD ZONE</p>
              <h2 className="text-2xl font-semibold text-zinc-900 tracking-tight">12 month forward curve</h2>
            </div>
            <div className="text-right shrink-0 ml-6">
              <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Peak month</p>
              <p className="font-mono text-3xl font-bold text-[#002FA7]">$91.43</p>
              <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest">Aug 26 / MWh</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={forwardCurveData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontFamily: 'monospace', fontSize: 11, fill: '#a1a1aa' }}
                axisLine={{ stroke: '#e4e4e7' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${v}`}
                tick={{ fontFamily: 'monospace', fontSize: 11, fill: '#a1a1aa' }}
                axisLine={false}
                tickLine={false}
                width={55}
                domain={[30, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={60}
                stroke="#002FA7"
                strokeDasharray="4 4"
                strokeOpacity={0.25}
                label={{ value: '$60 reference', fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace', position: 'insideTopRight' }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#002FA7"
                strokeWidth={2}
                dot={{ fill: '#002FA7', r: 3.5, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#002FA7', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="font-mono text-[9px] text-zinc-300 uppercase tracking-widest mt-6 text-right">
            Source: ERCOT forward market • Data as of Mar 2026
          </p>
        </div>
      </section>

      <section className="px-6 pb-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border-l-2 border-[#002FA7]/20 pl-6">
            <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-widest mb-3">01 — SUMMER PEAK</p>
            <p className="font-semibold text-zinc-900 text-lg tracking-tight mb-2">August is the high point</p>
            <p className="text-zinc-500 text-sm leading-relaxed">If the curve spikes in summer, that usually means the market expects tighter conditions and higher cost.</p>
          </div>
          <div className="border-l-2 border-[#002FA7]/20 pl-6">
            <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-widest mb-3">02 — SHORTER WINDOW</p>
            <p className="font-semibold text-zinc-900 text-lg tracking-tight mb-2">The spread matters</p>
            <p className="text-zinc-500 text-sm leading-relaxed">The gap between quiet months and expensive months helps show when pricing is most favorable.</p>
          </div>
          <div className="border-l-2 border-[#002FA7]/20 pl-6">
            <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-widest mb-3">03 — NEXT STEP</p>
            <p className="font-semibold text-zinc-900 text-lg tracking-tight mb-2">Review before the window closes</p>
            <p className="text-zinc-500 text-sm leading-relaxed">If the market looks expensive now, the safest move is to review the bill or book a briefing before renewal pressure builds.</p>
          </div>
        </div>
      </section>

      <section className="px-6 pb-32 max-w-5xl mx-auto">
        <div className="bg-zinc-900 rounded-3xl p-12 md:p-16 text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#002FA7]/20 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative z-10">
            <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">FORWARD STRATEGY</p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-white mb-4 leading-[1.1]">
              The market is telling you something.
            </h2>
            <p className="text-zinc-400 text-lg mb-10 max-w-xl mx-auto font-light leading-relaxed">
              Use the curve to decide whether to review the bill now or talk through the next move with us.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
              <a
                href="/bill-debugger"
                className="w-full md:w-auto inline-flex items-center justify-center gap-3 bg-white text-zinc-900 px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl"
              >
                Review My Bill
                <ArrowRight className="w-5 h-5" />
              </a>
              <Link
                href="/book"
                className="w-full md:w-auto inline-flex items-center justify-center gap-3 border border-white/20 text-white px-8 py-4 rounded-full font-bold text-lg hover:border-white/40 transition-all"
              >
                Book a Briefing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
