'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AlertOctagon } from 'lucide-react'
import { PageHero } from '@/components/landing/PageHero'
import { Reveal } from '@/components/landing/Reveal'
import { buttonPrimary, focusOnLight, TextLink } from '@/components/landing/ui'

// Modular Components
import { EASE, StepBand } from './components/StepBand'
import { TrustGate } from './components/TrustGate'
import { UploadZone } from './components/UploadZone'
import { AnalysisStream } from './components/AnalysisStream'
import { ResultsPreview } from './components/ResultsPreview'
import { EmailGate } from './components/EmailGate'
import { FullReport } from './components/FullReport'
import { isExampleBillFileName, redactBillIdentity } from './utils/redaction'

type ExtractedData = {
    customer_name: string
    provider_name: string
    billing_period: string
    total_usage_kwh: string
    actual_demand_kw?: string
    billed_demand_kw: string
    power_factor_pct?: string
    account_number?: string
    delivery_charges?: string | number
    energy_charges?: string | number
    taxes_and_fees?: string | number
    total_amount_due?: string | number
    service_address?: string
    esid?: string

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

const REVIEW_COVERS = [
    {
        title: 'What you really paid per kWh',
        body: 'Your bill total divided by your usage, next to the supply rate printed on the bill.',
    },
    {
        title: 'Where the money went',
        body: 'The bill split into supply, delivery (the utility that brings power to you), and taxes and fees.',
    },
    {
        title: 'Demand charges',
        body: 'Charges based on your highest usage. We show the peak you hit and the peak you were billed on.',
    },
    {
        title: 'Contract end date',
        body: 'If the bill shows when your contract ends, we point it out so renewal does not catch you off guard.',
    },
]

/** Cross-fade with a small blur between steps. */
function Step({ children }: { children: React.ReactNode }) {
    const reduceMotion = useReducedMotion()
    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: reduceMotion ? 0.01 : 0.3, ease: EASE }}
        >
            {children}
        </motion.div>
    )
}

export default function BillDebuggerPage() {
    const [view, setView] = useState<ViewState>('upload')
    const [footerText, setFooterText] = useState('Waiting for upload')
    const [isProcessing, setIsProcessing] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [isDemoBill, setIsDemoBill] = useState(false)

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
            const demoBill = isExampleBillFileName(file.name)
            setIsDemoBill(demoBill)

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
                account_number: data.accountNumber || data.account_number,
                esid: data.esid || data.esiId || data.esi_id,
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

        if (isDemoBill) {
            return
        }

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

    const displayData = useMemo(
        () => (extractedData ? redactBillIdentity(extractedData, isDemoBill) : null),
        [extractedData, isDemoBill]
    )

    // Status line, read out by screen readers when the step changes
    useEffect(() => {
        switch (view) {
            case 'trust': setFooterText('How we handle your bill'); break;
            case 'upload': setFooterText('Waiting for upload'); break;
            case 'analyzing': setFooterText('Review in progress'); break;
            case 'preview': setFooterText('Review complete. Summary shown.'); break;
            case 'email': setFooterText('Enter your work email to get the full report'); break;
            case 'report': setFooterText('Full report ready'); break;
            case 'error': setFooterText('Review failed'); break;
        }
    }, [view])

    // Each step starts at the top of the page
    const isFirstView = useRef(true)
    useEffect(() => {
        if (isFirstView.current) {
            isFirstView.current = false
            return
        }
        window.scrollTo(0, 0)
    }, [view])


    return (
        <>
            <p role="status" aria-live="polite" className="sr-only">
                {footerText}
            </p>

            <AnimatePresence mode="wait" initial={false}>

                {view === 'trust' && (
                    <Step key="trust">
                        <TrustGate onNext={() => setView('upload')} />
                    </Step>
                )}

                {view === 'upload' && (
                    <Step key="upload">
                        <PageHero
                            title="Review my bill"
                            lead="Upload a recent electricity bill. Usually in under 60 seconds, you get a plain-English breakdown of what you paid and where the cost comes from."
                            aside={
                                <UploadZone
                                    onUpload={handleUpload}
                                    isAnalyzing={isProcessing}
                                    onShowTrust={() => setView('trust')}
                                />
                            }
                        >
                            <p className="max-w-xl text-base leading-7 text-zinc-400">
                                We only read the bill. We do not contact your supplier or change your account.
                            </p>
                        </PageHero>

                        <section className="bg-white px-6 py-20 lg:px-10 lg:py-28">
                            <div className="mx-auto max-w-7xl">
                                <Reveal>
                                    <h2 className="np-display max-w-2xl text-4xl text-zinc-950 md:text-[3.25rem]">
                                        What the review covers
                                    </h2>
                                    <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600">
                                        One bill is enough. We pull out the numbers that decide what you pay
                                        and explain each one in plain English.
                                    </p>
                                </Reveal>
                                <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                                    {REVIEW_COVERS.map((item, index) => (
                                        <li key={item.title}>
                                            <Reveal delay={index * 0.07} className="border-t-2 border-zinc-950 pt-5">
                                                <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{item.title}</h3>
                                                <p className="mt-2 text-base leading-7 text-zinc-600">{item.body}</p>
                                            </Reveal>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>
                    </Step>
                )}

                {view === 'analyzing' && (
                    <Step key="analyzing">
                        <AnalysisStream onComplete={() => {
                            if (errorMsg) {
                                setView('error')
                            } else if (extractedData) {
                                setView('preview')
                            } else {
                                if (!isProcessing) setView('error')
                            }
                        }} />
                    </Step>
                )}

                {view === 'preview' && displayData && (
                    <Step key="preview">
                        <ResultsPreview
                            data={displayData}
                            redactedMode={isDemoBill}
                            onUnlock={() => setView('email')}
                        />
                    </Step>
                )}

                {view === 'email' && (
                    <Step key="email">
                        <EmailGate onUnlock={handleEmailUnlock} />
                    </Step>
                )}

                {view === 'report' && displayData && (
                    <Step key="report">
                        <FullReport data={displayData} email={userEmail} redactedMode={isDemoBill} />
                    </Step>
                )}

                {view === 'error' && (
                    <Step key="error">
                        <StepBand
                            title="We could not review that file"
                            lead="Something went wrong while reading your bill. Try again with a clear PDF or photo of one bill."
                        />
                        <section className="min-h-[50vh] bg-white px-6 py-12 lg:px-10 lg:py-16">
                            <div className="mx-auto max-w-7xl">
                                <div className="max-w-3xl">
                                    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-6">
                                        <AlertOctagon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                                        <div className="min-w-0">
                                            <p className="text-base font-semibold text-zinc-950">What went wrong</p>
                                            <p className="mt-1 break-words text-base leading-7 text-zinc-700">
                                                {errorMsg || 'An unexpected error happened while we were reading the bill.'}
                                            </p>
                                        </div>
                                    </div>

                                    <p className="mt-6 text-base leading-7 text-zinc-600">
                                        Use a PDF, PNG, JPG or HEIC file up to 10 MB, and make sure the
                                        whole bill is readable. If it keeps failing, send us a message and
                                        we will help.
                                    </p>

                                    <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setView('upload')
                                                setErrorMsg('')
                                                setExtractedData(null)
                                            }}
                                            className={`${buttonPrimary} ${focusOnLight}`}
                                        >
                                            Try another file
                                        </button>
                                        <TextLink href="/contact">Contact us</TextLink>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </Step>
                )}

            </AnimatePresence>
        </>
    )
}