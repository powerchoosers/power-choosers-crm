import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Calendar, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

interface NextStepsCardProps {
    email?: string;
}

export function NextStepsCard({ email }: NextStepsCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="glass-card p-8 md:p-14 text-center max-w-4xl mx-auto shadow-2xl relative overflow-hidden"
        >
            {/* Background Glow */}
            <div className="absolute -top-24 -left-24 w-80 h-80 bg-blue-100/30 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-blue-50/30 blur-[100px] rounded-full pointer-events-none"></div>

            <div className="relative z-10">
                <div className="flex justify-center mb-8">
                    <div className="px-4 py-1.5 rounded-full bg-blue-50 text-[#002FA7] font-mono text-[10px] uppercase tracking-[0.3em] font-bold border border-blue-100 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[#002FA7] rounded-full animate-pulse" />
                        Next Phase: Vector Optimization
                    </div>
                </div>

                <h2 className="text-4xl md:text-6xl font-bold mb-8 tracking-tighter text-zinc-900 leading-[0.95] max-w-2xl mx-auto">
                    Stop paying for <br />
                    <span className="text-[#002FA7]">the background noise.</span>
                </h2>

                <p className="text-zinc-500 mb-12 max-w-2xl mx-auto text-xl font-medium leading-relaxed">
                    The grid is a high-frequency puzzle designed to obfuscate.
                    Our forensic analysts isolate the true signal to eliminate waste.
                </p>

                <div className="flex flex-col items-center gap-8">
                    <Link
                        href={`/book${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                        className="group px-12 py-6 bg-black text-white rounded-full font-bold text-xl hover:scale-105 transition-all flex items-center gap-4 shadow-[#000]/20 shadow-2xl hover:shadow-black/30 active:scale-95"
                    >
                        <Calendar className="w-6 h-6" />
                        Run Strategic Review
                        <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                    </Link>

                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-12 text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-mono font-bold">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span>Official Nodal Protocol</span>
                        </div>
                        <span className="hidden md:block opacity-30">•</span>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                            <span>Live Analysts Online</span>
                        </div>
                        <span className="hidden md:block opacity-30">•</span>
                        <span>09:00 - 17:00 CST</span>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
