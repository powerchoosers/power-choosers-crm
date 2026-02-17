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
                <div className="glass-card flex flex-col items-center space-y-4 p-8">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-[#002FA7]">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 tracking-tight">Forensic Isolation</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed font-medium">
                        Read-only analysis protocol. Nodal Point operates in a zero-touch environment. We do not interface with suppliers or modify account structures during the diagnostic phase.
                    </p>
                </div>

                <div className="glass-card flex flex-col items-center space-y-4 p-8">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-[#002FA7]">
                        <FileX className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 tracking-tight">Ephemeral Logic</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed font-medium">
                        Inactive session data is purged after 72 hours. If a Forensic Audit is initiated, your load profile is encrypted and moved to your private Evidence Locker for architectural review.
                    </p>
                </div>

                <div className="glass-card flex flex-col items-center space-y-4 p-8">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-[#002FA7]">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 tracking-tight">Cryptographic Vault</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed font-medium">
                        Advanced encryption standards for data at rest and in transit. Your load profile remains isolated within our hardened SOC-2 infrastructure.
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
