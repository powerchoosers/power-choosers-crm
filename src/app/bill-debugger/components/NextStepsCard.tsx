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
            className="glass-card bg-white p-8 md:p-12 text-center max-w-3xl mx-auto shadow-2xl relative overflow-hidden"
        >
            {/* Background Glow */}
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-100/50 blur-[80px] rounded-full pointer-events-none"></div>
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-blue-50/50 blur-[80px] rounded-full pointer-events-none"></div>

            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tighter text-zinc-900 leading-[1.1] relative z-10">
                Stop paying for <span className="text-[#002FA7]">the noise.</span>
            </h2>
            <p className="text-zinc-600 mb-10 max-w-xl mx-auto text-center font-medium leading-relaxed relative z-10">
                The grid is a puzzle designed to confuse. Our analysts speak the language of forensic energy mathematics to reveal your true signal.
            </p>

            <div className="flex flex-col items-center gap-6 relative z-10">
                <a
                    href="https://calendly.com/nodalpoint/discovery"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group px-10 py-5 bg-black text-white rounded-full font-semibold text-lg hover:scale-105 transition-all flex items-center gap-3 shadow-xl hover:shadow-2xl"
                >
                    <Calendar className="w-5 h-5" />
                    Run Strategic Review
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
