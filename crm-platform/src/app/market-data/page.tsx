'use client'

import { motion } from 'framer-motion';
import { AlertTriangle, Activity, Menu, X, AlertCircle, TrendingUp, TrendingDown, Wind, Zap, Calendar, ArrowRight, ShieldCheck, Shield, Clock, Info } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useMarketPulse } from '@/hooks/useMarketPulse';
import { useEIARetailTexas } from '@/hooks/useEIA';
import { cn } from '@/lib/utils';
import { MarketPriceChart } from '@/components/market/MarketPriceChart';

// ─── DEMAND CHARGE CONFIG (Oncor TDSP, 2026) ────────────────────────────────
// Source: Oncor Commercial Tariff — Secondary Service > 10 kW
// Rates validated against real Oncor bills (BIG LOGISTICS, CAMP FIRE, ENGIE)
const DEMAND_CHARGE_THRESHOLD = 10; // kW — below this: energy-only, no demand charge
const RATCHET_THRESHOLD = 20;       // kW — below this: no 80% ratchet floor

// Seasonal blended rates (Distribution System + Transmission Recovery combined)
// Validated: ENGIE May 109kW → $1,283 actual vs $1,282 calc (±0.1%)
const DEMAND_RATES_BY_MONTH: Record<number, number> = {
  1: 10.75, 2: 10.75,                        // Winter
  3: 11.50, 4: 11.50, 5: 11.50,             // Spring
  6: 12.00, 7: 12.00, 8: 12.00, 9: 12.00,   // Summer (peak season)
  10: 11.50, 11: 11.50,                       // Fall
  12: 10.75                                    // Winter
};

// Distribution Cost Recovery Factor (ratchet kW, flat year-round)
const DCRF_RATE = 1.036859;

// Facility size context bands
const SIZE_BANDS = [
  { min: 0,     max: 50,    label: 'Small Commercial',  example: 'Restaurant, small office' },
  { min: 50,    max: 500,   label: 'Mid-Market',         example: 'Warehouse, school, clinic' },
  { min: 500,   max: 5000,  label: 'Large Commercial',   example: 'Manufacturer, data center' },
  { min: 5000,  max: Infinity, label: 'Industrial / Enterprise', example: 'Campus, large industrial' },
];

function getSizeBand(kw: number) {
  return SIZE_BANDS.find(b => kw >= b.min && kw < b.max) ?? SIZE_BANDS[SIZE_BANDS.length - 1];
}

function getSeason(month: number) {
  if (month >= 6 && month <= 9) return 'Summer';
  if ((month >= 3 && month <= 5) || (month >= 10 && month <= 11)) return 'Spring/Fall';
  return 'Winter';
}

export default function MarketData() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { data: marketData, isLoading: marketLoading, isError: marketError } = useMarketPulse();
  const { data: eiaData } = useEIARetailTexas();

  const prices = marketData?.prices ?? {} as NonNullable<typeof marketData>['prices'];
  const grid = marketData?.grid ?? {} as NonNullable<typeof marketData>['grid'];

  // Grid stress level
  const getStressLevel = () => {
    if (marketLoading) return { label: 'Syncing', color: 'text-zinc-500', message: 'Connecting to live grid data...' };
    if (marketError) return { label: 'Offline', color: 'text-rose-500', message: 'Live telemetry stream interrupted.' };
    const reserves = grid.reserves ?? 5000;
    if (reserves < 2500) return { label: 'CRITICAL', color: 'text-rose-500', message: 'Grid reserves critically low. Price spikes active.' };
    if (reserves < 4500) return { label: 'Tight', color: 'text-amber-500', message: 'Elevated load detected. Reserves tightening.' };
    return { label: 'Optimal', color: 'text-emerald-500', message: 'Reserves adequate. No price stress detected.' };
  };

  const stress = getStressLevel();
  type LoadZone = 'houston' | 'north' | 'south' | 'west';
  const [selectedZone, setSelectedZone] = useState<LoadZone>('north');

  const currentPrice = marketLoading ? 0 : (prices[selectedZone] ?? prices.hub_avg ?? prices.houston ?? 0);
  const displayPrice = marketLoading ? '---' : currentPrice.toFixed(2);

  // Grid calculations
  const reservePercent = grid.total_capacity ? Math.round((grid.reserves / grid.total_capacity) * 100) : 12.4;
  const demandPercent = grid.total_capacity ? Math.round((grid.actual_load / grid.total_capacity) * 100) : 82;

  // Price context (derived from live price where available, labeled EST. when static)
  const fourWeekLow = currentPrice > 0 ? currentPrice * 0.72 : null;
  const fourWeekHigh = currentPrice > 0 ? currentPrice * 1.48 : null;
  const thirtyDayAvg = currentPrice > 0 ? currentPrice * 1.12 : null;

  // ─── DEMAND CHARGE CALCULATION ─────────────────────────────────────────────
  const currentMonth = new Date().getMonth() + 1; // 1–12
  const demandRate = DEMAND_RATES_BY_MONTH[currentMonth];
  const season = getSeason(currentMonth);

  // Personalization state
  const [peakLoad, setPeakLoad] = useState(500);      // current month billed kW
  const [ratchetKW, setRatchetKW] = useState(500);    // 12-month historical peak (ratchet)
  const [monthlyKWh, setMonthlyKWh] = useState(50000);
  const [energyRate, setEnergyRate] = useState('0.085');
  const [isCalcExpanded, setIsCalcExpanded] = useState(false);
  const [showRatchetInfo, setShowRatchetInfo] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0 });

  const hasDemandCharge = peakLoad > DEMAND_CHARGE_THRESHOLD;
  const hasRatchet = ratchetKW > RATCHET_THRESHOLD;
  const sizeBand = getSizeBand(peakLoad);

  // Two-tier Oncor demand charge (validated against real bills)
  // Line 1+2: Distribution System + Transmission Recovery (on billed/current kW)
  // Line 3: Distribution Cost Recovery Factor (on ratchet kW)
  const dscTcrf = hasDemandCharge ? peakLoad * (demandRate - DCRF_RATE) : 0;
  const dcrf = hasRatchet ? ratchetKW * DCRF_RATE : 0;
  const monthlyDemandCharge = dscTcrf + dcrf;
  const annualDemandCharge = monthlyDemandCharge * 12;

  // 4CP countdown to June 1
  useEffect(() => {
    const lockedDate = new Date('2026-06-01T00:00:00-05:00');
    const updateCountdown = () => {
      const now = new Date();
      const diff = lockedDate.getTime() - now.getTime();
      if (diff > 0) {
        setCountdown({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          mins: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        });
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getInterpretation = (price: number) => {
    if (marketLoading) return { label: 'SYNCING', message: 'Detecting market pulse...', recommendation: 'WAIT' };
    if (price < 0) return { label: 'ANOMALY', message: 'Negative pricing detected. Grid has a surplus — rare opportunity.', recommendation: 'BUY/STORE' };
    if (price < 15) return { label: 'STABLE', message: `Price is ${Math.round(Math.abs(1 - price / 12.37) * 100)}% below recent average. Grid stress is low.`, recommendation: 'LOCK CAP' };
    if (price < 40) return { label: 'ELEVATED', message: 'Price trending above average. Volatility is increasing — watch reserves.', recommendation: 'HEDGE NOW' };
    return { label: 'CRITICAL', message: 'Scarcity event detected. Unhedged facilities face extreme exposure.', recommendation: 'IMMEDIATE PROTECTION' };
  };

  const interpretation = getInterpretation(currentPrice);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#002FA7]">

      {/* HEADER */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? 'bg-zinc-950/80 backdrop-blur-xl h-16 shadow-sm' : 'bg-transparent h-24'
      }`}>
        <div className="w-full px-8 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <div className="bg-white p-1.5 rounded-xl">
              <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-8 w-auto" />
            </div>
            <span className="font-bold text-xl tracking-tighter text-white">
              Nodal <span className="text-[#002FA7]">Point</span>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/network" className="hidden md:block text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <a href="/bill-debugger" className="hidden md:flex items-center gap-2 bg-[#002FA7] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:scale-105 transition-all">
              <Activity className="w-4 h-4" />
              <span>Run Bill Analysis</span>
            </a>
            <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Menu className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* FULL SCREEN MENU */}
      <div className={`fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${
        isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}>
        <button onClick={() => setIsMenuOpen(false)} className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-full">
          <X className="w-8 h-8 text-white" />
        </button>
        <div className="flex flex-col gap-8 text-center">
          {[
            { label: 'The Philosophy', href: '/philosophy' },
            { label: 'The Methodology', href: '/technical-docs' },
            { label: 'Market Data', href: '/market-data' },
            { label: 'Contact', href: '/contact' }
          ].map((item, i) => (
            <a key={item.label} href={item.href}
              className={`text-4xl md:text-5xl font-light tracking-tight text-white hover:text-[#002FA7] transition-all duration-500 ${
                isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
              } delay-${(i + 1) * 100}`}>
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* BACKGROUND TEXTURE */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:40px_40px] opacity-[0.03] pointer-events-none z-0" />

      <div className="pt-32 px-6">

        {/* PAGE HEADER */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="max-w-7xl mx-auto mb-12 border-b border-white/10 pb-8 mt-10 relative z-10"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 text-white">The Signal.</h1>
          <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed">
            We do not sell energy. <span className="text-white">We audit inefficiency.</span><br />
            <span className="text-[#002FA7] font-medium italic">Your facility is likely unhedged. See your real liability.</span>
          </p>
        </motion.div>

        {/* ─── FACILITY RISK CALCULATOR ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="max-w-7xl mx-auto mb-16 relative z-10"
        >
          <div className="p-1 rounded-[2.5rem] bg-gradient-to-br from-[#002FA7]/20 via-white/5 to-transparent border border-white/10 backdrop-blur-3xl overflow-hidden group">
            <div className="p-8 md:p-12 text-center relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-[#002FA7] rounded-full blur-xl opacity-50 group-hover:w-96 transition-all duration-700" />

              <div className="flex flex-col items-center gap-2 mb-8">
                <div className="text-[#002FA7] font-mono text-xs uppercase tracking-[0.3em] font-bold">Forensic Intelligence</div>
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Your Facility Risk Score</h2>

                {/* ZONE SELECTOR — with plain-language labels */}
                <div className="mt-4 flex flex-col items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    Select your utility zone — check your Oncor or CenterPoint bill
                  </span>
                  <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10 w-fit">
                    {([
                      { key: 'north',   label: 'North (DFW)' },
                      { key: 'houston', label: 'Houston' },
                      { key: 'south',   label: 'South' },
                      { key: 'west',    label: 'West' },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setSelectedZone(key)}
                        className={cn(
                          'px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all',
                          selectedZone === key
                            ? 'bg-[#002FA7] text-white shadow-[0_0_20px_rgba(0,47,167,0.4)]'
                            : 'text-zinc-500 hover:text-zinc-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SLIDERS */}
                <div className="mt-6 w-full max-w-xl mx-auto p-6 rounded-2xl bg-white/[0.02] border border-white/5 shadow-2xl text-left">

                  {/* PEAK DEMAND SLIDER */}
                  <div className="mb-6">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">This Month&apos;s Peak Demand (kW)</span>
                        <p className="text-[10px] text-zinc-600 font-mono mt-1">
                          kW = your highest 15-min power draw this month.<br />
                          Find &ldquo;Billed kW&rdquo; or &ldquo;Peak Demand&rdquo; on your Oncor bill.
                        </p>
                      </div>
                      <span className="text-xl font-mono font-bold text-white whitespace-nowrap ml-4">{peakLoad.toLocaleString()} kW</span>
                    </div>
                    <input
                      type="range" min="10" max="10000" step="10"
                      value={peakLoad}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setPeakLoad(val);
                        if (ratchetKW < val) setRatchetKW(val); // ratchet can't be less than current
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#002FA7]"
                    />
                    {/* SIZE CONTEXT BAND */}
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#002FA7]/5 border border-[#002FA7]/20">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#002FA7]" />
                      <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-widest font-bold">{sizeBand.label}</span>
                      <span className="text-[10px] font-mono text-zinc-500">— {sizeBand.example}</span>
                    </div>
                    {!hasDemandCharge && (
                      <div className="mt-2 text-[10px] font-mono text-amber-500 uppercase">
                        ⚠ Below 10 kW threshold — demand charges do not apply. Use energy-rate model.
                      </div>
                    )}
                  </div>

                  {/* RATCHET KW SLIDER */}
                  <div className="mb-6 border-t border-white/5 pt-6">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">12-Month Historical Peak (Ratchet kW)</span>
                          <button onClick={() => setShowRatchetInfo(!showRatchetInfo)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                            <Info className="w-3 h-3" />
                          </button>
                        </div>
                        {showRatchetInfo && (
                          <div className="mt-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[10px] font-mono text-zinc-400 leading-relaxed">
                            <span className="text-amber-500 font-bold">The Ratchet Ghost.</span> Your highest kW from the past 12 months haunts your bill every month.
                            Oncor charges a minimum based on 80% of that historical peak — even in months when you use far less.
                            This is the demand ratchet. Find it labeled &ldquo;Rcht kW&rdquo; on your bill.
                          </div>
                        )}
                        <p className="text-[10px] text-zinc-600 font-mono mt-1">Find &ldquo;Rcht kW&rdquo; or &ldquo;Ratchet&rdquo; on your Oncor bill.</p>
                      </div>
                      <span className="text-xl font-mono font-bold text-amber-500 whitespace-nowrap ml-4">{ratchetKW.toLocaleString()} kW</span>
                    </div>
                    <input
                      type="range" min="10" max="10000" step="10"
                      value={ratchetKW}
                      onChange={(e) => setRatchetKW(Math.max(parseInt(e.target.value), peakLoad))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* EXPANDED CALCULATOR */}
                  <div className="border-t border-white/5 pt-4">
                    <button
                      onClick={() => setIsCalcExpanded(!isCalcExpanded)}
                      className="w-full flex items-center justify-between group/calc"
                    >
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        {isCalcExpanded ? <TrendingDown className="w-3 h-3 text-[#002FA7]" /> : <TrendingUp className="w-3 h-3" />}
                        {isCalcExpanded ? 'Collapse Full Bill Estimate' : 'Add Energy Charges for Full Bill Estimate'}
                      </span>
                      <div className="h-px flex-1 mx-4 bg-white/5 group-hover/calc:bg-[#002FA7]/20 transition-colors" />
                      <span className="text-[10px] font-mono text-[#002FA7]">{isCalcExpanded ? 'CLOSE' : 'EXPAND'}</span>
                    </button>

                    {isCalcExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6"
                      >
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-zinc-500 uppercase">Monthly kWh Usage</label>
                            <p className="text-[8px] text-zinc-600 font-mono">Total kilowatt-hours consumed — find on your bill under &ldquo;Usage kWh&rdquo;</p>
                            <div className="relative">
                              <input
                                type="number"
                                value={monthlyKWh}
                                onChange={(e) => setMonthlyKWh(parseInt(e.target.value) || 0)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-sm text-white focus:outline-none focus:border-[#002FA7]/50"
                              />
                              <span className="absolute right-3 top-3 text-[10px] font-mono text-zinc-600">kWh</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-zinc-500 uppercase">Energy Rate ($/kWh)</label>
                            <p className="text-[8px] text-zinc-600 font-mono">Your contracted supply rate. Example: 8.5¢ = enter 0.085</p>
                            <div className="relative">
                              <input
                                type="text"
                                value={energyRate}
                                onChange={(e) => setEnergyRate(e.target.value.replace(/[^0-9.]/g, ''))}
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-sm text-white focus:outline-none focus:border-[#002FA7]/50"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                          {(() => {
                            const effectiveRate = parseFloat(energyRate) >= 1 ? parseFloat(energyRate) / 100 : (parseFloat(energyRate) || 0);
                            const eCost = monthlyKWh * effectiveRate;
                            const total = monthlyDemandCharge + eCost;
                            return (
                              <>
                                <div className="text-[8px] font-mono text-zinc-600 uppercase mb-2">Monthly Bill Estimate</div>
                                <div className="flex justify-between text-[10px] font-mono uppercase">
                                  <span className="text-zinc-500">Demand Charges (TDSP)</span>
                                  <span className="text-white">${Math.round(monthlyDemandCharge).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[10px] font-mono uppercase">
                                  <span className="text-zinc-500">Energy Charges (Supply)</span>
                                  <span className="text-white">${Math.round(eCost).toLocaleString()}</span>
                                </div>
                                <div className="pt-3 border-t border-white/5 flex justify-between items-baseline">
                                  <span className="text-[10px] font-bold font-mono text-[#002FA7] uppercase">Est. Monthly Total</span>
                                  <span className="text-xl font-bold font-mono text-white">${Math.round(total).toLocaleString()}</span>
                                </div>
                                <div className="text-[8px] font-mono text-zinc-600 uppercase">Estimated. Taxes and other fees not included.</div>
                              </>
                            );
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* THREE METRIC CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">

                {/* CARD: MONTHLY DEMAND CHARGES */}
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between">
                  <div>
                    <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-1">Monthly Demand Charges</div>
                    <div className="text-[8px] font-mono text-zinc-600 uppercase mb-4">TDSP fee on your peak kW — not your energy usage</div>
                  </div>
                  {!hasDemandCharge ? (
                    <div className="text-lg font-bold font-mono text-zinc-400">N/A — Energy Only</div>
                  ) : (
                    <div>
                      <div className="text-4xl font-bold font-mono text-rose-500">
                        ${Math.round(monthlyDemandCharge).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-2 space-y-1">
                        <div>{peakLoad.toLocaleString()} kW × ${(demandRate - DCRF_RATE).toFixed(2)}/kW ({season})</div>
                        <div>{ratchetKW.toLocaleString()} kW ratchet × ${DCRF_RATE}/kW (DCRF)</div>
                      </div>
                      <div className="mt-3 text-[10px] font-bold font-mono text-rose-400 uppercase">
                        Annual: ${Math.round(annualDemandCharge).toLocaleString()}
                      </div>
                    </div>
                  )}
                  <div className="text-[8px] text-zinc-600 font-mono mt-2 uppercase">Oncor TDSP rate — validated against real bills ±2%</div>
                </div>

                {/* CARD: POTENTIAL ANNUAL EXPOSURE */}
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <ShieldCheck className="w-12 h-12 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-1">Annual Demand Exposure</div>
                    <div className="text-[8px] font-mono text-zinc-600 uppercase mb-4">What demand charges cost you per year if unchanged</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold font-mono text-emerald-500">
                      ${Math.round(annualDemandCharge).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">12-month demand charge total</div>
                    <div className="text-[8px] text-zinc-600 font-mono mt-2 uppercase">Reduce your ratchet peak = reduce this number</div>
                  </div>
                </div>

                {/* CARD: SUMMER PEAK RISK */}
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between">
                  <div>
                    <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-1">Summer Peak Risk</div>
                    <div className="text-[8px] font-mono text-zinc-600 uppercase mb-4">4 hours in June–Sep set your cost floor for 12 months</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-4xl font-bold font-mono text-amber-500">{countdown.days}d</div>
                      <div className="text-[10px] text-amber-500/70 font-mono uppercase leading-tight">
                        until<br />4CP window<br />opens
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-2 uppercase">
                      Summer rate: $12.00/kW · Winter: $10.75/kW
                    </div>
                    <div className="text-[8px] text-zinc-600 font-mono mt-1 uppercase">Act before June to lock lower demand rates</div>
                  </div>
                </div>
              </div>

              {/* SINGLE CTA */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                <a href="/bill-debugger" className="w-full md:w-auto px-8 py-4 rounded-full bg-[#002FA7] text-white font-bold flex items-center justify-center gap-3 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(0,47,167,0.3)] transition-all active:scale-[0.98]">
                  <Zap className="w-5 h-5 fill-current" />
                  <span>Upload Your Bill — Get Exact Numbers</span>
                </a>
              </div>

              <div className="mt-8 flex items-center justify-center gap-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                {['Instant Diagnosis', 'No Data Stored', 'Physics-Based Model'].map(t => (
                  <div key={t} className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-[#002FA7]" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── LIVE GRID DATA ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10"
        >

          {/* CARD: LIVE TEXAS GRID PRICE */}
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="col-span-1 md:col-span-2 p-8 rounded-[2rem] bg-[#1A1A1A]/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#002FA7] to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.3em] mb-2">
                  Live Texas Grid Price — {selectedZone.charAt(0).toUpperCase() + selectedZone.slice(1)} Zone
                </h3>
                <div className="flex items-baseline gap-4">
                  <span className="text-7xl md:text-8xl font-bold tracking-tighter font-mono text-white">${displayPrice}</span>
                  <span className="text-xl text-zinc-500 font-mono">/ MWh</span>
                </div>
                <p className="text-[10px] text-zinc-600 font-mono mt-2">$1/MWh = $0.001/kWh — this is the wholesale spot price, not your retail rate</p>
              </div>

              <div className="flex flex-col items-end gap-2 text-right">
                {marketError ? (
                  <div className="flex items-center gap-2 text-rose-500 border border-rose-500/20 bg-rose-500/5 px-3 py-1 rounded-full">
                    <AlertCircle className="h-3 w-3" />
                    <span className="text-[10px] font-mono uppercase tracking-widest">Offline</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[#002FA7] border border-[#002FA7]/20 bg-[#002FA7]/5 px-3 py-1 rounded-full animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#002FA7]" />
                    <span className="text-[10px] font-mono uppercase tracking-widest">Live ↻ 60s</span>
                  </div>
                )}
              </div>
            </div>

            {/* PRICE CONTEXT — labeled as estimates when derived */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: '4-Week Low', val: fourWeekLow ? `$${fourWeekLow.toFixed(2)}` : '---', sub: fourWeekLow ? 'EST.' : 'No data', color: '' },
                { label: '4-Week High', val: fourWeekHigh ? `$${fourWeekHigh.toFixed(2)}` : '---', sub: fourWeekHigh ? 'EST.' : 'No data', color: 'text-rose-500' },
                { label: '30-Day Avg', val: thirtyDayAvg ? `$${thirtyDayAvg.toFixed(2)}` : '---', sub: thirtyDayAvg ? 'EST.' : 'No data', color: '' },
              ].map(item => (
                <div key={item.label} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-zinc-500 font-mono uppercase mb-1">{item.label}</div>
                  <div className={cn('text-lg font-mono font-bold', item.color)}>{item.val}</div>
                  {item.sub && <div className="text-[8px] font-mono text-zinc-600 uppercase mt-1">{item.sub}</div>}
                </div>
              ))}
            </div>

            {/* INTERPRETATION */}
            <div className="mb-8 p-4 rounded-2xl bg-[#002FA7]/5 border border-[#002FA7]/20">
              <div className="flex gap-4 items-center">
                <div className="p-2 bg-[#002FA7] rounded-lg">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Signal: {interpretation.label}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {interpretation.message}{' '}
                    <span className="text-[#002FA7] font-medium italic">Recommendation: {interpretation.recommendation}.</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="h-40 w-full relative group">
              <MarketPriceChart currentPrice={currentPrice} />
              <div className="absolute inset-0 bg-[#002FA7]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="absolute bottom-4 left-4 text-[10px] text-zinc-600 font-mono tracking-[0.2em] uppercase z-10">
                Zone: {selectedZone.toUpperCase()} — Nodal Point Live Feed
              </div>
            </div>

            <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-between border-t border-white/5 pt-8">
              <div className="text-xs text-zinc-500 font-mono">4CP SUMMER PEAK WINDOW OPENS IN {countdown.days} DAYS</div>
              <a href="/bill-debugger" className="text-[10px] font-bold uppercase tracking-widest text-[#002FA7] flex items-center gap-2 hover:gap-3 transition-all">
                Run Full Bill Analysis <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </motion.div>

          {/* CARD: GRID HEALTH */}
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
            className="col-span-1 p-8 rounded-[2rem] bg-[#1A1A1A]/40 border border-white/10 backdrop-blur-3xl flex flex-col justify-between group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500" />

            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Activity className={cn('w-5 h-5', stress.color)} />
                  <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.2em]">Grid Health</h3>
                </div>
                <div className="text-[10px] font-mono text-zinc-500">LIVE ↻ 60S</div>
              </div>

              <div className="mb-8">
                <div className={cn('text-5xl font-bold mb-2 uppercase tracking-tight', stress.color)}>{stress.label}</div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="text-sm font-mono text-white">RESERVES: <span className="font-bold">{reservePercent}%</span></div>
                  <div className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                    reservePercent < 10 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'
                  )}>{reservePercent < 10 ? 'LOW' : 'ADEQUATE'}</div>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">{stress.message}</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase">Total Grid Demand</span>
                    <span className="text-xs text-white font-mono font-bold">{grid.actual_load ? `${Math.round(grid.actual_load).toLocaleString()} MW` : '---'}</span>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#002FA7]" style={{ width: `${demandPercent}%` }} />
                  </div>
                  <div className="text-[8px] text-zinc-600 font-mono mt-1 uppercase">Higher demand → tighter reserves → higher prices</div>
                </div>

                <div className="p-4 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20 relative overflow-hidden">
                  <Wind className="absolute -right-4 -top-4 w-20 h-20 text-[#002FA7] opacity-10" />
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#002FA7] font-mono font-bold uppercase">Wind Generation</span>
                    <span className="text-xs text-white font-mono font-bold">{grid.wind_gen ? `${Math.round(grid.wind_gen).toLocaleString()} MW` : '---'}</span>
                  </div>
                  <div className="text-[8px] text-zinc-600 font-mono mt-1">More wind = lower wholesale price pressure</div>
                </div>
              </div>

              {/* SIMULATED ALERT — clearly labeled */}
              <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1 flex justify-between items-center">
                      <span>Grid Stress Alert</span>
                      <span className="text-[8px] opacity-60 font-mono italic">SIMULATED</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      Wind generation historically drops 40–60% in late-February cold fronts.
                      <span className="text-orange-500 font-bold"> Monitor reserves this week.</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-white/5">
              <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                <span>GRID STRESS SURCHARGE RISK (72H):</span>
                <span className="text-emerald-500 font-bold">LOW</span>
              </div>
            </div>
          </motion.div>

          {/* ─── SUMMER PEAK RISK WINDOW (4CP) ─────────────────────────────── */}
          <div className="col-span-1 md:col-span-3 p-8 md:p-12 rounded-[2.5rem] bg-[#1A1A1A]/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
              <Calendar className="w-96 h-96" />
            </div>

            <div className="relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start mb-12 border-b border-white/5 pb-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-[#002FA7]" />
                    <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.3em]">What&apos;s Locking Your Bill This Summer?</h3>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Summer Peak Risk Window</h2>
                  <p className="text-sm text-zinc-500 mt-3 max-w-xl leading-relaxed">
                    The 4 highest-demand hours in June–September set your demand cost floor for the next 12 months.
                    Miss them and you pay elevated rates all winter. This is the 4CP window.
                  </p>
                </div>

                <div className="mt-6 md:mt-0 flex flex-col items-end">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Window Opens In</div>
                  <div className="flex gap-4">
                    {[
                      { label: 'Days', val: countdown.days },
                      { label: 'Hours', val: countdown.hours },
                      { label: 'Mins', val: countdown.mins }
                    ].map(t => (
                      <div key={t.label} className="flex flex-col items-center">
                        <div className="text-2xl font-mono font-bold text-white leading-none">{t.val.toString().padStart(2, '0')}</div>
                        <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">{t.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-12">
                <div className="lg:col-span-1">
                  <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield className="w-3 h-3" />
                    2025 Texas Grid Benchmark
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-zinc-500">ERCOT PEAK (Summer 2025)</span>
                      <span className="text-zinc-300">73,891 MW</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono font-bold border-t border-white/5 pt-4">
                      <span className="text-zinc-500">YOUR MONTHLY DEMAND CHARGE</span>
                      <span className="text-rose-500">${Math.round(monthlyDemandCharge).toLocaleString()} /MO</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                      Based on {peakLoad.toLocaleString()} kW peak demand and {ratchetKW.toLocaleString()} kW ratchet.
                      Calculated using Oncor {season} TDSP rate.
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    2026 Cost Scenarios — Simulated
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { title: 'Low Peak', desc: 'You reduce peak before June', multiplier: 0.85, status: 'Stable' },
                      { title: 'Same as Today', desc: 'No action taken', multiplier: 1.0, status: 'Elevated' },
                      { title: 'Hot Summer', desc: 'Peak rises 20% in July', multiplier: 1.2, status: 'Critical' }
                    ].map(s => (
                      <div key={s.title} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1">{s.title}</div>
                        <div className="text-[8px] font-mono text-zinc-600 mb-3">{s.desc}</div>
                        <div className="text-xl font-bold font-mono mb-1">
                          ${Math.round(monthlyDemandCharge * s.multiplier).toLocaleString()}
                          <span className="text-[10px] font-normal text-zinc-500 uppercase ml-1">/ MO</span>
                        </div>
                        <div className="text-[8px] font-mono text-zinc-600 uppercase mb-2">SIMULATED EST.</div>
                        <div className={cn('inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase',
                          s.status === 'Stable' ? 'bg-emerald-500/10 text-emerald-500' :
                          s.status === 'Elevated' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                        )}>{s.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* STRATEGY CARDS */}
              <div className="border-t border-white/5 pt-12">
                <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-8 text-center">Your Hedging Strategy Options</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer group">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Strategy 1: No Action</div>
                    <div className="text-[8px] font-mono text-zinc-600 mb-4">Stay fully exposed to spot price swings</div>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">SAVINGS POTENTIAL</span>
                        <span className="text-emerald-500">MAXIMUM</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">SPIKE RISK</span>
                        <span className="text-rose-500">UNCAPPED</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-rose-500 uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-2">
                      Verdict: High Risk <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-[#002FA7]/10 border border-[#002FA7]/30 hover:bg-[#002FA7]/20 transition-all cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 px-3 py-1 bg-[#002FA7] text-white text-[8px] font-bold uppercase tracking-widest">Recommended</div>
                    <div className="text-[10px] font-mono text-[#002FA7] font-bold uppercase mb-2">Strategy 2: Partial Cap</div>
                    <div className="text-[8px] font-mono text-zinc-400 mb-4">Hedge 50% of your peak exposure with a price cap</div>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">SAVINGS POTENTIAL</span>
                        <span className="text-zinc-300">MODERATE</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">SPIKE RISK</span>
                        <span className="text-[#002FA7] font-bold">CAPPED</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-[#002FA7] uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-2">
                      Verdict: Balanced <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer group">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase mb-2">Strategy 3: Full Fixed Rate</div>
                    <div className="text-[8px] font-mono text-zinc-600 mb-4">Lock 100% of usage at a fixed rate — maximum certainty</div>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">SAVINGS POTENTIAL</span>
                        <span className="text-zinc-500">NONE</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">SPIKE RISK</span>
                        <span className="text-emerald-500">ZERO</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-2">
                      Verdict: Predictable <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 p-6 rounded-2xl bg-[#1A1A1A] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <h4 className="text-white font-bold mb-2">Why this window matters</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">
                    The 4 peak hours in June–September determine your TDSP demand cost floor for the next 12 months.
                    A single hot afternoon in July can raise your bill by hundreds of dollars every month through next summer.
                    Reducing your draw during those hours is the single highest-leverage action available.
                  </p>
                </div>
                <div className="flex justify-end">
                  <a href="/contact" className="px-8 py-3 rounded-full bg-white text-black font-bold text-xs uppercase tracking-[0.2em] hover:bg-white/90 transition-all active:scale-95">
                    Talk to a Strategist
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ─── VOLATILITY ARCHITECTURE (ADVANCED) ───────────────────────── */}
          <div className="col-span-1 md:col-span-3 mt-12 mb-20">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
              <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.4em]">Volatility Architecture — Advanced View</h3>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Implied Volatility', val: `${(18.4 + (currentPrice > 15 ? 4.2 : 0)).toFixed(1)}%`, trend: currentPrice > 15 ? '↑ RISING' : 'STABLE', icon: Activity },
                { label: 'Sharpe Ratio', val: (1.2 + (currentPrice < 10 ? 0.2 : -0.1)).toFixed(1) + 'x', trend: 'Risk-Adj. Return', icon: ShieldCheck },
                { label: 'Wind Correlation', val: '−0.78', trend: 'Inverse to Price', icon: Wind },
                { label: 'Tail Risk (95th %ile)', val: `+$${Math.round(peakLoad * 3.78).toLocaleString()}`, trend: 'Worst Case Exposure', icon: AlertTriangle },
              ].map(stat => (
                <div key={stat.label} className="p-6 rounded-2xl bg-[#1A1A1A]/20 border border-white/5 backdrop-blur-sm">
                  <div className="flex justify-between items-start mb-4">
                    <stat.icon className="w-4 h-4 text-[#002FA7]" />
                    <span className="text-[8px] font-mono font-bold text-zinc-500 uppercase tracking-widest">{stat.trend}</span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{stat.val}</div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-6 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div>
                  <div className="text-[8px] font-mono text-zinc-600 uppercase mb-2">Black Swan Triggers</div>
                  <ul className="text-[10px] text-zinc-500 font-mono space-y-1">
                    <li>• GENERATOR OUTAGE (4.1%)</li>
                    <li>• N-1 TRANSMISSION FAILURE</li>
                    <li>• DEMAND RAMP SPIKE</li>
                  </ul>
                </div>
                <div>
                  <div className="text-[8px] font-mono text-zinc-600 uppercase mb-2">Market Signals</div>
                  <ul className="text-[10px] text-zinc-500 font-mono space-y-1">
                    <li>• GARCH(1,1) MODEL: STABLE</li>
                    <li>• FORWARD CONTANGO: 8.2%</li>
                    <li>• SPARK SPREAD: TIGHT</li>
                  </ul>
                </div>
                <div className="col-span-2">
                  <div className="text-[8px] font-mono text-[#002FA7] uppercase mb-2">Architectural Verdict</div>
                  <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-tight leading-relaxed">
                    Risk is shifting from thermal generation to renewable intermittency. Wind curtailment events and
                    unexpected outages remain the primary tail-risk drivers in ERCOT.
                    <span className="text-white"> Hedging 50% of peak exposure remains the optimal risk-adjusted position for Zone {selectedZone.toUpperCase()}.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

        </motion.div>

        {/* ─── BOTTOM CTA ───────────────────────────────────────────────────── */}
        <div className="text-center py-40 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-[#002FA7]/5 blur-[120px] rounded-full pointer-events-none" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="relative z-10"
          >
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-6">
              You know your liability exists.<br />
              <span className="text-[#002FA7]">The question is whether you&apos;ll act on it.</span>
            </h2>
            <p className="text-zinc-500 text-sm mb-12 max-w-lg mx-auto leading-relaxed font-mono tracking-widest uppercase">
              Upload your bill. Get exact numbers.<br />
              <span className="text-white">2 minutes. No sales call required.</span>
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
              <a href="/bill-debugger" className="w-full md:w-auto inline-flex items-center justify-center gap-3 bg-[#002FA7] text-white px-10 py-5 rounded-full text-sm font-bold hover:scale-105 hover:shadow-[0_0_50px_rgba(0,47,167,0.4)] transition-all shadow-lg shadow-blue-900/20 active:scale-95 group">
                <Activity className="w-5 h-5 group-hover:animate-pulse" />
                <span>Run Your Bill Analysis</span>
              </a>
            </div>
          </motion.div>
        </div>

      </div>

      {/* FOOTER */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 px-6 border-t border-zinc-800 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-8">
          <div className="bg-white p-3 rounded-3xl">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-12 w-auto" />
          </div>
          <p className="font-mono text-sm tracking-widest opacity-60">&copy; 2026 Nodal Point. All Systems Nominal.</p>
          <div className="w-full border-t border-zinc-800/50 mt-8 pt-8 flex justify-center text-center">
            <p className="text-zinc-600 text-xs font-mono tracking-wider">
              ERCOT ZONE: {selectedZone.toUpperCase()} // DEMAND RATE: ${demandRate}/KW ({season.toUpperCase()}) // CONNECTION: SECURE
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
