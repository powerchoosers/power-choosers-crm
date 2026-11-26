import React, { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle, Loader2 } from 'lucide-react'
import { buttonPrimary, focusOnLight, NudgeArrow } from '@/components/landing/ui'
import { EASE, StepBand } from './StepBand'

interface EmailGateProps {
    onUnlock: (email: string) => void
}

export function EmailGate({ onUnlock }: EmailGateProps) {
    const reduceMotion = useReducedMotion()
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
    const [showError, setShowError] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !email.includes('@')) {
            setShowError(true)
            return
        }

        setShowError(false)
        setStatus('loading')

        // Short pause before the report opens
        await new Promise(resolve => setTimeout(resolve, 1500))

        setStatus('success')
        // Wait for the confirmation to show
        setTimeout(() => {
            onUnlock(email)
        }, 1000)
    }

    const fade = {
        initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' },
        animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' },
        transition: { duration: 0.25, ease: EASE },
    }

    return (
        <>
            <StepBand
                title="Where should we send your report?"
                lead="Enter your work email. We will email you the full report and open it on this page."
            />

            <section className="min-h-[50vh] bg-white px-6 py-12 lg:px-10 lg:py-16">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-xl rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
                        <AnimatePresence mode="wait" initial={false}>
                            {status === 'success' ? (
                                <motion.div key="success" role="status" className="flex items-start gap-3 py-2" {...fade}>
                                    <CheckCircle aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                                    <div>
                                        <p className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Your report is ready</p>
                                        <p className="mt-1 text-base leading-7 text-zinc-600">Opening the full report now.</p>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.form key="form" onSubmit={handleSubmit} {...fade}>
                                    <label htmlFor="bill-review-email" className="block text-sm font-medium text-zinc-950">
                                        Work email
                                    </label>
                                    <input
                                        id="bill-review-email"
                                        name="email"
                                        type="email"
                                        required
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value)
                                            if (showError) setShowError(false)
                                        }}
                                        placeholder="name@company.com"
                                        aria-invalid={showError}
                                        aria-describedby={showError ? 'bill-review-email-error' : undefined}
                                        className={`mt-2 w-full rounded-[10px] border bg-white px-4 py-3 text-base text-zinc-950 placeholder:text-zinc-400 transition-[border-color,box-shadow] duration-200 focus:outline-none focus:ring-4 disabled:opacity-60 ${
                                            showError
                                                ? 'border-red-500 focus:border-red-600 focus:ring-red-500/15'
                                                : 'border-zinc-300 focus:border-[#002FA7] focus:ring-[#002FA7]/15'
                                        }`}
                                        disabled={status === 'loading'}
                                    />
                                    {showError ? (
                                        <p id="bill-review-email-error" role="alert" className="mt-2 text-sm text-red-700">
                                            That email does not look right. Enter it like name@company.com.
                                        </p>
                                    ) : null}

                                    <button
                                        type="submit"
                                        disabled={status === 'loading'}
                                        className={`${buttonPrimary} ${focusOnLight} mt-6 w-full sm:w-auto`}
                                    >
                                        {status === 'loading' ? (
                                            <>
                                                <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
                                                Getting your report ready
                                            </>
                                        ) : (
                                            <>
                                                Email me the report
                                                <NudgeArrow />
                                            </>
                                        )}
                                    </button>

                                    <p className="mt-5 text-sm text-zinc-500">Your review stays private. No spam.</p>
                                </motion.form>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </section>
        </>
    )
}
