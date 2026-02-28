'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { AccountUplinkCard } from '@/components/accounts/AccountUplinkCard'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import { cn } from '@/lib/utils'

interface AccountPhysicsPanelProps {
    account: any
    isEditing: boolean
    isRecalibrating: boolean
    recentlyUpdatedFields: Set<string>
    glowingFields: Set<string>

    editCompanyPhone: string
    setEditCompanyPhone: (v: string) => void
    editDomain: string
    setEditDomain: (v: string) => void
    editAddress: string
    setEditAddress: (v: string) => void
    editLogoUrl: string
    editSupplier: string
    setEditSupplier: (v: string) => void
    editContractEnd: string
    setEditContractEnd: (v: string) => void
    editStrikePrice: string
    setEditStrikePrice: (v: string) => void
    editMills: string
    setEditMills: (v: string) => void
    editAnnualUsage: string
    setEditAnnualUsage: (v: string) => void

    contractEndDate: Date | null
    daysRemaining: number | null
    maturityPct: number
    maturityColor: string
    toggleEditing: () => void
}

export const AccountPhysicsPanel = memo(function AccountPhysicsPanel({
    account,
    isEditing,
    isRecalibrating,
    recentlyUpdatedFields,
    glowingFields,
    editCompanyPhone,
    setEditCompanyPhone,
    editDomain,
    setEditDomain,
    editAddress,
    setEditAddress,
    editLogoUrl,
    editSupplier,
    setEditSupplier,
    editContractEnd,
    setEditContractEnd,
    editStrikePrice,
    setEditStrikePrice,
    editMills,
    setEditMills,
    editAnnualUsage,
    setEditAnnualUsage,
    contractEndDate,
    daysRemaining,
    maturityPct,
    maturityColor,
    toggleEditing
}: AccountPhysicsPanelProps) {

    const handleUpdate = (updates: Partial<{ companyPhone: string; domain: string; address: string }>) => {
        if (updates.companyPhone !== undefined) setEditCompanyPhone(updates.companyPhone)
        if (updates.domain !== undefined) setEditDomain(updates.domain)
        if (updates.address !== undefined) setEditAddress(updates.address)
    }

    return (
        <div className="col-span-3 h-full overflow-y-auto p-6 border-r border-white/5 np-scroll bg-black/10">
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-700">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em] mb-4">01 // Physics</div>

                <AccountUplinkCard
                    account={{
                        ...account,
                        companyPhone: editCompanyPhone || account.companyPhone,
                        domain: editDomain || account.domain,
                        address: editAddress || account.address,
                        logoUrl: editLogoUrl || account.logoUrl
                    }}
                    isEditing={isEditing}
                    onEnter={toggleEditing}
                    onUpdate={handleUpdate}
                />

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
                                        onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                        className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-xs font-mono text-white tabular-nums focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
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
                            <div className={`h-full ${maturityColor} transition-all duration-1000 ease-out relative`} style={{ width: `${Math.round(maturityPct * 100)}%` }}>
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
                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#002FA7]/50 transition-all uppercase placeholder:text-zinc-700"
                                placeholder="SUPPLIER NAME"
                            />
                        ) : (
                            <div className={cn(
                                "text-xl font-semibold tracking-tighter text-white transition-all duration-800",
                                glowingFields.has('currentSupplier') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)]"
                            )}>
                                <ForensicDataPoint value={editSupplier || account.electricitySupplier || '--'} valueClassName="text-xl font-semibold tracking-tighter text-white" inline />
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
                                    onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-[#002FA7] focus:outline-none focus:border-[#002FA7]/50 transition-all"
                                    placeholder="0.000"
                                />
                            ) : (
                                <div className={cn(
                                    "text-xl font-mono tabular-nums tracking-tighter text-[#002FA7] transition-all duration-800",
                                    glowingFields.has('strikePrice') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                                )}>
                                    <ForensicDataPoint value={editStrikePrice ? `${editStrikePrice}¢` : '--'} valueClassName="text-xl font-mono tabular-nums text-[#002FA7]" inline />
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Load Factor</div>
                            <div className="text-xl font-mono tabular-nums tracking-tighter text-white">
                                <ForensicDataPoint value={(account.loadFactor || 0.45).toFixed(2)} valueClassName="text-xl font-mono tabular-nums text-white" inline />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                        <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Annual Volume</div>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editAnnualUsage}
                                onChange={(e) => {
                                    const cleaned = e.target.value.replace(/[^0-9]/g, '')
                                    if (!cleaned) {
                                        setEditAnnualUsage('')
                                        return
                                    }
                                    setEditAnnualUsage(parseInt(cleaned).toLocaleString())
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#002FA7]/50 transition-all"
                                placeholder="0"
                            />
                        ) : (
                            <div className={cn(
                                "text-3xl font-mono tabular-nums tracking-tighter text-white font-semibold transition-all duration-800",
                                glowingFields.has('annualVolume') && "text-[#002FA7] drop-shadow-[0_0_8px_rgba(0,47,167,0.8)]"
                            )}>
                                <ForensicDataPoint
                                    value={account.annualUsage ? `${parseInt(account.annualUsage).toLocaleString()} kWh` : '--'}
                                    valueClassName="text-3xl font-mono tabular-nums tracking-tighter text-white font-semibold"
                                    inline
                                />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Deal Mills</div>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={editMills}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/[^\d]/g, '')
                                        if (val) {
                                            // Auto format to decimal like 0.0070
                                            const num = parseInt(val, 10)
                                            setEditMills((num / 10000).toFixed(4))
                                        } else {
                                            setEditMills('')
                                        }
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-[#002FA7] focus:outline-none focus:border-[#002FA7]/50 transition-all"
                                    placeholder="0.0070"
                                />
                            ) : (
                                <div className={cn(
                                    "text-xl font-mono tabular-nums tracking-tighter text-[#002FA7] transition-all duration-800",
                                    glowingFields.has('mills') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                                )}>
                                    <ForensicDataPoint value={editMills || '--'} valueClassName="text-xl font-mono tabular-nums text-[#002FA7]" inline />
                                </div>
                            )}
                        </div>

                        <div className="pt-0">
                            <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2">Estimated Annual Revenue</div>
                            <div className={cn(
                                "text-3xl font-mono tabular-nums tracking-tighter text-green-500/80 transition-all duration-800",
                                glowingFields.has('revenue') && "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                            )}>
                                <ForensicDataPoint
                                    value={(() => {
                                        const usageStr = isEditing ? editAnnualUsage : (account.annualUsage || '0');
                                        const usage = parseInt(usageStr.toString().replace(/[^0-9]/g, '')) || 0;
                                        const millsFloat = parseFloat(String(editMills).replace(/[^\d.]/g, '')) || 0.0070;
                                        return (usage * millsFloat).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                                    })()}
                                    valueClassName="text-3xl font-mono tabular-nums tracking-tighter text-green-500/80"
                                    inline
                                />
                            </div>
                            <div className="text-[9px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">Calculated at {editMills || '0.007'} margin base</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
})
