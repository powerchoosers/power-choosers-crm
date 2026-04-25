import { motion } from 'framer-motion'
import { CircleDollarSign } from 'lucide-react'

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
    const allInRate = usageKwh > 0 && totalBill > 0 ? totalBill / usageKwh : 0
    const sectionTotal = supplyAmount + deliveryAmount + taxesAmount
    const supplyShare = sectionTotal > 0 ? (supplyAmount / sectionTotal) * 100 : 0
    const deliveryShare = sectionTotal > 0 ? (deliveryAmount / sectionTotal) * 100 : 0
    const taxesShare = sectionTotal > 0 ? (taxesAmount / sectionTotal) * 100 : 0
    const hasPrintedRate = printedSupplyRate > 0

    const sectionRows = [
        {
            label: 'Supply',
            value: supplyAmount,
            share: supplyShare,
            bar: 'bg-[#002FA7]',
            text: 'text-[#002FA7]',
        },
        {
            label: 'Delivery',
            value: deliveryAmount,
            share: deliveryShare,
            bar: 'bg-zinc-300',
            text: 'text-zinc-600',
        },
        {
            label: 'Taxes & fees',
            value: taxesAmount,
            share: taxesShare,
            bar: 'bg-zinc-200',
            text: 'text-zinc-500',
        },
    ] as const

    return (
        <motion.div
            initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="rounded-[28px] border border-zinc-200/70 bg-white shadow-sm overflow-hidden"
        >
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
                <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-400">
                        Rate lens
                    </p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">
                        Printed supply rate vs invoice rate
                    </h3>
                </div>

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#002FA7]/10 bg-[#002FA7]/5 text-[#002FA7]">
                    <CircleDollarSign className="h-5 w-5" />
                </div>
            </div>

            <div className="grid gap-3 px-5 pt-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-400">
                        All-in invoice rate
                    </p>
                    <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-zinc-900">
                        {allInRate > 0 ? formatCents(allInRate) : 'N/A'}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                        Current charges divided by usage. This is the number that reflects the month&apos;s real cost.
                    </p>
                </div>

                <div className="rounded-2xl border border-[#002FA7]/15 bg-[#002FA7]/5 p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#002FA7]">
                        Printed supply rate
                    </p>
                    <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-[#002FA7]">
                        {hasPrintedRate ? formatCents(printedSupplyRate) : 'Not found'}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                        {hasPrintedRate
                            ? formatDollarRate(printedSupplyRate)
                            : 'The bill did not surface a clean base-usage rate.'}
                    </p>
                </div>
            </div>

            <div className="px-5 pb-5 pt-5">
                <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-400">
                        Bill sections
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                        Parsed bill blocks
                    </p>
                </div>

                <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-100 flex">
                    {sectionRows.map((section) => (
                        <div
                            key={section.label}
                            className={section.bar}
                            style={{ width: `${Math.max(0, Math.min(100, section.share))}%` }}
                        />
                    ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {sectionRows.map((section) => (
                        <div key={section.label} className="rounded-2xl border border-zinc-200 bg-white/70 p-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${section.bar}`} />
                                    <p className="text-xs text-zinc-600">{section.label}</p>
                                </div>
                                <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${section.text}`}>
                                    {section.share.toFixed(1)}%
                                </p>
                            </div>
                            <p className="mt-2 font-mono text-lg font-semibold tracking-tight text-zinc-900">
                                {formatMoney(section.value)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-zinc-100 px-5 py-4">
                <p className="text-sm leading-6 text-zinc-500">
                    The printed supply rate is the bill line itself. The invoice rate is the number to use when you want the real month-over-month cost.
                </p>
            </div>
        </motion.div>
    )
}
