'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

// Modular Components
import { TrustGate } from './components/TrustGate'
import { UploadZone } from './components/UploadZone'
import { AnalysisStream } from './components/AnalysisStream'
import { ResultsPreview } from './components/ResultsPreview'
import { EmailGate } from './components/EmailGate'
import { FullReport } from './components/FullReport'

type ExtractedData = {
    customer_name: string
    provider_name: string
    billing_period: string
    total_usage_kwh: string
    billed_demand_kw: string
    delivery_charges?: string | number
    energy_charges?: string | number
    taxes_and_fees?: string | number
    total_amount_due?: string | number

    // New Fields
    contract_end_date?: string
    retail_plan_name?: string
    peak_demand?: string | number // Use as source of truth for calculations
    energy_rate_per_kwh?: string | number
    delivery_rate_per_kwh?: string | number
}

type ViewState = 'trust' | 'upload' | 'analyzing' | 'preview' | 'email' | 'report' | 'error'

export default function BillDebuggerPage() {
    const router = useRouter()
    const [view, setView] = useState<ViewState>('trust')
    const [footerText, setFooterText] = useState('Waiting for context...')
    const [isProcessing, setIsProcessing] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    // Data State
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
    const [userEmail, setUserEmail] = useState('')

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        if (isProcessing) return

        setIsProcessing(true)
        setFooterText('PROCESSING DATA STREAM...')
        setErrorMsg('')

        // 1. Transition to analyzing immediately
        setView('analyzing')

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

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
            }

            const result = await response.json()

            if (!response.ok || !result.success) {
                throw new Error(result.error || result.message || 'Failed to analyze bill')
            }

            // 4. Store Data - Robust Normalize
            const data = result.data || result;

            setExtractedData({
                customer_name: data.customerName || data.customer_name || 'Unknown Client',
                provider_name: data.supplier || data.provider_name || 'Unknown Provider',
                billing_period: (data.billingPeriod && typeof data.billingPeriod === 'object' ?
                    (data.billingPeriod.start ? `${data.billingPeriod.start} - ${data.billingPeriod.end}` :
                        data.billingPeriod.startDate ? `${data.billingPeriod.startDate} - ${data.billingPeriod.endDate}` : 'Unknown Period')
                    : data.billingPeriod) || 'Unknown Period',

                total_usage_kwh: (data.usagekWh || data.totalUsage || data.total_usage_kwh)?.toLocaleString() || '0',

                // Prioritize 'peakDemand' from new prompt, fallback to old demandKW object
                billed_demand_kw: (data.peakDemand || (data.demandKW && typeof data.demandKW === 'object' ? data.demandKW.peakDemand : data.demandKW) || data.billed_demand_kw || 0).toLocaleString(),
                peak_demand: data.peakDemand || (data.demandKW && typeof data.demandKW === 'object' ? data.demandKW.peakDemand : data.demandKW) || 0,

                delivery_charges: data.deliveryChargeTotal || data.deliveryCharges || data.delivery_charges,
                energy_charges: data.energyChargeTotal || data.energyCharges || data.energy_charges,
                taxes_and_fees: data.taxesAndFees || data.taxes_and_fees,
                total_amount_due: data.totalAmountDue || data.total_amount_due,

                contract_end_date: data.contractEndDate,
                retail_plan_name: data.retailPlanName,
                energy_rate_per_kwh: data.energyRatePerKWh,
                delivery_rate_per_kwh: data.deliveryRatePerKWh,

                // Attach Forensic Analysis
                analysis: data.analysis
            })
        } catch (err: unknown) {
            console.error('Analysis Error:', err)
            const message = err instanceof Error ? err.message : 'An error occurred during analysis'
            setErrorMsg(message)
        } finally {
            setIsProcessing(false)
        }
    }

    // Dynamic Footer Logic
    useEffect(() => {
        switch (view) {
            case 'trust': setFooterText('System Ready'); break;
            case 'upload': setFooterText('Awaiting Document Stream'); break;
            case 'analyzing': setFooterText('Analyzing Volatility Markers...'); break;
            case 'preview': setFooterText('Signal Detected'); break;
            case 'email': setFooterText('Verification Required'); break;
            case 'report': setFooterText('Forensic Analysis Complete'); break;
            case 'error': setFooterText('System Failure'); break;
        }
    }, [view])

    return (
        <div className="min-h-screen w-full bg-white text-zinc-900 selection:bg-[#002FA7] selection:text-white relative overflow-x-hidden font-sans flex flex-col">

            {/* Digital Paper Texture (Dot Grid) - PRESERVED */}
            <div className="absolute inset-0 z-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(#002FA7 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                opacity: 0.1
            }}></div>

            {/* Exit Button - PRESERVED */}
            <button
                onClick={() => router.back()}
                className="absolute top-4 right-4 md:top-6 md:right-8 z-50 p-2 text-zinc-400 hover:text-zinc-800 transition-colors duration-200 cursor-pointer"
                aria-label="Go back"
            >
                <X className="w-8 h-8" />
            </button>

            {/* Main Content Hub */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-center w-full mx-auto py-20">
                <AnimatePresence mode="wait">

                    {view === 'trust' && (
                        <TrustGate key="trust" onNext={() => setView('upload')} />
                    )}

                    {view === 'upload' && (
                        <UploadZone key="upload" onUpload={handleUpload} isAnalyzing={isProcessing} />
                    )}

                    {view === 'analyzing' && (
                        <AnalysisStream key="analyzing" onComplete={() => {
                            if (errorMsg) {
                                setView('error')
                            } else if (extractedData) {
                                setView('preview')
                            } else {
                                if (!isProcessing) setView('error')
                            }
                        }} />
                    )}

                    {view === 'preview' && extractedData && (
                        <ResultsPreview
                            key="preview"
                            data={extractedData}
                            onUnlock={() => setView('email')}
                        />
                    )}

                    {view === 'email' && (
                        <EmailGate key="email" onUnlock={(email) => {
                            setUserEmail(email)
                            setView('report')
                        }} />
                    )}

                    {view === 'report' && extractedData && (
                        <FullReport key="report" data={extractedData} />
                    )}

                    {view === 'error' && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center max-w-md px-6"
                        >
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                <X className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Analysis Failed</h2>
                            <p className="text-zinc-500 mb-8">{errorMsg || 'An unexpected error occurred during analysis.'}</p>
                            <button
                                onClick={() => {
                                    setView('upload')
                                    setErrorMsg('')
                                    setExtractedData(null)
                                }}
                                className="px-8 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors"
                            >
                                Try Again
                            </button>
                        </motion.div>
                    )}

                </AnimatePresence>
            </main>

            {/* Technical Micro-copy Footer - PRESERVED */}
            <footer className="w-full p-6 text-center z-10 shrink-0">
                <p className={`font-mono text-[10px] md:text-xs text-zinc-400 tracking-widest uppercase opacity-60 ${view === 'analyzing' ? 'animate-pulse' : ''} ${view === 'report' ? 'text-[#002FA7] opacity-100' : ''}`}>
                    {footerText}
                </p>
            </footer>
        </div>
    )
}
