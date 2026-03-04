'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    LogOut,
    Zap,
    FileText,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Activity,
    Calendar,
    ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { differenceInDays, format, parseISO } from 'date-fns';

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
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function fmtUsage(val?: string | number | null) {
    if (!val) return '—';
    const n = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.]/g, '')) : val;
    if (isNaN(n)) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M kWh/yr`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K kWh/yr`;
    return `${n} kWh/yr`;
}

function daysToExpiry(dateStr?: string | null): number | null {
    if (!dateStr) return null;
    try {
        return differenceInDays(parseISO(dateStr), new Date());
    } catch {
        return null;
    }
}

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

// ─────────────────────────────────────────────
// Metric tile
// ─────────────────────────────────────────────
function MetricTile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
    return (
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5 space-y-1">
            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-[0.25em]">{label}</p>
            <p className={`font-mono text-sm font-semibold ${alert ? 'text-amber-400' : 'text-zinc-100'}`}>{value}</p>
            {sub && <p className="font-mono text-[9px] text-zinc-600">{sub}</p>}
        </div>
    );
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
export function ClientDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState('');
    const [account, setAccount] = useState<AccountData | null>(null);
    const [deals, setDeals] = useState<DealData[]>([]);
    const [contactName, setContactName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        async function init() {
            // 1. Check auth
            const { data: { user }, error: authErr } = await supabase.auth.getUser();
            if (authErr || !user?.email) {
                router.replace('/portal');
                return;
            }
            setUserEmail(user.email);

            // 2. Find contact by email
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
            if (!accountId) {
                // No linked account — still show the shell, just no data
                setLoading(false);
                return;
            }

            // 3. Fetch account
            const { data: acct } = await supabase
                .from('accounts')
                .select('id, name, electricity_supplier, current_rate, annual_usage, contract_end_date, city, state, domain')
                .eq('id', accountId)
                .single();

            if (acct) setAccount(acct);

            // 4. Fetch deals (SECURED or ENGAGED = active contracts)
            const { data: dealData } = await supabase
                .from('deals')
                .select('id, title, stage, amount, annualUsage, mills, contractLength, closeDate, yearlyCommission')
                .eq('accountId', accountId)
                .in('stage', ['SECURED', 'ENGAGED', 'OUT_FOR_SIGNATURE'])
                .order('createdAt', { ascending: false })
                .limit(5);

            setDeals(dealData || []);
            setLoading(false);
        }

        init();
    }, [router]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.replace('/portal');
    };

    // ─── Loading ─────────────────────────────
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

    const activeDeal = deals[0] || null;
    const expiryDays = daysToExpiry(activeDeal?.closeDate || account?.contract_end_date);
    const location = [account?.city, account?.state].filter(Boolean).join(', ') || '—';

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">

            {/* ── HEADER ─────────────────────────────────── */}
            <header className="px-8 py-5 flex items-center justify-between border-b border-white/5 shrink-0">
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
                        onClick={handleSignOut}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-zinc-500 hover:text-zinc-200 hover:border-white/20 font-mono text-[10px] uppercase tracking-wider transition-all"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                    </button>
                </div>
            </header>

            {/* ── MAIN ───────────────────────────────────── */}
            <main className="flex-1 px-6 py-10 max-w-6xl mx-auto w-full">

                {/* PAGE LABEL */}
                <div className="mb-8">
                    <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-2">CLIENT_PORTAL</p>
                    <h1 className="text-3xl font-bold tracking-tighter text-white">
                        {contactName ? `Welcome back, ${contactName.split(' ')[0]}.` : 'Energy Intelligence Dashboard.'}
                    </h1>
                    {location !== '—' && (
                        <p className="text-zinc-500 text-sm mt-1 font-mono">{location} · ERCOT Grid</p>
                    )}
                </div>

                {!account ? (
                    // ─── NO ACCOUNT LINKED ─────────────────────
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
                        {/* ─── CONTRACT STATUS BAR ─────────────────── */}
                        {activeDeal && (
                            <div className="flex flex-wrap items-center gap-3 mb-8 px-5 py-4 rounded-xl bg-zinc-900/60 border border-white/5">
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
                                            ${activeDeal.amount.toLocaleString()}/yr
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ─── METRICS GRID ─────────────────────────── */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
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
                                value={account.current_rate ? `${account.current_rate}¢/kWh` : '—'}
                                sub="Blended rate"
                            />
                            <MetricTile
                                label="Contract Term"
                                value={activeDeal?.contractLength ? `${activeDeal.contractLength} mo` : '—'}
                                sub={activeDeal?.closeDate ? `Closes ${format(parseISO(activeDeal.closeDate), 'MMM yyyy')}` : undefined}
                                alert={expiryDays !== null && expiryDays <= 60}
                            />
                        </div>

                        {/* ─── TWO COLUMN ───────────────────────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* LEFT: FORENSIC DASHBOARD */}
                            <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-[#002FA7]" />
                                    <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.3em]">FORENSIC_DASHBOARD</p>
                                    <div className="ml-auto flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Live</span>
                                    </div>
                                </div>
                                <div className="p-5 space-y-3">
                                    {[
                                        {
                                            label: 'ACCOUNT',
                                            value: account.name,
                                        },
                                        {
                                            label: 'LOCATION',
                                            value: location,
                                        },
                                        {
                                            label: 'ANNUAL_USAGE',
                                            value: fmtUsage(activeDeal?.annualUsage || account.annual_usage),
                                        },
                                        {
                                            label: 'CURRENT_SUPPLIER',
                                            value: account.electricity_supplier || '—',
                                        },
                                        {
                                            label: 'ALL_IN_RATE',
                                            value: account.current_rate ? `${account.current_rate}¢/kWh` : '—',
                                        },
                                        {
                                            label: 'CONTRACT_END',
                                            value: account.contract_end_date
                                                ? format(parseISO(account.contract_end_date), 'MMM yyyy')
                                                : '—',
                                            alert: expiryDays !== null && expiryDays <= 60,
                                        },
                                    ].map(row => (
                                        <div key={row.label} className="flex justify-between items-center border-b border-white/5 pb-3">
                                            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{row.label}</span>
                                            <span className={`font-mono text-[11px] font-semibold ${(row as any).alert ? 'text-amber-400' : 'text-zinc-200'}`}>
                                                {row.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* RIGHT: CONTRACT MONITOR + ACTION */}
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-[#002FA7]" />
                                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.3em]">CONTRACT_MONITOR</p>
                                    </div>
                                    <div className="p-5 space-y-3">
                                        {activeDeal ? (
                                            <>
                                                {[
                                                    {
                                                        label: 'CONTRACT',
                                                        value: activeDeal.title,
                                                    },
                                                    {
                                                        label: 'STAGE',
                                                        value: activeDeal.stage,
                                                    },
                                                    {
                                                        label: 'TERM',
                                                        value: activeDeal.contractLength ? `${activeDeal.contractLength} months` : '—',
                                                    },
                                                    {
                                                        label: 'ANNUAL_VALUE',
                                                        value: activeDeal.amount ? `$${activeDeal.amount.toLocaleString()}` : '—',
                                                    },
                                                    {
                                                        label: 'CLOSE_DATE',
                                                        value: activeDeal.closeDate
                                                            ? format(parseISO(activeDeal.closeDate), 'dd MMM yyyy')
                                                            : '—',
                                                        alert: expiryDays !== null && expiryDays <= 60,
                                                    },
                                                ].map(row => (
                                                    <div key={row.label} className="flex justify-between items-center border-b border-white/5 pb-3">
                                                        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{row.label}</span>
                                                        <span className={`font-mono text-[11px] font-semibold max-w-[55%] text-right truncate ${(row as any).alert ? 'text-amber-400' : 'text-zinc-200'}`}>
                                                            {row.value}
                                                        </span>
                                                    </div>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="py-8 text-center">
                                                <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">No active contracts</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* CTA card */}
                                <Link
                                    href="/book"
                                    className="flex items-center justify-between px-5 py-4 rounded-2xl bg-[#002FA7]/10 border border-[#002FA7]/30 hover:bg-[#002FA7]/15 hover:border-[#002FA7]/50 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Calendar className="w-5 h-5 text-[#002FA7]" />
                                        <div>
                                            <p className="text-sm font-semibold text-white">Book a Strategy Session</p>
                                            <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Speak with your advisor · No commitment</p>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-[#002FA7] group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                            </div>
                        </div>

                        {/* ─── MARKET NOTICE ────────────────────────── */}
                        <div className="mt-6 px-5 py-4 rounded-xl bg-zinc-900/40 border border-white/5 flex items-start gap-3">
                            <TrendingUp className="w-4 h-4 text-[#002FA7] shrink-0 mt-0.5" />
                            <div>
                                <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest mb-1">ERCOT Market Advisory</p>
                                <p className="text-xs text-zinc-500 leading-relaxed">
                                    Your Nodal Point advisor monitors ERCOT price signals, scarcity adders, and demand charge exposure on your behalf. Reach out for a full forensic briefing on your current rate exposure.
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* ── FOOTER ─────────────────────────────────── */}
            <footer className="px-8 py-6 border-t border-white/5 shrink-0">
                <p className="font-mono text-[9px] text-zinc-700 uppercase tracking-widest text-center">
                    Nodal Point · Client Portal · Energy Intelligence Platform
                </p>
            </footer>

        </div>
    );
}
