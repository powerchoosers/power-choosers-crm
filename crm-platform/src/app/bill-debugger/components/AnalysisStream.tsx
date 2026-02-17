import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface AnalysisStreamProps {
    onComplete: () => void
}

export function AnalysisStream({ onComplete }: AnalysisStreamProps) {
    const messages = [
        "Initiating handshake...",
        "Parsing Load Profile...",
        "Checking against ERCOT Scarcity Pricing Adders...",
        "Detecting Volatility Markers...",
        "Calculating shadow price variance...",
        "Analysis Complete."
    ]

    const [lines, setLines] = useState<string[]>([])
    const [currentLineIndex, setCurrentLineIndex] = useState(0)

    useEffect(() => {
        if (currentLineIndex >= messages.length) {
            const timeout = setTimeout(onComplete, 800)
            return () => clearTimeout(timeout)
        }

        const currentMessage = messages[currentLineIndex]
        let charIndex = 0
        let currentText = ''

        // Add empty line first
        setLines(prev => [...prev, ''])

        const typeInterval = setInterval(() => {
            if (charIndex < currentMessage.length) {
                currentText += currentMessage.charAt(charIndex)
                setLines(prev => {
                    const newLines = [...prev]
                    newLines[newLines.length - 1] = currentText
                    return newLines
                })
                charIndex++
            } else {
                clearInterval(typeInterval)
                setTimeout(() => {
                    setCurrentLineIndex(prev => prev + 1)
                }, 400)
            }
        }, 30)

        return () => clearInterval(typeInterval)
    }, [currentLineIndex, messages, onComplete])

    return (
        <motion.div
            initial={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="w-full max-w-2xl mx-auto"
        >
            <div className="font-mono text-left w-full">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-3 h-3 bg-[#002FA7] rounded-full animate-pulse"></div>
                    <span className="text-sm tracking-widest uppercase text-zinc-400">System Active</span>
                </div>

                <div className="space-y-4 text-lg md:text-xl border-l-2 border-zinc-200 pl-6 h-64 overflow-hidden flex flex-col justify-end">
                    {lines.map((line, i) => (
                        <p key={i} className={`font-mono transition-colors duration-300 ${i === lines.length - 1 ? 'text-[#002FA7]' : 'text-zinc-400'}`}>
                            <span className="mr-2">&gt;</span>
                            {line}
                            {i === lines.length - 1 && <span className="inline-block w-2 h-5 bg-[#002FA7] ml-1 animate-pulse align-middle"></span>}
                        </p>
                    ))}
                </div>
            </div>
        </motion.div>
    )
}
