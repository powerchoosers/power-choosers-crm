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
    peak_demand_kw: number;
    billed_kw: number;
    actual_kw: number;
    tdsp_charges: number;
}

interface UsageProfilePanelProps {
    usageHistory?: UsageMonth[];
}

export function UsageProfilePanel({ usageHistory }: UsageProfilePanelProps) {
    const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');

    if (!usageHistory || usageHistory.length === 0) {
        return (
            <div className="nodal-void-card flex flex-col overflow-hidden border border-white/5 opacity-80 h-full">
                <div className="flex justify-between items-center p-4 border-b border-white/5 bg-zinc-950/40">
                    <h3 className="text-sm font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Usage Profile [No Data]
                    </h3>
                </div>
                <div className="flex-1 flex items-center justify-center p-8 bg-zinc-900/20 text-center">
                    <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest max-w-xs">
                        Ingest a usage data file or CSV into the Data Locker to generate the 12-month usage profile.
                    </p>
                </div>
            </div>
        );
    }

    const maxKwh = Math.max(...usageHistory.map(d => d.kwh || 0));
    const maxDemand = Math.max(...usageHistory.map(d => d.peak_demand_kw || 0));

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
        <div className="nodal-void-card flex flex-col overflow-hidden border border-white/5 bg-zinc-950/20 shadow-lg rounded-2xl h-full">
            {/* Header / Toggle */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-zinc-900/40 nodal-recessed backdrop-blur-md">
                <h3 className="text-[11px] font-mono text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#002FA7]" />
                    12-Month Usage Profile
                </h3>

                <div className="flex bg-zinc-950 rounded-lg p-1 border border-white/5">
                    <button
                        onClick={() => setViewMode('graph')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all ${viewMode === 'graph'
                                ? 'bg-[#002FA7]/20 text-white border border-[#002FA7]/40 shadow-[0_0_15px_-5px_#002FA7]'
                                : 'text-zinc-500 hover:text-white border border-transparent'
                            }`}
                    >
                        <BarChart3 className="w-3 h-3" /> Graph
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all ${viewMode === 'table'
                                ? 'bg-[#002FA7]/20 text-white border border-[#002FA7]/40 shadow-[0_0_15px_-5px_#002FA7]'
                                : 'text-zinc-500 hover:text-white border border-transparent'
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
                            className="absolute inset-0 p-4"
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={usageHistory} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorKwh" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#002FA7" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#002FA7" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                                        dy={10}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                                        tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                                        tickFormatter={(value) => `${value} kW`}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar yAxisId="left" dataKey="kwh" name="Total kWh" fill="url(#colorKwh)" radius={[4, 4, 0, 0]} barSize={40} />
                                    <Line yAxisId="right" type="monotone" dataKey="peak_demand_kw" name="Peak Demand" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5 }} />
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
                                <thead className="nodal-table-header bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10 border-b border-white/5">
                                    <tr>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium">Month</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">kWh Usage</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">Peak kW</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">Billed kW</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">Actual kW</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">TDSP Charges</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                    {usageHistory.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-200">{row.month}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-300 text-right">{row.kwh?.toLocaleString() ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-emerald-400 text-right">{row.peak_demand_kw?.toLocaleString() ?? '—'}</td>
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
