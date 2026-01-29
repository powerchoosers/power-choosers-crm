'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UploadCloud, Check, AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { LoadingOrb } from '@/components/ui/LoadingOrb'

type ExtractedData = {
  customer_name: string
  provider_name: string
  billing_period: string
  total_usage_kwh: string
  billed_demand_kw: string
}

export default function BillDebuggerPage() {
  const [view, setView] = useState<'upload' | 'console' | 'analyzing' | 'email' | 'success' | 'error'>('upload')
  const [footerText, setFooterText] = useState('Waiting for input stream...')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  
  // Data State
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)

  // Console Logic
  const processMessages = [
    "Initiating handshake...",
    "Parsing Load Profile...",
    "Checking against ERCOT Scarcity Pricing Adders...",
    "Detecting Volatility Markers...",
    "Calculating shadow price variance...",
    "Analysis Complete."
  ]

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (isProcessing) return
    
    setIsProcessing(true)
    setFooterText('PROCESSING...')
    setErrorMsg('')
    
    // 1. Transition to Console immediately for UX
    setView('console')

    try {
        const file = files[0]

        // 2. Convert to Base64
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
        })

        // 3. Call API
        const response = await fetch('/api/analyze-bill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileData: base64Data,
                mimeType: file.type
            })
        })

        // Check for non-JSON response (e.g., 500 Internal Server Error html/text)
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
        }

        const result = await response.json()

        if (!response.ok || !result.success) {
            throw new Error(result.error || result.message || 'Failed to analyze bill')
        }

        // 4. Store Data
        setExtractedData({
            customer_name: result.data.customer_name || 'Unknown Client',
            provider_name: result.data.provider_name || 'Unknown Provider',
            billing_period: result.data.billing_period || 'Unknown Period',
            total_usage_kwh: result.data.total_usage_kwh?.toLocaleString() || '0',
            billed_demand_kw: result.data.billed_demand_kw?.toLocaleString() || '0'
        })

    } catch (err: unknown) {
        console.error('Analysis Error:', err)
        const message = err instanceof Error ? err.message : 'An error occurred during analysis'
        setErrorMsg(message)
        // We let the console finish before showing error
    }
  }

  // Handle transition from Console
  const handleConsoleComplete = () => {
      if (errorMsg) {
          setView('error')
          setFooterText('ANALYSIS FAILED')
          setIsProcessing(false)
          return
      }

      if (extractedData) {
          // Data is ready, go to email capture
          setView('email')
          setFooterText('AWAITING AUTHORIZATION')
      } else {
          // Data not ready yet, go to analyzing/loading state
          setView('analyzing')
          setFooterText('FINALIZING...')
      }
  }

  // Watch for data arrival if we are in 'analyzing' state
  useEffect(() => {
      if (view === 'analyzing') {
          if (errorMsg) {
              setView('error')
              setFooterText('ANALYSIS FAILED')
              setIsProcessing(false)
          } else if (extractedData) {
              setView('email')
              setFooterText('AWAITING AUTHORIZATION')
          }
      }
  }, [view, extractedData, errorMsg])

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
                        onComplete={handleConsoleComplete} 
                    />
                )}
                {view === 'analyzing' && (
                    <AnalyzingView />
                )}
                {view === 'email' && (
                    <EmailCaptureView onComplete={() => {
                        setView('success')
                        setFooterText('DIAGNOSTIC COMPLETE')
                    }} />
                )}
                {view === 'success' && extractedData && (
                    <SuccessView data={extractedData} />
                )}
                {view === 'error' && (
                    <ErrorView message={errorMsg} onRetry={() => {
                        setView('upload')
                        setIsProcessing(false)
                        setFooterText('Waiting for input stream...')
                        setExtractedData(null)
                        setErrorMsg('')
                    }} />
                )}
            </AnimatePresence>
        </main>

        {/* Technical Micro-copy Footer */}
        <footer className="w-full p-6 text-center z-10 shrink-0">
            <p className={`font-mono text-xs text-zinc-400 tracking-wider uppercase opacity-60 ${view === 'console' || view === 'analyzing' ? 'animate-pulse' : ''} ${view === 'success' ? 'text-[#002FA7] opacity-100' : ''}`}>
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

function AnalyzingView() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center space-y-6"
        >
            <LoadingOrb label="FINALIZING ANALYSIS..." />
        </motion.div>
    )
}

function EmailCaptureView({ onComplete }: { onComplete: () => void }) {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        // Simulate email capture or actually send it if we had an endpoint
        // For now, just proceed after a short delay
        await new Promise(resolve => setTimeout(resolve, 800))
        setLoading(false)
        onComplete()
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md mx-auto text-center"
        >
            <div className="bg-white/80 backdrop-blur-xl border border-zinc-200 rounded-2xl p-8 shadow-xl">
                <h3 className="text-2xl font-semibold text-zinc-900 mb-2">Unlock Your Report</h3>
                <p className="text-zinc-500 mb-6">Enter your email to view the forensic analysis of your invoice.</p>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input 
                            type="email" 
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white focus:ring-2 focus:ring-[#002FA7] focus:border-transparent outline-none transition-all"
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-[#002FA7] text-white font-medium py-3 rounded-xl hover:bg-[#002FA7]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Reveal Data <ArrowRight className="w-5 h-5" /></>}
                    </button>
                </form>
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

function ErrorView({ message, onRetry }: { message: string, onRetry: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md mx-auto text-center"
        >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-6 text-red-600">
                <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-semibold text-zinc-900 mb-2">Analysis Failed</h3>
            <p className="text-zinc-500 mb-8">{message}</p>
            <button 
                onClick={onRetry}
                className="px-6 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors font-medium"
            >
                Try Again
            </button>
        </motion.div>
    )
}
