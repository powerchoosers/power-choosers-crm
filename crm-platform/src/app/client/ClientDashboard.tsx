'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    LogOut, Zap, FileText, AlertTriangle, Activity,
    Calendar, ArrowRight, Download, TrendingDown,
    Shield, Wifi, Lock, CheckCircle2, Clock, Flame,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, differenceInMonths, format, parseISO } from 'date-fns';
import { useScrollEffect } from '@/hooks/useScrollEffect';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface AccountData {
    id: string;
    name: string;
    electricity_supplier: string | null;
    current_rate: string | null;
    annual_usage: string | null;
    contract_end_date: string | null;
    city: string | null;
    state: string | null;
    domain: string | null;
}

interface DealData {
    id: string;
    title: string;
    stage: string;
    amount: number | null;
    annualUsage: number | null;
    mills: number | null;
    contractLength: number | null;
    closeDate: string | null;
    yearlyCommission: number | null;
    createdAt: string | null;
}

interface ErcotPrices {
    hub_avg?: number;
    houston?: number;
    south?: number;
    north?: number;
    west?: number;
}

interface ErcotGrid {
    actual_load?: number;
    forecast_load?: number;
    total_capacity?: number;
    reserves?: number;
    scarcity_prob?: string | number;
}

interface SignedDoc {
    id: string;
    name: string;
    signedAt: string;
    downloadUrl: string | null;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const TX_COMMERCIAL_BENCHMARK = 12.4; // ¢/kWh — EIA Texas commercial retail average

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function normalizeRate(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const n = parseFloat(raw);
    if (isNaN(n)) return null;
    return n < 1 ? n * 100 : n;
}

function fmtUsage(val?: string | number | null) {
    if (!val) return '—';
    const n = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.]/g, '')) : val;
    if (isNaN(n)) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M kWh/yr`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K kWh/yr`;
    return `${n.toLocaleString()} kWh/yr`;
}

function fmtDollars(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n).toLocaleString()}`;
}

function daysToExpiry(dateStr?: string | null): number | null {
    if (!dateStr) return null;
    try { return differenceInDays(parseISO(dateStr), new Date()); } catch { return null; }
}

function gridStress(reserves?: number, load?: number): { label: string; sub: string; color: 'emerald' | 'zinc' | 'amber' | 'rose' } {
    if (!reserves || !load) return { label: 'Unknown', sub: 'No data available', color: 'zinc' };
    const margin = reserves / load;
    if (margin > 0.30) return { label: 'Stable', sub: 'Reserve margin is healthy', color: 'emerald' };
    if (margin > 0.20) return { label: 'Adequate', sub: 'Normal operating range', color: 'zinc' };
    if (margin > 0.10) return { label: 'Watch', sub: 'Reserves tightening', color: 'amber' };
    return { label: 'Elevated', sub: 'Grid under stress — prices may spike', color: 'rose' };
}

function rateProtection(contracted: number, benchmark: number): { label: string; sub: string; color: 'emerald' | 'amber' | 'rose' } {
    const diff = benchmark - contracted;
    if (diff > 3) return { label: 'Well Protected', sub: `You're paying ${diff.toFixed(2)}¢ below the Texas average`, color: 'emerald' };
    if (diff > 0) return { label: 'Favorable', sub: `Slightly below the Texas average`, color: 'emerald' };
    if (diff > -1) return { label: 'Monitor', sub: 'Near market rate — worth watching', color: 'amber' };
    return { label: 'Above Market', sub: 'Your rate is above the Texas average', color: 'rose' };
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-[0.3em] mb-1">{children}</p>
    );
}

function CardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden ${className}`}>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────
export function ClientDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState('');
    const [account, setAccount] = useState<AccountData | null>(null);
    const [deals, setDeals] = useState<DealData[]>([]);
    const [contactName, setContactName] = useState('');
    const [ercotPrices, setErcotPrices] = useState<ErcotPrices | null>(null);
    const [ercotGrid, setErcotGrid] = useState<ErcotGrid | null>(null);
    const [signedDocs, setSignedDocs] = useState<SignedDoc[]>([]);
    const isScrolled = useScrollEffect((y) => y > 30, false);

    useEffect(() => {
        async function init() {
            const { data: { user }, error: authErr } = await supabase.auth.getUser();
            if (authErr || !user?.email) { router.replace('/portal'); return; }
            setUserEmail(user.email);

            const { data: { session } } = await supabase.auth.getSession();
            const authHeaders: Record<string, string> = session?.access_token
                ? { 'Authorization': `Bearer ${session.access_token}` }
                : {};

            const { data: contact } = await supabase
                .from('contacts')
                .select('id, firstName, lastName, name, accountId')
                .eq('email', user.email.toLowerCase())
                .maybeSingle();

            if (contact) {
                const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ');
                setContactName(name);
            }

            const accountId = contact?.accountId;
            if (!accountId) { setLoading(false); return; }

            const { data: acct } = await supabase
                .from('accounts')
                .select('id, name, electricity_supplier, current_rate, annual_usage, contract_end_date, city, state, domain')
                .eq('id', accountId)
                .single();
            if (acct) setAccount(acct);

            const { data: dealData } = await supabase
                .from('deals')
                .select('id, title, stage, amount, annualUsage, mills, contractLength, closeDate, yearlyCommission, createdAt')
                .eq('accountId', accountId)
                .in('stage', ['SECURED', 'ENGAGED', 'OUT_FOR_SIGNATURE'])
                .order('createdAt', { ascending: false })
                .limit(5);
            setDeals(dealData || []);

            try {
                const r = await fetch('/api/portal/market');
                if (r.ok) {
                    const d = await r.json();
                    if (d.prices) setErcotPrices(d.prices);
                    if (d.grid) setErcotGrid(d.grid);
                }
            } catch { /* optional */ }

            try {
                const r = await fetch('/api/portal/signed-documents', { headers: authHeaders });
                if (r.ok) {
                    const d = await r.json();
                    setSignedDocs(d.documents || []);
                }
            } catch { /* optional */ }

            setLoading(false);
        }
        init();
    }, [router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-6 h-6 border-2 border-zinc-700 border-t-[#002FA7] rounded-full animate-spin" />
                    <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Loading your portal...</p>
                </div>
            </div>
        );
    }

    // ── Derived values ──────────────────────────────
    const activeDeal = deals[0] || null;
    const expiryDays = daysToExpiry(activeDeal?.closeDate || account?.contract_end_date);
    const location = [account?.city, account?.state].filter(Boolean).join(', ') || '—';
    const contractedRate = normalizeRate(account?.current_rate);
    const protection = contractedRate ? rateProtection(contractedRate, TX_COMMERCIAL_BENCHMARK) : null;
    const savingsPerKwh = contractedRate ? TX_COMMERCIAL_BENCHMARK - contractedRate : null;
    const usage = activeDeal?.annualUsage || parseFloat(account?.annual_usage || '0') || 0;
    const signedDate = activeDeal?.createdAt ? parseISO(activeDeal.createdAt) : null;
    const monthsActive = signedDate ? Math.max(0, differenceInMonths(new Date(), signedDate)) : 0;
    const annualSavings = contractedRate && usage ? ((TX_COMMERCIAL_BENCHMARK - contractedRate) / 100) * usage : 0;
    const totalSavings = annualSavings * (monthsActive / 12);
    const monthlySavings = annualSavings / 12;
    const stress = gridStress(ercotGrid?.reserves, ercotGrid?.actual_load);
    const hubPriceKwh = ercotPrices?.hub_avg !== undefined ? (ercotPrices.hub_avg / 10).toFixed(2) : null;
    const reserveMarginPct = ercotGrid?.reserves && ercotGrid?.actual_load
        ? ((ercotGrid.reserves / ercotGrid.actual_load) * 100).toFixed(0) : null;
    const loadGW = ercotGrid?.actual_load ? (ercotGrid.actual_load / 1000).toFixed(1) : null;
    const currentMonth = new Date().getMonth() + 1;
    const is4CPSeason = currentMonth >= 6 && currentMonth <= 9;
    const seasonStart = new Date(new Date().getFullYear(), 5, 1);
    if (seasonStart < new Date() && !is4CPSeason) seasonStart.setFullYear(new Date().getFullYear() + 1);
    const daysTo4CP = is4CPSeason ? null : differenceInDays(seasonStart, new Date());
    const totalDaysToSeason = 365;
    const seasonProgress = daysTo4CP !== null ? Math.max(0, Math.min(100, ((totalDaysToSeason - daysTo4CP) / totalDaysToSeason) * 100)) : 100;

    // Rate bar visual: scale 0–15¢ range
    const rateBarMax = 15;
    const yourBarPct = contractedRate ? Math.min((contractedRate / rateBarMax) * 100, 100) : 0;
    const avgBarPct = Math.min((TX_COMMERCIAL_BENCHMARK / rateBarMax) * 100, 100);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">

            {/* ── HEADER ── */}
            <header className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-8 transition-all duration-300 ${isScrolled ? 'h-16 bg-zinc-950/90 backdrop-blur-xl border-b border-white/5' : 'h-20 bg-transparent border-b border-white/5'
                }`}>
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 shrink-0">
                        <Image src="/images/nodalpoint.png" alt="Nodal Point" width={32} height={32} className="h-full w-auto object-contain" />
                    </div>
                    <span className="font-bold text-lg tracking-tighter text-white">
                        Nodal <span className="text-[#002FA7]">Point</span>
                    </span>
                </Link>
                <div className="flex items-center gap-6">
                    {account?.name && (
                        <div className="hidden md:flex flex-col items-end">
                            <p className="text-sm font-semibold text-white">{account.name}</p>
                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">{userEmail}</p>
                        </div>
                    )}
                    <button
                        onClick={async () => { await supabase.auth.signOut(); router.replace('/portal'); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-zinc-500 hover:text-zinc-200 hover:border-white/20 font-mono text-[10px] uppercase tracking-wider transition-all"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                    </button>
                </div>
            </header>

            {/* ── MAIN ── */}
            <main className="flex-1 px-6 xl:px-12 pt-28 pb-16 max-w-[1400px] mx-auto w-full">

                {/* Welcome */}
                <div className="mb-8">
                    <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-2">CLIENT_PORTAL</p>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">
                        {contactName ? `Welcome back, ${contactName.split(' ')[0]}.` : 'Energy Intelligence Dashboard.'}
                    </h1>
                    {location !== '—' && (
                        <p className="text-zinc-500 text-sm mt-1 font-mono">{location} · ERCOT Grid</p>
                    )}
                </div>

                {/* NO ACCOUNT */}
                {!account ? (
                    <div className="rounded-2xl border border-white/5 bg-zinc-900 p-16 text-center">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                            <Activity className="w-6 h-6 text-zinc-600" />
                        </div>
                        <p className="font-mono text-sm text-zinc-400 mb-2">No account linked to your profile yet.</p>
                        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                            Contact your Nodal Point advisor to complete setup.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">

                        {/* ── CONTRACT STATUS BAR ── */}
                        {activeDeal && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 rounded-xl bg-zinc-900/60 border border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full shrink-0 ${activeDeal.stage === 'SECURED' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                                    <span className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest font-semibold">{activeDeal.stage}</span>
                                </div>
                                <span className="text-white/20">·</span>
                                <span className="font-mono text-[10px] text-zinc-400 truncate">{activeDeal.title}</span>
                                <span className="text-white/20">·</span>
                                {expiryDays !== null && (
                                    <span className={`font-mono text-[10px] flex items-center gap-1 ${expiryDays < 0 ? 'text-rose-400' : expiryDays <= 60 ? 'text-amber-400' : 'text-emerald-400'
                                        }`}>
                                        {expiryDays <= 60 && expiryDays >= 0 && <AlertTriangle className="w-3 h-3" />}
                                        {expiryDays < 0 ? 'Expired' : `${expiryDays} days remaining`}
                                    </span>
                                )}
                                {activeDeal.amount && (
                                    <>
                                        <span className="text-white/20">·</span>
                                        <span className="font-mono text-[10px] text-zinc-500">${activeDeal.amount.toLocaleString()}/yr contract value</span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── RATE PROTECTION HERO (full width) ── */}
                        {contractedRate && protection && (
                            <CardShell>
                                <div className="p-6 md:p-8">
                                    {/* Header row */}
                                    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                                        <div>
                                            <SectionLabel>Rate Protection</SectionLabel>
                                            <h2 className="text-lg font-semibold text-white">How your contracted rate compares to the Texas market</h2>
                                            <p className="text-zinc-500 text-sm mt-0.5">EIA Texas commercial retail average · Updated monthly</p>
                                        </div>
                                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${protection.color === 'emerald' ? 'bg-emerald-500/10 border border-emerald-500/20' :
                                            protection.color === 'amber' ? 'bg-amber-500/10 border border-amber-500/20' :
                                                'bg-rose-500/10 border border-rose-500/20'
                                            }`}>
                                            {protection.color === 'emerald'
                                                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                                : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                            }
                                            <span className={`font-mono text-[10px] uppercase tracking-widest font-semibold ${protection.color === 'emerald' ? 'text-emerald-400' :
                                                protection.color === 'amber' ? 'text-amber-400' : 'text-rose-400'
                                                }`}>{protection.label}</span>
                                        </div>
                                    </div>

                                    {/* Rate comparison numbers + bars */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                        {/* Your rate */}
                                        <div>
                                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-[0.25em] mb-2">Your contracted rate</p>
                                            <div className="flex items-end gap-2 mb-3">
                                                <span className="font-mono text-5xl font-bold text-white">{contractedRate.toFixed(2)}</span>
                                                <span className="font-mono text-lg text-zinc-400 mb-1">¢/kWh</span>
                                            </div>
                                            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-[#002FA7] transition-all duration-1000"
                                                    style={{ width: `${yourBarPct}%` }}
                                                />
                                            </div>
                                        </div>
                                        {/* TX Average */}
                                        <div>
                                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-[0.25em] mb-2">Texas commercial average</p>
                                            <div className="flex items-end gap-2 mb-3">
                                                <span className="font-mono text-5xl font-bold text-zinc-500">{TX_COMMERCIAL_BENCHMARK.toFixed(1)}</span>
                                                <span className="font-mono text-lg text-zinc-600 mb-1">¢/kWh</span>
                                            </div>
                                            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-zinc-600 transition-all duration-1000"
                                                    style={{ width: `${avgBarPct}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Savings callout */}
                                    {savingsPerKwh !== null && savingsPerKwh > 0 && (
                                        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                            <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
                                            <p className="font-mono text-sm text-emerald-300">
                                                You are saving <strong>{savingsPerKwh.toFixed(2)}¢ per kWh</strong> compared to the Texas market average.
                                                {usage > 0 && annualSavings > 0 && (
                                                    <span className="text-emerald-400/70"> That's <strong className="text-emerald-300">{fmtDollars(annualSavings)}/year</strong> of contract protection.</span>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </CardShell>
                        )}

                        {/* ── 3-COL ROW: Savings | Grid Status | Your Contract ── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

                            {/* Savings to Date */}
                            <CardShell>
                                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-[#002FA7]" />
                                    <div>
                                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">Savings to Date</p>
                                        <p className="text-zinc-600 text-[9px] mt-0.5">Estimated vs. paying market rate</p>
                                    </div>
                                    {signedDate && (
                                        <span className="ml-auto font-mono text-[9px] text-zinc-600">Since {format(signedDate, 'MMM yyyy')}</span>
                                    )}
                                </div>
                                <div className="p-5">
                                    <div className="mb-4">
                                        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Total accumulated</p>
                                        <p className={`font-mono text-4xl font-bold ${totalSavings > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                            {totalSavings > 0 ? fmtDollars(totalSavings) : '—'}
                                        </p>
                                    </div>
                                    <div className="space-y-3 pt-3 border-t border-white/5">
                                        <div className="flex justify-between items-center">
                                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Per month (avg)</p>
                                            <p className="font-mono text-xs text-zinc-200 font-semibold">{monthlySavings > 0 ? fmtDollars(monthlySavings) : '—'}</p>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Annual run rate</p>
                                            <p className="font-mono text-xs text-zinc-200 font-semibold">{annualSavings > 0 ? fmtDollars(annualSavings) : '—'}</p>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Months active</p>
                                            <p className="font-mono text-xs text-zinc-200 font-semibold">{monthsActive} months</p>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Annual usage</p>
                                            <p className="font-mono text-xs text-zinc-200 font-semibold">{fmtUsage(usage)}</p>
                                        </div>
                                    </div>
                                </div>
                            </CardShell>

                            {/* Live Grid Status (ERCOT) */}
                            <CardShell>
                                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                                    <Wifi className="w-4 h-4 text-[#002FA7]" />
                                    <div>
                                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">Live Grid Status</p>
                                        <p className="text-zinc-600 text-[9px] mt-0.5">Texas ERCOT real-time conditions</p>
                                    </div>
                                    {ercotGrid && (
                                        <span className={`ml-auto font-mono text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest ${stress.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                                            stress.color === 'amber' ? 'bg-amber-500/10 text-amber-400' :
                                                stress.color === 'rose' ? 'bg-rose-500/10 text-rose-400' :
                                                    'bg-zinc-800 text-zinc-500'
                                            }`}>{stress.label}</span>
                                    )}
                                </div>
                                {ercotPrices || ercotGrid ? (
                                    <div className="p-5 space-y-3">
                                        {/* Current grid status */}
                                        <div className={`flex items-center gap-3 p-3 rounded-xl ${stress.color === 'emerald' ? 'bg-emerald-500/5 border border-emerald-500/10' :
                                            stress.color === 'amber' ? 'bg-amber-500/5 border border-amber-500/10' :
                                                'bg-zinc-800/50 border border-white/5'
                                            }`}>
                                            <div className={`w-2 h-2 rounded-full shrink-0 ${stress.color === 'emerald' ? 'bg-emerald-400' :
                                                stress.color === 'amber' ? 'bg-amber-400 animate-pulse' :
                                                    'bg-rose-400 animate-pulse'
                                                }`} />
                                            <p className={`font-mono text-xs ${stress.color === 'emerald' ? 'text-emerald-300' :
                                                stress.color === 'amber' ? 'text-amber-300' : 'text-rose-300'
                                                }`}>{stress.sub}</p>
                                        </div>
                                        <div className="space-y-3 pt-1">
                                            {ercotPrices?.hub_avg !== undefined && (
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Spot Price</p>
                                                        <p className="text-zinc-600 text-[9px]">What the market pays right now</p>
                                                    </div>
                                                    <p className="font-mono text-xs text-zinc-200 font-semibold">${ercotPrices.hub_avg.toFixed(2)}/MWh</p>
                                                </div>
                                            )}
                                            {loadGW && (
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">System Load</p>
                                                        <p className="text-zinc-600 text-[9px]">Total Texas demand right now</p>
                                                    </div>
                                                    <p className="font-mono text-xs text-zinc-200 font-semibold">{loadGW} GW</p>
                                                </div>
                                            )}
                                            {reserveMarginPct && (
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Reserve Margin</p>
                                                        <p className="text-zinc-600 text-[9px]">Grid buffer — higher is safer</p>
                                                    </div>
                                                    <p className="font-mono text-xs text-zinc-200 font-semibold">{reserveMarginPct}%</p>
                                                </div>
                                            )}
                                        </div>
                                        {contractedRate && hubPriceKwh && (
                                            <div className="pt-3 border-t border-white/5">
                                                <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest mb-1">Grid context</p>
                                                {parseFloat(hubPriceKwh) < contractedRate ? (
                                                    <p className="font-mono text-[9px] text-zinc-600 leading-relaxed">
                                                        Today's wholesale energy price is {hubPriceKwh}¢/kWh (energy component only — no delivery, capacity, or TDU charges). Your fixed rate of {contractedRate.toFixed(2)}¢/kWh covers all costs. On peak summer days, wholesale alone can exceed 50¢/kWh — your contract holds regardless.
                                                    </p>
                                                ) : (
                                                    <p className="font-mono text-[9px] text-emerald-600 leading-relaxed">
                                                        Wholesale energy is currently at {hubPriceKwh}¢/kWh. Your fixed contract at {contractedRate.toFixed(2)}¢/kWh includes all delivery and capacity charges — and is locked in regardless of how high the market goes.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-5 py-10 text-center">
                                        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Market data refreshing...</p>
                                    </div>
                                )}
                            </CardShell>

                            {/* Your Contract */}
                            <CardShell>
                                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-[#002FA7]" />
                                    <div>
                                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">Your Contract</p>
                                        <p className="text-zinc-600 text-[9px] mt-0.5">Active energy agreement</p>
                                    </div>
                                </div>
                                <div className="p-5">
                                    {activeDeal ? (
                                        <div className="space-y-4">
                                            {/* Contract name */}
                                            <div className="p-3 rounded-xl bg-zinc-800/50 border border-white/5">
                                                <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Agreement</p>
                                                <p className="font-mono text-xs text-zinc-100 font-semibold leading-relaxed">{activeDeal.title}</p>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Supplier</p>
                                                    <p className="font-mono text-xs text-zinc-200 font-semibold">{account.electricity_supplier || '—'}</p>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Term length</p>
                                                    <p className="font-mono text-xs text-zinc-200 font-semibold">{activeDeal.contractLength ? `${activeDeal.contractLength} months` : '—'}</p>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Annual value</p>
                                                    <p className="font-mono text-xs text-zinc-200 font-semibold">{activeDeal.amount ? `$${activeDeal.amount.toLocaleString()}` : '—'}</p>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Expiry date</p>
                                                    </div>
                                                    <p className={`font-mono text-xs font-semibold flex items-center gap-1 ${expiryDays !== null && expiryDays <= 60 ? 'text-amber-400' : 'text-zinc-200'
                                                        }`}>
                                                        {expiryDays !== null && expiryDays <= 60 && <AlertTriangle className="w-3 h-3" />}
                                                        {activeDeal.closeDate ? format(parseISO(activeDeal.closeDate), 'MMM d, yyyy') : '—'}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Expiry progress bar */}
                                            {activeDeal.closeDate && activeDeal.createdAt && (() => {
                                                const total = differenceInDays(parseISO(activeDeal.closeDate), parseISO(activeDeal.createdAt));
                                                const elapsed = differenceInDays(new Date(), parseISO(activeDeal.createdAt));
                                                const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
                                                return (
                                                    <div className="pt-3 border-t border-white/5">
                                                        <div className="flex justify-between mb-1.5">
                                                            <p className="font-mono text-[9px] text-zinc-600">Contract progress</p>
                                                            <p className="font-mono text-[9px] text-zinc-500">{Math.round(pct)}% elapsed</p>
                                                        </div>
                                                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-amber-500' : 'bg-[#002FA7]'}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center">
                                            <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">No active contracts</p>
                                        </div>
                                    )}
                                </div>
                            </CardShell>
                        </div>

                        {/* ── BOTTOM ROW: 4CP + Documents ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                            {/* Peak Season Watch (4CP) */}
                            <CardShell>
                                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                                    <Flame className={`w-4 h-4 ${is4CPSeason ? 'text-amber-400' : 'text-[#002FA7]'}`} />
                                    <div>
                                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">Peak Season Watch</p>
                                        <p className="text-zinc-600 text-[9px] mt-0.5">Summer demand tracking · June 1 – Sep 30</p>
                                    </div>
                                    <span className={`ml-auto font-mono text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest ${is4CPSeason ? 'bg-amber-500/10 text-amber-400 animate-pulse' : 'bg-zinc-800 text-zinc-500'
                                        }`}>{is4CPSeason ? 'Active' : 'Off Season'}</span>
                                </div>
                                <div className="p-5 space-y-5">
                                    {/* Visual countdown / status */}
                                    {is4CPSeason ? (
                                        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 flex items-start gap-3">
                                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-mono text-xs text-amber-300 font-semibold mb-1">Peak season is active right now</p>
                                                <p className="font-mono text-[9px] text-amber-400/70 leading-relaxed">
                                                    We are monitoring the 4 highest demand windows. Avoid unnecessary high-draw operations during weekday afternoons (2–7pm).
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-baseline justify-between mb-2">
                                                <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Next peak season</p>
                                                <p className="font-mono text-2xl font-bold text-white">
                                                    {daysTo4CP !== null ? `${daysTo4CP}d` : '—'}
                                                    <span className="font-mono text-sm text-zinc-500 ml-1">away</span>
                                                </p>
                                            </div>
                                            {/* Progress bar toward season */}
                                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
                                                <div
                                                    className="h-full rounded-full bg-[#002FA7]/60 transition-all"
                                                    style={{ width: `${seasonProgress}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between">
                                                <p className="font-mono text-[9px] text-zinc-600">Today</p>
                                                <p className="font-mono text-[9px] text-zinc-600">Jun 1, {seasonStart.getFullYear()}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Explanation */}
                                    <div className="p-4 rounded-xl bg-zinc-800/40 border border-white/5 space-y-2">
                                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest font-semibold">What is this?</p>
                                        <p className="text-zinc-400 text-sm leading-relaxed">
                                            Each summer, ERCOT records the 4 highest demand hours across Texas. Your share of those peaks determines your transmission charges — called <span className="text-zinc-200 font-medium">capacity costs</span> — for the entire following year.
                                        </p>
                                        <p className="text-zinc-500 text-sm leading-relaxed">
                                            Nodal Point monitors the grid in real time and alerts you before high-risk windows occur.
                                        </p>
                                    </div>
                                </div>
                            </CardShell>

                            {/* Document Vault */}
                            <CardShell className="flex flex-col">
                                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-[#002FA7]" />
                                    <div>
                                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">Your Documents</p>
                                        <p className="text-zinc-600 text-[9px] mt-0.5">Executed agreements · PDF download</p>
                                    </div>
                                    {signedDocs.length > 0 && (
                                        <span className="ml-auto font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{signedDocs.length} executed</span>
                                    )}
                                </div>

                                {signedDocs.length > 0 ? (
                                    <div className="flex-1 p-5 space-y-3 overflow-y-auto max-h-72">
                                        {signedDocs.map((doc) => (
                                            <div key={doc.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-zinc-800/50 border border-white/5">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-lg bg-[#002FA7]/10 border border-[#002FA7]/20 flex items-center justify-center shrink-0">
                                                        <FileText className="w-3.5 h-3.5 text-[#002FA7]" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-mono text-[10px] text-zinc-200 truncate font-semibold">{doc.name}</p>
                                                        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                                                            Executed {format(parseISO(doc.signedAt), 'dd MMM yyyy')}
                                                        </p>
                                                    </div>
                                                </div>
                                                {doc.downloadUrl ? (
                                                    <a
                                                        href={doc.downloadUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20 font-mono text-[9px] uppercase tracking-wider transition-all shrink-0"
                                                    >
                                                        <Download className="w-3 h-3" />
                                                        PDF
                                                    </a>
                                                ) : (
                                                    <span className="font-mono text-[9px] text-zinc-700 shrink-0">Processing</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center py-14 px-6 text-center">
                                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                                            <Lock className="w-5 h-5 text-zinc-600" />
                                        </div>
                                        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">No executed documents yet</p>
                                        <p className="text-zinc-600 text-sm leading-relaxed max-w-[260px]">
                                            Signed contracts will appear here automatically after execution.
                                        </p>
                                    </div>
                                )}

                                <div className="px-5 py-3 border-t border-white/5">
                                    <p className="font-mono text-[9px] text-zinc-700">Customer copies only · Links expire in 1 hour · Audit trail retained internally</p>
                                </div>
                            </CardShell>
                        </div>

                        {/* ── ADVISOR CTAs ── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Link
                                href="/book"
                                className="flex items-center justify-between px-6 py-5 rounded-2xl bg-[#002FA7]/10 border border-[#002FA7]/30 hover:bg-[#002FA7]/15 hover:border-[#002FA7]/50 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-[#002FA7]/15 border border-[#002FA7]/20 flex items-center justify-center shrink-0">
                                        <Calendar className="w-5 h-5 text-[#002FA7]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">Book a Strategy Session</p>
                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Speak with your advisor · No commitment</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-[#002FA7] group-hover:translate-x-1 transition-transform" />
                            </Link>

                            <Link
                                href="/bill-debugger"
                                className="flex items-center justify-between px-6 py-5 rounded-2xl bg-zinc-900 border border-white/5 hover:bg-zinc-800/60 hover:border-white/10 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/5 flex items-center justify-center shrink-0">
                                        <Activity className="w-5 h-5 text-zinc-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">Run a Bill Analysis</p>
                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Upload a bill · 60-second forensic read</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-1 transition-all" />
                            </Link>
                        </div>

                    </div>
                )}
            </main>
        </div>
    );
}
