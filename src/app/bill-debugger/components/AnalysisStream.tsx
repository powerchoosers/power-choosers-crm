import React, { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { EASE, StepBand } from './StepBand'

interface AnalysisStreamProps {
    onComplete: () => void
}

const STEPS = [
    'Opening the file',
    'Reading the bill details',
    'Checking the utility charges',
    'Looking for peaks in your usage',
    'Writing up what we found',
]

/** How long each step shows as active before the next one starts. */
const STEP_MS = 1200

export function AnalysisStream({ onComplete }: AnalysisStreamProps) {
    const reduceMotion = useReducedMotion()
    const [currentStep, setCurrentStep] = useState(0)
    const [finished, setFinished] = useState(false)

    // Walk through the steps. The last one stays active until the page moves on.
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (currentStep < STEPS.length - 1) {
                setCurrentStep((prev) => prev + 1)
            } else {
                setFinished(true)
            }
        }, STEP_MS)
        return () => clearTimeout(timeout)
    }, [currentStep])

    // Once the steps have played, ask the page to move on. The page passes a new
    // onComplete whenever its data changes, so this fires again when the result arrives.
    useEffect(() => {
        if (!finished) return
        const timeout = setTimeout(onComplete, 800)
        return () => clearTimeout(timeout)
    }, [finished, onComplete])

    const progress = finished ? 0.94 : (currentStep + 0.5) / STEPS.length

    return (
        <>
            <StepBand
                title="Reading your bill"
                lead="This usually takes under a minute. Keep this page open."
            />

            <section className="min-h-[50vh] bg-white px-6 py-12 lg:px-10 lg:py-16">
                <div className="mx-auto max-w-7xl">
                    <div className="max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
                        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
                            <motion.div
                                className="h-full origin-left rounded-full bg-[#002FA7]"
                                initial={false}
                                animate={{ scaleX: progress }}
                                transition={{ duration: reduceMotion ? 0 : 0.45, ease: EASE }}
                            />
                        </div>

                        <ol className="mt-7 space-y-4">
                            {STEPS.map((step, index) => {
                                const done = index < currentStep
                                const active = index === currentStep
                                return (
                                    <li key={step} className="flex items-center gap-3">
                                        <span
                                            aria-hidden
                                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color] duration-300 ease-out ${
                                                done
                                                    ? 'border-[#002FA7] bg-[#002FA7] text-white'
                                                    : active
                                                        ? 'border-[#002FA7]/30 bg-white text-[#002FA7]'
                                                        : 'border-zinc-300 bg-white text-transparent'
                                            }`}
                                        >
                                            {done ? (
                                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                            ) : active ? (
                                                <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                                            ) : null}
                                        </span>
                                        <span
                                            className={`text-base transition-colors duration-300 ${
                                                active ? 'font-medium text-zinc-950' : done ? 'text-zinc-600' : 'text-zinc-400'
                                            }`}
                                        >
                                            {step}
                                        </span>
                                    </li>
                                )
                            })}
                        </ol>

                        <p role="status" aria-live="polite" className="mt-7 border-t border-zinc-200 pt-5 text-sm text-zinc-500">
                            {finished
                                ? 'Still working. Longer bills take a little more time.'
                                : `Step ${currentStep + 1} of ${STEPS.length}: ${STEPS[currentStep].toLowerCase()}.`}
                        </p>
                    </div>
                </div>
            </section>
        </>
    )
}
