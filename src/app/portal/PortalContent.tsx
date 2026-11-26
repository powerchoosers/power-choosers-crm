'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { displayFontClass } from '@/components/landing/fonts';
import { buttonPrimary, focusOnDark, focusOnLight, NudgeArrow, TextLink } from '@/components/landing/ui';

const EASE = [0.23, 1, 0.32, 1] as const;

/** What a client actually finds in the dashboard. Keep in step with ClientDashboard. */
const INSIDE = [
    { title: 'Your rate next to the Texas average', body: 'See at a glance whether your contract is protecting you.' },
    { title: 'When to renew', body: 'Days left on your contract and how the market looks for locking a new one.' },
    { title: 'Your usage, month by month', body: 'The last year of usage and peak demand for each of your sites.' },
    { title: 'Signed agreements', body: 'Download your executed contracts whenever you need them.' },
] as const;

const labelClass = 'block text-sm font-medium text-zinc-950';
const inputClass =
    'mt-2 w-full rounded-[10px] border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-950 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-200 focus:border-[#002FA7] focus:outline-none focus:ring-4 focus:ring-[#002FA7]/15';
const quietButton = `np-link rounded-sm text-sm font-medium text-[#002FA7] ${focusOnLight}`;

export default function PortalContent() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [mode, setMode] = useState<'password' | 'magic'>('password');
    const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const reduceMotion = useReducedMotion();

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) return;
        setStatus('loading');
        setErrorMsg('');

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });

            if (error) {
                if (error.message.toLowerCase().includes('invalid login credentials')) {
                    setErrorMsg('That email or password is not right. If you have not set a password yet, use "Email me a sign-in link" below.');
                } else if (error.message.toLowerCase().includes('email not confirmed')) {
                    setErrorMsg('Your account is not active yet. Check your email for the invitation link, then come back and sign in.');
                } else {
                    setErrorMsg(error.message);
                }
                setStatus('error');
            } else {
                window.location.href = '/client';
            }
        } catch {
            setErrorMsg('We could not sign you in. Check your connection and try again.');
            setStatus('error');
        }
    };

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setStatus('loading');
        setErrorMsg('');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: email.trim().toLowerCase(),
                options: {
                    shouldCreateUser: false,
                    emailRedirectTo: `${window.location.origin}/client`,
                },
            });

            if (error) {
                if (error.message.toLowerCase().includes('signups not allowed') || error.status === 422) {
                    setErrorMsg('This email is not registered as a Nodal Point client. To get started, review a bill or book a call below.');
                } else {
                    setErrorMsg(error.message);
                }
                setStatus('error');
            } else {
                setStatus('sent');
            }
        } catch {
            setErrorMsg('We could not send the link. Check your connection and try again.');
            setStatus('error');
        }
    };

    const switchMode = (next: 'password' | 'magic') => {
        setMode(next);
        setStatus('idle');
        setErrorMsg('');
    };

    const view = status === 'sent' ? 'sent' : mode;
    const swap = reduceMotion
        ? { initial: false as const, animate: {}, exit: {} }
        : {
              initial: { opacity: 0, y: 10, filter: 'blur(6px)' },
              animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
              exit: { opacity: 0, y: -6, filter: 'blur(4px)' },
          };

    const errorBox = (
        <AnimatePresence initial={false}>
            {status === 'error' ? (
                <motion.p
                    role="alert"
                    className="overflow-hidden rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                >
                    {errorMsg}
                </motion.p>
            ) : null}
        </AnimatePresence>
    );

    return (
        <div className={`${displayFontClass} grid min-h-screen bg-white font-sans text-zinc-600 antialiased selection:bg-[#002FA7] selection:text-white lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]`}>

            {/* LEFT: brand and what is inside. Dark, sits above the form on small screens. */}
            <aside className="relative isolate flex flex-col overflow-hidden bg-zinc-950 px-6 pb-10 pt-6 text-white lg:px-12 lg:pb-12 lg:pt-8">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -left-40 -top-48 -z-10 h-[34rem] w-[34rem] rounded-full bg-[#002FA7]/45 blur-[150px]"
                />
                <div className="flex items-center justify-between">
                    <Link href="/" className={`flex items-center gap-2.5 rounded-md ${focusOnDark}`}>
                        <Image src="/images/nodalpoint.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg bg-white p-0.5" priority />
                        <span className="text-lg font-semibold tracking-[-0.02em]">Nodal Point</span>
                    </Link>
                    <Link href="/" className={`np-link rounded-sm text-sm font-medium text-zinc-300 transition-colors duration-200 hover:text-white ${focusOnDark}`}>
                        Back to site
                    </Link>
                </div>

                <div className="mt-12 lg:my-auto lg:py-12">
                    <h1 className="np-display np-enter max-w-md text-4xl sm:text-5xl lg:text-6xl">Your client dashboard.</h1>
                    <p className="np-enter mt-5 max-w-md text-lg leading-8 text-zinc-300" style={{ animationDelay: '80ms' }}>
                        Everything about your electricity contract in one place, in plain English.
                    </p>
                    <ul className="np-enter mt-10 hidden max-w-md border-t border-white/10 lg:block" style={{ animationDelay: '160ms' }}>
                        {INSIDE.map((item) => (
                            <li key={item.title} className="border-b border-white/10 py-4">
                                <p className="text-base font-semibold tracking-[-0.01em] text-white">{item.title}</p>
                                <p className="mt-1 text-sm leading-6 text-zinc-400">{item.body}</p>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="hidden text-sm text-zinc-500 lg:block">Access is by invitation, for existing clients.</p>
            </aside>

            {/* RIGHT: sign in */}
            <main className="flex items-center justify-center px-6 py-12 lg:px-12">
                <div className="w-full max-w-md">
                    <AnimatePresence mode="wait" initial={false}>
                        {view === 'sent' ? (
                            <motion.div key="sent" {...swap} transition={{ duration: 0.3, ease: EASE }} role="status">
                                <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden />
                                <h2 className="np-display mt-5 text-4xl text-zinc-950">Check your inbox</h2>
                                <p className="mt-4 text-base leading-7 text-zinc-600">
                                    We sent a sign-in link to <span className="font-medium text-zinc-950">{email}</span>. The link expires in 10 minutes.
                                </p>
                                <button type="button" onClick={() => setStatus('idle')} className={`mt-8 ${quietButton}`}>
                                    Back to sign in
                                </button>
                            </motion.div>
                        ) : view === 'password' ? (
                            <motion.div key="password" {...swap} transition={{ duration: 0.3, ease: EASE }}>
                                <h2 className="np-display text-4xl text-zinc-950">Sign in</h2>
                                <p className="mt-3 text-base leading-7 text-zinc-600">Use the email your invitation was sent to.</p>

                                <form onSubmit={handlePasswordLogin} className="mt-8 space-y-5">
                                    <div>
                                        <label htmlFor="portal-email" className={labelClass}>Work email</label>
                                        <input
                                            id="portal-email"
                                            type="email"
                                            autoComplete="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="you@company.com"
                                            required
                                            className={inputClass}
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="portal-password" className={labelClass}>Password</label>
                                        <div className="relative">
                                            <input
                                                id="portal-password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="current-password"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                required
                                                className={`${inputClass} pr-12`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(v => !v)}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                aria-pressed={showPassword}
                                                className={`absolute right-2 top-1/2 mt-1 -translate-y-1/2 rounded-md p-2 text-zinc-500 transition-colors duration-200 hover:text-zinc-950 ${focusOnLight}`}
                                            >
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {errorBox}

                                    <button
                                        type="submit"
                                        disabled={status === 'loading' || !email.trim() || !password.trim()}
                                        className={`${buttonPrimary} ${focusOnLight} w-full`}
                                    >
                                        {status === 'loading' ? 'Signing in…' : <>Sign in<NudgeArrow /></>}
                                    </button>
                                </form>

                                <button type="button" onClick={() => switchMode('magic')} className={`mt-6 ${quietButton}`}>
                                    Email me a sign-in link instead
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div key="magic" {...swap} transition={{ duration: 0.3, ease: EASE }}>
                                <h2 className="np-display text-4xl text-zinc-950">Get a sign-in link</h2>
                                <p className="mt-3 text-base leading-7 text-zinc-600">
                                    We&apos;ll email you a link that signs you in. No password needed.
                                </p>

                                <form onSubmit={handleMagicLink} className="mt-8 space-y-5">
                                    <div>
                                        <label htmlFor="portal-magic-email" className={labelClass}>Work email</label>
                                        <input
                                            id="portal-magic-email"
                                            type="email"
                                            autoComplete="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="you@company.com"
                                            required
                                            className={inputClass}
                                        />
                                    </div>

                                    {errorBox}

                                    <button
                                        type="submit"
                                        disabled={status === 'loading' || !email.trim()}
                                        className={`${buttonPrimary} ${focusOnLight} w-full`}
                                    >
                                        {status === 'loading' ? 'Sending link…' : <>Email me the link<NudgeArrow /></>}
                                    </button>
                                </form>

                                <button type="button" onClick={() => switchMode('password')} className={`mt-6 ${quietButton}`}>
                                    Sign in with a password instead
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="mt-12 border-t border-zinc-200 pt-8">
                        <p className="text-sm font-medium text-zinc-950">Not a client yet?</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-500">Start with a bill review or a call. Both are free of commitment.</p>
                        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                            <TextLink href="/bill-debugger">Review my bill</TextLink>
                            <TextLink href={`/book${email.trim() ? `?email=${encodeURIComponent(email)}&from=/portal` : ''}`}>
                                Book a call
                            </TextLink>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
