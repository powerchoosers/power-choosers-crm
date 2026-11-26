import React, { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Reveal } from '@/components/landing/Reveal'
import { generateFeedback } from '../utils/feedbackLogic'
import { FeedbackBadge } from './FeedbackBadge'
import { BillReviewLens } from './BillReviewLens'
import { NextStepsCard } from './NextStepsCard'
import { EASE, StepBand } from './StepBand'

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

const panel = 'rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8'
const figure = 'text-3xl font-semibold tracking-[-0.02em] text-zinc-950 tabular-nums'

export function FullReport({ data, email, redactedMode = false }: FullReportProps) {
    const reduceMotion = useReducedMotion()
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

    const invoiceRateText = allInRate > 0 ? formatCents(allInRate) : 'an unknown rate'
    const summaryText = printedSupplyRate > 0
        ? `The bill prints ${formatCents(printedSupplyRate)} on the supply line, but the invoice lands at ${invoiceRateText} once delivery and taxes are included.`
        : (redactedMode
            ? 'The bill is being driven by delivery and demand, not just the supply rate.'
            : (feedback.description || 'The bill is being driven by delivery and demand, not just the supply rate.'))
    const providerLabel = redactedMode ? 'Hidden on this example' : data.provider_name
    const utilityName = redactedMode ? 'The utility' : 'Oncor'
    const powerFactorRule = `${utilityName} can raise the demand it bills when power factor falls below 95%.`

    const facts = [
        { label: 'Supplier', value: providerLabel },
        { label: 'Billing period', value: data.billing_period },
        { label: 'Contract ends', value: data.contract_end_date || 'Not found on this bill' },
    ]

    const findings = [
        `Supply, the electricity itself, is ${supplyShare.toFixed(1)}% of the charges we could read.`,
        `Delivery, the utility's charge for bringing power to your site, is ${deliveryShare.toFixed(1)}% of the charges we could read.`,
        totalDemandGap > 0
            ? `The demand you are billed on is ${totalDemandGap.toLocaleString()} kW above this month's actual peak.`
            : 'We did not see a gap between your actual peak and the demand you are billed on. Any minimum demand level is worth a second look.',
        powerFactor > 0
            ? `Power factor is ${powerFactor.toFixed(1)}%. ${powerFactorRule}`
            : 'The bill did not show a power factor figure, so that still needs checking.',
    ]

    const enter = (index: number) =>
        reduceMotion
            ? {}
            : {
                initial: { opacity: 0, y: 10, filter: 'blur(4px)' },
                animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
                transition: { duration: 0.4, delay: 0.1 + index * 0.07, ease: EASE },
            }

    return (
        <>
            <StepBand title="Your bill review" lead={summaryText} />

            {/* Verdict, total and demand */}
            <section className="bg-white px-6 py-12 lg:px-10 lg:py-16">
                <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
                    <div>
                        <motion.div {...enter(0)}>
                            <FeedbackBadge
                                status={feedback.status}
                                title={feedback.title}
                                isLarge={feedback.facilitySize === 'large'}
                            />
                        </motion.div>

                        <motion.div {...enter(1)} className="mt-6">
                            <p className="text-sm font-medium text-zinc-950">Total on this bill</p>
                            <p className="np-display mt-2 text-5xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums] sm:text-6xl">
                                {formatMoney(totalBill)}
                            </p>
                        </motion.div>

                        <motion.dl {...enter(2)} className="mt-8 border-t border-zinc-200">
                            {facts.map((fact) => (
                                <div
                                    key={fact.label}
                                    className="grid gap-1 border-b border-zinc-200 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8"
                                >
                                    <dt className="text-sm font-medium text-zinc-950">{fact.label}</dt>
                                    <dd className="text-base text-zinc-600 tabular-nums">{fact.value}</dd>
                                </div>
                            ))}
                        </motion.dl>

                        {redactedMode ? (
                            <p className="mt-5 text-sm text-zinc-500">
                                This is an example bill. Names, addresses and account numbers are hidden.
                            </p>
                        ) : null}
                    </div>

                    <motion.div {...enter(3)} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
                        <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Peak demand</h2>
                        <p className="mt-1 text-sm leading-6 text-zinc-500">
                            Demand is your highest rate of use in the month, measured in kW. Part of the
                            delivery charge is based on it.
                        </p>

                        <p className="mt-6 text-4xl font-semibold tracking-[-0.02em] text-zinc-950 tabular-nums">
                            {actualDemand > 0 ? `${actualDemand.toLocaleString()} kW` : 'Not available'}
                        </p>
                        <p className="mt-2 text-base leading-7 text-zinc-600">
                            Your actual peak. The bill uses {billedDemand > 0 ? `${billedDemand.toLocaleString()} kW` : 'a higher demand figure'} to work out delivery charges.
                        </p>

                        <dl className="mt-6 border-t border-zinc-200">
                            <div className="border-b border-zinc-200 py-4">
                                <div className="flex items-baseline justify-between gap-4">
                                    <dt className="text-sm font-medium text-zinc-950">Power factor</dt>
                                    <dd className="text-lg font-semibold text-zinc-950 tabular-nums">
                                        {powerFactor > 0 ? `${powerFactor.toFixed(1)}%` : 'Not shown'}
                                    </dd>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-zinc-500">
                                    {powerFactor > 0
                                        ? `How efficiently your site uses the power it draws. ${powerFactorRule}`
                                        : 'No power factor figure was visible on the bill.'}
                                </p>
                            </div>
                            <div className="pt-4">
                                <div className="flex items-baseline justify-between gap-4">
                                    <dt className="text-sm font-medium text-zinc-950">Gap between actual and billed demand</dt>
                                    <dd className="shrink-0 text-lg font-semibold text-zinc-950 tabular-nums">
                                        {totalDemandGap > 0 ? `${totalDemandGap.toLocaleString()} kW` : 'None found'}
                                    </dd>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-zinc-500">
                                    {totalDemandGap > 0
                                        ? 'That gap is why delivery charges can stay higher than this month’s usage suggests.'
                                        : 'No demand gap was visible in the figures we could read.'}
                                </p>
                            </div>
                        </dl>
                    </motion.div>
                </div>
            </section>

            {/* Breakdown */}
            <section className="bg-zinc-100 px-6 py-16 lg:px-10 lg:py-24">
                <div className="mx-auto max-w-7xl">
                    <Reveal>
                        <h2 className="np-display max-w-2xl text-4xl text-zinc-950 md:text-[3.25rem]">Where the bill comes from</h2>
                    </Reveal>

                    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
                        <Reveal>
                            <BillReviewLens
                                usageKwh={usage}
                                totalBill={totalBill}
                                printedSupplyRate={printedSupplyRate}
                                supplyAmount={energyCharges}
                                deliveryAmount={deliveryCharges}
                                taxesAmount={taxesCharges}
                            />
                        </Reveal>

                        <div className="grid gap-6">
                            <Reveal delay={0.07} className={panel}>
                                <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Supply</h3>
                                <p className="mt-1 text-sm text-zinc-500">The electricity itself, for the month.</p>
                                <p className={`mt-4 ${figure}`}>{formatMoney(energyCharges)}</p>
                                <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-zinc-200 pt-4 text-sm">
                                    <span className="text-zinc-600">Rate printed on the bill</span>
                                    <span className="font-semibold text-zinc-950 tabular-nums">
                                        {printedSupplyRate > 0 ? formatCents(printedSupplyRate) : 'Not shown'}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">
                                    This rate covers supply only. It is not what you paid per kWh overall.
                                </p>
                            </Reveal>

                            <Reveal delay={0.14} className={panel}>
                                <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Delivery</h3>
                                <p className="mt-1 text-sm text-zinc-500">
                                    Charges from the utility that delivers your power, including charges tied to demand.
                                </p>
                                <p className={`mt-4 ${figure}`}>{formatMoney(deliveryCharges)}</p>
                                <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-zinc-200 pt-4 text-sm">
                                    <span className="text-zinc-600">Share of the bill</span>
                                    <span className="font-semibold text-zinc-950 tabular-nums">{deliveryShare.toFixed(1)}%</span>
                                </div>
                            </Reveal>

                            <Reveal delay={0.21} className={panel}>
                                <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">Demand</h3>
                                <p className="mt-1 text-sm text-zinc-500 tabular-nums">
                                    {billedDemand > 0
                                        ? `Billed on ${billedDemand.toLocaleString()} kW, with ${powerFactor > 0 ? `a power factor of ${powerFactor.toFixed(1)}%` : 'no power factor shown'}.`
                                        : 'We could not clearly read the billed demand.'}
                                </p>
                                <p className={`mt-4 ${figure}`}>
                                    {actualDemand > 0 ? `${actualDemand.toLocaleString()} kW` : 'Not available'}
                                </p>
                                <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-zinc-200 pt-4 text-sm">
                                    <span className="text-zinc-600">Gap between actual and billed</span>
                                    <span className="font-semibold text-[#002FA7] tabular-nums">
                                        {totalDemandGap > 0 ? `${totalDemandGap.toLocaleString()} kW` : 'None found'}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">
                                    {powerFactorRule} It can also keep billing on an earlier, higher peak.
                                </p>
                            </Reveal>
                        </div>
                    </div>
                </div>
            </section>

            {/* Findings and next steps */}
            <section className="bg-white px-6 py-16 lg:px-10 lg:py-24">
                <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-2 lg:gap-20">
                    <Reveal>
                        <h2 className="np-display text-3xl text-zinc-950 md:text-4xl">What the bill is telling us</h2>
                        <ul className="mt-8 border-t border-zinc-200">
                            {findings.map((item, i) => (
                                <li key={i} className="border-b border-zinc-200 py-4 text-base leading-7 text-zinc-600 tabular-nums">
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </Reveal>

                    <Reveal delay={0.08}>
                        <h2 className="np-display text-3xl text-zinc-950 md:text-4xl">Recommended next steps</h2>
                        <ol className="mt-8 border-t border-zinc-200">
                            {feedback.actionItems.map((item: string, i: number) => (
                                <li
                                    key={i}
                                    className="flex gap-4 border-b border-zinc-200 py-4 transition-[padding] duration-300 ease-out hover:pl-2"
                                >
                                    <span className="w-5 shrink-0 text-base font-semibold leading-7 text-[#002FA7] tabular-nums">{i + 1}</span>
                                    <span className="text-base leading-7 text-zinc-950">{item}</span>
                                </li>
                            ))}
                        </ol>
                    </Reveal>
                </div>
            </section>

            <NextStepsCard email={email} />
        </>
    )
}
