'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { PageReveal } from '@/components/motion/PageReveal'

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
    actual_demand_kw?: string
    billed_demand_kw: string
    power_factor_pct?: string
    delivery_charges?: string | number
    energy_charges?: string | number
    taxes_and_fees?: string | number
    total_amount_due?: string | number
    service_address?: string

    // New Fields
    contract_end_date?: string
    retail_plan_name?: string
    peak_demand?: string | number // Use as source of truth for calculations
    energy_rate_per_kwh?: string | number
    delivery_rate_per_kwh?: string | number
    demand_floor_kw?: string | number

    // Analysis summary
    analysis?: {
        zone: string;
        territory: string;
        isFacilityLarge: boolean;
        facilitySize: 'large' | 'small';
        allInRateCents: string;
        demandPercentOfBill: string;
        deliverySharePct?: string;
        supplySharePct?: string;
        taxesSharePct?: string;
        actualDemandKW?: string;
        billedDemandKW?: string;
        powerFactorPct?: string;
        demandGapKW?: string;
        billSplit?: {
            supply: number;
            delivery: number;
            taxes: number;
            total: number;
        }
        demandProfile?: {
            actualDemandKW: number;
            billedDemandKW: number;
            powerFactorPct: number;
            demandGapKW: number;
        }
        feedback: any;
        marketContext: any;
    }
}

type ViewState = 'trust' | 'upload' | 'analyzing' | 'preview' | 'email' | 'report' | 'error'

export default function BillDebuggerPage() {
    const router = useRouter()
    const [view, setView] = useState<ViewState>('upload')
    const [footerText, setFooterText] = useState('Waiting for upload')
    const [isProcessing, setIsProcessing] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    // Data State
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null)
    const [userEmail, setUserEmail] = useState('')
    const [encodedFile, setEncodedFile] = useState<{ base64: string, name: string, type: string } | null>(null)

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        if (isProcessing) return

        setIsProcessing(true)
        setFooterText('Processing bill...')
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

            // Persist file data for later usage
            setEncodedFile({
                base64: base64Data,
                name: file.name,
                type: file.type
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

            // 4. Store data - normalize the response
            const data = result.data || result;

            setExtractedData({
                customer_name: data.customerName || data.customer_name || 'Unknown Client',
                provider_name: data.providerName || data.provider_name || data.supplier || 'Unknown Provider',
                service_address: data.serviceAddress || data.service_address,
                billing_period: (data.billingPeriod && typeof data.billingPeriod === 'object' ?
                    (data.billingPeriod.start ? `${data.billingPeriod.start} - ${data.billingPeriod.end}` :
                        data.billingPeriod.startDate ? `${data.billingPeriod.startDate} - ${data.billingPeriod.endDate}` : 'Unknown Period')
                    : data.billingPeriod) || 'Unknown Period',

                total_usage_kwh: (data.usagekWh || data.totalUsage || data.total_usage_kwh || data.baseUsage)?.toLocaleString() || '0',

                // TXU / Oncor specific: actual demand, billed demand, and power factor
                actual_demand_kw: (data.actualDemand || data.actualDemandKw || data.actual_demand || data.actual_demand_kw || data.meteredDemand || data.metered_demand || data.ncpDemand || data.peakDemand || 0).toLocaleString(),
                billed_demand_kw: (data.billedDemand || data.billedDemandKw || data.billed_demand || data.billed_demand_kw || data.billingDemand || data.peakDemand || data.actualDemand || 0).toLocaleString(),
                peak_demand: data.actualDemand || data.actualDemandKw || data.actual_demand || data.actual_demand_kw || data.meteredDemand || data.metered_demand || data.ncpDemand || data.peakDemand || data.billedDemand || 0,
                power_factor_pct: data.powerFactor || data.powerFactorPct || data.power_factor || data.power_factor_pct || data.powerFactorPercent,

                delivery_charges: data.deliveryChargeTotal || data.delivery_charge_total || data.totalDistributionCharges || data.total_distribution_charges || data.deliveryCharges || data.delivery_charges || data.distributionCharges || data.distribution_charges,
                energy_charges: data.energyChargeTotal || data.energy_charge_total || data.totalCommercialCharges || data.total_commercial_charges || data.energyCharges || data.energy_charges || data.supplyCharges || data.supply_charges,
                taxes_and_fees: data.taxesAndFees || data.taxes_and_fees || data.salesTax || data.sales_tax,
                total_amount_due: data.totalAmountDue || data.total_amount_due || data.currentCharges || data.current_charges || data.totalAmount || data.total_amount,

                contract_end_date: data.contractEndDate || data.contract_end_date,
                retail_plan_name: data.retailPlanName || data.retail_plan_name || data.product,
                energy_rate_per_kwh: data.energyRatePerKWh || data.energy_rate_per_kwh,
                delivery_rate_per_kwh: data.deliveryRatePerKWh || data.delivery_rate_per_kwh,
                demand_floor_kw: data.demandFloorKW || data.demandFloorKw || data.demand_floor_kw || data.ratchetFloorKW || data.ratchetFloorKw || data.ratchetDemand,

                // Attach analysis summary
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

    const handleEmailUnlock = async (email: string) => {
        setUserEmail(email)
        setView('report')

        // Fire-and-forget notification
        try {
            fetch('/api/email/analysis-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    analysisData: extractedData,
                    fileData: encodedFile?.base64, // Pass the raw file
                    fileName: encodedFile?.name
                })
            }).then(res => {
                if (!res.ok) console.warn('[Notification] Request failed:', res.status);
            }).catch(err => {
                console.error('[Notification] Network error:', err);
            });
        } catch (e) {
            console.error('[Notification] Error sending notification:', e);
        }
    }

    // Dynamic Footer Logic
    useEffect(() => {
        switch (view) {
            case 'trust': setFooterText('Review ready'); break;
            case 'upload': setFooterText('Waiting for upload'); break;
            case 'analyzing': setFooterText('Review in progress'); break;
            case 'preview': setFooterText('Delivery and demand reviewed'); break;
            case 'email': setFooterText('Verification required'); break;
            case 'report': setFooterText('Report ready'); break;
            case 'error': setFooterText('Review failed'); break;
        }
    }, [view])

    return (
        <div className="min-h-screen w-full bg-white text-zinc-900 selection:bg-[#002FA7] selection:text-white relative overflow-x-hidden font-sans flex flex-col">

            {/* Digital Paper Texture (Dot Grid) - FIXED */}
            <div className="fixed inset-0 z-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(#002FA7 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                opacity: 0.1
            }}></div>

            {/* Wordmark — top left brand anchor */}
            <a href="/" className="absolute top-4 left-4 md:top-6 md:left-8 z-50 flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity duration-300">
                <div className="bg-black/10 p-1.5 rounded-lg">
                    <img src="/images/nodalpoint.png" alt="Nodal Point" className="h-5 w-auto" />
                </div>
                <span className="font-bold text-sm tracking-tighter text-zinc-700 hidden sm:block">
                    Nodal <span className="text-[#002FA7]">Point</span>
                </span>
            </a>

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
                <PageReveal className="w-full flex flex-col items-center justify-center">
                    <AnimatePresence mode="wait">

                        {view === 'trust' && (
                            <TrustGate key="trust" onNext={() => setView('upload')} />
                        )}

                        {view === 'upload' && (
                            <div key="upload" className="w-full flex flex-col items-center">
                                <UploadZone
                                    onUpload={handleUpload}
                                    isAnalyzing={isProcessing}
                                    onShowTrust={() => setView('trust')}
                                />
                            </div>
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
                            <EmailGate key="email" onUnlock={handleEmailUnlock} />
                        )}

                        {view === 'report' && extractedData && (
                            <FullReport key="report" data={extractedData} email={userEmail} />
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
                                    Try again
                                    </button>
                                </motion.div>
                        )}

                    </AnimatePresence>
                </PageReveal>
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
