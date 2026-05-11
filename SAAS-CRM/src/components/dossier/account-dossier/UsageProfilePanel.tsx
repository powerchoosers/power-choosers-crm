'use client';

import React, { useMemo, useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Table2, BarChart3 } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Bar, ComposedChart, Line } from 'recharts';

interface UsageMonth {
    month: string;
    kwh: number;
    billed_kw: number | null;
    actual_kw: number | null;
    billed_demand_unit?: 'kW' | 'kVA' | 'mixed' | null;
    actual_demand_unit?: 'kW' | 'kVA' | 'mixed' | null;
    tdsp_charges: number | null;
    esid?: string;
    site?: string;
    site_name?: string;
    service_address?: string;
    billing_days?: number | null;
    power_factor?: number | null;
    source_sheet?: string | null;
}

interface UsageProfilePanelProps {
    usageHistory?: UsageMonth[];
    meters?: Array<{
        id?: string;
        esid?: string | null;
        service_address?: string | null;
    }>;
    theme?: 'default' | 'crm';
}

type DemandUnit = 'kW' | 'kVA' | 'mixed' | null;

function normalizeSiteLabel(value?: string | null) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function getRowSiteLabel(row: UsageMonth) {
    return normalizeSiteLabel(
        row.service_address || row.site_name || row.site || row.source_sheet || row.esid || ''
    );
}

function mergeDemandUnit(current?: DemandUnit, next?: DemandUnit): DemandUnit {
    const cleanedCurrent = current || null;
    const cleanedNext = next || null;
    if (!cleanedNext) return cleanedCurrent;
    if (!cleanedCurrent) return cleanedNext;
    return cleanedCurrent === cleanedNext ? cleanedCurrent : 'mixed';
}

function formatDemandValue(value?: number | null, unit?: DemandUnit) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    const resolvedUnit = unit || 'kW';
    if (resolvedUnit === 'mixed') {
      return `${Number(value).toLocaleString()} mixed`;
    }
    return `${Number(value).toLocaleString()} ${resolvedUnit}`;
}

export function UsageProfilePanel({ usageHistory, meters = [], theme = 'default' }: UsageProfilePanelProps) {
    const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
    const [selectedSite, setSelectedSite] = useState<string>('ALL');
    const isCrm = theme === 'crm';
    const gradientId = useId().replace(/:/g, '_');
    const normalizedHistory = usageHistory ?? [];

    const chartFillStart = isCrm ? 'rgba(255,255,255,0.08)' : '#52525b';
    const chartFillEnd = isCrm ? 'rgba(255,255,255,0.02)' : '#27272a';
    const lineColor = '#d4d4d8';
    const axisTickColor = isCrm ? '#9ca3af' : '#71717a';
    const gridColor = isCrm ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)';
    const headerBg = isCrm ? '' : 'bg-zinc-900/90';
    const rowHoverBg = isCrm ? 'hover:bg-white/5' : 'hover:bg-zinc-900/40';
    const activeToggle = isCrm
        ? 'bg-black/30 text-white border border-white/10 shadow-sm'
        : 'bg-zinc-800 text-white border border-white/10 shadow-sm';
    const inactiveToggle = isCrm
        ? 'text-zinc-400 hover:text-zinc-200 border border-transparent'
        : 'text-zinc-500 hover:text-white border border-transparent';
    const panelClasses = isCrm
        ? 'bg-transparent border border-white/5 shadow-none'
        : 'bg-zinc-900 shadow-lg';
    const chartAreaBg = '';
    const emptyPanelBg = isCrm ? 'bg-transparent' : 'bg-zinc-900';
    const emptyBodyBg = isCrm ? 'bg-transparent' : 'bg-zinc-900';

    const siteOptions = useMemo(() => {
        const usageSites = normalizedHistory
            .map(getRowSiteLabel)
            .filter(Boolean);

        const meterSites = meters
            .map((m) => normalizeSiteLabel(m.service_address))
            .filter(Boolean) as string[];

        return Array.from(new Set([...usageSites, ...meterSites]));
    }, [meters, normalizedHistory]);

    const hasMultiSite = siteOptions.length > 1;
    const safeSelectedSite = hasMultiSite
        ? (selectedSite === 'ALL' || siteOptions.includes(selectedSite) ? selectedSite : 'ALL')
        : 'ALL';

    const filteredRows = useMemo(() => {
        if (!hasMultiSite || safeSelectedSite === 'ALL') return normalizedHistory;
        return normalizedHistory.filter((row) => getRowSiteLabel(row) === safeSelectedSite);
    }, [hasMultiSite, normalizedHistory, safeSelectedSite]);

    const displayRows = useMemo(() => {
        if (!hasMultiSite || safeSelectedSite !== 'ALL') return filteredRows;

        const monthOrder: string[] = [];
        const monthMap: Record<string, UsageMonth> = {};

        for (const row of filteredRows) {
            const monthKey = row.month || 'Unknown';
            if (!monthMap[monthKey]) {
                monthMap[monthKey] = {
                    month: monthKey,
                    kwh: 0,
                    billed_kw: 0,
                    actual_kw: 0,
                    billed_demand_unit: null,
                    actual_demand_unit: null,
                    tdsp_charges: 0,
                };
                monthOrder.push(monthKey);
            }

            const monthEntry = monthMap[monthKey]!;
            monthEntry.kwh = (monthEntry.kwh ?? 0) + (Number(row.kwh) || 0);
            monthEntry.billed_kw = (monthEntry.billed_kw ?? 0) + (Number(row.billed_kw) || 0);
            monthEntry.actual_kw = (monthEntry.actual_kw ?? 0) + (Number(row.actual_kw) || 0);
            monthEntry.tdsp_charges = (monthEntry.tdsp_charges ?? 0) + (Number(row.tdsp_charges) || 0);
            monthEntry.billed_demand_unit = mergeDemandUnit(monthEntry.billed_demand_unit, row.billed_demand_unit);
            monthEntry.actual_demand_unit = mergeDemandUnit(monthEntry.actual_demand_unit, row.actual_demand_unit);
        }

        return monthOrder.map((month) => monthMap[month]);
    }, [filteredRows, hasMultiSite, safeSelectedSite]);

    if (normalizedHistory.length === 0) {
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
                                        : formatDemandValue(
                                            entry.value,
                                            entry.dataKey === 'billed_kw'
                                                ? entry.payload?.billed_demand_unit
                                                : entry.dataKey === 'actual_kw'
                                                    ? entry.payload?.actual_demand_unit
                                                    : null
                                        )}
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 gap-2">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-zinc-300" />
                    <div>
                        <p className="font-mono text-[9px] text-zinc-400 uppercase tracking-[0.25em]">12-Month Usage Profile</p>
                        <p className="text-zinc-600 text-[9px] mt-0.5">{hasMultiSite ? `Historical energy load profile · ${siteOptions.length} sites` : 'Historical energy load profile'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {hasMultiSite && (
                        <select
                            value={safeSelectedSite}
                            onChange={(e) => setSelectedSite(e.target.value)}
                            className={`h-8 rounded-md border border-white/10 px-2 font-mono text-[10px] uppercase tracking-widest bg-transparent text-zinc-300 focus:outline-none focus:border-white/20 ${isCrm ? 'bg-black/20' : 'bg-zinc-950/50'}`}
                        >
                            <option value="ALL">All Sites</option>
                            {siteOptions.map((site) => (
                                <option key={site} value={site}>
                                    {site}
                                </option>
                            ))}
                        </select>
                    )}

                    <div className={`flex rounded-lg p-1 border border-white/5 ${isCrm ? 'bg-transparent' : 'bg-zinc-950/50'}`}>
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
                                <ComposedChart data={displayRows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
                                        tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value)}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar yAxisId="left" dataKey="kwh" name="Total kWh" fill={`url(#${gradientId})`} radius={[4, 4, 0, 0]} barSize={40} />
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
                                        {hasMultiSite && safeSelectedSite !== 'ALL' && (
                                            <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium">Site</th>
                                        )}
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">kWh Usage</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">Billed Demand</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">Actual Demand</th>
                                        <th className="px-4 py-3 font-sans text-xs text-zinc-400 font-medium text-right">TDSP Charges</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                    {displayRows.map((row, idx) => (
                                        <tr key={idx} className={`${rowHoverBg} transition-colors`}>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-200">{row.month}</td>
                                            {hasMultiSite && safeSelectedSite !== 'ALL' && (
                                                <td className="px-4 py-3 font-mono text-sm text-zinc-300">{safeSelectedSite}</td>
                                            )}
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-300 text-right">{row.kwh?.toLocaleString() ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-400 text-right">{formatDemandValue(row.billed_kw, row.billed_demand_unit)}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-zinc-400 text-right">{formatDemandValue(row.actual_kw, row.actual_demand_unit)}</td>
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
