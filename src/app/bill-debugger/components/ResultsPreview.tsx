import { motion, useReducedMotion } from 'framer-motion'
import { buttonPrimary, focusOnLight, NudgeArrow } from '@/components/landing/ui'
import { BillReviewLens } from './BillReviewLens'
import { FeedbackBadge } from './FeedbackBadge'
import { EASE, StepBand } from './StepBand'

interface ExtractedData {
    customer_name?: string
    billing_period: string
    total_usage_kwh: string
    peak_demand?: string | number
    billed_demand_kw: string
    actual_demand_kw?: string
    power_factor_pct?: string | number
    energy_rate_per_kwh?: string | number
    energy_charges?: string | number
    delivery_charges?: string | number
    taxes_and_fees?: string | number
    total_amount_due?: string | number
    demand_floor_kw?: string | number
    analysis?: {
        facilitySize: 'large' | 'small'
        feedback: any
        billSplit?: {
            supply: number
            delivery: number
            taxes: number
            total: number
        }
        deliverySharePct?: string
        supplySharePct?: string
        taxesSharePct?: string
        actualDemandKW?: string
        billedDemandKW?: string
        powerFactorPct?: string
    }
}

interface ResultsPreviewProps {
    data: ExtractedData
    redactedMode?: boolean
    onUnlock: () => void
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

export function ResultsPreview({ data, redactedMode = false, onUnlock }: ResultsPreviewProps) {
    const reduceMotion = useReducedMotion()
    const feedback = data.analysis?.feedback
    const billTotal = parseCurrency(data.total_amount_due)
    const usageKwh = parseNumber(data.total_usage_kwh)
    const allInRate = billTotal > 0 && usageKwh > 0 ? billTotal / usageKwh : 0
    const printedSupplyRate = parseNumber(data.energy_rate_per_kwh)
    const invoiceRateText = allInRate > 0 ? formatCents(allInRate) : 'an unknown rate'
    const supplyCost = parseCurrency(data.energy_charges ?? data.analysis?.billSplit?.supply)
    const deliveryCost = parseCurrency(data.delivery_charges ?? data.analysis?.billSplit?.delivery)
    const taxesCost = parseCurrency(data.taxes_and_fees ?? data.analysis?.billSplit?.taxes)
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

    const snapshotFields = [
        {
            id: 'demand',
            label: 'Demand',
            hint: 'Your highest rate of use in the month. Part of the bill is based on it.',
            value: actualDemand > 0
                ? `${actualDemand.toLocaleString()} kW actual, ${billedDemand.toLocaleString()} kW billed`
                : 'No demand figure found',
            context: powerFactor > 0 ? `Power factor ${powerFactor.toFixed(1)}%` : 'Power factor not shown',
        },
        {
            id: 'usage',
            label: 'Total usage',
            hint: 'Electricity used during the billing period.',
            value: `${data.total_usage_kwh} kWh`,
            context: '',
        },
        {
            id: 'period',
            label: 'Billing period',
            hint: 'Service dates on the bill.',
            value: data.billing_period,
            context: '',
        },
    ]

    const summaryCopy = printedSupplyRate > 0
        ? `The bill prints ${formatCents(printedSupplyRate)} on the supply line, but the invoice lands at ${invoiceRateText} once delivery and taxes are included.`
        : (redactedMode
            ? 'The bill is split into supply, delivery, and demand so the main cost driver is easy to see.'
            : (feedback?.description || 'We split the bill into supply, delivery, and demand so the main cost driver is easy to see.'))
    const badgeTitle = feedback?.title || 'Review complete'

    const item = (index: number) =>
        reduceMotion
            ? {}
            : {
                initial: { opacity: 0, y: 10, filter: 'blur(4px)' },
                animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
                transition: { duration: 0.4, delay: 0.1 + index * 0.07, ease: EASE },
            }

    return (
        <>
            <StepBand title="Here is what we found" lead={summaryCopy} />

            <section className="bg-white px-6 py-12 lg:px-10 lg:py-16">
                <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
                    <div>
                        {feedback && (
                            <motion.div {...item(0)} className="mb-6">
                                <FeedbackBadge
                                    status={feedback.status}
                                    title={badgeTitle}
                                    isLarge={feedback.facilitySize === 'large'}
                                />
                            </motion.div>
                        )}

                        <motion.div {...item(1)}>
                            <p className="text-sm font-medium text-zinc-950">Current charges on this bill</p>
                            <p className="np-display mt-2 text-5xl text-zinc-950 [font-variant-numeric:lining-nums_tabular-nums] sm:text-6xl">
                                {billTotal ? formatMoney(billTotal) : 'Not found'}
                            </p>
                        </motion.div>

                        <dl className="mt-8 border-t border-zinc-200">
                            {snapshotFields.map((field, i) => (
                                <motion.div
                                    key={field.id}
                                    {...item(i + 2)}
                                    className="border-b border-zinc-200 py-4"
                                >
                                    <dt className="text-sm font-medium text-zinc-950">{field.label}</dt>
                                    <dd className="mt-1">
                                        <span className="block text-lg font-semibold tracking-[-0.01em] text-zinc-950 tabular-nums">
                                            {field.value}
                                        </span>
                                        {field.context ? (
                                            <span className="mt-0.5 block text-sm font-medium text-zinc-600 tabular-nums">{field.context}</span>
                                        ) : null}
                                        <span className="mt-0.5 block text-sm text-zinc-500">{field.hint}</span>
                                    </dd>
                                </motion.div>
                            ))}
                        </dl>

                        {redactedMode ? (
                            <p className="mt-5 text-sm text-zinc-500">
                                This is an example bill. Names, addresses and account numbers are hidden.
                            </p>
                        ) : null}

                        <motion.div {...item(5)} className="mt-8">
                            <button type="button" onClick={onUnlock} className={`${buttonPrimary} ${focusOnLight} w-full sm:w-auto`}>
                                Get the full report
                                <NudgeArrow />
                            </button>
                            <p className="mt-4 max-w-md text-sm leading-6 text-zinc-500">
                                The full report keeps the bill split and next steps in one place. We ask
                                for your work email so we can send it to you.
                            </p>
                        </motion.div>
                    </div>

                    <motion.div {...item(2)}>
                        <BillReviewLens
                            usageKwh={usageKwh}
                            totalBill={billTotal}
                            printedSupplyRate={printedSupplyRate}
                            supplyAmount={supplyCost}
                            deliveryAmount={deliveryCost}
                            taxesAmount={taxesCost}
                        />
                    </motion.div>
                </div>
            </section>
        </>
    )
}
