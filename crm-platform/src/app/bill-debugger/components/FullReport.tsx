import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Zap, Truck, Activity, Info, Calendar, AlertCircle, Warehouse } from 'lucide-react'
import { generateFeedback } from '../utils/feedbackLogic'
import { FeedbackBadge } from './FeedbackBadge'
import { BillReviewLens } from './BillReviewLens'
import { NextStepsCard } from './NextStepsCard'

interface ExtractedData {
    customer_name?: string
    provider_name: string
    billing_period: string
    total_usage_kwh: string
    actual_demand_kw?: string
    billed_demand_kw: string
    power_factor_pct?: string | number
    demand_floor_kw?: string | number
    delivery_charges?: string | number
    energy_charges?: string | number
    taxes_and_fees?: string | number
    total_amount_due?: string | number
    service_address?: string

    contract_end_date?: string
    retail_plan_name?: string
    peak_demand?: string | number
    energy_rate_per_kwh?: string | number
    delivery_rate_per_kwh?: string | number

    analysis?: {
        zone: string
        territory: string
        isFacilityLarge: boolean
        facilitySize: 'large' | 'small'
        allInRateCents: string
        demandPercentOfBill: string
        deliverySharePct?: string
        supplySharePct?: string
        taxesSharePct?: string
        actualDemandKW?: string
        billedDemandKW?: string
        powerFactorPct?: string
        demandGapKW?: string
        billSplit?: {
            supply: number
            delivery: number
            taxes: number
            total: number
        }
        demandProfile?: {
            actualDemandKW: number
            billedDemandKW: number
            powerFactorPct: number
            demandGapKW: number
        }
        feedback?: any
        marketContext?: any
    }
}

interface FullReportProps {
    data: ExtractedData
    email?: string
    redactedMode?: boolean
}

function parseCurrency(value: string | number | undefined) {
    if (value === undefined || value === null) return 0
    const num = parseFloat(String(value).replace(/[$,]/g, ''))
    return isNaN(num) ? 0 : num
}

function parseNumber(value: string | number | undefined) {
    if (value === undefined || value === null) return 0
    const num = parseFloat(String(value).replace(/[,%\s]/g, ''))
    return isNaN(num) ? 0 : num
}

function parsePercent(value: string | number | undefined) {
    const num = parseNumber(value)
    if (!num) return 0
    return num <= 1.5 ? num * 100 : num
}

function formatMoney(value: number) {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatCents(value: number) {
    return `${(value * 100).toFixed(2)}¢/kWh`
}

export function FullReport({ data, email, redactedMode = false }: FullReportProps) {
    const usage = parseNumber(data.total_usage_kwh)
    const actualDemand = Math.max(
        parseNumber(data.actual_demand_kw),
        parseNumber(data.analysis?.actualDemandKW),
        parseNumber(data.peak_demand)
    )
    const billedDemand = Math.max(
        parseNumber(data.billed_demand_kw),
        parseNumber(data.analysis?.billedDemandKW),
        parseNumber(data.demand_floor_kw),
        actualDemand
    )
    const powerFactor = parsePercent(data.power_factor_pct ?? data.analysis?.powerFactorPct)
    const printedSupplyRate = parseNumber(data.energy_rate_per_kwh)

    const totalBill = parseCurrency(data.total_amount_due)
    const allInRate = totalBill > 0 && usage > 0 ? totalBill / usage : 0
    const energyCharges = parseCurrency(data.energy_charges ?? data.analysis?.billSplit?.supply)
    const deliveryCharges = parseCurrency(data.delivery_charges ?? data.analysis?.billSplit?.delivery)
    const taxesCharges = parseCurrency(data.taxes_and_fees ?? data.analysis?.billSplit?.taxes)
    const structureTotal = energyCharges + deliveryCharges + taxesCharges

    const supplyShare = structureTotal > 0 ? (energyCharges / structureTotal) * 100 : parsePercent(data.analysis?.supplySharePct)
    const deliveryShare = structureTotal > 0 ? (deliveryCharges / structureTotal) * 100 : parsePercent(data.analysis?.deliverySharePct)
    const taxesShare = structureTotal > 0 ? (taxesCharges / structureTotal) * 100 : parsePercent(data.analysis?.taxesSharePct)

    const totalDemandGap = billedDemand > actualDemand ? billedDemand - actualDemand : 0

    const feedback = useMemo(() => {
        if (data.analysis?.feedback) return data.analysis.feedback

        return generateFeedback({
            allInRate: totalBill > 0 && usage > 0 ? totalBill / usage : 0,
            energyComponent: energyCharges > 0 && usage > 0 ? energyCharges / usage : 0,
            deliveryComponent: deliveryCharges > 0 && usage > 0 ? deliveryCharges / usage : 0,
            peakDemandKW: actualDemand || billedDemand,
            actualDemandKW: actualDemand || undefined,
            billedDemandKW: billedDemand || undefined,
            powerFactorPct: powerFactor || undefined,
            deliverySharePct: deliveryShare || undefined,
            supplySharePct: supplyShare || undefined,
            totalUsage: usage,
            totalBill,
            billingPeriod: data.billing_period,
            provider: data.provider_name,
            productType: data.retail_plan_name,
            contractEndDate: data.contract_end_date
        }, "Oncor")
    }, [actualDemand, billedDemand, data.analysis?.feedback, data.billing_period, data.contract_end_date, data.provider_name, data.retail_plan_name, deliveryCharges, deliveryShare, energyCharges, powerFactor, supplyShare, totalBill, usage])

    const invoiceRateText = allInRate > 0 ? formatCents(allInRate) : 'N/A'
    const summaryText = printedSupplyRate > 0
        ? `The bill prints ${formatCents(printedSupplyRate)} on the supply line, but the invoice lands at ${invoiceRateText} once delivery and taxes are included.`
        : (redactedMode
            ? 'The bill is being driven by delivery and demand, not just the supply rate.'
            : (feedback.description || 'The bill is being driven by delivery and demand, not just the supply rate.'))
    const siteLabel = redactedMode ? 'Redacted facility' : 'Logistics warehouse'
    const providerLabel = redactedMode ? 'Redacted provider' : data.provider_name
    const utilityName = redactedMode ? 'the utility' : 'Oncor'
    const powerFactorLine = redactedMode
        ? 'Below the utility adjustment line.'
        : 'Below Oncor’s 95% adjustment line.'

    return (
        <div className="w-full max-w-6xl mx-auto px-4 pb-20">
            <motion.div
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className="mb-12"
            >
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    <div className="flex-1">
                        <FeedbackBadge
                            status={feedback.status}
                            title={feedback.title}
                            isLarge={feedback.facilitySize === 'large'}
                        />

                        <div className="mt-5 flex items-center gap-2 text-[10px] md:text-xs font-mono tracking-widest text-[#002FA7] uppercase opacity-80">
                            <Warehouse className="w-4 h-4" />
                            <span>{siteLabel}</span>
                        </div>

                        <h1 className="text-3xl md:text-5xl font-light text-zinc-900 mt-4 mb-4">
                            Review complete
                        </h1>

                        <p className="text-zinc-600 max-w-3xl text-lg leading-relaxed mb-6">
                            {summaryText}
                        </p>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 bg-zinc-100 rounded-full px-4 py-1.5 text-sm text-zinc-600 border border-zinc-200">
                            <span className="font-medium text-zinc-900">{providerLabel}</span>
                                <span>•</span>
                                <span>{data.billing_period}</span>
                            </div>
                            {data.contract_end_date ? (
                                <div className="inline-flex items-center gap-2 bg-amber-50 rounded-full px-4 py-1.5 text-sm text-amber-700 border border-amber-100">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span className="font-medium uppercase tracking-tighter">Contract ends {data.contract_end_date}</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-2 bg-zinc-50 rounded-full px-4 py-1.5 text-sm text-zinc-400 border border-zinc-100">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="font-medium uppercase tracking-tighter">Contract date not found</span>
                                </div>
                            )}
                            <div className="inline-flex items-center gap-2 bg-blue-50 rounded-full px-4 py-1.5 text-sm text-blue-700 border border-blue-100">
                                <span className="font-medium uppercase tracking-tighter">{formatMoney(totalBill)} total</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full lg:w-[360px]">
                        <div className="glass-card p-6 md:p-7 h-full">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-1">Demand snapshot</div>
                                    <div className="text-lg font-semibold text-zinc-900">Peak and billing demand</div>
                                </div>
                                <Activity className="w-5 h-5 text-[#002FA7]" />
                            </div>

                            <div className="text-4xl font-semibold text-zinc-900 tracking-tight mb-2">
                                {actualDemand > 0 ? `${actualDemand.toLocaleString()} kW` : 'N/A'}
                            </div>
                            <div className="text-sm text-zinc-500 mb-5">
                                Actual peak demand. The bill is using {billedDemand > 0 ? `${billedDemand.toLocaleString()} kW` : 'a higher demand figure'} for delivery math.
                            </div>

                            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 mb-4">
                                <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono mb-1">Power factor</div>
                                <div className="text-2xl font-mono font-semibold text-zinc-900">
                                    {powerFactor > 0 ? `${powerFactor.toFixed(1)}%` : 'Not shown'}
                                </div>
                                <div className="text-xs text-zinc-500 mt-2">
                                    {powerFactor > 0 ? powerFactorLine : 'No PF figure was visible on the bill.'}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4">
                                <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono mb-1">Billing gap</div>
                                <div className="text-2xl font-mono font-semibold text-zinc-900">
                                    {totalDemandGap > 0 ? `${totalDemandGap.toLocaleString()} kW` : 'N/A'}
                                </div>
                                <div className="text-xs text-zinc-500 mt-2">
                                    {totalDemandGap > 0
                                        ? 'That gap is why the delivery side can stay higher than the current month suggests.'
                                        : 'No demand gap was visible in the extracted data.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <div className="mb-10">
                <BillReviewLens
                    usageKwh={usage}
                    totalBill={totalBill}
                    printedSupplyRate={printedSupplyRate}
                    supplyAmount={energyCharges}
                    deliveryAmount={deliveryCharges}
                    taxesAmount={taxesCharges}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10 text-left">
                <motion.div
                    initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ delay: 0.08 }}
                    className="glass-card p-8 flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400">Supply</h3>
                            <Zap className="w-5 h-5 text-[#002FA7]" />
                        </div>
                        <div className="text-4xl font-semibold text-zinc-900 mb-2">
                            {formatMoney(energyCharges)}
                        </div>
                        <div className="text-sm text-zinc-500">
                            Supply-side subtotal for the month.
                        </div>
                    </div>

                    <div className="border-t border-zinc-100 pt-4 mt-8">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">Printed rate</span>
                            <span className="text-zinc-900 font-mono font-medium">
                                {printedSupplyRate > 0 ? formatCents(printedSupplyRate) : 'Not shown'}
                            </span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-2">
                            This is the bill line rate, not the full invoice rate.
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ delay: 0.16 }}
                    className="glass-card p-8 flex flex-col justify-between"
                >
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-400">Delivery</h3>
                            <Truck className="w-5 h-5 text-[#002FA7]" />
                        </div>
                        <div className="text-4xl font-semibold text-zinc-900 mb-2">
                            {formatMoney(deliveryCharges)}
                        </div>
                        <div className="text-sm text-zinc-500">
                            Utility delivery and demand-related charges.
                        </div>
                    </div>

                    <div className="border-t border-zinc-100 pt-4 mt-8">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">Share of bill</span>
                            <span className="text-zinc-900 font-mono font-medium">
                                {deliveryShare.toFixed(1)}%
                            </span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-2">
                            Delivery is roughly equal to supply in the extracted sections, so the utility side is doing a lot of the damage.
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ delay: 0.24 }}
                    className="glass-card p-8 shadow-xl shadow-[#002FA7]/5 flex flex-col justify-between relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#002FA7]/10 blur-3xl rounded-full pointer-events-none z-0" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-mono uppercase tracking-widest text-[#002FA7]">Demand</h3>
                            <Activity className="w-5 h-5 text-[#002FA7]" />
                        </div>
                        <div className="text-4xl font-semibold text-zinc-900 mb-2">
                            {actualDemand > 0 ? `${actualDemand.toLocaleString()} kW` : 'N/A'}
                        </div>
                        <div className="text-sm text-zinc-500">
                            {billedDemand > 0
                                ? `Billed at ${billedDemand.toLocaleString()} kW with ${powerFactor > 0 ? `${powerFactor.toFixed(1)}% PF` : 'no PF shown'}`
                                : 'Billing demand not clearly extracted'}
                        </div>
                    </div>

                    <div className="border-t border-zinc-100 pt-4 mt-8 relative z-10">
                        <div className="flex justify-between items-center text-sm mb-2">
                            <span className="text-zinc-500">Demand gap</span>
                            <span className="text-[#002FA7] font-mono font-semibold">
                                {totalDemandGap > 0 ? `${totalDemandGap.toLocaleString()} kW` : 'N/A'}
                            </span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-2 flex gap-2 items-start">
                            <Info className="w-3 h-3 mt-0.5 shrink-0 text-zinc-300" />
                            <span>
                                {redactedMode
                                    ? 'The utility can adjust billing demand when power factor falls below 95%, and it can still hold the bill up after a higher historical peak.'
                                    : 'Oncor can adjust billing demand when power factor falls below 95%, and the utility can still hold the bill up after a higher historical peak.'}
                            </span>
                        </div>
                    </div>
                </motion.div>
            </div>

            <motion.div
                initial={{ opacity: 0, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mb-20 glass-card p-10 shadow-xl"
            >
                <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
                    What the bill is telling us
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        'Supply is fixed-price and predictable, so it is not the first problem to solve.',
                        `Delivery is ${deliveryShare.toFixed(1)}% of the extracted sections, which means the utility side is doing most of the damage.`,
                        totalDemandGap > 0
                            ? `Billing demand is still above the current peak by ${totalDemandGap.toLocaleString()} kW.`
                            : 'The extracted bill did not show a clear billing gap, so the demand floor needs a second look.',
                        powerFactor > 0
                            ? `Power factor is ${powerFactor.toFixed(1)}%, which is below ${utilityName}’s 95% adjustment line.`
                            : 'The bill did not show a power factor figure, so that lever still needs verification.'
                    ].map((item, i) => (
                        <div key={i} className="flex items-start gap-4 p-5 bg-white/50 backdrop-blur-sm rounded-2xl border border-zinc-200">
                            <div className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-[#002FA7]" />
                            <p className="text-zinc-700 text-sm md:text-base leading-snug">{item}</p>
                        </div>
                    ))}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mb-20 glass-card p-10 shadow-xl"
            >
                <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
                    Recommended next steps
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {feedback.actionItems.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-4 p-5 bg-white/50 backdrop-blur-sm rounded-2xl border border-zinc-200 hover:border-[#002FA7]/30 transition-all">
                            <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${feedback.status === 'green' ? 'bg-emerald-500' : feedback.status === 'yellow' ? 'bg-amber-500' : 'bg-red-500'}`} />
                            <p className="text-zinc-700 text-sm md:text-base leading-snug">{item}</p>
                        </div>
                    ))}
                </div>
            </motion.div>

            <NextStepsCard email={email} />
        </div>
    )
}
