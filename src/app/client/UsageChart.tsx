'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE, Panel, wholeNumber } from './portal-ui';
import { focusOnLight } from '@/components/landing/ui';

export interface UsageMonth {
    label: string;
    kwh: number;
    billedKw: number | null;
    actualKw: number | null;
}

/** A round scale for the axis: the top value and the evenly spaced labels under it. */
function niceScale(max: number): { ceil: number; ticks: number[] } {
    if (max <= 0) return { ceil: 1, ticks: [1, 0] };
    const rough = max / 5;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = ([1, 2, 2.5, 5, 10].find((s) => s * magnitude >= rough) ?? 10) * magnitude;
    const count = Math.max(1, Math.ceil(max / step));
    return { ceil: count * step, ticks: Array.from({ length: count + 1 }, (_, i) => (count - i) * step) };
}

function compact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return String(Math.round(value));
}

/**
 * Energy used each month as bars, with billed peak demand as a line.
 * The month you point at (or the highest month, by default) is the blue one,
 * and its numbers are written out above the chart.
 */
export function UsageChart({ months, source }: { months: UsageMonth[]; source: string }) {
    const reduceMotion = useReducedMotion();
    const [view, setView] = useState<'chart' | 'table'>('chart');
    const [hovered, setHovered] = useState<number | null>(null);

    const stats = useMemo(() => {
        const maxKwh = Math.max(0, ...months.map((m) => m.kwh));
        const peakIndex = months.findIndex((m) => m.kwh === maxKwh);
        const demand = months.map((m) => m.billedKw).filter((v): v is number => typeof v === 'number' && v > 0);
        const kwhScale = niceScale(maxKwh);
        const kwScale = niceScale(demand.length ? Math.max(...demand) : 0);
        return {
            ceilKwh: kwhScale.ceil,
            kwhTicks: kwhScale.ticks,
            peakIndex,
            ceilKw: kwScale.ceil,
            kwTicks: kwScale.ticks,
            total: months.reduce((sum, m) => sum + m.kwh, 0),
            hasDemand: demand.length >= 2,
        };
    }, [months]);

    if (months.length === 0) {
        return (
            <Panel className="p-6 sm:p-8">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Your usage, month by month</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
                    No usage on file yet. Add a few bills and each month will show here as it is read.
                </p>
            </Panel>
        );
    }

    const active = hovered ?? stats.peakIndex;
    const activeMonth = months[active];
    const linePoints = stats.hasDemand
        ? months
            .map((m, i) => (m.billedKw && m.billedKw > 0 ? { x: ((i + 0.5) / months.length) * 100, y: 100 - (m.billedKw / stats.ceilKw) * 100 } : null))
            .filter((p): p is { x: number; y: number } => p !== null)
        : [];

    return (
        <Panel className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <div>
                    <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Your usage, month by month</h2>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">{source}</p>
                </div>
                <div className="inline-flex rounded-[10px] border border-zinc-200 bg-zinc-100 p-1" role="group" aria-label="Show usage as">
                    {(['chart', 'table'] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => setView(option)}
                            aria-pressed={view === option}
                            className={`relative rounded-[7px] px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${view === option ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-950'} ${focusOnLight}`}
                        >
                            {view === option && (
                                <motion.span
                                    layoutId="usage-view"
                                    className="absolute inset-0 rounded-[7px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                                    transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                                />
                            )}
                            <span className="relative">{option === 'chart' ? 'Chart' : 'Table'}</span>
                        </button>
                    ))}
                </div>
            </div>

            {view === 'chart' ? (
                <div className="mt-8">
                    {/* Readout: the numbers for the month being pointed at. */}
                    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2" aria-live="polite">
                        <p className="flex items-baseline gap-2">
                            <span className="np-display text-5xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums]">{wholeNumber(activeMonth.kwh)}</span>
                            <span className="text-base text-zinc-500">kWh in {activeMonth.label}</span>
                        </p>
                        {activeMonth.billedKw ? (
                            <p className="text-sm text-zinc-500">
                                Peak demand billed: <span className="font-medium tabular-nums text-zinc-950">{wholeNumber(activeMonth.billedKw, 'kW')}</span>
                            </p>
                        ) : null}
                        {hovered === null && <p className="text-sm text-zinc-500">Your highest month</p>}
                    </div>

                    <div className="mt-6 flex gap-3">
                        <div className="relative h-64 w-10 shrink-0 text-right text-xs tabular-nums text-zinc-400" aria-hidden>
                            {stats.kwhTicks.map((t) => (
                                <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / stats.ceilKwh) * 100}%` }}>{compact(t)}</span>
                            ))}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="relative h-64" onMouseLeave={() => setHovered(null)}>
                                {stats.kwhTicks.map((t) => (
                                    <div key={t} className={`absolute inset-x-0 border-t ${t === 0 ? 'border-zinc-300' : 'border-zinc-100'}`} style={{ top: `${(1 - t / stats.ceilKwh) * 100}%` }} aria-hidden />
                                ))}

                                <div className="absolute inset-0 flex items-end">
                                    {months.map((m, i) => {
                                        const isActive = i === active;
                                        return (
                                            <button
                                                key={`${m.label}-${i}`}
                                                type="button"
                                                onMouseEnter={() => setHovered(i)}
                                                onFocus={() => setHovered(i)}
                                                onBlur={() => setHovered(null)}
                                                aria-label={`${m.label}: ${wholeNumber(m.kwh, 'kWh')}${m.billedKw ? `, ${wholeNumber(m.billedKw, 'kW')} billed demand` : ''}`}
                                                className={`group relative block h-full min-w-0 flex-1 rounded-md ${focusOnLight}`}
                                            >
                                                <motion.span
                                                    className={`absolute inset-x-[18%] bottom-0 block origin-bottom rounded-t-md transition-colors duration-200 ${isActive ? 'bg-[#002FA7]' : 'bg-[#002FA7]/15 group-hover:bg-[#002FA7]/30'}`}
                                                    style={{ height: `${Math.max(1.5, (m.kwh / stats.ceilKwh) * 100)}%` }}
                                                    initial={reduceMotion ? false : { scaleY: 0 }}
                                                    whileInView={{ scaleY: 1 }}
                                                    viewport={{ once: true }}
                                                    transition={{ duration: 0.45, delay: i * 0.025, ease: EASE }}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>

                                {linePoints.length >= 2 && (
                                    <>
                                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                                            <motion.polyline
                                                points={linePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                                                fill="none"
                                                stroke="#18181b"
                                                strokeWidth="1.5"
                                                strokeLinejoin="round"
                                                strokeLinecap="round"
                                                vectorEffect="non-scaling-stroke"
                                                initial={reduceMotion ? false : { opacity: 0 }}
                                                whileInView={{ opacity: 1 }}
                                                viewport={{ once: true }}
                                                transition={{ duration: 0.4, delay: 0.35 }}
                                            />
                                        </svg>
                                        {linePoints.map((p, i) => (
                                            <span
                                                key={i}
                                                aria-hidden
                                                className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900"
                                                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                                            />
                                        ))}
                                    </>
                                )}
                            </div>

                            <div className="mt-3 flex text-xs text-zinc-500" aria-hidden>
                                {months.map((m, i) => (
                                    <span key={`${m.label}-${i}`} className={`min-w-0 flex-1 truncate text-center transition-colors duration-200 ${i === active ? 'font-medium text-zinc-950' : ''}`}>
                                        {m.label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {stats.hasDemand && (
                            <div className="relative hidden h-64 w-10 shrink-0 text-xs tabular-nums text-zinc-400 sm:block" aria-hidden>
                                {stats.kwTicks.map((t) => (
                                    <span key={t} className="absolute left-0 -translate-y-1/2" style={{ top: `${(1 - t / stats.ceilKw) * 100}%` }}>{compact(t)}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
                        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#002FA7]" aria-hidden />Energy used (kWh, left scale)</li>
                        {stats.hasDemand && <li className="flex items-center gap-2"><span className="h-0.5 w-4 rounded-full bg-zinc-900" aria-hidden />Peak demand billed (kW, right scale)</li>}
                        <li className="tabular-nums">Total shown: <span className="font-medium text-zinc-950">{wholeNumber(stats.total, 'kWh')}</span></li>
                    </ul>
                </div>
            ) : (
                <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[26rem] text-left text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-zinc-500">
                                <th scope="col" className="py-3 pr-4 font-medium">Month</th>
                                <th scope="col" className="px-4 py-3 text-right font-medium">Energy used</th>
                                <th scope="col" className="px-4 py-3 text-right font-medium">Demand billed</th>
                                <th scope="col" className="py-3 pl-4 text-right font-medium">Demand measured</th>
                            </tr>
                        </thead>
                        <tbody>
                            {months.map((m, i) => (
                                <tr key={`${m.label}-${i}`} className="border-b border-zinc-100 last:border-b-0">
                                    <th scope="row" className="py-3 pr-4 font-medium text-zinc-950">{m.label}</th>
                                    <td className="px-4 py-3 text-right tabular-nums text-zinc-950">{wholeNumber(m.kwh, 'kWh')}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{wholeNumber(m.billedKw, 'kW')}</td>
                                    <td className="py-3 pl-4 text-right tabular-nums text-zinc-600">{wholeNumber(m.actualKw, 'kW')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Panel>
    );
}
