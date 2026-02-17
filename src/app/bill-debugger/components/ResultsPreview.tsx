import { motion } from 'framer-motion'
import { Calendar, Zap, TrendingUp, Search, ShieldCheck, ArrowRight } from 'lucide-react'
import { FeedbackBadge } from './FeedbackBadge'

interface ExtractedData {
    customer_name: string
    billing_period: string
    total_usage_kwh: string
    billed_demand_kw: string
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

interface ResultsPreviewProps {
    data: ExtractedData
    onUnlock: () => void
}

export function ResultsPreview({ data, onUnlock }: ResultsPreviewProps) {

    // Use actual forensic feedback if available
    const feedback = data.analysis?.feedback;

    const snapshotFields = [
        {
            id: 'period',
            label: 'BILLING PERIOD',
            value: data.billing_period,
            icon: Calendar,
            context: 'Verified bill dates'
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
            label: 'DIAGNOSTIC STATUS',
            value: feedback ? feedback.title : "Analyzing load profile...",
            icon: Search,
            context: 'Forensic summary',
            isText: true
        }
    ]

    return (
        <div className="w-full max-w-4xl mx-auto text-center px-4">

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="mb-12 flex flex-col items-center"
            >
                {feedback && (
                    <div className="mb-6">
                        <FeedbackBadge
                            status={feedback.status}
                            title="Forensic Signal Detected"
                            isLarge={feedback.facilitySize === 'large'}
                        />
                    </div>
                )}
                <h1 className="text-3xl md:text-5xl font-light text-zinc-900 mb-2 tracking-tight">
                    Analysis Complete
                </h1>
                <div className="text-xl text-[#002FA7] font-medium mb-6 uppercase tracking-tight">
                    {data.customer_name}
                </div>
                <p className="text-zinc-500 max-w-md mx-auto">
                    Our diagnostic engine has extracted the critical volatility markers from your energy profile.
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
                        className="glass-card p-8 text-left relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-[#002FA7]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                        <div className="flex items-start justify-between mb-4">
                            <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">
                                {field.label}
                            </span>
                            <field.icon className="w-5 h-5 text-[#002FA7] opacity-80" />
                        </div>

                        <div className={`font-semibold text-zinc-900 mb-2 ${field.isText ? 'text-lg leading-snug' : 'text-3xl tracking-tight font-mono text-[#002FA7]'}`}>
                            {field.value}
                        </div>

                        <div className="text-xs text-zinc-500 font-medium">
                            {field.context}
                        </div>
                    </motion.div>
                ))}
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="flex flex-col items-center gap-4 py-10 glass-card bg-white/50 border-zinc-200"
            >
                <div className="mb-2 flex items-center gap-2 text-[#002FA7] text-xs font-mono uppercase tracking-widest font-bold">
                    <ShieldCheck className="w-5 h-5" />
                    Forensic Report Ready for Decryption
                </div>
                <button
                    onClick={onUnlock}
                    className="w-full md:w-auto px-12 py-5 bg-black text-white rounded-full font-bold text-lg hover:scale-105 transition-all shadow-2xl flex items-center gap-2 group"
                >
                    Unlock Full Forensic Report
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <p className="text-sm text-zinc-500 font-medium">
                    Verified access only. Secure SOC-2 encrypted tunnel.
                </p>
            </motion.div>

        </div>
    )
}
