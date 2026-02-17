import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Zap, Truck, Activity, ArrowRight, Info, Map as MapIcon, Globe } from 'lucide-react'
import { generateFeedback } from '../utils/feedbackLogic'
import { FeedbackBadge } from './FeedbackBadge'
import { NextStepsCard } from './NextStepsCard'

interface ExtractedData {
    customer_name: string
    provider_name: string
    billing_period: string
    total_usage_kwh: string
    billed_demand_kw: string
    delivery_charges?: string | number
    energy_charges?: string | number
    taxes_and_fees?: string | number
    total_amount_due?: string | number

    // New Fields
    contract_end_date?: string
    retail_plan_name?: string
    peak_demand?: string | number
    energy_rate_per_kwh?: string | number
    delivery_rate_per_kwh?: string | number

    // Forensic Analysis
    analysis?: {
        zone: string;
        territory: string;
        isFacilityLarge: boolean;
        facilitySize: 'large' | 'small';
        allInRateCents: string;
        demandPercentOfBill: string;
        feedback: any;
        marketContext: any;
    }
}

interface FullReportProps {
    data: ExtractedData
}

export function FullReport({ data }: FullReportProps) {

    // Clean Numbers for Logic
    const usage = parseFloat(String(data.total_usage_kwh).replace(/,/g, '')) || 0
    // Use peak_demand if available (number or string), else billed_demand_kw string
    const peakRaw = data.peak_demand !== undefined ? data.peak_demand : data.billed_demand_kw
    const peak = parseFloat(String(peakRaw).replace(/,/g, '')) || 0

    const totalBillRaw = parseFloat(String(data.total_amount_due).replace(/[$,]/g, '')) || 0
    const energyChargesRaw = parseFloat(String(data.energy_charges).replace(/[$,]/g, '')) || 0
    const deliveryChargesRaw = parseFloat(String(data.delivery_charges).replace(/[$,]/g, '')) || 0

    // Robust formatting helper
    const formatCurrency = (val: string | number | undefined, estimate: number) => {
        if (!val) return estimate.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        if (typeof val === 'number') return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        const num = parseFloat(String(val).replace(/[$,]/g, ''))
        if (isNaN(num)) return estimate.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    }

    // Use Backend Feedback if available, fallback to frontend generation
    const feedback = useMemo(() => {
        if (data.analysis?.feedback) return data.analysis.feedback;

        return generateFeedback({
            allInRate: totalBillRaw > 0 && usage > 0 ? totalBillRaw / usage : 0,
            energyComponent: energyChargesRaw > 0 && usage > 0 ? energyChargesRaw / usage : 0,
            deliveryComponent: deliveryChargesRaw > 0 && usage > 0 ? deliveryChargesRaw / usage : 0,
            peakDemandKW: peak,
            totalUsage: usage,
            totalBill: totalBillRaw,
            billingPeriod: data.billing_period,
            provider: data.provider_name
        }, "Oncor")
    }, [data.analysis, totalBillRaw, usage, energyChargesRaw, deliveryChargesRaw, peak, data.billing_period, data.provider_name])

    // Fallback/Extracted estimates
    const estEnergy = usage * 0.045
    const estDelivery = usage * 0.038
    const estDemand = peak * 12

    const energyCost = formatCurrency(data.energy_charges, estEnergy)
    const deliveryCost = formatCurrency(data.delivery_charges, estDelivery)
    const demandCost = formatCurrency(0, estDemand)
    const totalCost = formatCurrency(data.total_amount_due, totalBillRaw || (estEnergy + estDelivery))

    return (
        <div className="w-full max-w-5xl mx-auto px-4 pb-20">

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-16"
            >
                <div className="flex flex-col items-center gap-4 mb-4">
                    <FeedbackBadge
                        status={feedback.status}
                        title={feedback.title}
                        isLarge={feedback.facilitySize === 'large'}
                    />
                    {data.analysis && (
                        <div className="flex items-center gap-3 text-[10px] md:text-xs font-mono tracking-widest text-[#002FA7] uppercase opacity-80">
                            <span>ZONE: {data.analysis.zone}</span>
                            <span>/</span>
                            <span>TDU: {data.analysis.territory}</span>
                        </div>
                    )}
                </div>
                <h1 className="text-3xl md:text-5xl font-light text-zinc-900 mb-6">
                    Forensic Analysis Complete
                </h1>

                {data.analysis && (
                    <div className="mb-10 max-w-4xl mx-auto rounded-3xl overflow-hidden h-48 bg-zinc-100 border border-zinc-200 relative group">
                        <div className="absolute inset-0 bg-blue-50/50 flex items-center justify-center opacity-40 group-hover:opacity-60 transition-opacity">
                            <Globe className="w-24 h-24 text-[#002FA7]" />
                        </div>
                        <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-200 flex items-center gap-2">
                            <MapIcon className="w-4 h-4 text-[#002FA7]" />
                            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Digital Site Map: {data.analysis.zone}</span>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-32 h-32 border-2 border-[#002FA7]/20 rounded-full animate-ping"></div>
                        </div>
                        <div className="absolute bottom-4 right-4 text-[10px] font-mono text-zinc-400 bg-white/50 px-2 py-0.5 rounded">
                            PRECISION GEO-LOCATION: ACTIVE
                        </div>
                    </div>
                )}

                <p className="text-zinc-500 max-w-2xl mx-auto text-lg leading-relaxed mb-6">
                    {feedback.description}
                </p>
                <div className="inline-flex items-center gap-2 bg-zinc-100 rounded-full px-4 py-1 text-sm text-zinc-500">
                    <span className="font-medium text-zinc-900">{data.provider_name}</span>
                    <span>•</span>
                    <span>{data.billing_period}</span>
                </div>
            </motion.div>

            {/* Charge Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 text-left">

                {/* Card 1: Energy */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-[#1e293b] rounded-2xl p-8 border border-zinc-700/50 shadow-xl flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-[#94a3b8]">Energy</h3>
                            <Zap className="w-5 h-5 text-[#38bdf8]" />
                        </div>
                        <div className="text-4xl font-light text-white mb-2">
                            {data.total_usage_kwh} <span className="text-lg text-zinc-500">kWh</span>
                        </div>
                    </div>

                    <div className="border-t border-zinc-700 pt-4 mt-8">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">Supply Cost</span>
                            <span className="text-white font-mono">{energyCost}</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-2">
                            Effective Rate: <span className="text-zinc-300">
                                {energyChargesRaw > 0 ? (energyChargesRaw / usage).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3 }) : 'N/A'} / kWh
                            </span>
                        </div>
                        {data.analysis && (
                            <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
                                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Shadow Pricing</div>
                                <div className="flex justify-between items-end">
                                    <span className="text-xs text-zinc-500">Market Median:</span>
                                    <span className="text-xs text-emerald-400 font-mono">{(data.analysis.marketContext.largeEnergyComponent * 100).toFixed(2)}¢</span>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Card 2: Delivery */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-[#1e293b] rounded-2xl p-8 border border-zinc-700/50 shadow-xl flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-[#94a3b8]">Delivery</h3>
                            <Truck className="w-5 h-5 text-[#38bdf8]" />
                        </div>
                        <div className="text-4xl font-light text-white mb-2">
                            {deliveryCost}
                        </div>
                    </div>

                    <div className="border-t border-zinc-700 pt-4 mt-8">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">TDU Charges</span>
                            <span className="text-white font-mono">{deliveryCost}</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-2">
                            {feedback.facilitySize === 'small'
                                ? 'High fixed charge impact due to small load.'
                                : `Includes ${data.analysis?.territory || 'regulated'} utility tariffs.`}
                        </div>
                    </div>
                </motion.div>

                {/* Card 3: Demand */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-[#1e293b] rounded-2xl p-8 border border-zinc-700/50 shadow-xl shadow-[#002FA7]/10 flex flex-col justify-between relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-20 h-20 bg-[#002FA7]/20 blur-2xl rounded-full pointer-events-none"></div>

                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-[#38bdf8]">Peak Demand</h3>
                            <Activity className="w-5 h-5 text-[#38bdf8]" />
                        </div>
                        <div className="text-4xl font-light text-white mb-2">
                            {feedback.missingPeak ? "N/A" : <>{peak.toLocaleString()} <span className="text-lg text-zinc-500">kW</span></>}
                        </div>
                    </div>

                    <div className="border-t border-zinc-700 pt-4 mt-8">
                        {feedback.facilitySize === 'large' ? (
                            <>
                                <div className="flex justify-between items-center text-sm mb-1">
                                    <span className="text-zinc-500">Ratchet Impact</span>
                                    <span className="text-[#38bdf8] font-mono">{data.analysis ? (parseFloat(data.analysis.demandPercentOfBill) > 0 ? `${data.analysis.demandPercentOfBill}%` : 'Extracted') : 'Modeling...'}</span>
                                </div>
                                <div className="text-xs text-zinc-500 mt-2 flex gap-2 items-start">
                                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span>
                                        Ratchet locks 80% cost floor for 11 months.
                                        Est. yearly penalty: <span className="text-zinc-300">{(peak * (data.analysis?.marketContext?.largeDemandCharge || 10.88) * 12 * 0.8).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div className="text-xs text-zinc-500 mt-2">
                                Small facility (&lt; 10kW). No demand ratchet detected in this tier.
                            </div>
                        )}
                    </div>
                </motion.div>

            </div>

            {/* Forensic Recommendations List */}
            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mb-20 bg-white border border-zinc-200 rounded-3xl p-8 shadow-sm"
            >
                <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
                    Forensic Recommendations
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {feedback.actionItems.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-100 hover:border-[#002FA7]/20 transition-all">
                            <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${feedback.status === 'green' ? 'bg-emerald-500' : feedback.status === 'yellow' ? 'bg-amber-500' : 'bg-red-500'}`} />
                            <p className="text-zinc-700 text-sm md:text-base leading-snug">{item}</p>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Next Steps CTA */}
            <NextStepsCard />

        </div>
    )
}
