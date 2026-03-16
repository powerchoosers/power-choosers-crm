'use client'

import { memo, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, parseISO, isValid } from 'date-fns'
import {
    ArrowLeft, Globe, Linkedin, Lock, Unlock, Clock, Activity, Check, MapPin, Users, ChevronDown, Trash2
} from 'lucide-react'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import { FieldSyncIndicator } from '@/components/ui/FieldSyncIndicator'
import { TaskCommandBar } from '@/components/crm/TaskCommandBar'
import DestructModal from '@/components/network/DestructModal'
import { cn } from '@/lib/utils'
import { domainToClickableUrl } from '@/lib/url'

function parseContractEndDate(raw: unknown): Date | null {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null
    const iso = parseISO(s)
    if (isValid(iso)) return iso
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (mdy) {
        const mm = Number(mdy[1])
        const dd = Number(mdy[2])
        const yyyy = Number(mdy[3])
        const d = new Date(yyyy, mm - 1, dd)
        return isValid(d) ? d : null
    }
    const fallback = new Date(s)
    return isValid(fallback) ? fallback : null
}

interface AccountDossierHeaderProps {
    account: any
    isEditing: boolean
    toggleEditing: () => void
    onDelete: () => void
    showSynced: boolean
    isSaving: boolean
    recentlyUpdatedFields: Set<string>

    editAccountName: string
    setEditAccountName: (v: string) => void
    editIndustry: string
    setEditIndustry: (v: string) => void
    editLocation: string
    setEditLocation: (v: string) => void
    editEmployees: string
    setEditEmployees: (v: string) => void
    editLogoUrl: string
    setEditLogoUrl: (v: string) => void
    editDomain: string
    setEditDomain: (v: string) => void
    editLinkedinUrl: string
    setEditLinkedinUrl: (v: string) => void

    activeEditField: 'logo' | 'domain' | 'linkedin' | null
    setActiveEditField: (field: 'logo' | 'domain' | 'linkedin' | null) => void

    hasTasks: boolean
    pendingTasks: any[]
    displayTaskIndex: number
    globalTotal?: number
    globalPosition?: number
    useGlobalPagination: boolean
    handlePrev: () => void
    handleNext: () => void
    handleCompleteAndAdvance: () => void
}

export const AccountDossierHeader = memo(function AccountDossierHeader({
    account,
    isEditing,
    toggleEditing,
    onDelete,
    showSynced,
    isSaving,
    recentlyUpdatedFields,
    editAccountName,
    setEditAccountName,
    editIndustry,
    setEditIndustry,
    editLocation,
    setEditLocation,
    editEmployees,
    setEditEmployees,
    editLogoUrl,
    setEditLogoUrl,
    editDomain,
    setEditDomain,
    editLinkedinUrl,
    setEditLinkedinUrl,
    activeEditField,
    setActiveEditField,
    hasTasks,
    pendingTasks,
    displayTaskIndex,
    globalTotal,
    globalPosition,
    useGlobalPagination,
    handlePrev,
    handleNext,
    handleCompleteAndAdvance
}: AccountDossierHeaderProps) {
    const router = useRouter()
    const [menuOpen, setMenuOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!menuOpen) return
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEsc)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEsc)
        }
    }, [menuOpen])

    return (
        <header className="flex-none px-6 py-6 md:px-8 border-b border-white/5 nodal-recessed relative z-10">
            <div className="flex items-center justify-between gap-6">
                <div className="flex-1 min-w-0 flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="flex-none icon-button-forensic w-10 h-10 flex items-center justify-center -ml-2"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div className="flex-1 min-w-0 flex items-center gap-3 relative group/logo">
                        <div className="flex-none" onClick={() => isEditing && setActiveEditField(activeEditField === 'logo' ? null : 'logo')}>
                            {recentlyUpdatedFields.has('logoUrl') ? (
                                <motion.div
                                    initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                                    animate={{ filter: 'blur(0px)', opacity: 1 }}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                >
                                    <CompanyIcon
                                        logoUrl={editLogoUrl || account.logoUrl}
                                        domain={editDomain || account.domain}
                                        name={account.name}
                                        size={56}
                                        roundedClassName="rounded-[14px]"
                                        className={cn(
                                            "w-14 h-14 transition-all",
                                            isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.3)]"
                                        )}
                                    />
                                </motion.div>
                            ) : (
                                <CompanyIcon
                                    logoUrl={editLogoUrl || account.logoUrl}
                                    domain={editDomain || account.domain}
                                    name={account.name}
                                    size={56}
                                    roundedClassName="rounded-[14px]"
                                    className={cn(
                                        "w-14 h-14 transition-all",
                                        isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.3)]"
                                    )}
                                />
                            )}
                        </div>

                        <AnimatePresence>
                            {isEditing && activeEditField === 'logo' && (
                                <motion.div
                                    key="logo-edit"
                                    initial={{ width: 0, opacity: 0, x: -10 }}
                                    animate={{ width: "auto", opacity: 1, x: 0 }}
                                    exit={{ width: 0, opacity: 0, x: -10 }}
                                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 flex items-center z-50"
                                >
                                    <div className="bg-zinc-950/90 backdrop-blur-xl nodal-monolith-edge rounded-lg p-2 shadow-2xl flex items-center gap-2 min-w-[320px]">
                                        <div className="p-1.5 bg-white/5 rounded border border-white/10 text-zinc-500">
                                            <Activity className="w-3.5 h-3.5" />
                                        </div>
                                        <input
                                            type="text"
                                            value={editLogoUrl}
                                            onChange={(e) => setEditLogoUrl(e.target.value)}
                                            placeholder="PASTE LOGO URL..."
                                            className="bg-transparent border-none focus:ring-0 text-[10px] font-mono text-white w-full placeholder:text-zinc-700 uppercase tracking-widest"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex-1 min-w-0 flex flex-col">
                            <div className="flex items-center gap-3 mb-1">
                                {isEditing ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={editAccountName}
                                            onChange={(e) => setEditAccountName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                            className="bg-transparent border-b border-white/10 text-white text-2xl font-semibold tracking-tighter w-72 focus:outline-none focus:border-[#002FA7] transition-colors"
                                            placeholder="ACCOUNT NAME"
                                            autoFocus
                                        />
                                    </div>
                                ) : (
                                    <h1 className="text-2xl font-semibold tracking-tighter text-white">
                                        <ForensicDataPoint
                                            value={account.name ?? ''}
                                            copyValue={account.name ?? undefined}
                                            valueClassName="text-2xl font-semibold tracking-tighter text-white"
                                            inline
                                            compact
                                        />
                                    </h1>
                                )}
                                {!isEditing && (
                                    <FieldSyncIndicator
                                        active={recentlyUpdatedFields.has('name')}
                                        isSaving={isSaving}
                                        severity="identity"
                                    />
                                )}

                                <div className="flex items-center gap-1 bg-white/[0.02] rounded-full p-1 border border-white/5 relative group/links">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                if (isEditing) {
                                                    setActiveEditField(activeEditField === 'domain' ? null : 'domain')
                                                } else {
                                                    const url = editDomain ? domainToClickableUrl(editDomain) : domainToClickableUrl(account.domain)
                                                    if (url) window.open(url, '_blank')
                                                }
                                            }}
                                            className={cn(
                                                "icon-button-forensic p-1.5",
                                                !editDomain && !account.domain && "opacity-50 cursor-not-allowed",
                                                isEditing && activeEditField === 'domain' && "bg-[#002FA7]/20 text-white",
                                                isEditing && "hover:bg-[#002FA7]/20 transition-colors"
                                            )}
                                            title={isEditing ? "Edit Domain" : "Visit Website"}
                                        >
                                            <Globe className="w-3.5 h-3.5" />
                                        </button>
                                        {!isEditing && (
                                            <FieldSyncIndicator
                                                active={recentlyUpdatedFields.has('domain')}
                                                isSaving={isSaving}
                                                severity="identity"
                                            />
                                        )}

                                        <AnimatePresence>
                                            {isEditing && activeEditField === 'domain' && (
                                                <motion.div
                                                    key="domain-edit"
                                                    initial={{ width: 0, opacity: 0 }}
                                                    animate={{ width: "auto", opacity: 1 }}
                                                    exit={{ width: 0, opacity: 0 }}
                                                    className="flex items-center overflow-hidden"
                                                >
                                                    <input
                                                        type="text"
                                                        value={editDomain}
                                                        onChange={(e) => setEditDomain(e.target.value)}
                                                        placeholder="DOMAIN.COM"
                                                        className="bg-transparent border-none focus:ring-0 text-[9px] font-mono text-white w-24 placeholder:text-zinc-700 uppercase tracking-widest h-6"
                                                        autoFocus
                                                        onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="w-px h-3 bg-white/10" />

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                if (isEditing) {
                                                    setActiveEditField(activeEditField === 'linkedin' ? null : 'linkedin')
                                                } else {
                                                    const url = editLinkedinUrl || account.linkedinUrl
                                                    if (url) window.open(url, '_blank')
                                                }
                                            }}
                                            className={cn(
                                                "icon-button-forensic p-1.5",
                                                !editLinkedinUrl && !account.linkedinUrl && "opacity-50 cursor-not-allowed",
                                                isEditing && activeEditField === 'linkedin' && "bg-[#002FA7]/20 text-white",
                                                isEditing && "hover:bg-[#002FA7]/20 transition-colors"
                                            )}
                                            title={isEditing ? "Edit LinkedIn" : "View LinkedIn"}
                                        >
                                            <Linkedin className="w-3.5 h-3.5" />
                                        </button>
                                        {!isEditing && (
                                            <FieldSyncIndicator
                                                active={recentlyUpdatedFields.has('linkedin')}
                                                isSaving={isSaving}
                                                severity="identity"
                                            />
                                        )}

                                        <AnimatePresence>
                                            {isEditing && activeEditField === 'linkedin' && (
                                                <motion.div
                                                    key="linkedin-edit"
                                                    initial={{ width: 0, opacity: 0 }}
                                                    animate={{ width: "auto", opacity: 1 }}
                                                    exit={{ width: 0, opacity: 0 }}
                                                    className="flex items-center overflow-hidden"
                                                >
                                                    <input
                                                        type="text"
                                                        value={editLinkedinUrl}
                                                        onChange={(e) => setEditLinkedinUrl(e.target.value)}
                                                        placeholder="LINKEDIN URL"
                                                        className="bg-transparent border-none focus:ring-0 text-[9px] font-mono text-white w-24 placeholder:text-zinc-700 uppercase tracking-widest h-6"
                                                        autoFocus
                                                        onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                <motion.div layout className="flex items-center gap-2 overflow-visible">
                                    {(() => {
                                        const hasContract = !!account.contractEnd
                                        const contractEnd = parseContractEndDate(account.contractEnd)
                                        const isExpired = hasContract && contractEnd && contractEnd < new Date()
                                        const isCustomer = account.status === 'CUSTOMER'
                                        const isActiveLoad = (hasContract && !isExpired) || account.status === 'ACTIVE_LOAD'

                                        const displayStatus = isCustomer ? 'Customer' : isActiveLoad ? 'Active Load' : isExpired ? 'Expired' : 'No Contract'
                                        return (
                                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full nodal-module-glass border border-white/5 shrink-0">
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full",
                                                    isCustomer ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                                        isActiveLoad ? "bg-[#002FA7] animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.5)]" :
                                                            isExpired ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                                                "bg-zinc-600"
                                                )} />
                                                <span className={cn(
                                                    "text-[10px] font-mono uppercase tracking-widest font-medium whitespace-nowrap",
                                                    isCustomer ? "text-emerald-500" :
                                                        isActiveLoad ? "text-[#002FA7]" :
                                                            isExpired ? "text-red-500/80" :
                                                                "text-zinc-500"
                                                )}>
                                                    {displayStatus}
                                                </span>
                                            </div>
                                        )
                                    })()}

                                    {account.updated && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full nodal-module-glass border border-white/5 shrink-0">
                                            <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest whitespace-nowrap">
                                                Last_Sync: {(() => {
                                                    try {
                                                        return formatDistanceToNow(new Date(account.updated), { addSuffix: true }).toUpperCase()
                                                    } catch (e) {
                                                        return 'UNKNOWN'
                                                    }
                                                })()}
                                            </span>
                                        </div>
                                    )}
                                </motion.div>

                                <AnimatePresence>
                                    {showSynced && (
                                        <motion.div
                                            key="synced-indicator"
                                            initial={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                                            exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                                            className="flex items-center gap-1 text-[10px] font-mono text-green-500"
                                        >
                                            <Check className="w-3 h-3" />
                                            <span className="uppercase tracking-widest">Synced</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono mb-2 w-full">
                                {isEditing ? (
                                    <div className="flex items-center gap-3 w-full">
                                        <div className="flex items-center gap-1.5">
                                            <Activity className="w-3.5 h-3.5 text-white shrink-0" />
                                            <input
                                                type="text"
                                                value={editIndustry}
                                                onChange={(e) => setEditIndustry(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                                className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-36 focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                                                placeholder="INDUSTRY"
                                            />
                                        </div>
                                        <span className="w-1 h-1 rounded-full bg-black/40 shrink-0" />
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                                            <input
                                                type="text"
                                                value={editLocation}
                                                onChange={(e) => setEditLocation(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                                className="bg-transparent border-b border-white/10 text-white text-xs font-mono tracking-widest w-28 focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                                                placeholder="CITY, STATE"
                                            />
                                        </div>
                                        <span className="w-1 h-1 rounded-full bg-black/40 shrink-0" />
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Users className="w-3.5 h-3.5 text-white shrink-0" />
                                            <input
                                                type="text"
                                                value={editEmployees}
                                                onChange={(e) => setEditEmployees(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                                className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-20 focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                                                placeholder="HEADCOUNT"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex-none flex items-center gap-1.5 uppercase tracking-widest text-zinc-400">
                                            <Activity className="w-3.5 h-3.5 text-white shrink-0" />
                                            <ForensicDataPoint value={account.industry || 'Unknown Sector'} valueClassName="uppercase tracking-widest text-zinc-400" inline compact />
                                        </div>
                                        <span className="flex-none w-1 h-1 rounded-full bg-zinc-800" />
                                        <div className="flex-none flex items-center gap-1.5 text-zinc-400">
                                            <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                                            <ForensicDataPoint value={account.location || 'Unknown Location'} valueClassName="text-zinc-400" inline compact />
                                        </div>
                                        {account.employees && (
                                            <>
                                                <span className="flex-none w-1 h-1 rounded-full bg-zinc-800" />
                                                <div className="flex-none flex items-center gap-1.5 text-zinc-400">
                                                    <Users className="w-3.5 h-3.5 text-white shrink-0" />
                                                    <ForensicDataPoint value={`${Number(account.employees).toLocaleString()} emp`} valueClassName="text-zinc-400" inline compact />
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-none shrink-0 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-2">
                            {!hasTasks && <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Dossier Status</div>}
                            {hasTasks && (
                                <TaskCommandBar
                                    pendingTasks={pendingTasks}
                                    currentIndex={displayTaskIndex}
                                    globalTotal={useGlobalPagination ? globalTotal : undefined}
                                    globalPosition={useGlobalPagination ? globalPosition : undefined}
                                    onPrev={handlePrev}
                                    onNext={handleNext}
                                    onSkip={handleNext}
                                    onCompleteAndAdvance={handleCompleteAndAdvance}
                                />
                            )}

                            {/* Animated lock dropdown button */}
                            <div className="relative" ref={menuRef}>
                                <motion.div
                                    className="flex items-center rounded-lg overflow-hidden"
                                    layout
                                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                                >
                                    {/* Left: lock/unlock + label */}
                                    <motion.button
                                        onClick={toggleEditing}
                                        className={cn(
                                            "flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors duration-300 border-r",
                                            isEditing
                                                ? "text-[#002FA7] bg-[#002FA7]/10 border border-[#002FA7]/30 border-r-[#002FA7]/20"
                                                : "text-zinc-500 hover:text-white bg-white/5 border border-white/10 border-r-white/5"
                                        )}
                                        layout
                                    >
                                        <AnimatePresence mode="wait">
                                            {isEditing ? (
                                                <motion.span
                                                    key="unlock-icon"
                                                    initial={{ rotate: -15, opacity: 0, scale: 0.8 }}
                                                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                                    exit={{ rotate: 15, opacity: 0, scale: 0.8 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <Unlock className="w-3.5 h-3.5" />
                                                </motion.span>
                                            ) : (
                                                <motion.span
                                                    key="lock-icon"
                                                    initial={{ rotate: 15, opacity: 0, scale: 0.8 }}
                                                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                                    exit={{ rotate: -15, opacity: 0, scale: 0.8 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <Lock className="w-3.5 h-3.5" />
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                        <AnimatePresence mode="wait">
                                            <motion.span
                                                key={isEditing ? 'editing-label' : 'edit-label'}
                                                initial={{ opacity: 0, x: -4 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 4 }}
                                                transition={{ duration: 0.15 }}
                                            >
                                                {isEditing ? 'Editing' : 'Edit'}
                                            </motion.span>
                                        </AnimatePresence>
                                    </motion.button>

                                    {/* Right: chevron for dropdown */}
                                    <motion.button
                                        onClick={() => setMenuOpen(v => !v)}
                                        className={cn(
                                            "flex items-center px-1.5 py-1.5 transition-colors duration-300",
                                            isEditing
                                                ? "text-[#002FA7] bg-[#002FA7]/10 border border-[#002FA7]/30 border-l-0"
                                                : "text-zinc-500 hover:text-white bg-white/5 border border-white/10 border-l-0"
                                        )}
                                        layout
                                    >
                                        <motion.div
                                            animate={{ rotate: menuOpen ? 180 : 0 }}
                                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                                        >
                                            <ChevronDown className="w-3 h-3" />
                                        </motion.div>
                                    </motion.button>
                                </motion.div>

                                {/* Dropdown */}
                                <AnimatePresence>
                                    {menuOpen && (
                                        <motion.div
                                            key="account-dossier-menu"
                                            initial={{ opacity: 0, y: -6, scale: 0.96 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -6, scale: 0.96 }}
                                            transition={{ duration: 0.15, ease: 'easeOut' }}
                                            className="absolute right-0 top-full mt-2 w-44 bg-zinc-950 nodal-monolith-edge border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl"
                                        >
                                            <button
                                                onClick={() => { toggleEditing(); setMenuOpen(false) }}
                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                                            >
                                                {isEditing ? <Lock className="w-3.5 h-3.5 shrink-0" /> : <Unlock className="w-3.5 h-3.5 shrink-0" />}
                                                {isEditing ? 'Lock Record' : 'Edit Record'}
                                            </button>
                                            <div className="h-px bg-white/5 mx-3" />
                                            <button
                                                onClick={() => { setDeleteModalOpen(true); setMenuOpen(false) }}
                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest text-red-500/60 hover:text-red-500 hover:bg-red-500/5 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                                Terminate Record
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                        {!hasTasks && (
                            <div className="flex items-center gap-2">
                                <motion.div
                                    className={cn("h-2 w-2 rounded-full animate-pulse", isEditing ? "bg-[#002FA7]" : "bg-green-500")}
                                    layout
                                />
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={isEditing ? 'override' : 'active'}
                                        initial={{ opacity: 0, x: 4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -4 }}
                                        transition={{ duration: 0.2 }}
                                        className={cn("text-xs font-mono uppercase tracking-widest", isEditing ? "text-[#002FA7]" : "text-green-500")}
                                    >
                                        {isEditing ? "SECURE_FIELD_OVERRIDE" : "ACTIVE_INTELLIGENCE"}
                                    </motion.span>
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <DestructModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={onDelete}
                count={1}
            />
        </header>
    )
})
