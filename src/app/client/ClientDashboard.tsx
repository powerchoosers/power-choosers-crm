'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogOut, AlertTriangle, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, differenceInMonths, format, parseISO } from 'date-fns';
import { useScrollEffect } from '@/hooks/useScrollEffect';
import { mapLocationToZone } from '@/lib/market-mapping';
import { displayFontClass } from '@/components/landing/fonts';
import { Reveal } from '@/components/landing/Reveal';
import { buttonOutlineOnDark, buttonPrimary, focusOnDark, focusOnLight, NudgeArrow, PrimaryLink, TextLink } from '@/components/landing/ui';
import { Callout, EASE, Panel, PanelHeading, Row, StatusTag, billMonth, money, portalFetch, type Tone } from './portal-ui';
import { UsageChart, type UsageMonth } from './UsageChart';
import { BillsView, type ClientBill } from './BillsView';
import { ContractView, type ContractSummary, type SignedDoc } from './ContractView';

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
    metadata?: any;
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

interface UsageHistoryRow {
    month?: string;
    kwh?: number | string | null;
    billed_kw?: number | string | null;
    actual_kw?: number | string | null;
}

type View = 'overview' | 'bills' | 'contract';
const VIEWS: Array<{ id: View; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'bills', label: 'Bills' },
    { id: 'contract', label: 'Contract and files' },
];

/** One row per month from the advisor's usage file; several meters in a month are added up. */
function monthsFromHistory(rows: UsageHistoryRow[] | undefined): UsageMonth[] {
    if (!Array.isArray(rows)) return [];
    const order: string[] = [];
    const byMonth: Record<string, UsageMonth> = {};
    for (const row of rows) {
        const label = String(row?.month || '').trim();
        const kwh = Number(row?.kwh) || 0;
        if (!label) continue;
        if (!byMonth[label]) { byMonth[label] = { label, kwh: 0, billedKw: null, actualKw: null }; order.push(label); }
        const entry = byMonth[label];
        entry.kwh += kwh;
        const billed = Number(row?.billed_kw) || 0;
        const actual = Number(row?.actual_kw) || 0;
        if (billed > 0) entry.billedKw = (entry.billedKw ?? 0) + billed;
        if (actual > 0) entry.actualKw = (entry.actualKw ?? 0) + actual;
    }
    return order.map((label) => byMonth[label]).filter((m) => m.kwh > 0);
}

/** The last 12 billing months we have read from bills, oldest first. */
function monthsFromBills(bills: ClientBill[]): UsageMonth[] {
    const byMonth = new Map<string, UsageMonth>();
    for (const bill of bills) {
        if (bill.status !== 'ready' || !bill.period_end || !bill.usage_kwh) continue;
        const key = bill.period_end.slice(0, 7);
        const [y, m] = key.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
        const entry = byMonth.get(key) ?? { label, kwh: 0, billedKw: null, actualKw: null };
        entry.kwh += Number(bill.usage_kwh);
        if (bill.billed_demand_kw) entry.billedKw = (entry.billedKw ?? 0) + Number(bill.billed_demand_kw);
        if (bill.actual_demand_kw) entry.actualKw = (entry.actualKw ?? 0) + Number(bill.actual_demand_kw);
        byMonth.set(key, entry);
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, month]) => month);
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const TX_COMMERCIAL_BENCHMARK = 12.4; // ¢/kWh — EIA Texas commercial retail average

// ERCOT South LZ forward prices — sourced March 2026
// Best buying windows: March (spring low) and October/November (fall dip)
const FORWARD_PRICES = [
    { label: "Apr '26", price: 34.79, month: 4 },
    { label: "May '26", price: 39.41, month: 5 },
    { label: "Jun '26", price: 43.08, month: 6 },
    { label: "Jul '26", price: 62.39, month: 7 },
    { label: "Aug '26", price: 91.43, month: 8 },
    { label: "Sep '26", price: 49.38, month: 9 },
    { label: "Oct '26", price: 41.66, month: 10 },
    { label: "Nov '26", price: 43.15, month: 11 },
    { label: "Dec '26", price: 48.51, month: 12 },
    { label: "Jan '27", price: 65.35, month: 1 },
    { label: "Feb '27", price: 62.25, month: 2 },
    { label: "Mar '27", price: 37.28, month: 3 },
];

const BEST_MONTHS = [3];       // March — spring seasonal low
const GOOD_MONTHS = [10, 11];  // Oct / Nov — fall dip
const AVOID_MONTHS = [8, 1, 2]; // Aug peak, Jan/Feb winter premium

type WindowStatus = 'optimal' | 'good' | 'neutral' | 'avoid';
interface MarketWindow {
    status: WindowStatus;
    label: string;
    color: 'emerald' | 'blue' | 'zinc' | 'rose';
    headline: string;
    body: string;
    nextWindow: string;
}

function getMarketWindow(month: number): MarketWindow {
    if (BEST_MONTHS.includes(month)) return {
        status: 'optimal', label: 'Best time to buy', color: 'emerald',
        headline: "You're in the best buying window of the year.",
        body: 'Spring forward prices are at their seasonal low. Locking a contract now captures the lowest expected rates before summer demand drives wholesale prices up 160%+.',
        nextWindow: 'Oct – Nov 2026 (next good window)',
    };
    if (GOOD_MONTHS.includes(month)) return {
        status: 'good', label: 'Good time to buy', color: 'blue',
        headline: 'Fall buying window is open.',
        body: 'October and November see a seasonal dip after summer peaks. This is the second-best window of the year to lock a new contract before winter premiums arrive.',
        nextWindow: 'March 2027 (optimal spring window)',
    };
    if (AVOID_MONTHS.includes(month)) return {
        status: 'avoid', label: 'Prices are high', color: 'rose',
        headline: 'Forward prices are elevated right now.',
        body: month === 8
            ? 'August is the most expensive time to lock a contract — summer peak demand drives wholesale to seasonal highs. Wait for the September cool-down.'
            : 'Winter premiums are active. January and February see elevated forward prices. The spring buying window opens in March.',
        nextWindow: month === 8 ? 'Oct – Nov 2026 (fall window)' : 'March 2026 (optimal spring window)',
    };
    return {
        status: 'neutral', label: 'Prices are moderate', color: 'zinc',
        headline: 'Prices are moderate — not peak, not optimal.',
        body: 'Forward prices are in a mid-range. If renewal is approaching, your advisor can begin sourcing quotes. The next optimal window is March (spring low).',
        nextWindow: 'March 2027 (optimal spring window)',
    };
}

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
    if (diff > 3) return { label: 'Well protected', sub: `You're paying ${diff.toFixed(2)}¢ below the Texas average`, color: 'emerald' };
    if (diff > 0) return { label: 'Favorable', sub: `Slightly below the Texas average`, color: 'emerald' };
    if (diff > -1) return { label: 'Monitor', sub: 'Near market rate — worth watching', color: 'amber' };
    return { label: 'Above market', sub: 'Your rate is above the Texas average', color: 'rose' };
}

/** Deal stages as a client would say them. */
const STAGE_LABEL: Record<string, string> = {
    SECURED: 'Active contract',
    OUT_FOR_SIGNATURE: 'Out for signature',
    ENGAGED: 'In progress',
};

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
    const [bills, setBills] = useState<ClientBill[]>([]);
    const [billsLoaded, setBillsLoaded] = useState(false);
    const [view, setView] = useState<View>('overview');
    const reduceMotion = useReducedMotion();
    const tabsRef = useRef<HTMLDivElement>(null);

    // The open tab lives in the address (?view=bills) so a reload or a shared link lands on it.
    useEffect(() => {
        const read = () => {
            const param = new URLSearchParams(window.location.search).get('view');
            setView(VIEWS.some((v) => v.id === param) ? (param as View) : 'overview');
        };
        read();
        window.addEventListener('popstate', read);
        return () => window.removeEventListener('popstate', read);
    }, []);

    const goTo = useCallback((next: View) => {
        setView(next);
        const url = new URL(window.location.href);
        if (next === 'overview') url.searchParams.delete('view'); else url.searchParams.set('view', next);
        window.history.pushState(null, '', url);
        const top = tabsRef.current ? tabsRef.current.getBoundingClientRect().top + window.scrollY - 64 : 0;
        if (window.scrollY > top) window.scrollTo({ top, behavior: 'auto' });
    }, []);
    const isScrolled = useScrollEffect((y) => y > 8, false);
    // The header turns from white-on-dark to dark-on-white once the welcome band scrolls away.
    const bandRef = useRef<HTMLDivElement>(null);
    const pastBand = useScrollEffect((y) => y > (bandRef.current?.offsetHeight ?? 320) - 32, false);

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
                .select('id, name, electricity_supplier, current_rate, annual_usage, contract_end_date, city, state, domain, metadata')
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

            // Bills load after the page is up; the Bills tab shows placeholders until then.
            portalFetch<{ bills: ClientBill[] }>('/api/portal/bills')
                .then((d) => setBills(d.bills || []))
                .catch(() => setBills([]))
                .finally(() => setBillsLoaded(true));
        }
        init();
    }, [router]);

    const usageHistory = account?.metadata?.usageHistory as UsageHistoryRow[] | undefined;
    const usageMonths = useMemo(() => {
        const fromAdvisor = monthsFromHistory(usageHistory);
        return fromAdvisor.length ? { months: fromAdvisor, fromBills: false } : { months: monthsFromBills(bills), fromBills: true };
    }, [usageHistory, bills]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-100 font-sans" role="status">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-[#002FA7]" aria-hidden />
                    <p className="text-sm text-zinc-500">Loading your dashboard…</p>
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

    // Default to ERCOT Hub Average
    let wholesalePrice = ercotPrices?.hub_avg;
    let wholesaleLabel = 'Wholesale price right now';
    let wholesaleDescription = 'Texas-wide average, before delivery and capacity charges.';

    if (account && ercotPrices) {
        const loadZone = mapLocationToZone(account.city ?? '', account.state ?? '');
        const zoneKey = loadZone.replace('LZ_', '').toLowerCase() as keyof ErcotPrices;
        if (ercotPrices[zoneKey] !== undefined) {
            wholesalePrice = ercotPrices[zoneKey];
            wholesaleLabel = 'Wholesale price in your area';
            wholesaleDescription = `ERCOT ${loadZone.replace('LZ_', '').toLowerCase()} zone, before delivery charges.`;
        }
    }
    const spotPriceKwh = wholesalePrice !== undefined ? (wholesalePrice / 10).toFixed(2) : null;
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

    const dark = !pastBand;
    const firstName = contactName ? contactName.split(' ')[0] : '';
    const expiryTone: Tone = expiryDays === null ? 'zinc' : expiryDays < 0 ? 'rose' : expiryDays <= 60 ? 'amber' : 'emerald';
    const expiryOnDark = expiryTone === 'rose' ? 'text-rose-300' : expiryTone === 'amber' ? 'text-amber-300' : 'text-emerald-300';
    const focusRing = dark ? focusOnDark : focusOnLight;

    const latestBill = bills.find((b) => (b.status === 'ready' || b.status === 'needs_review') && b.period_end) || null;
    const billsToCheck = bills.filter((b) => b.status === 'needs_review' || b.status === 'failed').length;
    const contractEnd = activeDeal?.closeDate || account?.contract_end_date || null;
    const contract: ContractSummary | null = activeDeal || contractEnd
        ? {
            title: activeDeal?.title || null,
            supplier: account?.electricity_supplier || null,
            lengthMonths: activeDeal?.contractLength || null,
            startDate: activeDeal?.createdAt || null,
            endDate: contractEnd,
            daysLeft: expiryDays,
            rateCents: contractedRate,
            annualValue: activeDeal?.amount || null,
        }
        : null;

    return (
        <div className={`${displayFontClass} min-h-screen bg-zinc-100 font-sans text-zinc-600 antialiased selection:bg-[#002FA7] selection:text-white`}>

            {/* ── HEADER: glass that follows what is behind it ── */}
            <header
                className={`fixed inset-x-0 top-0 z-40 h-16 border-b transition-[background-color,border-color,color,box-shadow] duration-300 ${
                    isScrolled
                        ? dark
                            ? 'border-white/10 bg-zinc-950/55 backdrop-blur-xl backdrop-saturate-150'
                            : 'border-zinc-950/[0.06] bg-white/70 shadow-[0_1px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur-xl backdrop-saturate-150'
                        : 'border-transparent bg-transparent'
                } ${dark ? 'text-white' : 'text-zinc-950'}`}
            >
                <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-6 lg:px-10">
                    <Link href="/" className={`flex items-center gap-2.5 rounded-md ${focusRing}`}>
                        <Image src="/images/nodalpoint.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg bg-white p-0.5" priority />
                        <span className="text-lg font-semibold tracking-[-0.02em]">Nodal Point</span>
                    </Link>
                    <div className="flex items-center gap-5">
                        {account?.name && (
                            <div className="hidden text-right md:block">
                                <p className="text-sm font-medium">{account.name}</p>
                                <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>{userEmail}</p>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={async () => { await supabase.auth.signOut(); router.replace('/portal'); }}
                            className={`inline-flex items-center gap-2 rounded-[10px] border px-4 py-2 text-sm font-medium transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] ${
                                dark ? 'border-white/25 hover:border-white/60 hover:bg-white/5' : 'border-zinc-300 bg-white hover:border-zinc-950'
                            } ${focusRing}`}
                        >
                            <LogOut className="h-4 w-4" aria-hidden />
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            {/* ── WELCOME BAND ── */}
            <div ref={bandRef} className="relative isolate overflow-hidden bg-zinc-950 px-6 pb-12 pt-28 text-white lg:px-10 lg:pb-16 lg:pt-32">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -right-48 -top-56 -z-10 h-[36rem] w-[36rem] rounded-full bg-[#002FA7]/45 blur-[150px]"
                />
                <div className="mx-auto max-w-7xl">
                    <h1 className="np-display np-enter text-4xl sm:text-5xl lg:text-6xl">
                        {firstName ? `Welcome back, ${firstName}.` : 'Your energy dashboard.'}
                    </h1>
                    {(account?.name || location !== '—') && (
                        <p className="np-enter mt-4 text-lg leading-8 text-zinc-300" style={{ animationDelay: '80ms' }}>
                            {[account?.name, location !== '—' ? location : null].filter(Boolean).join(', ')}
                        </p>
                    )}

                    {/* Contract status at a glance */}
                    {account && activeDeal && (
                        <ul className="np-enter mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-6" style={{ animationDelay: '160ms' }}>
                            <li>
                                <p className="text-sm text-zinc-400">Status</p>
                                <p className="mt-1 flex items-center gap-2 text-base font-medium">
                                    <span className={`h-2 w-2 rounded-full ${activeDeal.stage === 'SECURED' ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
                                    {STAGE_LABEL[activeDeal.stage] ?? activeDeal.stage}
                                </p>
                            </li>
                            <li className="min-w-0 max-w-full">
                                <p className="text-sm text-zinc-400">Agreement</p>
                                <p className="mt-1 truncate text-base font-medium">{activeDeal.title}</p>
                            </li>
                            {expiryDays !== null && (
                                <li>
                                    <p className="text-sm text-zinc-400">Time left</p>
                                    <p className={`mt-1 text-base font-medium tabular-nums ${expiryOnDark}`}>
                                        {expiryDays < 0 ? 'Expired' : `${expiryDays} days remaining`}
                                    </p>
                                </li>
                            )}
                            {activeDeal.amount && (
                                <li>
                                    <p className="text-sm text-zinc-400">Contract value</p>
                                    <p className="mt-1 text-base font-medium tabular-nums">${activeDeal.amount.toLocaleString()} a year</p>
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            </div>

            {/* ── TABS: stick under the header once the welcome band scrolls away ── */}
            {account && (
                <div ref={tabsRef} className="sticky top-16 z-30 border-b border-zinc-200 bg-zinc-100/80 backdrop-blur-xl backdrop-saturate-150">
                    <nav aria-label="Portal sections" className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 lg:px-8">
                        {VIEWS.map((item) => {
                            const selected = view === item.id;
                            const attention = item.id === 'bills' ? bills.filter((b) => b.status === 'needs_review' || b.status === 'failed').length : 0;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => goTo(item.id)}
                                    aria-current={selected ? 'page' : undefined}
                                    className={`relative shrink-0 rounded-md px-3 py-4 text-base font-medium transition-colors duration-200 ${selected ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-950'} ${focusOnLight}`}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        {item.label}
                                        {attention > 0 && (
                                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800">
                                                {attention}<span className="sr-only"> to check</span>
                                            </span>
                                        )}
                                    </span>
                                    {selected && (
                                        <motion.span
                                            layoutId="portal-tab"
                                            className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#002FA7]"
                                            transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: EASE }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            )}

            {/* ── MAIN ── */}
            <main className="mx-auto w-full max-w-7xl px-6 py-10 lg:px-10 lg:py-12">

                {/* NO ACCOUNT */}
                {!account ? (
                    <Panel className="p-8 sm:p-12">
                        <h2 className="np-display text-3xl text-zinc-950 md:text-4xl">Your account is not linked yet.</h2>
                        <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600">
                            We could not find an account for {userEmail || 'this sign-in'}. Your Nodal Point advisor can finish the setup for you.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
                            <TextLink href="/contact">Contact us</TextLink>
                            <TextLink href={`/book${userEmail ? `?email=${encodeURIComponent(userEmail)}&from=/client` : ''}`}>Book a call</TextLink>
                        </div>
                    </Panel>
                ) : (
                    <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={view}
                        initial={reduceMotion ? false : { opacity: 0, y: 10, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: -6, filter: 'blur(4px)' }}
                        transition={{ duration: 0.28, ease: EASE }}
                    >
                    {view === 'bills' && <BillsView bills={bills} loaded={billsLoaded} onChange={setBills} />}
                    {view === 'contract' && (
                        <ContractView contract={contract} signedDocs={signedDocs} bills={bills} userEmail={userEmail} onOpenBills={() => goTo('bills')} />
                    )}
                    {view === 'overview' && (
                    <div className="space-y-6">

                        {/* ── YOUR RATE (full width) ── */}
                        {contractedRate && protection && (
                            <Panel className="p-6 sm:p-8">
                                <PanelHeading
                                    title="Your rate compared with the Texas average"
                                    sub="Texas commercial retail average from the U.S. Energy Information Administration."
                                    aside={<StatusTag tone={protection.color}>{protection.label}</StatusTag>}
                                />

                                <div className="mt-8 grid gap-10 md:grid-cols-2">
                                    <div>
                                        <p className="text-sm font-medium text-zinc-950">Your contracted rate</p>
                                        <p className="mt-2 flex items-baseline gap-2">
                                            <span className="np-display text-6xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">{contractedRate.toFixed(2)}</span>
                                            <span className="text-base text-zinc-500">¢ per kWh</span>
                                        </p>
                                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                                            <div className="h-full rounded-full bg-[#002FA7] transition-[width] duration-700 ease-out" style={{ width: `${yourBarPct}%` }} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-zinc-950">Texas commercial average</p>
                                        <p className="mt-2 flex items-baseline gap-2">
                                            <span className="np-display text-6xl text-zinc-400 [font-variant-numeric:lining-nums_tabular-nums]">{TX_COMMERCIAL_BENCHMARK.toFixed(1)}</span>
                                            <span className="text-base text-zinc-500">¢ per kWh</span>
                                        </p>
                                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                                            <div className="h-full rounded-full bg-zinc-400 transition-[width] duration-700 ease-out" style={{ width: `${avgBarPct}%` }} />
                                        </div>
                                    </div>
                                </div>

                                {!(savingsPerKwh !== null && savingsPerKwh > 0) && (
                                    <p className="mt-6 text-sm leading-6 text-zinc-500">{protection.sub}.</p>
                                )}

                                {savingsPerKwh !== null && savingsPerKwh > 0 && (
                                    <div className="mt-4">
                                        <Callout tone="emerald">
                                            <span className="flex items-start gap-3">
                                                <TrendingDown className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                                                <span>
                                                    You are paying <strong className="font-semibold text-zinc-950">{savingsPerKwh.toFixed(2)}¢ less per kWh</strong> than the Texas average.
                                                    {usage > 0 && annualSavings > 0 && (
                                                        <> At your usage, that is about <strong className="font-semibold text-zinc-950">{fmtDollars(annualSavings)} a year</strong>.</>
                                                    )}
                                                </span>
                                            </span>
                                        </Callout>
                                    </div>
                                )}
                            </Panel>
                        )}

                        {/* ── RENEWAL: only shown within 2 years of expiry ── */}
                        {expiryDays !== null && expiryDays <= 730 && (() => {
                            const marketWindow = getMarketWindow(new Date().getMonth() + 1);
                            const priceMin = Math.min(...FORWARD_PRICES.map(p => p.price));
                            const priceMax = Math.max(...FORWARD_PRICES.map(p => p.price));
                            const priceRange = priceMax - priceMin;
                            const W = 380; const H = 96;
                            const padX = 15; const padY = 14; const drawH = H - padY * 2;
                            const pts = FORWARD_PRICES.map((p, i) => ({
                                x: padX + (i / (FORWARD_PRICES.length - 1)) * (W - padX * 2),
                                y: (padY + drawH) - ((p.price - priceMin) / priceRange) * drawH,
                                ...p,
                            }));
                            const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

                            // Tier thresholds:
                            // expired     → < 0d
                            // urgent      → 0–90d    (act now, don't wait)
                            // planning    → 90–180d  (plan now, source quotes)
                            // approaching → 180–365d (renewal window open)
                            // monitoring  → 365–730d (watch the market, 1 yr out)
                            const urgency = expiryDays < 0 ? 'expired'
                                : expiryDays <= 90 ? 'urgent'
                                    : expiryDays <= 180 ? 'planning'
                                        : expiryDays <= 365 ? 'approaching'
                                            : 'monitoring';

                            const urgencyConfig = {
                                expired: { color: 'rose', badge: 'Contract expired', text: 'Your contract has ended. You may be on a variable rate that moves with the market. Contact your advisor now to lock in a new one.' },
                                urgent: { color: 'rose', badge: 'Act now', text: 'Less than 3 months remain. Start the renewal now so you do not roll onto a variable rate when the contract ends.' },
                                planning: { color: 'amber', badge: 'Time to get quotes', text: 'Under 6 months to go. Your advisor should start collecting supplier offers now; lead time matters for competitive pricing.' },
                                approaching: { color: 'amber', badge: 'Renewal window is open', text: 'You are within 12 months of the end of your contract. This is when renewal planning begins. Ask your advisor to watch for a good time to buy.' },
                                monitoring: { color: 'emerald', badge: 'Start watching the market', text: 'You are 1 to 2 years from the end of your contract. Start tracking future prices so you can pick a good moment to commit.' },
                            } as const;
                            const uc = urgencyConfig[urgency];
                            const countTone = urgency === 'expired' || urgency === 'urgent' ? 'text-rose-700' : urgency === 'approaching' ? 'text-amber-700' : 'text-zinc-950';

                            return (
                                <Reveal>
                                    <Panel className="p-6 sm:p-8">
                                        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">

                                            {/* LEFT: countdown */}
                                            <div>
                                                <PanelHeading title="Contract renewal" sub="When to act on your next energy agreement." />
                                                <p className="mt-8 flex flex-wrap items-baseline gap-x-3">
                                                    <span className={`np-display text-7xl [font-variant-numeric:lining-nums_tabular-nums] ${countTone}`}>
                                                        {expiryDays < 0 ? 'Expired' : expiryDays}
                                                    </span>
                                                    {expiryDays >= 0 && <span className="text-base text-zinc-500">days left on your contract</span>}
                                                </p>
                                                {activeDeal?.closeDate && (
                                                    <p className="mt-2 text-sm text-zinc-500">
                                                        Ends {format(parseISO(activeDeal.closeDate), 'MMMM d, yyyy')}
                                                    </p>
                                                )}
                                                <div className="mt-6">
                                                    <Callout tone={uc.color} title={uc.badge}>{uc.text}</Callout>
                                                </div>
                                            </div>

                                            {/* RIGHT: market timing */}
                                            <div>
                                                <PanelHeading
                                                    title="Market timing"
                                                    sub="Future wholesale prices by month, South Texas."
                                                    aside={<StatusTag tone={marketWindow.color}>{marketWindow.label}</StatusTag>}
                                                />

                                                <div className="mt-6">
                                                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Chart of future wholesale electricity prices by month">
                                                        {/* Month bands */}
                                                        {pts.map((p, i) => {
                                                            const isBest = BEST_MONTHS.includes(p.month);
                                                            const isGood = GOOD_MONTHS.includes(p.month);
                                                            const isAvoid = AVOID_MONTHS.includes(p.month);
                                                            if (!isBest && !isGood && !isAvoid) return null;
                                                            const bw = (W - padX * 2) / (FORWARD_PRICES.length - 1);
                                                            return (
                                                                <rect
                                                                    key={i}
                                                                    x={p.x - bw * 0.45}
                                                                    y={padY}
                                                                    width={bw * 0.9}
                                                                    height={drawH}
                                                                    rx={3}
                                                                    fill={isBest ? 'rgba(16,185,129,0.14)' : isGood ? 'rgba(0,47,167,0.10)' : 'rgba(225,29,72,0.09)'}
                                                                />
                                                            );
                                                        })}
                                                        <path d={pathD} fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                        {pts.map((p, i) => {
                                                            const isBest = BEST_MONTHS.includes(p.month);
                                                            const isGood = GOOD_MONTHS.includes(p.month);
                                                            const isAvoid = AVOID_MONTHS.includes(p.month);
                                                            const isCurrent = p.month === currentMonth;
                                                            const fill = isBest ? '#059669' : isGood ? '#002FA7' : isAvoid ? '#e11d48' : '#a1a1aa';
                                                            return <circle key={i} cx={p.x} cy={p.y} r={isCurrent ? 4.5 : 2.5} fill={fill} stroke={isCurrent ? '#ffffff' : 'none'} strokeWidth={isCurrent ? 1.5 : 0} />;
                                                        })}
                                                        {pts.filter(p => AVOID_MONTHS.includes(p.month) || BEST_MONTHS.includes(p.month)).map((p, i) => (
                                                            <text key={i} x={p.x} y={p.y - 6} textAnchor="middle" fontSize="7.5" fontWeight="600" fill={BEST_MONTHS.includes(p.month) ? '#047857' : '#be123c'}>
                                                                ${p.price}
                                                            </text>
                                                        ))}
                                                        {pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map((p, i) => (
                                                            <text key={i} x={p.x} y={H - 1} textAnchor="middle" fontSize="7.5" fill="#71717a">
                                                                {p.label.split("'")[0].trim()}
                                                            </text>
                                                        ))}
                                                    </svg>
                                                    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                                                        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden />Best time to buy</li>
                                                        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#002FA7]" aria-hidden />Good time to buy</li>
                                                        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-600" aria-hidden />Avoid</li>
                                                        <li>Prices in dollars per MWh</li>
                                                    </ul>
                                                </div>

                                                <div className="mt-5">
                                                    <Callout tone={marketWindow.color} title={marketWindow.headline}>
                                                        {marketWindow.body}
                                                        {marketWindow.status !== 'optimal' && (
                                                            <span className="mt-2 block text-zinc-500">Next: {marketWindow.nextWindow}</span>
                                                        )}
                                                    </Callout>
                                                </div>
                                            </div>
                                        </div>
                                    </Panel>
                                </Reveal>
                            );
                        })()}

                        {/* ── 12-MONTH USAGE ── */}
                        <Reveal>
                            <UsageChart
                                months={usageMonths.months}
                                source={usageMonths.fromBills
                                    ? 'Read from the bills you have on file.'
                                    : 'Energy used and peak demand over the last year, across your sites.'}
                            />
                        </Reveal>

                        {/* ── 3-COL ROW: Savings | Grid | Contract ── */}
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">

                            {/* Savings to date */}
                            <Reveal className="h-full">
                                <Panel className="h-full p-6">
                                    <PanelHeading
                                        title="Savings so far"
                                        sub={signedDate ? `Estimated against the Texas average, since ${format(signedDate, 'MMM yyyy')}.` : 'Estimated against the Texas average.'}
                                    />
                                    <p className={`np-display mt-6 text-6xl [font-variant-numeric:lining-nums_tabular-nums] ${totalSavings > 0 ? 'text-emerald-700' : 'text-zinc-400'}`}>
                                        {totalSavings > 0 ? fmtDollars(totalSavings) : '—'}
                                    </p>
                                    <dl className="mt-6 border-t border-zinc-100">
                                        <Row label="Average per month">{monthlySavings > 0 ? fmtDollars(monthlySavings) : '—'}</Row>
                                        <Row label="At this pace, per year">{annualSavings > 0 ? fmtDollars(annualSavings) : '—'}</Row>
                                        <Row label="Months on this contract">{monthsActive}</Row>
                                        <Row label="Annual usage">{fmtUsage(usage)}</Row>
                                    </dl>
                                </Panel>
                            </Reveal>

                            {/* Live grid status */}
                            <Reveal delay={0.07} className="h-full">
                                <Panel className="h-full p-6">
                                    <PanelHeading
                                        title="Texas grid right now"
                                        sub="Live conditions from ERCOT, the grid operator."
                                        aside={ercotGrid ? <StatusTag tone={stress.color}>{stress.label}</StatusTag> : undefined}
                                    />
                                    <div className="mt-6 space-y-5">
                                        <Callout tone={stress.color}>{stress.sub}</Callout>
                                        {wholesalePrice !== undefined && (
                                            <div className="flex items-baseline justify-between gap-6">
                                                <div>
                                                    <p className="text-sm font-medium text-zinc-950">{wholesaleLabel}</p>
                                                    <p className="mt-0.5 text-xs leading-5 text-zinc-500">{wholesaleDescription}</p>
                                                </div>
                                                <p className="shrink-0 text-base font-semibold tabular-nums text-zinc-950">${wholesalePrice.toFixed(2)} <span className="text-sm font-normal text-zinc-500">per MWh</span></p>
                                            </div>
                                        )}
                                        {contractedRate && spotPriceKwh && (
                                            <p className="border-t border-zinc-100 pt-4 text-sm leading-6 text-zinc-600">
                                                {parseFloat(spotPriceKwh) < contractedRate
                                                    ? 'The grid is calm today. Your fixed rate protects you when wholesale prices spike; on peak summer days wholesale can exceed 50¢ per kWh. Your rate holds regardless.'
                                                    : `Wholesale prices are high right now. Your fixed contract at ${contractedRate.toFixed(2)}¢ per kWh is locked, so you do not pay more whatever the grid does.`}
                                            </p>
                                        )}
                                        {!ercotPrices && !ercotGrid && (
                                            <p className="text-sm text-zinc-500">Market data is not available right now. It will show here when it is back.</p>
                                        )}
                                    </div>
                                </Panel>
                            </Reveal>

                            {/* Your contract */}
                            <Reveal delay={0.14} className="h-full md:col-span-2 xl:col-span-1">
                                <Panel className="h-full p-6">
                                    <PanelHeading title="Your contract" sub="Your active energy agreement." />
                                    {activeDeal ? (
                                        <>
                                            <p className="mt-6 text-base font-medium leading-6 text-zinc-950">{activeDeal.title}</p>
                                            <dl className="mt-4 border-t border-zinc-100">
                                                <Row label="Supplier">{account.electricity_supplier || '—'}</Row>
                                                <Row label="Length">{activeDeal.contractLength ? `${activeDeal.contractLength} months` : '—'}</Row>
                                                <Row label="Value per year">{activeDeal.amount ? `$${activeDeal.amount.toLocaleString()}` : '—'}</Row>
                                                <Row label="End date">
                                                    <span className={expiryDays !== null && expiryDays <= 60 ? 'inline-flex items-center gap-1.5 text-amber-700' : ''}>
                                                        {expiryDays !== null && expiryDays <= 60 && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                                                        {activeDeal.closeDate ? format(parseISO(activeDeal.closeDate), 'MMM d, yyyy') : '—'}
                                                    </span>
                                                </Row>
                                            </dl>
                                            {activeDeal.closeDate && activeDeal.createdAt && (() => {
                                                const total = differenceInDays(parseISO(activeDeal.closeDate), parseISO(activeDeal.createdAt));
                                                const elapsed = differenceInDays(new Date(), parseISO(activeDeal.createdAt));
                                                const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
                                                return (
                                                    <div className="mt-5">
                                                        <div className="flex justify-between text-xs text-zinc-500">
                                                            <span>How far through the contract</span>
                                                            <span className="tabular-nums">{Math.round(pct)}%</span>
                                                        </div>
                                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                                                            <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${pct > 80 ? 'bg-amber-500' : 'bg-[#002FA7]'}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    ) : (
                                        <p className="mt-6 text-sm leading-6 text-zinc-500">No active contract on file yet. It will show here once your agreement is signed.</p>
                                    )}
                                </Panel>
                            </Reveal>
                        </div>

                        {/* ── BOTTOM ROW: Peak season + Documents ── */}
                        <div className="grid gap-6 lg:grid-cols-2">

                            {/* Peak season watch (4CP) */}
                            <Reveal className="h-full">
                                <Panel className="h-full p-6">
                                    <PanelHeading
                                        title="Summer peak season"
                                        sub="June 1 to September 30."
                                        aside={<StatusTag tone={is4CPSeason ? 'amber' : 'zinc'}>{is4CPSeason ? 'Active now' : 'Off season'}</StatusTag>}
                                    />
                                    <div className="mt-6 space-y-5">
                                        {is4CPSeason ? (
                                            <Callout tone="amber" title="Peak season is active right now">
                                                We are watching for the four highest-demand hours. Where you can, avoid running heavy equipment on weekday afternoons (2 to 7pm).
                                            </Callout>
                                        ) : (
                                            <div>
                                                <div className="flex items-baseline justify-between gap-6">
                                                    <p className="text-sm font-medium text-zinc-950">Next peak season starts in</p>
                                                    <p className="np-display text-4xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">
                                                        {daysTo4CP !== null ? daysTo4CP : '—'}
                                                        <span className="ml-2 font-sans text-sm font-normal tracking-normal text-zinc-500">days</span>
                                                    </p>
                                                </div>
                                                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                                                    <div className="h-full rounded-full bg-[#002FA7] transition-[width] duration-700 ease-out" style={{ width: `${seasonProgress}%` }} />
                                                </div>
                                                <div className="mt-2 flex justify-between text-xs text-zinc-500">
                                                    <span>Today</span>
                                                    <span>Jun 1, {seasonStart.getFullYear()}</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="border-t border-zinc-100 pt-5">
                                            <p className="text-sm font-semibold text-zinc-950">Why this matters</p>
                                            <p className="mt-2 text-sm leading-6 text-zinc-600">
                                                Each summer, ERCOT records the four highest-demand hours across Texas. Your share of those peaks sets your transmission charges, sometimes called capacity costs, for the whole of the following year.
                                            </p>
                                            <p className="mt-2 text-sm leading-6 text-zinc-600">
                                                Nodal Point monitors the grid in real time and alerts you before high-risk hours.
                                            </p>
                                        </div>
                                    </div>
                                </Panel>
                            </Reveal>

                            {/* Bills and files */}
                            <Reveal delay={0.07} className="h-full">
                                <Panel className="flex h-full flex-col p-6">
                                    <PanelHeading
                                        title="Bills and files"
                                        sub="Your bills, read and filed by month, and your signed agreements."
                                    />
                                    <dl className="mt-6 border-t border-zinc-100">
                                        <Row label="Bills on file">{billsLoaded ? bills.length : '—'}</Row>
                                        <Row label="Latest bill">
                                            {latestBill ? `${billMonth(latestBill.period_end)}, ${money(latestBill.total_amount)}` : 'None yet'}
                                        </Row>
                                        <Row label="Signed agreements">{signedDocs.length}</Row>
                                    </dl>
                                    {billsToCheck > 0 && (
                                        <div className="mt-4">
                                            <Callout tone="amber">
                                                {billsToCheck === 1 ? 'One bill needs a quick check.' : `${billsToCheck} bills need a quick check.`}
                                            </Callout>
                                        </div>
                                    )}
                                    <div className="mt-auto flex flex-wrap gap-3 pt-6">
                                        <button type="button" onClick={() => goTo('bills')} className={`${buttonPrimary} ${focusOnLight} !px-5 !py-3`}>
                                            {bills.length ? 'Open bills' : 'Add a bill'}
                                            <NudgeArrow />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => goTo('contract')}
                                            className={`group inline-flex items-center justify-center gap-2 rounded-[10px] border border-zinc-300 bg-white px-5 py-3 text-base font-medium text-zinc-950 transition-[border-color,transform] duration-200 ease-out hover:border-zinc-950 active:scale-[0.98] ${focusOnLight}`}
                                        >
                                            Contract and files
                                        </button>
                                    </div>
                                </Panel>
                            </Reveal>
                        </div>

                        {/* ── NEXT STEPS ── */}
                        <Reveal>
                            <section className="relative isolate overflow-hidden rounded-2xl bg-zinc-950 p-8 text-white sm:p-10">
                                <div aria-hidden className="pointer-events-none absolute -bottom-56 right-0 -z-10 h-[26rem] w-[36rem] rounded-full bg-[#002FA7]/40 blur-[130px]" />
                                <h2 className="np-display max-w-xl text-3xl md:text-4xl">Questions about your contract?</h2>
                                <p className="mt-4 max-w-xl text-base leading-7 text-zinc-300">
                                    Talk to your advisor, or add a new bill and we will read it for you.
                                </p>
                                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                    <PrimaryLink href={`/book${userEmail ? `?email=${encodeURIComponent(userEmail)}&from=/client` : ''}`} surface="dark">
                                        Book a call
                                    </PrimaryLink>
                                    <button type="button" onClick={() => goTo('bills')} className={`${buttonOutlineOnDark} ${focusOnDark}`}>
                                        Add a bill
                                    </button>
                                </div>
                            </section>
                        </Reveal>

                    </div>
                    )}
                    </motion.div>
                    </AnimatePresence>
                )}
            </main>
        </div>
    );
}
