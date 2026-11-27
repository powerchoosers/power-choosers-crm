'use client';

import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Shared pieces for the signed-in client portal. Same type, colour and motion rules as
 * the public site: white panels on zinc-100, Nodal blue for the one main action, Inter
 * for everything except headlines.
 */

export const EASE = [0.23, 1, 0.32, 1] as const;

export type Tone = 'emerald' | 'amber' | 'rose' | 'zinc' | 'blue';

/** Status colours on a light background. Colour always comes with a word, never alone. */
export const TONE: Record<Tone, { text: string; panel: string; dot: string }> = {
    emerald: { text: 'text-emerald-700', panel: 'border-emerald-200 bg-emerald-50', dot: 'bg-emerald-500' },
    amber: { text: 'text-amber-800', panel: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500' },
    rose: { text: 'text-rose-700', panel: 'border-rose-200 bg-rose-50', dot: 'bg-rose-500' },
    zinc: { text: 'text-zinc-600', panel: 'border-zinc-200 bg-zinc-50', dot: 'bg-zinc-400' },
    blue: { text: 'text-[#002FA7]', panel: 'border-[#002FA7]/20 bg-[#002FA7]/5', dot: 'bg-[#002FA7]' },
};

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <section className={`rounded-2xl border border-zinc-200 bg-white ${className}`}>{children}</section>;
}

export function PanelHeading({ title, sub, aside }: { title: string; sub?: string; aside?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{title}</h2>
                {sub ? <p className="mt-1 text-sm leading-6 text-zinc-500">{sub}</p> : null}
            </div>
            {aside}
        </div>
    );
}

export function StatusTag({ tone, children }: { tone: Tone; children: ReactNode }) {
    return (
        <span className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-1 text-sm font-medium ${TONE[tone].panel} ${TONE[tone].text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} aria-hidden />
            {children}
        </span>
    );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-6 border-b border-zinc-100 py-3 last:border-b-0">
            <dt className="shrink-0 text-sm text-zinc-500">{label}</dt>
            <dd className="min-w-0 text-right text-sm font-medium tabular-nums text-zinc-950">{children}</dd>
        </div>
    );
}

export function Callout({ tone, title, children }: { tone: Tone; title?: string; children: ReactNode }) {
    return (
        <div className={`rounded-xl border p-4 ${TONE[tone].panel}`}>
            {title ? <p className={`text-sm font-semibold ${TONE[tone].text}`}>{title}</p> : null}
            <div className={`text-sm leading-6 text-zinc-700 ${title ? 'mt-1' : ''}`}>{children}</div>
        </div>
    );
}

/** Small outline button used for row actions (Open, Download, Try again). */
export const smallButton =
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-950 transition-[border-color,background-color,transform] duration-200 ease-out hover:border-zinc-950 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';

/** Fetch a /api/portal route as the signed-in client. Throws an Error with a readable message. */
export async function portalFetch<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(path, {
        method: init?.method || 'GET',
        headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const payload = isJson ? await response.json().catch(() => null) : null;
    if (!response.ok) throw new Error(payload?.error || 'Something went wrong. Try again.');
    return payload as T;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function money(value: number | null | undefined, digits = 2): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function wholeNumber(value: number | null | undefined, unit = ''): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${Math.round(Number(value)).toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
}

/** Dates from the database are plain YYYY-MM-DD; parse them without a timezone shift. */
export function plainDate(value: string | null | undefined, style: 'short' | 'long' = 'short'): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '—';
    return new Date(y, m - 1, d).toLocaleDateString('en-US', style === 'long'
        ? { month: 'long', day: 'numeric', year: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function billMonth(value: string | null | undefined): string {
    if (!value) return 'Billing period not read';
    const [y, m] = value.slice(0, 10).split('-').map(Number);
    if (!y || !m) return 'Billing period not read';
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
