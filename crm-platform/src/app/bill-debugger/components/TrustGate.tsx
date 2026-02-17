import React from 'react'
import { motion } from 'framer-motion'
import { Lock, FileX, ShieldCheck, ArrowRight } from 'lucide-react'

interface TrustGateProps {
    onNext: () => void
}

export function TrustGate({ onNext }: TrustGateProps) {
    return (
        <div className="w-full max-w-4xl mx-auto px-6 flex flex-col items-center text-center">

            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="mb-16"
            >
                <h1 className="text-4xl md:text-6xl font-thin tracking-tight mb-6 text-zinc-900">
                    Your Energy Bill Has <span className="font-normal text-[#002FA7]">Hidden Costs</span>.<br />
                    Let's Find Them.
                </h1>
                <p className="text-xl text-zinc-600 font-light max-w-2xl mx-auto leading-relaxed">
                    Your utility provider buries extra charges in the fine print.
                    We pull out exactly what you're paying for—and why.
                </p>
            </motion.div>

            {/* Trust Items Grid */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16 w-full max-w-3xl"
            >
                {/* Item 1: Privacy */}
                <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 border border-zinc-100 backdrop-blur-sm">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                        <Lock className="w-5 h-5" />
                    </div>
                    <h3 className="font-medium text-zinc-900">Your data stays private</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Read-only analysis. We never reach out to your supplier or switch your account.
                    </p>
                </div>

                {/* Item 2: Auto-delete */}
                <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 border border-zinc-100 backdrop-blur-sm">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                        <FileX className="w-5 h-5" />
                    </div>
                    <h3 className="font-medium text-zinc-900">Files auto-delete</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Your invoice is permanently deleted 72 hours after we analyze it.
                    </p>
                </div>

                {/* Item 3: Security */}
                <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-white/50 border border-zinc-100 backdrop-blur-sm">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h3 className="font-medium text-zinc-900">Bank-level security</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        SOC-2 certified standards. Your file never leaves encrypted servers.
                    </p>
                </div>
            </motion.div>

            {/* CTA Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center space-y-6"
            >
                <button
                    onClick={onNext}
                    className="group relative px-8 py-4 bg-[#002FA7] text-white rounded-full font-medium text-lg hover:bg-[#002FA7]/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-[#002FA7]/20 flex items-center gap-2"
                >
                    See My Analysis
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>

                <p className="text-sm text-zinc-400">
                    Takes less than 60 seconds • No commitment required
                </p>
            </motion.div>

        </div>
    )
}
