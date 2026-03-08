'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Table2, BarChart3 } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line
} from 'recharts';

interface UsageMonth {
    month: string;
    kwh: number;
    billed_kw: number;
    actual_kw: number;
    tdsp_charges: number;
}

interface UsageProfilePanelProps {
    usageHistory?: UsageMonth[];
    theme?: 'default' | 'crm';
}

export function UsageProfilePanel({ usageHistory, theme = 'default' }: UsageProfilePanelProps) {
    const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
    const isCrm = theme === 'crm';

    const chartFillStart = isCrm ? 'rgba(255,255,255,0.08)' : '#52525b';
    const chartFillEnd = isCrm ? 'rgba(255,255,255,0.02)' : '#27272a';
    const lineColor = '#d4d4d8';
    const axisTickColor = isCrm ? '#9ca3af' : '#71717a';
    const gridColor = isCrm ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';
    const headerBg = isCrm ? 'bg-black/30' : 'bg-zinc-900/90';
    const rowHoverBg = isCrm ? 'hover:bg-white/5' : 'hover:bg-zinc-900/40';
    const activeToggle = isCrm
        ? 'bg-black/30 text-white border border-white/10 shadow-sm'
        : 'bg-zinc-800 text-white border border-white/10 shadow-sm';
    const inactiveToggle = isCrm
        ? 'text-zinc-400 hover:text-zinc-200 border border-transparent'
        : 'text-zinc-500 hover:text-white border border-transparent';
    const panelClasses = isCrm
        ? 'bg-black/30 border border-white/5 shadow-none'
        : 'bg-zinc-900 shadow-lg';
    const chartAreaBg = isCrm ? 'bg-black/30' : '';
    const emptyPanelBg = isCrm ? 'bg-black/30' : 'bg-zinc-900';
    const emptyBodyBg = isCrm ? 'bg-black/30' : 'bg-zinc-900';

    if (!usageHistory || usageHistory.length === 0) {
        return (
            <div className={`rounded-2xl flex flex-col overflow-hidden border border-white/5 opacity-80 h-full ${emptyPanelBg}`}>
                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-zinc-300" />
                    <div>
                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">Usage Profile</p>
                        <p className="text-zinc-600 text-[9px] mt-0.5">[NO DATA AVAILABLE]</p>
                    </div>
                </div>
                <div className={`flex-1 flex items-center justify-center p-8 text-center ${emptyBodyBg}`}>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest max-w-xs">
                        Ingest a usage data file or CSV into the Data Locker to generate the 12-month usage profile.
                    </p>
                </div>
            </div>
        );
    }

    const maxKwh = Math.max(...usageHistory.map(d => d.kwh || 0));
    const maxDemand = Math.max(...usageHistory.map(d => d.billed_kw || 0));

    // Custom Tooltip for Chart
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-zinc-950 border border-white/10 p-3 rounded-xl shadow-xl">
                    <p className="font-sans font-medium text-white mb-2">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-3 font-mono text-xs mt-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-zinc-400">{entry.name}:</span>
                            <span className="text-zinc-100 ml-auto whitespace-nowrap">
                                {entry.name === 'Total kWh'
                                    ? entry.value.toLocaleString()
                                    : entry.name === 'TDSP Charges'
                                        ? `$${entry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : `${entry.value.toLocaleString()} kW`}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className={`rounded-2xl flex flex-col overflow-hidden border border-white/5 h-full ${panelClasses}`}>
            {/* Header / Toggle */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-zinc-300" />
                    <div>
                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">12-Month Usage Profile</p>
                        <p className="text-zinc-600 text-[9px] mt-0.5">Historical energy load profile</p>
                    </div>
                </div>

                <div className={`flex rounded-lg p-1 border border-white/5 ${isCrm ? 'bg-black/30' : 'bg-zinc-950/50'}`}>
                    <button
                        onClick={() => setViewMode('graph')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all ${viewMode === 'graph'
                            ? activeToggle
                            : inactiveToggle
                            }`}
                    >
                        <BarChart3 className="w-3 h-3" /> Graph
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all ${viewMode === 'table'
                            ? activeToggle
                            : inactiveToggle
                            }`}
                    >
                        <Table2 className="w-3 h-3" /> Table
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="relative flex-1 min-h-[300px]">
                <AnimatePresence mode="wait">
                    {viewMode === 'graph' ? (
                        <motion.div
                            key="graph"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className={`absolute inset-0 p-4 ${chartAreaBg}`}
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={usageHistory} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorKwh" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartFillStart} stopOpacity={0.8} />
                                            <stop offset="95%" stopColor={chartFillEnd} stopOpacity={0.2} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: axisTickColor, fontSize: 10, fontFamily: 'monospace' }}
                                        dy={10}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: axisTickColor, fontSize: 10, fontFamily: 'monospace' }}
                                        tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: axisTickColor, fontSize: 10, fontFamily: 'monospace' }}
                                        tickFormatter={(value) => `${value} kW`}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar yAxisId="left" dataKey="kwh" name="Total kWh" fill="url(#colorKwh)" radius={[4, 4, 0, 0]} barSize={40} />
                                    <Line yAxisId="right" type="monotone" dataKey="billed_kw" name="Billed Demand" stroke={lineColor} strokeWidth={2} dot={{ r: 3, fill: lineColor, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="table"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 np-scroll overflow-y-auto"
                        >
                            <table className="w-full text-left border-collapse">
                                <thead className={`${headerBg} backdrop-blur-md sticky top-0 z-10 border-b border-white/5`}>
                                    <tr>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium">Month</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">kWh Usage</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">Billed kW</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">Actual kW</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">TDSP Charges</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                    {usageHistory.map((row, idx) => (
                                        <tr key={idx} className={`${rowHoverBg} transition-colors`}>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-200">{row.month}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-300 text-right">{row.kwh?.toLocaleString() ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-400 text-right">{row.billed_kw?.toLocaleString() ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-400 text-right">{row.actual_kw?.toLocaleString() ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-400 text-right">
                                                {row.tdsp_charges ? `$${row.tdsp_charges.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default UsageProfilePanel;
