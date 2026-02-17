import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, ArrowRight, Loader2, CheckCircle, ShieldCheck } from 'lucide-react'

interface EmailGateProps {
    onUnlock: (email: string) => void
}

export function EmailGate({ onUnlock }: EmailGateProps) {
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !email.includes('@')) return

        setStatus('loading')

        // Simulate secure tunnel initialization
        await new Promise(resolve => setTimeout(resolve, 1500))

        setStatus('success')
        // Wait for success animation
        setTimeout(() => {
            onUnlock(email)
        }, 1000)
    }

    return (
        <div className="w-full max-w-lg mx-auto text-center px-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card p-10 md:p-14 relative overflow-hidden"
            >
                {/* Success Overlay */}
                {status === 'success' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-[#002FA7] z-20 flex flex-col items-center justify-center text-white"
                    >
                        <motion.div
                            initial={{ scale: 0.5 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 10 }}
                        >
                            <CheckCircle className="w-20 h-20 mb-6" />
                        </motion.div>
                        <p className="text-2xl font-bold tracking-tight">Access Granted</p>
                        <p className="text-blue-200 mt-2 font-mono text-xs uppercase tracking-widest">Decrypting Forensic Data...</p>
                    </motion.div>
                )}

                <div className="mb-10">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-[#002FA7] shadow-inner">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 mb-4 tracking-tighter">
                        Unlock Forensic Data
                    </h2>
                    <p className="text-zinc-500 text-lg leading-relaxed font-medium">
                        Verification required to decrypt market volatility benchmarks.
                        Enter your work email for secure access.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="text-left">
                        <label className="text-xs font-mono font-bold uppercase text-[#002FA7] ml-2 mb-2 block tracking-widest">
                            // Identity_Vector
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full px-6 py-4 rounded-2xl border border-zinc-200 bg-white focus:bg-white focus:ring-4 focus:ring-[#002FA7]/10 focus:border-[#002FA7] outline-none transition-all placeholder:text-zinc-300 text-lg font-medium"
                            disabled={status === 'loading'}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="w-full bg-black text-white font-bold py-5 rounded-2xl hover:bg-zinc-900 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl active:scale-[0.98] group"
                    >
                        {status === 'loading' ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                Initialize Decryption
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-10 flex items-center justify-center gap-4 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
                    <span className="flex items-center gap-1">
                        <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
                        SOC-2 SECURE
                    </span>
                    <span>•</span>
                    <span>AUTO-DELETE ACTIVE</span>
                </div>

            </motion.div>
        </div>
    )
}
