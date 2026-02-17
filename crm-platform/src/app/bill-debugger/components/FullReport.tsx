import React from 'react'
import { motion } from 'framer-motion'
import { Zap, Truck, Activity, ArrowRight, DollarSign } from 'lucide-react'

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
}

interface FullReportProps {
    data: ExtractedData
}

export function FullReport({ data }: FullReportProps) {

    // Robust formatting helper
    const formatCurrency = (val: string | number | undefined, estimate: number) => {
        if (!val) return estimate.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        if (typeof val === 'number') return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        // If it's a string, try to clean it (remove $ and ,)
        const num = parseFloat(String(val).replace(/[$,]/g, ''))
        if (isNaN(num)) return estimate.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    }

    const usage = parseFloat(data.total_usage_kwh.replace(/,/g, '')) || 0
    const demand = parseFloat(data.billed_demand_kw.replace(/,/g, '')) || 0

    // Fallback estimates if API didn't extract them
    const estEnergy = usage * 0.045
    const estDelivery = usage * 0.038
    const estDemand = demand * 12

    const energyCost = formatCurrency(data.energy_charges, estEnergy)
    const deliveryCost = formatCurrency(data.delivery_charges, estDelivery)
    const demandCost = formatCurrency(0, estDemand) // Demand is usually bundled in delivery but we highlight it
    const totalCost = formatCurrency(data.total_amount_due, estEnergy + estDelivery)


    return (
        <div className="w-full max-w-5xl mx-auto px-4 pb-20">

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-16"
            >
                <h1 className="text-3xl md:text-5xl font-light text-zinc-900 mb-4">
                    Your Energy Bill Breakdown
                </h1>
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
                            <h3 className="text-sm font-mono uppercase tracking-widest text-[#94a3b8]">Energy You Used</h3>
                            <Zap className="w-5 h-5 text-[#38bdf8]" />
                        </div>
                        <div className="text-4xl font-light text-white mb-2">
                            {data.total_usage_kwh} <span className="text-lg text-zinc-500">kWh</span>
                        </div>
                        <div className="text-sm text-[#cbd5e1] leading-relaxed mb-6">
                            This is the raw electricity your facility consumed. It's the only part of the bill you can shop for.
                        </div>
                    </div>

                    <div className="border-t border-zinc-700 pt-4">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">Supply Cost</span>
                            <span className="text-white font-mono">{energyCost}</span>
                        </div>
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
                            <h3 className="text-sm font-mono uppercase tracking-widest text-[#94a3b8]">Delivery Charges</h3>
                            <Truck className="w-5 h-5 text-[#38bdf8]" />
                        </div>
                        <div className="text-4xl font-light text-white mb-2">
                            {deliveryCost}
                        </div>
                        <div className="text-sm text-[#cbd5e1] leading-relaxed mb-6">
                            Fees paid to move power to your building. These are non-negotiable but reducible through timing.
                        </div>
                    </div>

                    <div className="border-t border-zinc-700 pt-4">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">TDU / Wires</span>
                            <span className="text-white font-mono">{deliveryCost}</span>
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
                            {data.billed_demand_kw} <span className="text-lg text-zinc-500">kW</span>
                        </div>
                        <div className="text-sm text-[#cbd5e1] leading-relaxed mb-6">
                            Your highest 15-minute usage spike. This single number drives 30–40% of your total delivery cost.
                        </div>
                    </div>

                    <div className="border-t border-zinc-700 pt-4">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">Demand Penalty (Est.)</span>
                            <span className="text-[#38bdf8] font-mono">{demandCost}</span>
                        </div>
                    </div>
                </motion.div>

            </div>

            {/* Summary Banner */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mb-12 flex flex-col md:flex-row items-center justify-between p-8 bg-white border border-zinc-200 rounded-3xl"
            >
                <div className="text-left mb-6 md:mb-0">
                    <div className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-1">Total Period Cost</div>
                    <div className="text-4xl font-semibold text-zinc-900">{totalCost}</div>
                </div>
                <div className="flex gap-4">
                    <div className="bg-[#002FA7]/5 border border-[#002FA7]/10 px-6 py-3 rounded-2xl text-left">
                        <div className="text-[10px] font-mono text-[#002FA7] uppercase tracking-wider">Est. Potential Savings</div>
                        <div className="text-xl font-medium text-[#002FA7] mt-1">12 - 18% / year</div>
                    </div>
                </div>
            </motion.div>

            {/* Next Steps CTA */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-zinc-50 border border-zinc-200 rounded-3xl p-8 md:p-12 text-center max-w-3xl mx-auto"
            >
                <h2 className="text-3xl font-light text-zinc-900 mb-4">What's Next?</h2>
                <p className="text-lg text-zinc-600 font-light mb-8 max-w-xl mx-auto text-center">
                    Schedule a brief call with our team. We'll walk through your bill,
                    explain what's driving your costs, and show you specific options
                    to lower them. No obligation.
                </p>

                <div className="flex flex-col items-center gap-4">
                    <a
                        href="https://calendly.com/nodalpoint/discovery"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-8 py-4 bg-[#002FA7] text-white rounded-full font-medium text-lg hover:bg-[#002FA7]/90 transition-all shadow-lg hover:shadow-[#002FA7]/20 flex items-center gap-2"
                    >
                        Book a Call <ArrowRight className="w-5 h-5" />
                    </a>
                    <p className="text-sm text-zinc-400">
                        Quick call. Direct answers. No brokers, no pressure.
                    </p>
                </div>

            </motion.div>

        </div>
    )
}
