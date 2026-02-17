import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Calendar, Phone } from 'lucide-react'

export function NextStepsCard() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-zinc-900 text-white rounded-3xl p-8 md:p-12 text-center max-w-3xl mx-auto shadow-2xl shadow-[#002FA7]/20 border border-white/5 relative overflow-hidden"
        >
            {/* Background Glow */}
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#002FA7]/20 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#002FA7]/10 blur-[100px] rounded-full pointer-events-none"></div>

            <h2 className="text-3xl md:text-4xl font-light mb-4 tracking-tight relative z-10">
                Speak with a <span className="text-[#38bdf8] font-medium">Forensic Analyst</span>
            </h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto text-center font-light leading-relaxed relative z-10">
                We'll walk through your ERCOT load zone data, clarify the demand ratchet impact, and build a custom optimization strategy.
                No obligation. Direct answers.
            </p>

            <div className="flex flex-col items-center gap-6 relative z-10">
                <a
                    href="https://calendly.com/nodalpoint/discovery"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group px-8 py-4 bg-white text-zinc-900 rounded-full font-medium text-lg hover:bg-[#002FA7] hover:text-white transition-all flex items-center gap-3 shadow-xl hover:shadow-[#002FA7]/40"
                >
                    <Calendar className="w-5 h-5 text-[#38bdf8]" />
                    Book 15-Min Review
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>

                <div className="flex items-center gap-8 text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-mono">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span>Live Analysts Available</span>
                    </div>
                    <span>•</span>
                    <span>Mon-Fri | 9AM - 5PM CST</span>
                </div>
            </div>
        </motion.div>
    )
}
