'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    LogOut, Zap, FileText, AlertTriangle, Activity,
    Calendar, ArrowRight, Download, TrendingDown,
    Shield, Wifi, BarChart3, Lock,
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
/** EIA Texas commercial retail average — used as benchmark for rate comparisons */
const TX_COMMERCIAL_BENCHMARK = 12.4; // ¢/kWh

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
/** Handles both 0.0872 (decimal fraction) and 8.72 (already in ¢/kWh) */
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

function gridStress(reserves?: number, load?: number): { label: string; color: 'emerald' | 'zinc' | 'amber' | 'rose' } {
    if (!reserves || !load) return { label: 'UNKNOWN', color: 'zinc' };
    const margin = reserves / load;
    if (margin > 0.30) return { label: 'NOMINAL', color: 'emerald' };
    if (margin > 0.20) return { label: 'ADEQUATE', color: 'zinc' };
    if (margin > 0.10) return { label: 'WATCH', color: 'amber' };
    return { label: 'ELEVATED', color: 'rose' };
}

function rateProtection(contracted: number, benchmark: number): { label: string; color: 'emerald' | 'amber' | 'rose' } {
    const diff = benchmark - contracted;
    if (diff > 3) return { label: 'PROTECTED', color: 'emerald' };
    if (diff > 0) return { label: 'FAVORABLE', color: 'emerald' };
    if (diff > -1) return { label: 'MONITOR', color: 'amber' };
    return { label: 'ABOVE_MARKET', color: 'rose' };
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function ExpiryBadge({ days }: { days: number | null }) {
    if (days === null) return <span className="font-mono text-xs text-zinc-600">—</span>;
    if (days < 0) return <span className="font-mono text-xs text-rose-400">Expired</span>;
    if (days <= 60) return (
        <span className="font-mono text-xs text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {days}d remaining
        </span>
    );
    return <span className="font-mono text-xs text-emerald-400">{days}d remaining</span>;
}

function MetricTile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
    return (
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5 space-y-1">
            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-[0.25em]">{label}</p>
            <p className={`font-mono text-sm font-semibold ${alert ? 'text-amber-400' : 'text-zinc-100'}`}>{value}</p>
            {sub && <p className="font-mono text-[9px] text-zinc-600">{sub}</p>}
        </div>
    );
}

function CardHeader({ icon: Icon, label, badge }: { icon: React.ElementType; label: string; badge?: React.ReactNode }) {
    return (
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
            <Icon className="w-4 h-4 text-[#002FA7]" />
            <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.3em]">{label}</p>
            {badge && <div className="ml-auto">{badge}</div>}
        </div>
    );
}

function DataRow({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
    return (
        <div className="flex justify-between items-center border-b border-white/5 pb-3 last:border-0 last:pb-0">
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider shrink-0">{label}</span>
            <span className={`font-mono text-[11px] font-semibold max-w-[60%] text-right truncate ml-4 ${alert ? 'text-amber-400' : 'text-zinc-200'}`}>
                {value}
            </span>
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
            // 1. Auth check
            const { data: { user }, error: authErr } = await supabase.auth.getUser();
            if (authErr || !user?.email) { router.replace('/portal'); return; }
            setUserEmail(user.email);

            // Session token for authenticated API calls
            const { data: { session } } = await supabase.auth.getSession();
            const authHeaders: Record<string, string> = session?.access_token
                ? { 'Authorization': `Bearer ${session.access_token}` }
                : {};

            // 2. Contact → accountId
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

            // 3. Account
            const { data: acct } = await supabase
                .from('accounts')
                .select('id, name, electricity_supplier, current_rate, annual_usage, contract_end_date, city, state, domain')
                .eq('id', accountId)
                .single();
            if (acct) setAccount(acct);

            // 4. Active deals
            const { data: dealData } = await supabase
                .from('deals')
                .select('id, title, stage, amount, annualUsage, mills, contractLength, closeDate, yearlyCommission, createdAt')
                .eq('accountId', accountId)
                .in('stage', ['SECURED', 'ENGAGED', 'OUT_FOR_SIGNATURE'])
                .order('createdAt', { ascending: false })
                .limit(5);
            setDeals(dealData || []);

            // 5. ERCOT market data (cached from market_telemetry — no auth needed)
            try {
                const r = await fetch('/api/portal/market');
                if (r.ok) {
                    const d = await r.json();
                    if (d.prices) setErcotPrices(d.prices);
                    if (d.grid) setErcotGrid(d.grid);
                }
            } catch { /* market data is optional */ }

            // 6. Signed / executed contracts (customer copies only)
            try {
                const r = await fetch('/api/portal/signed-documents', { headers: authHeaders });
                if (r.ok) {
                    const d = await r.json();
                    setSignedDocs(d.documents || []);
                }
            } catch { /* docs are optional */ }

            setLoading(false);
        }
        init();
    }, [router]);

    // ── Loading ────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-6 h-6 border-2 border-zinc-700 border-t-[#002FA7] rounded-full animate-spin" />
                    <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Loading Intelligence...</p>
                </div>
            </div>
        );
    }

    // ── Derived values ─────────────────────────
    const activeDeal = deals[0] || null;
    const expiryDays = daysToExpiry(activeDeal?.closeDate || account?.contract_end_date);
    const location = [account?.city, account?.state].filter(Boolean).join(', ') || '—';

    // Rate benchmarking
    const contractedRate = normalizeRate(account?.current_rate);
    const protection = contractedRate ? rateProtection(contractedRate, TX_COMMERCIAL_BENCHMARK) : null;
    const savingsPerKwh = contractedRate ? TX_COMMERCIAL_BENCHMARK - contractedRate : null;

    // Savings ledger
    const usage = activeDeal?.annualUsage || parseFloat(account?.annual_usage || '0') || 0;
    const signedDate = activeDeal?.createdAt ? parseISO(activeDeal.createdAt) : null;
    const monthsActive = signedDate ? Math.max(0, differenceInMonths(new Date(), signedDate)) : 0;
    const annualSavings = contractedRate && usage
        ? ((TX_COMMERCIAL_BENCHMARK - contractedRate) / 100) * usage
        : 0;
    const totalSavings = annualSavings * (monthsActive / 12);
    const monthlySavings = annualSavings / 12;

    // ERCOT grid context
    const stress = gridStress(ercotGrid?.reserves, ercotGrid?.actual_load);
    const hubPriceKwh = ercotPrices?.hub_avg !== undefined
        ? (ercotPrices.hub_avg / 10).toFixed(2)
        : null;
    const reserveMarginPct = ercotGrid?.reserves && ercotGrid?.actual_load
        ? ((ercotGrid.reserves / ercotGrid.actual_load) * 100).toFixed(0)
        : null;
    const loadGW = ercotGrid?.actual_load ? (ercotGrid.actual_load / 1000).toFixed(1) : null;

    // 4CP season
    const currentMonth = new Date().getMonth() + 1;
    const is4CPSeason = currentMonth >= 6 && currentMonth <= 9;
    const seasonStart = new Date(new Date().getFullYear(), 5, 1); // June 1 this year
    if (seasonStart < new Date() && !is4CPSeason) seasonStart.setFullYear(new Date().getFullYear() + 1);
    const daysTo4CP = is4CPSeason ? null : differenceInDays(seasonStart, new Date());

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">

            {/* ── HEADER — fixed + blur on scroll ─── */}
            <header
                className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-8 transition-all duration-300 ${
                    isScrolled
                        ? 'h-16 bg-zinc-950/85 backdrop-blur-xl border-b border-white/5'
                        : 'h-20 bg-transparent border-b border-white/5'
                }`}
            >
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

            {/* ── MAIN ──────────────────────────────── */}
            <main className="flex-1 px-6 pt-28 pb-16 max-w-6xl mx-auto w-full">

                {/* Page label + welcome */}
                <div className="mb-8">
                    <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-2">CLIENT_PORTAL</p>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">
                        {contactName ? `Welcome back, ${contactName.split(' ')[0]}.` : 'Energy Intelligence Dashboard.'}
                    </h1>
                    {location !== '—' && (
                        <p className="text-zinc-500 text-sm mt-1 font-mono">{location} · ERCOT Grid</p>
                    )}
                </div>

                {/* ─── NO ACCOUNT ───────────────────────── */}
                {!account ? (
                    <div className="rounded-2xl border border-white/5 bg-zinc-900 p-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                            <Activity className="w-6 h-6 text-zinc-600" />
                        </div>
                        <p className="font-mono text-sm text-zinc-400 mb-2">No account linked to your profile yet.</p>
                        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                            Contact your Nodal Point advisor to complete setup.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* ─── CONTRACT STATUS BAR ──────────────── */}
                        {activeDeal && (
                            <div className="flex flex-wrap items-center gap-3 mb-6 px-5 py-4 rounded-xl bg-zinc-900/60 border border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${activeDeal.stage === 'SECURED' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                                    <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">{activeDeal.stage}</span>
                                </div>
                                <div className="h-4 w-px bg-white/10" />
                                <span className="font-mono text-[10px] text-zinc-400 truncate">{activeDeal.title}</span>
                                <div className="h-4 w-px bg-white/10" />
                                <ExpiryBadge days={expiryDays} />
                                {activeDeal.amount && (
                                    <>
                                        <div className="h-4 w-px bg-white/10" />
                                        <span className="font-mono text-[10px] text-zinc-400">
                                            ${activeDeal.amount.toLocaleString()}/yr contract value
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ─── HERO STRIP: Rate Benchmarking + Savings Ledger ─ */}
                        {contractedRate && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

                                {/* Rate Benchmarking */}
                                <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                    <CardHeader icon={BarChart3} label="RATE_BENCHMARK" badge={
                                        protection && (
                                            <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                                protection.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400'
                                                : protection.color === 'amber' ? 'bg-amber-500/10 text-amber-400'
                                                : 'bg-rose-500/10 text-rose-400'
                                            }`}>{protection.label}</span>
                                        )
                                    } />
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-end justify-between gap-4">
                                            <div>
                                                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Your Rate</p>
                                                <p className="font-mono text-2xl font-bold text-white">
                                                    {contractedRate.toFixed(2)}<span className="text-sm text-zinc-400 ml-1">¢/kWh</span>
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">TX Commercial Avg</p>
                                                <p className="font-mono text-2xl font-bold text-zinc-500">
                                                    {TX_COMMERCIAL_BENCHMARK.toFixed(1)}<span className="text-sm text-zinc-600 ml-1">¢/kWh</span>
                                                </p>
                                            </div>
                                        </div>
                                        {savingsPerKwh !== null && savingsPerKwh > 0 && (
                                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                                <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                <p className="font-mono text-[10px] text-emerald-400">
                                                    Saving <strong>{savingsPerKwh.toFixed(2)}¢/kWh</strong> vs. TX market average
                                                </p>
                                            </div>
                                        )}
                                        <p className="font-mono text-[9px] text-zinc-700 leading-relaxed">
                                            Benchmark: EIA Texas commercial retail average. Your fixed contract insulates you from grid volatility.
                                        </p>
                                    </div>
                                </div>

                                {/* Savings Ledger */}
                                <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                    <CardHeader icon={Shield} label="SAVINGS_LEDGER" badge={
                                        signedDate && (
                                            <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                                                Since {format(signedDate, 'MMM yyyy')}
                                            </span>
                                        )
                                    } />
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-end justify-between gap-4">
                                            <div>
                                                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Cumulative Savings</p>
                                                <p className={`font-mono text-2xl font-bold ${totalSavings > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                                    {totalSavings > 0 ? fmtDollars(totalSavings) : 'Calculating...'}
                                                </p>
                                            </div>
                                            {monthsActive > 0 && monthlySavings > 0 && (
                                                <div className="text-right">
                                                    <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Monthly Avg</p>
                                                    <p className="font-mono text-2xl font-bold text-zinc-500">
                                                        {fmtDollars(monthlySavings)}<span className="text-sm text-zinc-600 ml-1">/mo</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <DataRow label="Months Active" value={`${monthsActive} months`} />
                                            <DataRow label="Annual Run Rate" value={annualSavings > 0 ? fmtDollars(annualSavings) : '—'} />
                                            <DataRow label="Consumption" value={fmtUsage(usage)} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── METRICS GRID ─────────────────────── */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                            <MetricTile
                                label="Annual Usage"
                                value={fmtUsage(activeDeal?.annualUsage || account.annual_usage)}
                                sub="Estimated consumption"
                            />
                            <MetricTile
                                label="Current Supplier"
                                value={account.electricity_supplier || '—'}
                                sub="Active REP"
                            />
                            <MetricTile
                                label="All-In Rate"
                                value={contractedRate ? `${contractedRate.toFixed(2)}¢/kWh` : '—'}
                                sub="Fixed contracted rate"
                            />
                            <MetricTile
                                label="Contract Term"
                                value={activeDeal?.contractLength ? `${activeDeal.contractLength} mo` : '—'}
                                sub={activeDeal?.closeDate ? `Expires ${format(parseISO(activeDeal.closeDate), 'MMM yyyy')}` : undefined}
                                alert={expiryDays !== null && expiryDays <= 60}
                            />
                        </div>

                        {/* ─── MAIN 2-COL: Forensic + ERCOT ────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                            {/* Forensic Dashboard */}
                            <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                <CardHeader icon={Zap} label="FORENSIC_DASHBOARD" badge={
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Live</span>
                                    </div>
                                } />
                                <div className="p-5 space-y-3">
                                    <DataRow label="Account" value={account.name} />
                                    <DataRow label="Location" value={location} />
                                    <DataRow label="Annual Usage" value={fmtUsage(activeDeal?.annualUsage || account.annual_usage)} />
                                    <DataRow label="Current Supplier" value={account.electricity_supplier || '—'} />
                                    <DataRow label="All-In Rate" value={contractedRate ? `${contractedRate.toFixed(2)}¢/kWh` : '—'} />
                                    <DataRow
                                        label="Contract End"
                                        value={account.contract_end_date ? format(parseISO(account.contract_end_date), 'MMM yyyy') : '—'}
                                        alert={expiryDays !== null && expiryDays <= 60}
                                    />
                                </div>
                            </div>

                            {/* ERCOT Market Feed */}
                            <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                <CardHeader icon={Wifi} label="ERCOT_MARKET_FEED" badge={
                                    ercotGrid && (
                                        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                            stress.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400'
                                            : stress.color === 'amber' ? 'bg-amber-500/10 text-amber-400'
                                            : stress.color === 'rose' ? 'bg-rose-500/10 text-rose-400'
                                            : 'bg-zinc-800 text-zinc-500'
                                        }`}>GRID: {stress.label}</span>
                                    )
                                } />
                                {ercotPrices || ercotGrid ? (
                                    <div className="p-5 space-y-3">
                                        {ercotPrices?.hub_avg !== undefined && (
                                            <DataRow label="Hub Avg Spot" value={`$${ercotPrices.hub_avg.toFixed(2)}/MWh`} />
                                        )}
                                        {loadGW && <DataRow label="System Load" value={`${loadGW} GW`} />}
                                        {reserveMarginPct && <DataRow label="Reserve Margin" value={`${reserveMarginPct}%`} />}
                                        {ercotGrid?.scarcity_prob !== undefined && (
                                            <DataRow label="Scarcity Probability" value={`${ercotGrid.scarcity_prob}%`} />
                                        )}
                                        {contractedRate && hubPriceKwh && (
                                            <div className="mt-4 px-3 py-2.5 rounded-lg bg-[#002FA7]/5 border border-[#002FA7]/10">
                                                <p className="font-mono text-[9px] text-zinc-500 leading-relaxed">
                                                    Your fixed rate of {contractedRate.toFixed(2)}¢/kWh is insulated from today&apos;s spot market at {hubPriceKwh}¢/kWh energy-only.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-5 py-10 text-center">
                                        <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">Market data refreshing...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ─── LOWER 2-COL: Contract + 4CP | Documents ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                            {/* LEFT: Contract Monitor + 4CP stacked */}
                            <div className="space-y-4">

                                {/* Contract Monitor */}
                                <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                    <CardHeader icon={FileText} label="CONTRACT_MONITOR" />
                                    <div className="p-5 space-y-3">
                                        {activeDeal ? (
                                            <>
                                                <DataRow label="Contract" value={activeDeal.title} />
                                                <DataRow label="Stage" value={activeDeal.stage} />
                                                <DataRow label="Term" value={activeDeal.contractLength ? `${activeDeal.contractLength} months` : '—'} />
                                                <DataRow label="Annual Value" value={activeDeal.amount ? `$${activeDeal.amount.toLocaleString()}` : '—'} />
                                                <DataRow
                                                    label="Expiry"
                                                    value={activeDeal.closeDate ? format(parseISO(activeDeal.closeDate), 'dd MMM yyyy') : '—'}
                                                    alert={expiryDays !== null && expiryDays <= 60}
                                                />
                                            </>
                                        ) : (
                                            <div className="py-8 text-center">
                                                <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">No active contracts</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 4CP Season Tracker */}
                                <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                    <CardHeader icon={BarChart3} label="4CP_SEASON_TRACKER" badge={
                                        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                            is4CPSeason ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'
                                        }`}>{is4CPSeason ? 'ACTIVE' : 'INACTIVE'}</span>
                                    } />
                                    <div className="p-5 space-y-3">
                                        <DataRow
                                            label="Season Status"
                                            value={is4CPSeason ? 'IN SEASON — Jun–Sep' : 'OFF SEASON'}
                                            alert={is4CPSeason}
                                        />
                                        {!is4CPSeason && daysTo4CP !== null && (
                                            <DataRow
                                                label="Season Opens"
                                                value={`${format(seasonStart, 'MMM d, yyyy')} — ${daysTo4CP}d`}
                                            />
                                        )}
                                        <DataRow label="Season Window" value="June 1 – Sep 30 annually" />
                                        <div className="mt-1 px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-white/5">
                                            <p className="font-mono text-[9px] text-zinc-500 leading-relaxed">
                                                The 4 highest 15-min system load events each summer set your ERCOT capacity charges for the following year.
                                                {is4CPSeason
                                                    ? ' We are actively monitoring peak windows now.'
                                                    : ' We will alert you as high-risk windows approach.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: Document Vault (signed/executed contracts only) */}
                            <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden flex flex-col">
                                <CardHeader icon={Lock} label="DOCUMENT_VAULT" badge={
                                    signedDocs.length > 0 && (
                                        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                                            {signedDocs.length} executed
                                        </span>
                                    )
                                } />

                                {signedDocs.length > 0 ? (
                                    <div className="flex-1 p-5 space-y-3 overflow-y-auto max-h-64">
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
                                    <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                                            <Lock className="w-4 h-4 text-zinc-600" />
                                        </div>
                                        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">No Executed Documents</p>
                                        <p className="font-mono text-[9px] text-zinc-700 leading-relaxed max-w-[220px]">
                                            Signed contracts appear here automatically after execution.
                                        </p>
                                    </div>
                                )}

                                <div className="px-5 py-3 border-t border-white/5">
                                    <p className="font-mono text-[9px] text-zinc-700 leading-relaxed">
                                        Customer copies only · Audit trail retained internally · Links expire in 1 hour
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ─── ADVISOR CTA ──────────────────────── */}
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
                                <ArrowRight className="w-4 h-4 text-[#002FA7] group-hover:translate-x-0.5 transition-transform" />
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
                                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
                            </Link>
                        </div>

                    </>
                )}
            </main>
        </div>
    );
}
