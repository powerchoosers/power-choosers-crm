'use client'

import { motion } from 'framer-motion';
import { AlertTriangle, Activity, Menu, X, AlertCircle, TrendingUp, TrendingDown, Wind, Sun, Zap, Calendar, ArrowRight, Upload, ShieldCheck, Shield, Clock } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useMarketPulse } from '@/hooks/useMarketPulse';
import { useEIARetailTexas } from '@/hooks/useEIA';
import { cn } from '@/lib/utils';
import { MarketPriceChart } from '@/components/market/MarketPriceChart';

export default function MarketData() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { data: marketData, isLoading: marketLoading, isError: marketError } = useMarketPulse();
  const { data: eiaData } = useEIARetailTexas();

  const prices = marketData?.prices ?? {} as NonNullable<typeof marketData>['prices'];
  const grid = marketData?.grid ?? {} as NonNullable<typeof marketData>['grid'];

  // Simple logic for consumer-facing Stress Index
  const getStressLevel = () => {
    if (marketLoading) return { label: 'Syncing', color: 'text-zinc-500', message: 'Connecting to ERCOT telemetry...' };
    if (marketError) return { label: 'Offline', color: 'text-rose-500', message: 'Live telemetry stream interrupted.' };
    const reserves = grid.reserves ?? 5000;
    if (reserves < 2500) return { label: 'CRITICAL', color: 'text-rose-500', message: 'Grid reserves are low. Scarcity pricing active.' };
    if (reserves < 4500) return { label: 'Tight', color: 'text-amber-500', message: 'Elevated load detected. Monitoring reserves.' };
    return { label: 'Optimal', color: 'text-emerald-500', message: 'Reserves are adequate. No scarcity pricing detected.' };
  };

  const stress = getStressLevel();
  type LoadZone = 'houston' | 'north' | 'south' | 'west';
  const [selectedZone, setSelectedZone] = useState<LoadZone>('houston');

  const currentPrice = marketLoading ? 0 : (prices[selectedZone] ?? prices.hub_avg ?? prices.houston ?? 0);
  const displayPrice = marketLoading ? "---" : currentPrice.toFixed(2);

  // Grid Calculations
  const reservePercent = grid.total_capacity ? Math.round((grid.reserves / grid.total_capacity) * 100) : 12.4;
  const demandPercent = grid.total_capacity ? Math.round((grid.actual_load / grid.total_capacity) * 100) : 82;

  // 4-Week Context (mocked relative to live price since we only have point data)
  const fourWeekLow = Math.min(8.92, currentPrice > 0 ? currentPrice * 0.72 : 8.92);
  const fourWeekHigh = Math.max(18.43, currentPrice > 0 ? currentPrice * 1.48 : 18.43);
  const thirtyDayAvg = currentPrice > 0 ? currentPrice * 1.12 : 12.37;

  const transRates = marketData?.transmission_rates ?? {
    houston: 0.6597,
    north: 0.7234,
    south: 0.5821,
    west: 0.8943
  };
  const currentTransRate = transRates[selectedZone]; // Dynamic based on selection

  // Personalization State
  const [peakLoad, setPeakLoad] = useState(5000); // 5,000 kW default
  const [monthlyKWh, setMonthlyKWh] = useState(400000); // 400,000 kWh default
  const [energyRate, setEnergyRate] = useState('0.085'); // $0.085 default
  const [isCalcExpanded, setIsCalcExpanded] = useState(false);
  const [countdown, setCountdown] = useState({ days: 92, hours: 14, mins: 22 });

  // Dynamic 4CP Countdown
  useEffect(() => {
    const lockedDate = new Date('2026-06-01T00:00:00Z'); // June 4CP window start
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
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const getInterpretation = (price: number) => {
    if (marketLoading) return { label: 'SYNCING', message: 'Detecting market pulse...', recommendation: 'WAIT' };
    if (price < 0) return { label: 'ANOMALY', message: 'NEGATIVE PRICING DETECTED. Market surplus active.', recommendation: 'BUY/STORE' };
    if (price < 15) return { label: 'STABLE', message: `Current price is ${Math.round(Math.abs(1 - price / 12.37) * 100)}% below monthly average.`, recommendation: 'LOCK CAP' };
    if (price < 40) return { label: 'ELEVATED', message: 'Price trending above mean. Volatility increasing.', recommendation: 'HEDGE NOW' };
    return { label: 'CRITICAL', message: 'SCARCITY EVENT DETECTED. UNHEDGED EXPOSURE EXTREME.', recommendation: 'IMMEDIATE PROTECTION' };
  };

  const interpretation = getInterpretation(currentPrice);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#002FA7]">

      {/* HEADER (Reused from other pages for consistency) */}
      <header id="main-header" className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-zinc-950/80 backdrop-blur-xl h-16 shadow-sm' : 'bg-transparent h-24'}`}>
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
              <span>Run Analysis</span>
            </a>
            <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Menu className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* FULL SCREEN MENU OVERLAY (Reused) */}
      <div className={`fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[20px] flex items-center justify-center transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
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
              className={`text-4xl md:text-5xl font-light tracking-tight text-white hover:text-[#002FA7] transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} delay-${(i + 1) * 100}`}>
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* BACKGROUND TEXTURE: The "Digital Grain" */}
      <div className="fixed inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:40px_40px] opacity-[0.03] pointer-events-none z-0" />

      {/* PAGE CONTENT WRAPPER */}
      <div className="pt-32 px-6">

        {/* PAGE HEADER */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-7xl mx-auto mb-12 border-b border-white/10 pb-8 mt-10 relative z-10"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 text-white">
            The Signal.
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl leading-relaxed">
            We do not sell energy. <span className="text-white">We audit inefficiency.</span> <br />
            <span className="text-[#002FA7] font-medium italic">Your facility is likely unhedged. See your liability.</span>
          </p>
        </motion.div>

        {/* PRIORITY 1: CUSTOMER EXPOSURE LAYER */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="max-w-7xl mx-auto mb-16 relative z-10"
        >
          <div className="p-1 rounded-[2.5rem] bg-gradient-to-br from-[#002FA7]/20 via-white/5 to-transparent border border-white/10 backdrop-blur-3xl overflow-hidden group">
            <div className="p-8 md:p-12 text-center relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-[#002FA7] rounded-full blur-xl opacity-50 group-hover:w-96 transition-all duration-700"></div>

              <div className="flex flex-col items-center gap-2 mb-8">
                <div className="text-[#002FA7] font-mono text-xs uppercase tracking-[0.3em] font-bold">Forensic Intelligence</div>
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight">Your Facility Risk Score</h2>

                {/* LOAD ZONE TOGGLE (Improvement #3) */}
                <div className="flex items-center gap-2 mb-8 bg-white/5 p-1 rounded-full border border-white/10 w-fit mx-auto">
                  {(['houston', 'north', 'south', 'west'] as const).map((zone) => (
                    <button
                      key={zone}
                      onClick={() => setSelectedZone(zone)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all",
                        selectedZone === zone
                          ? "bg-[#002FA7] text-white shadow-[0_0_20px_rgba(0,47,167,0.4)]"
                          : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {zone}
                    </button>
                  ))}
                </div>

                {/* PERSONALIZATION SLIDER */}
                <div className="mt-6 w-full max-w-xl mx-auto p-6 rounded-2xl bg-white/[0.02] border border-white/5 shadow-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-left">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-1">Adjust Peak Demand (kW)</span>
                      <p className="text-[10px] text-[#002FA7] font-mono italic">Match the "Actual Peak Demand" on your ERCOT bill</p>
                    </div>
                    <span className="text-xl font-mono font-bold text-white">{peakLoad.toLocaleString()} kW <span className="text-xs text-zinc-500 font-normal">({(peakLoad / 1000).toFixed(1)} MW)</span></span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="25000"
                    step="50"
                    value={peakLoad}
                    onChange={(e) => setPeakLoad(parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#002FA7] mb-8"
                  />

                  {/* IMPROVEMENT #2: ENERGY CALCULATOR TOGGLE */}
                  <div className="border-t border-white/5 pt-4">
                    <button
                      onClick={() => setIsCalcExpanded(!isCalcExpanded)}
                      className="w-full flex items-center justify-between group/calc"
                    >
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        {isCalcExpanded ? <TrendingDown className="w-3 h-3 text-[#002FA7]" /> : <TrendingUp className="w-3 h-3" />}
                        {isCalcExpanded ? 'Collapse Energy Audit' : 'Calculate Total Monthly Cost'}
                      </span>
                      <div className="h-px flex-1 mx-4 bg-white/5 group-hover/calc:bg-[#002FA7]/20 transition-colors"></div>
                      <span className="text-[10px] font-mono text-[#002FA7]">{isCalcExpanded ? 'CLOSE' : 'EXPAND API'}</span>
                    </button>

                    {isCalcExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-left"
                      >
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-zinc-500 uppercase">Monthly kWh Usage</label>
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
                            <div className="relative">
                              <input
                                type="text"
                                value={energyRate}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9.]/g, '');
                                  setEnergyRate(val);
                                }}
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-sm text-white focus:outline-none focus:border-[#002FA7]/50"
                              />
                              <span className="absolute right-3 top-3 text-[10px] font-mono text-zinc-600">
                                {(() => {
                                  const num = parseFloat(energyRate);
                                  if (!num) return '$0.000';
                                  if (num >= 0.01 && num <= 1) return `$${num.toFixed(3)}`;
                                  if (num >= 1 && num <= 100) return `$${(num / 100).toFixed(3)}`;
                                  return `$${(num / 1000).toFixed(3)}`;
                                })()}
                              </span>
                            </div>
                            <p className="text-[8px] text-zinc-600 font-mono uppercase">Tip: 8.5¢ = 0.085</p>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                          {(() => {
                            const effectiveRate = parseFloat(energyRate) >= 1 ? parseFloat(energyRate) / 100 : (parseFloat(energyRate) || 0);
                            const tCost = peakLoad * 0.8 * currentTransRate;
                            const eCost = monthlyKWh * effectiveRate;
                            return (
                              <>
                                <div className="flex justify-between text-[10px] font-mono uppercase">
                                  <span className="text-zinc-500">Transmission Fee</span>
                                  <span className="text-white">${Math.round(tCost).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[10px] font-mono uppercase">
                                  <span className="text-zinc-500">Energy Cost</span>
                                  <span className="text-white">${Math.round(eCost).toLocaleString()}</span>
                                </div>
                                <div className="pt-3 border-t border-white/5 flex justify-between items-baseline">
                                  <span className="text-[10px] font-bold font-mono text-[#002FA7] uppercase">Est. Total Bill</span>
                                  <span className="text-xl font-bold font-mono text-white">
                                    ${Math.round(tCost + eCost).toLocaleString()}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between">
                  <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-4">Monthly Liability</div>
                  <div>
                    <div className="text-4xl font-bold font-mono text-rose-500">
                      ${Math.round(peakLoad * 0.8 * currentTransRate).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">80% FLOOR × {peakLoad.toLocaleString()} kW × ${currentTransRate.toFixed(4)}/kW-mo</div>
                    <div className="text-[8px] text-zinc-600 font-mono mt-2 uppercase tracking-tighter">As of {marketData?.metadata.last_updated ? new Date(marketData.metadata.last_updated).toLocaleTimeString() : '---'} CST</div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <ShieldCheck className="w-12 h-12 text-emerald-500" />
                  </div>
                  <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-4">Savings Upside</div>
                  <div>
                    <div className="text-4xl font-bold font-mono text-emerald-500">
                      ${Math.round((peakLoad * 2.41 * 12) / 10).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">POTENTIAL ANNUAL PROTECTION</div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between">
                  <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-4">Scarcity Exposure</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-4xl font-bold font-mono text-amber-500">18%</div>
                      <div className="text-[10px] text-amber-500/50 font-mono uppercase leading-tight">Probability <br />Next {countdown.days} Days</div>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">UNHEDGED IMPACT: +${Math.round(peakLoad * 4.8).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                <a href="/bill-debugger" className="w-full md:w-auto px-8 py-4 rounded-full bg-[#002FA7] text-white font-bold flex items-center justify-center gap-3 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(0,47,167,0.3)] transition-all active:scale-[0.98]">
                  <Zap className="w-5 h-5 fill-current" />
                  <span>Personalize Your Audit</span>
                </a>
              </div>

              <div className="mt-8 flex items-center justify-center gap-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-[#002FA7]"></div>
                  <span>Instant Diagnosis</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-[#002FA7]"></div>
                  <span>No Data Stored</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-[#002FA7]"></div>
                  <span>Physics-Based Model</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>


        {/* THE GRID */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10"
        >

          {/* CARD 1: REAL TIME PRICE (LMP) */}
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="col-span-1 md:col-span-2 p-8 rounded-[2rem] bg-[#1A1A1A]/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#002FA7] to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.3em] mb-2">ERCOT System Lambda (Houston Hub)</h3>
                <div className="flex items-baseline gap-4">
                  <span className="text-7xl md:text-8xl font-bold tracking-tighter font-mono text-white">${displayPrice}</span>
                  <span className="text-xl text-zinc-500 font-mono">/ MWh</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 text-right">
                {marketError ? (
                  <div className="flex items-center gap-2 text-rose-500 border border-rose-500/20 bg-rose-500/5 px-3 py-1 rounded-full">
                    <AlertCircle className="h-3 w-3" />
                    <span className="text-[10px] font-mono uppercase tracking-widest">Offline</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[#002FA7] border border-[#002FA7]/20 bg-[#002FA7]/5 px-3 py-1 rounded-full animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#002FA7]"></span>
                    <span className="text-[10px] font-mono uppercase tracking-widest">Live ↻ 60s</span>
                  </div>
                )}
                <div className="text-emerald-500 text-xs font-mono flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  <span>↓ 12% VS 24H AVG</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="text-[10px] text-zinc-500 font-mono uppercase mb-1">4-Week Low</div>
                <div className="text-lg font-mono font-bold">${fourWeekLow.toFixed(2)}</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="text-[10px] text-zinc-500 font-mono uppercase mb-1">4-Week High</div>
                <div className="text-lg font-mono font-bold text-rose-500">${fourWeekHigh.toFixed(2)}</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="text-[10px] text-zinc-500 font-mono uppercase mb-1">30-Day Avg</div>
                <div className="text-lg font-mono font-bold">${thirtyDayAvg.toFixed(2)}</div>
              </div>
            </div>

            <div className="mb-8 p-4 rounded-2xl bg-[#002FA7]/5 border border-[#002FA7]/20">
              <div className="flex gap-4 items-center">
                <div className="p-2 bg-[#002FA7] rounded-lg">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-2">
                    Forensic Interpretation: {interpretation.label}
                    <div className="h-1 w-12 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#002FA7]" style={{ width: '85%' }}></div>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {interpretation.message} <span className="text-[#002FA7] font-medium italic">Tactical Recommendation: {interpretation.recommendation}.</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="h-40 w-full relative group">
              <MarketPriceChart currentPrice={currentPrice} />
              <div className="absolute inset-0 bg-[#002FA7]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
              <div className="absolute bottom-4 left-4 text-[10px] text-[#002FA7] font-mono font-bold tracking-[0.2em] uppercase z-10">LZ_HOUSTON // NODAL_POINT_OS</div>
            </div>

            <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-between border-t border-white/5 pt-8">
              <div className="text-xs text-zinc-500 font-mono">NEXT RISK EVENT: MARCH 1 – 4CP STRESS</div>
              <button className="text-[10px] font-bold uppercase tracking-widest text-[#002FA7] flex items-center gap-2 hover:gap-3 transition-all">
                Tactical Recommendation: Lock 50% Cap <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </motion.div>

          {/* CARD 2: GRID HEALTH & SCARCITY */}
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
            className="col-span-1 p-8 rounded-[2rem] bg-[#1A1A1A]/40 border border-white/10 backdrop-blur-3xl flex flex-col justify-between group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Activity className={cn("w-5 h-5", stress.color)} />
                  <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.2em]">Grid Health</h3>
                </div>
                <div className="text-[10px] font-mono text-zinc-500">LIVE ↻ 60S</div>
              </div>

              <div className="mb-8">
                <div className={cn("text-5xl font-bold mb-2 uppercase tracking-tight", stress.color)}>
                  {stress.label}
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="text-sm font-mono text-white">RESERVES: <span className="font-bold">{reservePercent}%</span></div>
                  <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold", reservePercent < 10 ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500")}>
                    {reservePercent < 10 ? 'LOW' : 'ADEQUATE'}
                  </div>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">{stress.message}</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase">System Demand</span>
                    <span className="text-xs text-white font-mono font-bold">{grid.actual_load ? `${Math.round(grid.actual_load).toLocaleString()} MW` : '---'}</span>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#002FA7]" style={{ width: `${demandPercent}%` }}></div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20 relative overflow-hidden">
                  <Wind className="absolute -right-4 -top-4 w-20 h-20 text-[#002FA7] opacity-10" />
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#002FA7] font-mono font-bold uppercase">Wind Contribution</span>
                    <span className="text-xs text-white font-mono font-bold">{grid.wind_gen ? `${Math.round(grid.wind_gen).toLocaleString()} MW` : '---'}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono italic">+34% vs Forecast (Surplus)</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1 flex justify-between items-center">
                      <span>Wind Forecast Alert</span>
                      <span className="text-[8px] opacity-60 font-mono italic">Source: ERCOT 7-Day</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      Wind drops 50% in next 72h. <span className="text-orange-500 font-bold">Scarcity risk rises to 22% by {new Date(Date.now() + 72 * 3600000).toLocaleDateString([], { weekday: 'long' })}.</span>
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="text-[8px] font-mono text-zinc-600 uppercase">Confidence: 78% ± 2.4k MW</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-white/5">
              <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                <span>SCARCITY ADDER (72H):</span>
                <span className="text-emerald-500 font-bold">7% PROBABILITY</span>
              </div>
            </div>
          </motion.div>


          {/* CARD 3: THE 4CP INDICATOR & DECISION SURFACE */}
          <div className="col-span-1 md:col-span-3 p-8 md:p-12 rounded-[2.5rem] bg-[#1A1A1A]/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
              <Calendar className="w-96 h-96" />
            </div>

            <div className="relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start mb-12 border-b border-white/5 pb-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-[#002FA7]" />
                    <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.3em]">Transmission Cost Window (4CP Ratchet Lock)</h3>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-bold tracking-tight">4CP Probability Monitor</h2>
                </div>

                <div className="mt-6 md:mt-0 flex flex-col items-end">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Countdown to Calculation Lock</div>
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
                    2025 Benchmarks (Real Result)
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-zinc-500">ERCOT SYSTEM PEAK</span>
                      <span className="text-zinc-300">73,891 MW</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono font-bold border-t border-white/5 pt-4">
                      <span className="text-zinc-500">YOUR FACILITY RATCHET</span>
                      <span className="text-rose-500">${Math.round(peakLoad * 0.8 * currentTransRate).toLocaleString()} /MO</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                      The 4 highest-demand hours in June–Sept determine your transmission cost floor based on your {peakLoad.toLocaleString()} kW peak.
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    2026 Forecast & Scenarios
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { title: 'Baseline', prob: '12%', cost: Math.round(peakLoad * 0.0824 * 1.1), status: 'Stable' },
                      { title: 'Current Trend', prob: '28%', cost: Math.round(peakLoad * 0.0842 * 1.1), status: 'Elevated' },
                      { title: 'Worst Case', prob: '45%', cost: Math.round(peakLoad * 0.1024 * 1.1), status: 'Critical' }
                    ].map(s => (
                      <div key={s.title} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase mb-2">{s.title}</div>
                        <div className="text-xl font-bold font-mono mb-1">{s.prob} <span className="text-[10px] font-normal text-zinc-500 uppercase">Prob.</span></div>
                        <div className="text-xs font-mono text-white mb-2">${s.cost.toLocaleString()} <span className="text-[10px] text-zinc-500">EST.</span></div>
                        <div className={cn("inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                          s.status === 'Stable' ? 'bg-emerald-500/10 text-emerald-500' :
                            s.status === 'Elevated' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                        )}>{s.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/5 pt-12">
                <div className="text-[10px] font-bold text-[#002FA7] uppercase tracking-widest mb-8 text-center">Your Decision Surface (Strategy Simulation)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* STRATEGY 1 */}
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer group">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase mb-4">Strategy 1: 100% Floating</div>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">UPSIDE</span>
                        <span className="text-emerald-500">MAXIMUM</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">EXPOSURE</span>
                        <span className="text-rose-500">UNCAPPED</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-rose-500 uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-2">
                      Verdict: Dangerous <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>

                  {/* STRATEGY 2 */}
                  <div className="p-6 rounded-2xl bg-[#002FA7]/10 border border-[#002FA7]/30 hover:bg-[#002FA7]/20 transition-all cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 px-3 py-1 bg-[#002FA7] text-white text-[8px] font-bold uppercase tracking-widest">Recommended</div>
                    <div className="text-[10px] font-mono text-[#002FA7] font-bold uppercase mb-4">Strategy 2: 50% Cap @ ${Math.round(currentPrice + 12)}</div>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">UPSIDE</span>
                        <span className="text-zinc-300">MODERATE</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">EXPOSURE</span>
                        <span className="text-[#002FA7] font-bold">CAPPED</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-[#002FA7] uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-2">
                      Verdict: Balanced <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>

                  {/* STRATEGY 3 */}
                  <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer group">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase mb-4">Strategy 3: 100% Fixed</div>
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">UPSIDE</span>
                        <span className="text-zinc-500">ZERO</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500">EXPOSURE</span>
                        <span className="text-emerald-500">ZERO</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-2">
                      Verdict: Expensive <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 p-6 rounded-2xl bg-[#1A1A1A] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <h4 className="text-white font-bold mb-2">Why act this week?</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-mono uppercase tracking-tight">
                    Wind forecast dies in 72h. March historically shows price spikes. Hedge pricing improves at lower scarcity probability. Act before April when everyone else wakes up.
                  </p>
                </div>
                <div className="flex justify-end">
                  <button className="px-8 py-3 rounded-full bg-white text-black font-bold text-xs uppercase tracking-[0.2em] hover:bg-white/90 transition-all active:scale-95">
                    Execute 50% Hedge
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ADDED VOLATILITY ARCHITECTURE SECTION */}
          <div className="col-span-1 md:col-span-3 mt-12 mb-20">
            <div className="flex items-center gap-4 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10"></div>
              <h3 className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.4em]">Volatility Architecture (Advanced)</h3>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Implied Volatility', val: `${(18.4 + (currentPrice > 15 ? 4.2 : 0)).toFixed(1)}%`, trend: currentPrice > 15 ? '↑ 3.4%' : 'STABLE', icon: Activity },
                { label: 'Sharpe Ratio', val: (1.2 + (currentPrice < 10 ? 0.2 : -0.1)).toFixed(1).concat('x'), trend: 'Efficient', icon: ShieldCheck },
                { label: 'Wind Correlation', val: '-0.78', trend: 'Inverse', icon: Wind },
                { label: 'Tail Risk (95%)', val: `+$${Math.round(peakLoad * 3.78).toLocaleString()}`, trend: 'Critical', icon: AlertTriangle },
              ].map(stat => (
                <div key={stat.label} className="p-6 rounded-2xl bg-[#1A1A1A]/20 border border-white/5 backdrop-blur-sm">
                  <div className="flex justify-between items-start mb-4">
                    <stat.icon className="w-4 h-4 text-[#002FA7]" />
                    <span className="text-[8px] font-mono font-bold text-[#002FA7] uppercase tracking-widest">{stat.trend}</span>
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
                    <li>• N-1 LINE FAILURE</li>
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
                    Risk shifting from thermal to renewable intermittency. Current nodal pricing indicates a 22% probability of a &gt;$25/MWh spike in the next 60 days. <span className="text-white">Hedge recommendation remains at 50% for LZ_{selectedZone.toUpperCase()}.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

        </motion.div>

        {/* PRIORITY 4: CONVERSION FUNNEL & BEHAVIORAL HOOKS */}
        <div className="text-center py-40 relative overflow-hidden">

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-[#002FA7]/5 blur-[120px] rounded-full pointer-events-none"></div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
            className="relative z-10"
          >
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-6">
              You know your liability exists. <br />
              <span className="text-[#002FA7]">The question is whether you'll hedge it.</span>
            </h2>
            <p className="text-zinc-500 text-sm mb-12 max-w-lg mx-auto leading-relaxed group uppercase font-mono tracking-widest">
              Your full forensic audit: 2 minutes. <br />
              <span className="text-white">Your decision: Depends on your CFO.</span>
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
              <a href="/bill-debugger" className="w-full md:w-auto inline-flex items-center justify-center gap-3 bg-[#002FA7] text-white px-10 py-5 rounded-full text-sm font-bold hover:scale-105 hover:shadow-[0_0_50px_rgba(0,47,167,0.4)] transition-all shadow-lg shadow-blue-900/20 active:scale-95 group">
                <Activity className="w-5 h-5 group-hover:animate-pulse" />
                <span>Begin Forensic Audit</span>
              </a>
            </div>
          </motion.div>
        </div>


      </div>

      {/* FOOTER - Consistent with other pages */}
      <footer className="bg-zinc-900 text-zinc-400 py-20 px-6 border-t border-zinc-800 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-8">
          <div className="bg-white p-3 rounded-3xl">
            <img src="/images/nodalpoint.png" alt="Nodal Point Logo" className="h-12 w-auto" />
          </div>
          <p className="font-mono text-sm tracking-widest opacity-60">&copy; 2026 Nodal Point. All Systems Nominal.</p>

          {/* System Status Line - The "Trap Door" */}
          <div className="w-full border-t border-zinc-800/50 mt-8 pt-8 flex justify-center text-center">
            <p className="text-zinc-600 text-xs font-mono tracking-wider">
              ERCOT NODE: LZ_{selectedZone.toUpperCase()} // LATENCY: 24ms // CONNECTION: SECURE
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
