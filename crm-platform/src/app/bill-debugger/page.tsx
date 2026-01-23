'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UploadCloud, Check, Activity } from 'lucide-react'

type ExtractedData = {
  customer_name: string
  provider_name: string
  billing_period: string
  total_usage_kwh: string
  billed_demand_kw: string
}

export default function BillDebuggerPage() {
  const [view, setView] = useState<'upload' | 'console' | 'success'>('upload')
  const [footerText, setFooterText] = useState('Waiting for input stream...')
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Mock Data
  const [extractedData, setExtractedData] = useState({
    customer_name: 'Unknown',
    provider_name: 'Unknown',
    billing_period: '--',
    total_usage_kwh: '0',
    billed_demand_kw: '0'
  })

  // Console Logic
  const processMessages = [
    "Initiating handshake...",
    "Parsing Load Profile...",
    "Checking against ERCOT Scarcity Pricing Adders...",
    "Detecting Volatility Markers...",
    "Calculating shadow price variance...",
    "Analysis Complete."
  ]

  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (isProcessing) return
    
    setIsProcessing(true)
    setFooterText('PROCESSING...')
    
    // Transition to Console
    setTimeout(() => {
        setView('console')
    }, 300)
  }

  return (
    <div className="min-h-screen w-full bg-white text-zinc-900 selection:bg-[#002FA7] selection:text-white relative overflow-x-hidden font-sans flex flex-col">
        
        {/* Digital Paper Texture */}
        <div className="absolute inset-0 z-0 pointer-events-none" style={{
            backgroundImage: 'radial-gradient(#002FA7 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            opacity: 0.1
        }}></div>

        {/* Exit Button */}
        <Link href="/" className="absolute top-4 right-4 md:top-6 md:right-8 z-50 p-2 text-zinc-400 hover:text-zinc-800 transition-colors duration-200">
            <X className="w-8 h-8" />
        </Link>

        {/* Main Content Container */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-4xl mx-auto px-6 py-20 md:py-0">
            <AnimatePresence mode="wait">
                {view === 'upload' && (
                    <UploadView onUpload={handleUpload} />
                )}
                {view === 'console' && (
                    <ConsoleView 
                        messages={processMessages} 
                        onComplete={() => {
                            // Mock Data Set
                            setExtractedData({
                                customer_name: 'Nodal Client',
                                provider_name: 'Retail Energy Provider',
                                billing_period: '06/01/2025 - 07/01/2025',
                                total_usage_kwh: '142,500',
                                billed_demand_kw: '850'
                            })
                            
                            setTimeout(() => {
                                setView('success')
                                setFooterText('DIAGNOSTIC COMPLETE')
                            }, 500)
                        }} 
                    />
                )}
                {view === 'success' && (
                    <SuccessView data={extractedData} />
                )}
            </AnimatePresence>
        </main>

        {/* Technical Micro-copy Footer */}
        <footer className="w-full p-6 text-center z-10 shrink-0">
            <p className={`font-mono text-xs text-zinc-400 tracking-wider uppercase opacity-60 ${view === 'console' ? 'animate-pulse' : ''} ${view === 'success' ? 'text-[#002FA7] opacity-100' : ''}`}>
                {footerText}
            </p>
        </footer>
    </div>
  )
}

function UploadView({ onUpload }: { onUpload: (files: FileList | null) => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        onUpload(e.dataTransfer.files)
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, transform: 'translateY(10px)', transition: { duration: 0.3 } }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="w-full text-center"
        >
            <h1 className="text-4xl md:text-6xl font-thin tracking-tight mb-6 text-zinc-900">
                Your Bill is a <span className="font-normal">Black Box</span>.<br />
                Let&apos;s Break it Open.
            </h1>
            <p className="text-xl text-zinc-600 font-light max-w-2xl mx-auto mb-16 leading-relaxed">
                Suppliers bury volatility in &quot;pass-through&quot; fees. We reverse-engineer the math to find the design flaws taxing your margins.
            </p>

            <div 
                className={`group relative w-full max-w-2xl mx-auto aspect-[2/1] md:aspect-[3/1] rounded-3xl border transition-all duration-400 cubic-bezier(0.4, 0, 0.2, 1) flex flex-col items-center justify-center cursor-pointer shadow-lg backdrop-blur-xl bg-white/80 ${isDragging ? 'scale-105 border-[#002FA7] ring-4 ring-[#002FA7]/10 shadow-2xl' : 'border-zinc-300 hover:border-zinc-400'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    accept=".pdf,image/*"
                    onChange={(e) => onUpload(e.target.files)}
                />

                <div className="pointer-events-none z-10 flex flex-col items-center transition-transform duration-300 group-hover:scale-105">
                    <div className={`w-16 h-16 mb-4 transition-colors duration-300 ${isDragging ? 'text-[#002FA7]' : 'text-zinc-300 group-hover:text-[#002FA7]'}`}>
                        <UploadCloud className="w-full h-full" />
                    </div>
                    <p className={`text-lg font-medium transition-colors ${isDragging ? 'text-[#002FA7]' : 'text-zinc-700'}`}>
                        {isDragging ? 'Initiating Analysis...' : 'Drop PDF or Image here to initiate forensic analysis'}
                    </p>
                    <p className="text-sm text-zinc-400 mt-2">
                        {isDragging ? 'Ready to receive stream...' : 'or click to browse files'}
                    </p>
                </div>
            </div>
        </motion.div>
    )
}

function ConsoleView({ messages, onComplete }: { messages: string[], onComplete: () => void }) {
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

function SuccessView({ data }: { data: ExtractedData }) {
    return (
        <motion.div
            initial={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            className="w-full max-w-lg mx-auto text-center"
        >
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#002FA7]/10 mb-4 ring-1 ring-[#002FA7]/20">
                    <Check className="w-6 h-6 text-[#002FA7]" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-black">
                    Signal Detected for <span className="text-[#002FA7]">{data.customer_name}</span>.
                </h3>
                <p className="text-zinc-500 text-sm mt-2 font-medium">
                    Forensic snapshot of your <span id="providerName">{data.provider_name}</span> invoice.
                </p>
            </div>

            <div className="bg-zinc-50/50 backdrop-blur-sm rounded-2xl border border-zinc-200 overflow-hidden relative group hover:border-[#002FA7]/30 transition-colors duration-500 text-left">
                 {/* Texture Overlay */}
                 <div className="absolute inset-0 bg-[radial-gradient(#002FA7_1px,transparent_1px)] [background-size:16px_16px] opacity-[0.03] pointer-events-none"></div>

                 <div className="p-6 space-y-5 relative z-10">
                    {/* Row 1: Period */}
                    <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
                        <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Billing Period</span>
                        <span className="text-sm font-medium text-zinc-700">{data.billing_period}</span>
                    </div>

                    {/* Row 2: Load Profile */}
                    <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
                        <div className="flex flex-col text-left">
                            <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Consumption</span>
                            <span className="text-[10px] text-zinc-400 font-medium">Volume</span>
                        </div>
                        <span className="text-xl font-bold tracking-tight text-zinc-900">
                            {data.total_usage_kwh} <span className="text-sm font-normal text-zinc-500">kWh</span>
                        </span>
                    </div>

                    {/* Row 3: The Risk Factor (Demand) */}
                    <div className="flex justify-between items-center">
                        <div className="flex flex-col text-left">
                            <span className="text-xs font-mono uppercase tracking-widest text-[#002FA7]">Peak Demand</span>
                            <span className="text-[10px] text-zinc-400 font-medium">Volatility Driver</span>
                        </div>
                        <div className="text-right">
                            <span className="text-xl font-bold tracking-tight text-[#002FA7]">
                                {data.billed_demand_kw} <span className="text-sm font-normal text-[#002FA7]/70">kW</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="bg-white p-4 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-500">
                        This usage profile reveals <br/> potential 4CP exposure.
                    </span>
                    <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#002FA7] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#002FA7]"></span>
                    </span>
                </div>
            </div>

            <button onClick={() => window.location.reload()} className="mt-8 text-sm text-zinc-400 hover:text-[#002FA7] transition-colors">
                Analyze Another Bill
            </button>
        </motion.div>
    )
}
