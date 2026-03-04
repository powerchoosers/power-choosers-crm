'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Lock, Activity, Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Blurred dashboard preview cards
function ForensicPreview() {
    return (
        <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-zinc-900">
            <div className="p-5 blur-[3px] select-none pointer-events-none">
                <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">FORENSIC_DASHBOARD</p>
                <div className="space-y-3">
                    {[
                        { label: 'DEMAND_EXPOSURE', value: '$4,820 / mo' },
                        { label: 'RATE_CLASS', value: 'LZ_SOUTH_7B' },
                        { label: 'CONTRACT_END', value: 'Aug 2026' },
                        { label: 'SCARCITY_ADDER', value: '+$0.031 /kWh' },
                        { label: 'PEAK_LOAD', value: '847 kW' },
                        { label: 'ALL_IN_RATE', value: '14.2 ¢/kWh' },
                    ].map(row => (
                        <div key={row.label} className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{row.label}</span>
                            <span className="font-mono text-[11px] text-zinc-200 font-semibold">{row.value}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="absolute inset-0 bg-zinc-950/60 flex flex-col items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-zinc-500" />
                <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Client Access Only</p>
            </div>
        </div>
    );
}

function MarketPreview() {
    return (
        <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-zinc-900">
            <div className="p-5 blur-[3px] select-none pointer-events-none">
                <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">LIVE_MARKET_FEED</p>
                <div className="space-y-3">
                    {[
                        { label: 'LZ_SOUTH', value: '$22.35', sub: '↑ 4.2%' },
                        { label: 'LZ_HOUSTON', value: '$21.80', sub: '↑ 3.8%' },
                        { label: 'SYSTEM_LOAD', value: '48.1 GW', sub: 'Live' },
                        { label: 'RESERVES', value: '19.0 GW', sub: 'Adequate' },
                        { label: 'SCARCITY_PROB', value: '0.0%', sub: 'Signal' },
                    ].map(row => (
                        <div key={row.label} className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{row.label}</span>
                            <div className="text-right">
                                <span className="font-mono text-[11px] text-zinc-200 font-semibold">{row.value}</span>
                                <span className="font-mono text-[9px] text-zinc-600 ml-2">{row.sub}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="absolute inset-0 bg-zinc-950/60 flex flex-col items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-zinc-500" />
                <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Client Access Only</p>
            </div>
        </div>
    );
}

function ContractPreview() {
    return (
        <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-zinc-900">
            <div className="p-5 blur-[3px] select-none pointer-events-none">
                <p className="font-mono text-[9px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">CONTRACT_MONITOR</p>
                <div className="space-y-3">
                    {[
                        { label: 'ACTIVE CONTRACT', value: 'Constellation Energy', alert: false },
                        { label: 'RATE TYPE', value: 'Fixed 12-Month', alert: false },
                        { label: 'EXPIRY ALERT', value: '87 days', alert: true },
                        { label: 'SAVINGS_LOCKED', value: '$14,220 /yr', alert: false },
                        { label: 'RENEWAL_WINDOW', value: 'Opens Nov 2026', alert: false },
                    ].map(row => (
                        <div key={row.label} className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">{row.label}</span>
                            <span className={`font-mono text-[11px] font-semibold ${row.alert ? 'text-amber-400' : 'text-zinc-200'}`}>{row.value}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="absolute inset-0 bg-zinc-950/60 flex flex-col items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-zinc-500" />
                <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">Client Access Only</p>
            </div>
        </div>
    );
}

export default function PortalContent() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setStatus('loading');
        setErrorMsg('');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: email.trim().toLowerCase(),
                options: {
                    shouldCreateUser: false, // existing clients only
                    emailRedirectTo: `${window.location.origin}/network`,
                },
            });

            if (error) {
                if (error.message.toLowerCase().includes('signups not allowed') || error.status === 422) {
                    setErrorMsg('This email isn\'t registered as a Nodal Point client. To get access, book a briefing or run a free analysis below.');
                } else {
                    setErrorMsg(error.message);
                }
                setStatus('error');
            } else {
                setStatus('sent');
            }
        } catch {
            setErrorMsg('Something went wrong. Please try again.');
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">

            {/* Header */}
            <header className="px-8 py-6 flex items-center justify-between shrink-0">
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1 shrink-0">
                        <Image src="/images/nodalpoint.png" alt="Nodal Point" width={32} height={32} className="h-full w-auto object-contain" />
                    </div>
                    <span className="font-bold text-lg tracking-tighter text-white">
                        Nodal <span className="text-[#002FA7]">Point</span>
                    </span>
                </Link>
                <Link href="/" className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors">
                    ← Back to site
                </Link>
            </header>

            {/* Main */}
            <main className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                    {/* LEFT: Login */}
                    <div className="w-full max-w-sm mx-auto lg:mx-0">
                        <p className="font-mono text-[10px] text-[#002FA7] uppercase tracking-[0.3em] mb-4">CLIENT_PORTAL</p>
                        <h1 className="text-4xl font-bold tracking-tighter text-white mb-3 leading-tight">
                            Your energy intelligence dashboard.
                        </h1>
                        <p className="text-zinc-400 text-sm leading-relaxed mb-10">
                            Enter your email to receive a secure access link. Client access is by engagement only.
                        </p>

                        {status === 'sent' ? (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
                                <p className="font-semibold text-white mb-2">Check your inbox</p>
                                <p className="text-zinc-400 text-sm leading-relaxed">
                                    We sent a secure access link to <span className="text-zinc-200 font-mono">{email}</span>. The link expires in 10 minutes.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="your@company.com"
                                        required
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-11 pr-4 py-3.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] transition-colors"
                                    />
                                </div>

                                {status === 'error' && (
                                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3">
                                        <p className="text-zinc-400 text-xs leading-relaxed">{errorMsg}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={status === 'loading' || !email.trim()}
                                    className="w-full flex items-center justify-center gap-2 bg-[#002FA7] hover:bg-[#002FA7]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    {status === 'loading' ? (
                                        <span className="font-mono text-sm">Sending link...</span>
                                    ) : (
                                        <>
                                            <span className="font-mono text-sm uppercase tracking-wider">Send Access Link</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>

                                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest text-center pt-1">
                                    Access by invitation only · Existing clients
                                </p>
                            </form>
                        )}

                        {/* Divider */}
                        <div className="flex items-center gap-4 my-10">
                            <div className="flex-1 h-px bg-zinc-800" />
                            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest shrink-0">Not a client?</p>
                            <div className="flex-1 h-px bg-zinc-800" />
                        </div>

                        {/* Non-client CTAs */}
                        <div className="space-y-3">
                            <Link
                                href="/bill-debugger"
                                className="w-full flex items-center justify-between gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium py-3.5 px-5 rounded-xl transition-all duration-200 group"
                            >
                                <div className="flex items-center gap-3">
                                    <Activity className="w-4 h-4 text-[#002FA7]" />
                                    <div>
                                        <p className="text-sm font-semibold">Run a Free Analysis</p>
                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Upload your bill · 60 seconds</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
                            </Link>
                            <Link
                                href="/book"
                                className="w-full flex items-center justify-between gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-medium py-3.5 px-5 rounded-xl transition-all duration-200 group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full border border-[#002FA7] flex items-center justify-center shrink-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#002FA7]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold">Book a Briefing</p>
                                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Strategy session · No commitment</p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
                            </Link>
                        </div>
                    </div>

                    {/* RIGHT: Blurred FOMO previews */}
                    <div className="hidden lg:flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                            <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">What clients see</p>
                        </div>
                        <ForensicPreview />
                        <div className="grid grid-cols-2 gap-4">
                            <MarketPreview />
                            <ContractPreview />
                        </div>
                    </div>

                </div>
            </main>

            {/* Footer */}
            <footer className="px-8 py-6 shrink-0">
                <p className="font-mono text-[9px] text-zinc-700 uppercase tracking-widest text-center">
                    Nodal Point · Client Portal · Secured by Supabase
                </p>
            </footer>

        </div>
    );
}
