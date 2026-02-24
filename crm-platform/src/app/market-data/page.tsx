'use client'

import { motion } from 'framer-motion';
import { AlertTriangle, Activity, Menu, X, AlertCircle, TrendingUp, TrendingDown, Wind, Sun, Zap, Calendar, ArrowRight, Upload, ShieldCheck, Shield, Clock } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useMarketPulse } from '@/hooks/useMarketPulse';
import { useEIARetailTexas } from '@/hooks/useEIA';
import { cn } from '@/lib/utils';

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

  // 4CP Status
  const currentMonth = new Date().getMonth(); // 0-indexed
  const is4CPSeason = currentMonth >= 5 && currentMonth <= 8; // June - Sept

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const displayPrice = marketLoading ? "---" : (prices.hub_avg?.toFixed(2) ?? prices.houston?.toFixed(2) ?? "0.00");

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
                <p className="text-zinc-500 text-sm font-mono uppercase tracking-widest mt-1">Based on Anonymous Texas Facility Profiles</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between">
                  <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-4">Monthly Liability</div>
                  <div>
                    <div className="text-4xl font-bold font-mono text-rose-500">$34,272</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">80% FLOOR × 5 MW × $10.85 AVG</div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <ShieldCheck className="w-12 h-12 text-emerald-500" />
                  </div>
                  <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-4">Savings Upside</div>
                  <div>
                    <div className="text-4xl font-bold font-mono text-emerald-500">$144,500</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">POTENTIAL ANNUAL PROTECTION</div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-left flex flex-col justify-between">
                  <div className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest mb-4">Scarcity Exposure</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-4xl font-bold font-mono text-amber-500">18%</div>
                      <div className="text-[10px] text-amber-500/50 font-mono uppercase leading-tight">Probability <br />Next 92 Days</div>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">UNHEDGED IMPACT: +$24,000</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                <button className="w-full md:w-auto px-8 py-4 rounded-full bg-[#002FA7] text-white font-bold flex items-center justify-center gap-3 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(0,47,167,0.3)] transition-all active:scale-[0.98]">
                  <Zap className="w-5 h-5 fill-current" />
                  <span>Simulate Your Hedge</span>
                </button>
                <button className="w-full md:w-auto px-8 py-4 rounded-full bg-transparent border border-white/10 text-white font-bold flex items-center justify-center gap-3 hover:bg-white/5 transition-all">
                  <Upload className="w-5 h-5" />
                  <span>Upload Your Bill</span>
                </button>
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
                <div className="text-lg font-mono font-bold">$8.92</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="text-[10px] text-zinc-500 font-mono uppercase mb-1">4-Week High</div>
                <div className="text-lg font-mono font-bold text-rose-500">$18.43</div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="text-[10px] text-zinc-500 font-mono uppercase mb-1">30-Day Avg</div>
                <div className="text-lg font-mono font-bold">$12.37</div>
              </div>
            </div>

            <div className="mb-8 p-4 rounded-2xl bg-[#002FA7]/5 border border-[#002FA7]/20">
              <div className="flex gap-4 items-center">
                <div className="p-2 bg-[#002FA7] rounded-lg">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white uppercase tracking-wider mb-1">Forensic Interpretation</div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    STABLE. Current price is 12% below monthly average. <span className="text-[#002FA7] font-medium italic">Good window for index hedging before March ramp.</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="h-32 w-full bg-gradient-to-t from-[#002FA7]/20 to-transparent rounded-xl border-b border-[#002FA7]/30 relative group">
              <svg className="absolute bottom-0 left-0 w-full h-full" preserveAspectRatio="none">
                <path d="M0,100 L100,80 L150,95 L200,90 L250,60 L300,50 L350,70 L400,50 L450,85 L500,80 L550,30 L600,20 L650,45 L700,20 L750,55 L800,60 L850,35 L900,40 L950,50 L1000,60 L1000,128 L0,128 Z" fill="url(#grad1)" fillOpacity="0.2" />
                <path d="M0,100 L100,80 L150,95 L200,90 L250,60 L300,50 L350,70 L400,50 L450,85 L500,80 L550,30 L600,20 L650,45 L700,20 L750,55 L800,60 L850,35 L900,40 L950,50 L1000,60" stroke="#002FA7" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="absolute inset-0 bg-[#002FA7]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
              <div className="absolute bottom-4 left-4 text-[10px] text-[#002FA7] font-mono font-bold tracking-[0.2em] uppercase">LZ_HOUSTON // NODAL_POINT_OS</div>
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
                  <div className="text-sm font-mono text-white">RESERVES: <span className="font-bold">12.4%</span></div>
                  <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">ADEQUATE</div>
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
                    <div className="h-full bg-blue-500" style={{ width: '82%' }}></div>
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
                    <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Wind Forecast Alert</div>
                    <p className="text-[10px] text-zinc-400 leading-tight">
                      Wind drops 50% in 72h. <span className="text-orange-500">Scarcity risk rises to 22% by Thursday.</span> Hedge before wind dies.
                    </p>
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
                      { label: 'Days', val: '92' },
                      { label: 'Hours', val: '14' },
                      { label: 'Mins', val: '22' }
                    ].map(t => (
                      <div key={t.label} className="flex flex-col items-center">
                        <div className="text-2xl font-mono font-bold text-white leading-none">{t.val}</div>
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
                      <span className="text-rose-500">$34,272 /MO</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed italic">
                      The 4 highest-demand hours in June–Sept determine your transmission cost floor through May 2027.
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
                      { title: 'Baseline', prob: '12%', cost: '$412k', status: 'Stable' },
                      { title: 'Current Trend', prob: '28%', cost: '$421k', status: 'Elevated' },
                      { title: 'Worst Case', prob: '45%', cost: '$512k', status: 'Critical' }
                    ].map(s => (
                      <div key={s.title} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase mb-2">{s.title}</div>
                        <div className="text-xl font-bold font-mono mb-1">{s.prob} <span className="text-[10px] font-normal text-zinc-500 uppercase">Prob.</span></div>
                        <div className="text-xs font-mono text-white mb-2">{s.cost} <span className="text-[10px] text-zinc-500">EST.</span></div>
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
                    <div className="text-[10px] font-mono text-[#002FA7] font-bold uppercase mb-4">Strategy 2: 50% Cap @ $22</div>
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
                { label: 'Implied Volatility', val: '18.4%', trend: '↑ 2.1%', icon: Activity },
                { label: 'Sharpe Ratio', val: '1.2x', trend: 'Efficient', icon: ShieldCheck },
                { label: 'Wind Correlation', val: '-0.78', trend: 'Inverse', icon: Wind },
                { label: 'Tail Risk (95%)', val: '+$18.9k', trend: 'Critical', icon: AlertTriangle },
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
                    Risk shifting from thermal to renewable intermittency. Current nodal pricing indicates a 22% probability of a &gt;$25/MWh spike in the next 60 days. <span className="text-white">Hedge recommendation remains at 50% for LZ_HOUSTON.</span>
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
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-6">Stop guessing. <br /><span className="text-[#002FA7]">Identify your liability.</span></h2>
            <p className="text-zinc-500 text-sm mb-12 max-w-lg mx-auto leading-relaxed group uppercase font-mono tracking-widest">
              A 30-second audit could save your facility six figures. <br />
              <span className="text-white">Upload your bill or simulate your peak now.</span>
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
              <a href="/bill-debugger" className="w-full md:w-auto inline-flex items-center justify-center gap-3 bg-[#002FA7] text-white px-10 py-5 rounded-full text-sm font-bold hover:scale-105 hover:shadow-[0_0_50px_rgba(0,47,167,0.4)] transition-all shadow-lg shadow-blue-900/20 active:scale-95 group">
                <Zap className="w-5 h-5 fill-current group-hover:animate-pulse" />
                <span>Simulate Your Hedge</span>
              </a>
              <a href="/bill-debugger" className="w-full md:w-auto inline-flex items-center justify-center gap-3 bg-transparent border border-white/10 text-white px-10 py-5 rounded-full text-sm font-bold hover:bg-white/5 transition-all active:scale-95">
                <Upload className="w-5 h-5" />
                <span>Upload Bill (PDF)</span>
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
              ERCOT NODE: LZ_HOUSTON // LATENCY: 24ms // CONNECTION: SECURE
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
