import { motion } from 'framer-motion'
import { Calendar, Zap, Activity, ReceiptText, ArrowRight, ShieldCheck } from 'lucide-react'
import { BillReviewLens } from './BillReviewLens'
import { FeedbackBadge } from './FeedbackBadge'

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
    const feedback = data.analysis?.feedback
    const billTotal = parseCurrency(data.total_amount_due)
    const usageKwh = parseNumber(data.total_usage_kwh)
    const allInRate = billTotal > 0 && usageKwh > 0 ? billTotal / usageKwh : 0
    const printedSupplyRate = parseNumber(data.energy_rate_per_kwh)
    const invoiceRateText = allInRate > 0 ? formatCents(allInRate) : 'N/A'
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
            id: 'charges',
            label: 'CURRENT CHARGES',
            value: billTotal ? formatMoney(billTotal) : 'Not found',
            icon: ReceiptText,
            context: 'This invoice',
            isText: false
        },
        {
            id: 'demand',
            label: 'DEMAND PROFILE',
            value: actualDemand > 0
                ? `${actualDemand.toLocaleString()} kW actual / ${billedDemand.toLocaleString()} kW billed`
                : 'Demand data found',
            icon: Activity,
            context: powerFactor > 0 ? `Power factor ${powerFactor.toFixed(1)}%` : 'Power factor not shown',
            isText: true
        },
        {
            id: 'usage',
            label: 'TOTAL USAGE',
            value: `${data.total_usage_kwh} kWh`,
            icon: Zap,
            context: 'Usage during the billing period',
            isText: false
        },
        {
            id: 'period',
            label: 'BILLING PERIOD',
            value: data.billing_period,
            icon: Calendar,
            context: 'Service dates on the bill',
            isText: true
        }
    ]

    const summaryCopy = printedSupplyRate > 0
        ? `The bill prints ${formatCents(printedSupplyRate)} on the supply line, but the invoice lands at ${invoiceRateText} once delivery and taxes are included.`
        : (redactedMode
            ? 'The bill is split into supply, delivery, and demand so the main cost driver is easy to see.'
            : (feedback?.description || 'We split the bill into supply, delivery, and demand so the main cost driver is easy to see.'))
    const badgeTitle = feedback?.title || 'Review complete'
    const siteLabel = redactedMode ? 'Redacted facility review' : 'Logistics warehouse review'

    return (
        <div className="w-full max-w-5xl mx-auto text-center px-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.6 }}
                className="mb-12 flex flex-col items-center"
            >
                {feedback && (
                    <div className="mb-6">
                        <FeedbackBadge
                            status={feedback.status}
                            title={badgeTitle}
                            isLarge={feedback.facilitySize === 'large'}
                        />
                    </div>
                )}

                <div className="text-[10px] md:text-xs font-mono uppercase tracking-[0.3em] text-zinc-500 mb-3">
                    {siteLabel}
                </div>
                <h1 className="text-3xl md:text-5xl font-light text-zinc-900 mb-2 tracking-tight">
                    Review complete
                </h1>
                <p className="text-zinc-500 max-w-2xl mx-auto text-lg leading-relaxed">
                    {summaryCopy}
                </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-left">
                {snapshotFields.map((field, i) => (
                    <motion.div
                        key={field.id}
                        initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        transition={{ duration: 0.5, delay: i * 0.08 }}
                        className="glass-card p-8 relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-[#002FA7]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="flex items-start justify-between mb-4">
                            <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">
                                {field.label}
                            </span>
                            <field.icon className="w-5 h-5 text-[#002FA7] opacity-80" />
                        </div>

                        <div className={`font-semibold text-zinc-900 mb-3 ${field.isText ? 'text-lg leading-snug' : 'text-3xl tracking-tight font-mono text-[#002FA7]'}`}>
                            {field.value}
                        </div>

                        <div className="text-xs text-zinc-500 font-medium">
                            {field.context}
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="mb-12 text-left">
                <BillReviewLens
                    usageKwh={usageKwh}
                    totalBill={billTotal}
                    printedSupplyRate={printedSupplyRate}
                    supplyAmount={supplyCost}
                    deliveryAmount={deliveryCost}
                    taxesAmount={taxesCost}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, filter: 'blur(10px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ delay: 0.45 }}
                className="flex flex-col items-center gap-4 py-10 glass-card bg-white/50 border-zinc-200"
            >
                <div className="mb-2 flex items-center gap-2 text-[#002FA7] text-xs font-mono uppercase tracking-widest font-bold">
                    <ShieldCheck className="w-5 h-5" />
                    Full report ready
                </div>
                <button
                    onClick={onUnlock}
                    className="w-full md:w-auto px-12 py-5 bg-black text-white rounded-full font-bold text-lg hover:scale-105 transition-all shadow-2xl flex items-center gap-2 group"
                >
                    Open full report
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <p className="text-sm text-zinc-500 font-medium">
                    Protected delivery. The full report keeps the bill split and next steps in one place.
                </p>
            </motion.div>
        </div>
    )
}
