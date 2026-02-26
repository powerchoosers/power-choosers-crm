'use client'

import { useMemo } from 'react'
import { format, differenceInCalendarDays } from 'date-fns'
import { UplinkCard } from '@/components/dossier/UplinkCard'
import DataIngestionCard from '@/components/dossier/DataIngestionCard'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import { cn } from '@/lib/utils'

interface IntelligencePanelProps {
    contact: any
    isEditing: boolean
    isRecalibrating: boolean
    glowingFields: Set<string>
    recentlyUpdatedFields: Set<string>

    // Field States & Setters
    editEmail: string
    setEditEmail: (v: string) => void
    editPhone: string
    setEditPhone: (v: string) => void
    editMobile: string
    setEditMobile: (v: string) => void
    editWorkDirect: string
    setEditWorkDirect: (v: string) => void
    editOther: string
    setEditOther: (v: string) => void
    editCompanyPhone: string
    setEditCompanyPhone: (v: string) => void
    editPrimaryField: 'mobile' | 'workDirectPhone' | 'otherPhone'
    setEditPrimaryField: (v: 'mobile' | 'workDirectPhone' | 'otherPhone') => void
    editContractEnd: string
    setEditContractEnd: (v: string) => void
    editSupplier: string
    setEditSupplier: (v: string) => void
    editStrikePrice: string
    setEditStrikePrice: (v: string) => void
    editAnnualUsage: string
    setEditAnnualUsage: (v: string) => void

    // Handlers
    onEmailClick: () => void
    onIngestionComplete: () => void
}

export function IntelligencePanel({
    contact,
    isEditing,
    isRecalibrating,
    glowingFields,
    recentlyUpdatedFields,
    editEmail,
    setEditEmail,
    editPhone,
    setEditPhone,
    editMobile,
    setEditMobile,
    editWorkDirect,
    setEditWorkDirect,
    editOther,
    setEditOther,
    editCompanyPhone,
    setEditCompanyPhone,
    editPrimaryField,
    setEditPrimaryField,
    editContractEnd,
    setEditContractEnd,
    editSupplier,
    setEditSupplier,
    editStrikePrice,
    setEditStrikePrice,
    editAnnualUsage,
    setEditAnnualUsage,
    onEmailClick,
    onIngestionComplete
}: IntelligencePanelProps) {

    const contractEndDate = useMemo(() => {
        if (!editContractEnd) return null
        const d = new Date(editContractEnd)
        return isNaN(d.getTime()) ? null : d
    }, [editContractEnd])

    const daysRemaining = contractEndDate ? differenceInCalendarDays(contractEndDate, new Date()) : null

    const maturityPct = useMemo(() => {
        if (daysRemaining == null) return 0
        const pct = 1 - daysRemaining / 365
        return Math.max(0, Math.min(1, pct))
    }, [daysRemaining])

    const maturityColor = useMemo(() => {
        if (daysRemaining == null) return 'bg-zinc-700'
        if (daysRemaining < 90) return 'bg-red-500'
        if (daysRemaining < 180) return 'bg-yellow-500'
        return 'bg-[#002FA7]'
    }, [daysRemaining])

    const annualRevenue = useMemo(() => {
        const usage = parseFloat(editAnnualUsage) || 0
        return (usage * 0.003).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    }, [editAnnualUsage])

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
            {contact && (
                <UplinkCard
                    contact={{
                        ...contact,
                        email: editEmail,
                        phone: editPhone,
                        mobile: editMobile,
                        workDirectPhone: editWorkDirect,
                        otherPhone: editOther,
                        companyPhone: editCompanyPhone,
                        primaryPhoneField: editPrimaryField
                    }}
                    isEditing={isEditing}
                    onEmailClick={onEmailClick}
                    onUpdate={(updates) => {
                        if (updates.email !== undefined) setEditEmail(updates.email)
                        if (updates.mobile !== undefined) {
                            setEditMobile(updates.mobile)
                            if (editPrimaryField === 'mobile') setEditPhone(updates.mobile)
                        }
                        if (updates.workDirectPhone !== undefined) {
                            setEditWorkDirect(updates.workDirectPhone)
                            if (editPrimaryField === 'workDirectPhone') setEditPhone(updates.workDirectPhone)
                        }
                        if (updates.otherPhone !== undefined) {
                            setEditOther(updates.otherPhone)
                            if (editPrimaryField === 'otherPhone') setEditPhone(updates.otherPhone)
                        }
                        if (updates.companyPhone !== undefined) setEditCompanyPhone(updates.companyPhone)
                        if (updates.primaryPhoneField !== undefined) {
                            setEditPrimaryField(updates.primaryPhoneField)
                            if (updates.primaryPhoneField === 'mobile') setEditPhone(editMobile)
                            else if (updates.primaryPhoneField === 'workDirectPhone') setEditPhone(editWorkDirect)
                            else if (updates.primaryPhoneField === 'otherPhone') setEditPhone(editOther)
                        }
                    }}
                />
            )}

            {/* Contract & Supplier Intelligence */}
            <div className={cn(
                "nodal-void-card transition-all duration-500 p-6 relative overflow-hidden shadow-lg space-y-6",
                isEditing ? 'border-[#002FA7]/30' : 'border-white/10',
                isRecalibrating && 'grayscale backdrop-blur-2xl'
            )}>

                <div>
                    <div className="flex justify-between items-end mb-2">
                        <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Position Maturity</h4>
                        <div className="text-right flex items-center gap-2">
                            <span className="text-xs text-zinc-500">Expiration:</span>
                            {isEditing ? (
                                <input
                                    type="date"
                                    value={editContractEnd}
                                    onChange={(e) => setEditContractEnd(e.target.value)}
                                    className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-xs font-mono text-white tabular-nums focus:outline-none focus:border-[#002FA7]/50"
                                />
                            ) : (
                                <span className={cn(
                                    "text-white font-mono font-bold tabular-nums transition-all duration-800",
                                    glowingFields.has('contractEnd') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)]"
                                )}>
                                    <ForensicDataPoint
                                        value={contractEndDate ? format(contractEndDate, 'MMM dd, yyyy') : 'TBD'}
                                        copyValue={contractEndDate ? format(contractEndDate, 'yyyy-MM-dd') : undefined}
                                        valueClassName={cn("text-white font-mono font-bold tabular-nums", glowingFields.has('contractEnd') && "text-[#002FA7]")}
                                        inline
                                    />
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative">
                        <div
                            className={`h-full ${maturityColor} transition-all duration-1000 ease-out relative`}
                            style={{ width: `${Math.round(maturityPct * 100)}%` }}
                        >
                            <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_10px_white]" />
                        </div>
                    </div>

                    <div className="flex justify-between mt-2">
                        <span className={cn(
                            "text-xs text-[#002FA7] font-mono tabular-nums ml-auto transition-all duration-800",
                            glowingFields.has('daysRemaining') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                        )}>
                            <ForensicDataPoint
                                value={daysRemaining != null ? `${Math.max(daysRemaining, 0)} Days Remaining` : '-- Days Remaining'}
                                copyValue={daysRemaining != null ? String(Math.max(daysRemaining, 0)) : undefined}
                                valueClassName="text-xs text-[#002FA7] font-mono tabular-nums"
                                inline
                            />
                        </span>
                    </div>
                </div>

                <div>
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Current Supplier</div>
                    {isEditing ? (
                        <input
                            type="text"
                            value={editSupplier}
                            onChange={(e) => setEditSupplier(e.target.value)}
                            className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-[#002FA7]/50"
                            placeholder="Supplier Name"
                        />
                    ) : (
                        <div className={cn("text-xl font-semibold tracking-tighter text-white transition-all duration-800", glowingFields.has('currentSupplier') && "text-[#002FA7]")}>
                            <ForensicDataPoint value={editSupplier || '--'} valueClassName="text-xl font-semibold tracking-tighter text-white" inline />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Strike Price</div>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editStrikePrice}
                                onChange={(e) => setEditStrikePrice(e.target.value)}
                                className="w-full bg-zinc-950/50 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-[#002FA7] focus:outline-none focus:border-[#002FA7]/50"
                                placeholder="0.000"
                            />
                        ) : (
                            <div className={cn("text-xl font-mono tabular-nums tracking-tighter text-[#002FA7] transition-all duration-800", glowingFields.has('strikePrice') && "text-emerald-400")}>
                                <ForensicDataPoint value={editStrikePrice || '--'} valueClassName="text-xl font-mono tabular-nums text-[#002FA7]" inline />
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Annual Usage</div>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editAnnualUsage}
                                onChange={(e) => setEditAnnualUsage(e.target.value)}
                                className="w-full bg-zinc-950/50 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#002FA7]/50"
                                placeholder="0"
                            />
                        ) : (
                            <div className={cn("text-xl font-mono tabular-nums tracking-tighter text-white transition-all duration-800", glowingFields.has('annualUsage') && "text-[#002FA7]")}>
                                <ForensicDataPoint value={editAnnualUsage || '--'} valueClassName="text-xl font-mono tabular-nums text-white" inline />
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                    <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Estimated Annual Revenue</div>
                    <div className={cn("text-3xl font-mono tabular-nums tracking-tighter text-green-500/80 transition-all duration-800", glowingFields.has('revenue') && "text-emerald-400")}>
                        <ForensicDataPoint value={annualRevenue} valueClassName="text-3xl font-mono tabular-nums text-green-500/80" inline />
                    </div>
                    <div className="text-[9px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">Calculated at 0.003 margin base</div>
                </div>
            </div>

            <DataIngestionCard
                accountId={contact?.accountId}
                onIngestionComplete={onIngestionComplete}
            />
        </div>
    )
}
