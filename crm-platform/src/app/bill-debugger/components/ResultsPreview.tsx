import React from 'react'
import { motion } from 'framer-motion'
import { Calendar, Zap, TrendingUp, Search } from 'lucide-react'

interface ExtractedData {
    billing_period: string
    total_usage_kwh: string
    billed_demand_kw: string
}

interface ResultsPreviewProps {
    data: ExtractedData
    onUnlock: () => void
}

export function ResultsPreview({ data, onUnlock }: ResultsPreviewProps) {

    // Dynamic "Findings" logic based on demand
    const demandValue = parseFloat(data.billed_demand_kw.replace(/,/g, '')) || 0
    let findingText = "Your detailed usage profile has been generated."

    if (demandValue > 100) {
        findingText = "High peak demand detected. Significant potential for reduction strategies."
    } else if (demandValue > 0) {
        findingText = "Peak demand charges found. Optimization opportunities available."
    }

    const snapshotFields = [
        {
            id: 'period',
            label: 'BILLING PERIOD',
            value: data.billing_period,
            icon: Calendar,
            context: 'Based on bill dates'
        },
        {
            id: 'usage',
            label: 'TOTAL USAGE',
            value: `${data.total_usage_kwh} kWh`,
            icon: Zap,
            context: 'Volume consumed'
        },
        {
            id: 'demand',
            label: 'PEAK DEMAND',
            value: `${data.billed_demand_kw} kW`,
            icon: TrendingUp,
            context: 'Volatility driver'
        },
        {
            id: 'finding',
            label: 'WHAT WE FOUND',
            value: findingText,
            icon: Search,
            context: 'Algorithmic summary',
            isText: true
        }
    ]

    return (
        <div className="w-full max-w-4xl mx-auto text-center px-4">

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="mb-12"
            >
                <h1 className="text-3xl md:text-5xl font-light text-zinc-900 mb-4">
                    Analysis Complete
                </h1>
                <p className="text-zinc-500">
                    We've extracted the critical data points driving your cost.
                </p>
            </motion.div>

            {/* Snapshot Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                {snapshotFields.map((field, i) => (
                    <motion.div
                        key={field.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: i * 0.1 }}
                        className="bg-[#1e293b] rounded-2xl p-6 text-left border border-zinc-700/50 shadow-xl relative overflow-hidden group"
                    >
                        {/* Subtle internal glow */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                        <div className="flex items-start justify-between mb-4">
                            <span className="text-xs font-mono uppercase tracking-widest text-[#94a3b8]">
                                {field.label}
                            </span>
                            <field.icon className="w-5 h-5 text-[#38bdf8] opacity-80" />
                        </div>

                        <div className={`font-medium text-white mb-2 ${field.isText ? 'text-lg leading-snug' : 'text-3xl tracking-tight font-mono text-[#38bdf8]'}`}>
                            {field.value}
                        </div>

                        <div className="text-xs text-[#94a3b8] font-light">
                            {field.context}
                        </div>
                    </motion.div>
                ))}
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="flex flex-col items-center gap-4"
            >
                <button
                    onClick={onUnlock}
                    className="w-full md:w-auto px-12 py-4 bg-[#002FA7] text-white rounded-xl font-medium text-lg hover:bg-[#002FA7]/90 transition-all shadow-lg hover:shadow-[#002FA7]/30"
                >
                    See Full Report
                </button>
                <p className="text-sm text-zinc-400">
                    Unlock your complete breakdown with your email.
                </p>
            </motion.div>

        </div>
    )
}
