import { motion, useReducedMotion } from 'framer-motion'
import { EASE } from './StepBand'

interface BillReviewLensProps {
    usageKwh: number
    totalBill: number
    printedSupplyRate?: number
    supplyAmount: number
    deliveryAmount: number
    taxesAmount: number
}

function formatCents(value: number) {
    return `${(value * 100).toFixed(2)}¢/kWh`
}

function formatMoney(value: number) {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDollarRate(value: number) {
    return `$${value.toFixed(7)}/kWh`
}

export function BillReviewLens({
    usageKwh,
    totalBill,
    printedSupplyRate = 0,
    supplyAmount,
    deliveryAmount,
    taxesAmount,
}: BillReviewLensProps) {
    const reduceMotion = useReducedMotion()
    const allInRate = usageKwh > 0 && totalBill > 0 ? totalBill / usageKwh : 0
    const sectionTotal = supplyAmount + deliveryAmount + taxesAmount
    const supplyShare = sectionTotal > 0 ? (supplyAmount / sectionTotal) * 100 : 0
    const deliveryShare = sectionTotal > 0 ? (deliveryAmount / sectionTotal) * 100 : 0
    const taxesShare = sectionTotal > 0 ? (taxesAmount / sectionTotal) * 100 : 0
    const hasPrintedRate = printedSupplyRate > 0

    const sectionRows = [
        {
            label: 'Supply',
            note: 'The electricity itself',
            value: supplyAmount,
            share: supplyShare,
            bar: 'bg-[#002FA7]',
        },
        {
            label: 'Delivery',
            note: 'The utility that brings it to you',
            value: deliveryAmount,
            share: deliveryShare,
            bar: 'bg-zinc-500',
        },
        {
            label: 'Taxes and fees',
            note: 'Passed through on the bill',
            value: taxesAmount,
            share: taxesShare,
            bar: 'bg-zinc-300',
        },
    ] as const

    return (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">
                The rate on the bill and the rate you paid
            </h3>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div>
                    <p className="text-sm font-medium text-zinc-950">What you paid per kWh, all in</p>
                    <p className="np-display mt-2 text-4xl text-[#002FA7] [font-variant-numeric:lining-nums_tabular-nums]">
                        {allInRate > 0 ? formatCents(allInRate) : 'Not available'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                        The bill total divided by your usage. This is what the month really cost.
                    </p>
                </div>

                <div className="border-zinc-200 sm:border-l sm:pl-6 lg:border-l-0 lg:pl-0 xl:border-l xl:pl-6">
                    <p className="text-sm font-medium text-zinc-950">Supply rate printed on the bill</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-zinc-950 tabular-nums">
                        {hasPrintedRate ? formatCents(printedSupplyRate) : 'Not found'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-500 tabular-nums">
                        {hasPrintedRate
                            ? `Shown on the bill as ${formatDollarRate(printedSupplyRate)}.`
                            : 'We could not find a supply rate printed on this bill.'}
                    </p>
                </div>
            </div>

            <div className="mt-8 border-t border-zinc-200 pt-6">
                <p className="text-sm font-medium text-zinc-950">Where the money went</p>

                <div aria-hidden className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-100">
                    {sectionRows.map((section, index) => (
                        <motion.div
                            key={section.label}
                            className={section.bar}
                            initial={reduceMotion ? false : { width: 0 }}
                            animate={{ width: `${Math.max(0, Math.min(100, section.share))}%` }}
                            transition={{ duration: 0.5, delay: 0.15 + index * 0.08, ease: EASE }}
                        />
                    ))}
                </div>

                <dl className="mt-4">
                    {sectionRows.map((section) => (
                        <div
                            key={section.label}
                            className="flex items-baseline justify-between gap-4 border-b border-zinc-100 py-3 last:border-b-0 last:pb-0"
                        >
                            <dt className="flex min-w-0 items-baseline gap-3">
                                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-sm ${section.bar}`} />
                                <span>
                                    <span className="block text-base font-medium text-zinc-950">{section.label}</span>
                                    <span className="block text-sm text-zinc-500">{section.note}</span>
                                </span>
                            </dt>
                            <dd className="shrink-0 text-right tabular-nums">
                                <span className="block text-base font-semibold text-zinc-950">{formatMoney(section.value)}</span>
                                <span className="block text-sm text-zinc-500">{section.share.toFixed(1)}%</span>
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>

            <p className="mt-6 border-t border-zinc-200 pt-5 text-sm leading-6 text-zinc-500">
                The printed supply rate only covers the electricity itself. The all-in rate includes
                delivery, taxes and fees, so use it when you compare one month with another.
            </p>
        </div>
    )
}
