import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, ArrowRight, Loader2, CheckCircle } from 'lucide-react'

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

        // Simulate API delay (1.5s)
        await new Promise(resolve => setTimeout(resolve, 1500))

        setStatus('success')
        // Wait for success animation
        setTimeout(() => {
            onUnlock(email)
        }, 1000)
    }

    return (
        <div className="w-full max-w-md mx-auto text-center px-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/80 backdrop-blur-xl border border-zinc-200 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
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
                            <CheckCircle className="w-16 h-16 mb-4" />
                        </motion.div>
                        <p className="text-lg font-medium">Report Unlocked</p>
                    </motion.div>
                )}

                <div className="mb-8">
                    <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-500">
                        <Mail className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-semibold text-zinc-900 mb-2">
                        Get Your Full Report
                    </h2>
                    <p className="text-zinc-500 text-sm">
                        Enter your work email to receive a detailed breakdown of your charges and options to reduce them.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="text-left">
                        <label className="text-xs font-semibold uppercase text-zinc-400 ml-1 mb-1 block">Work Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-[#002FA7] focus:border-transparent outline-none transition-all placeholder:text-zinc-300"
                            disabled={status === 'loading'}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="w-full bg-[#002FA7] text-white font-medium py-3 rounded-xl hover:bg-[#002FA7]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg hover:shadow-[#002FA7]/20"
                    >
                        {status === 'loading' ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>Unlock Report <ArrowRight className="w-4 h-4" /></>
                        )}
                    </button>
                </form>

                <p className="mt-6 text-xs text-zinc-400">
                    Your email is used only for this report. We won't spam you.
                </p>

            </motion.div>
        </div>
    )
}
