'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import {
    ArrowLeft, Globe, Linkedin, Lock, Unlock, Clock, Activity, Check, MapPin
} from 'lucide-react'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import { TaskCommandBar } from '@/components/crm/TaskCommandBar'
import { cn } from '@/lib/utils'

interface DossierHeaderProps {
    contact: any
    isEditing: boolean
    toggleEditing: () => void
    recentlyUpdatedFields: Set<string>
    showSynced: boolean

    // Field States & Setters
    editName: string
    editFirstName: string
    setEditFirstName: (v: string) => void
    editLastName: string
    setEditLastName: (v: string) => void
    editTitle: string
    setEditTitle: (v: string) => void
    editCompany: string
    setEditCompany: (v: string) => void
    editLocation: string
    setEditLocation: (v: string) => void
    editLogoUrl: string
    setEditLogoUrl: (v: string) => void
    editWebsite: string
    setEditWebsite: (v: string) => void
    editLinkedinUrl: string
    setEditLinkedinUrl: (v: string) => void

    activeEditField: 'logo' | 'website' | 'linkedin' | null
    setActiveEditField: (field: 'logo' | 'website' | 'linkedin' | null) => void

    // Task Integration
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

export const DossierHeader = memo(function DossierHeader({
    contact,
    isEditing,
    toggleEditing,
    recentlyUpdatedFields,
    showSynced,
    editName,
    editFirstName,
    setEditFirstName,
    editLastName,
    setEditLastName,
    editTitle,
    setEditTitle,
    editCompany,
    setEditCompany,
    editLocation,
    setEditLocation,
    editLogoUrl,
    setEditLogoUrl,
    editWebsite,
    setEditWebsite,
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
}: DossierHeaderProps) {
    const router = useRouter()
    const contactName = contact?.name || 'Unknown Contact'

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

                    <div className="flex-1 min-w-0 flex items-center gap-3 relative group/avatar">
                        <div className="flex-none" onClick={() => isEditing && setActiveEditField(activeEditField === 'logo' ? null : 'logo')}>
                            <AnimatePresence mode="wait">
                                {recentlyUpdatedFields.has('logoUrl') ? (
                                    <motion.div
                                        key="avatar-blur"
                                        initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                                        animate={{ filter: 'blur(0px)', opacity: 1 }}
                                        transition={{ duration: 0.4, ease: 'easeOut' }}
                                    >
                                        <ContactAvatar
                                            name={contactName}
                                            size={56}
                                            className={cn(
                                                "w-14 h-14 transition-all",
                                                isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.2)]"
                                            )}
                                        />
                                    </motion.div>
                                ) : (
                                    <ContactAvatar
                                        name={contactName}
                                        size={56}
                                        className={cn(
                                            "w-14 h-14 transition-all",
                                            isEditing && "cursor-pointer hover:border-[#002FA7]/50 hover:shadow-[0_0_20px_rgba(0,47,167,0.2)]"
                                        )}
                                    />
                                )}
                            </AnimatePresence>
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
                                            placeholder="PASTE AVATAR/LOGO URL..."
                                            className="bg-transparent border-none focus:ring-0 text-[10px] font-mono text-white w-full placeholder:text-zinc-700 uppercase tracking-widest"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex-1 min-w-0 flex flex-col">
                            <div className="flex items-center gap-3 mb-0.5">
                                {isEditing ? (
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <input
                                            type="text"
                                            value={editFirstName}
                                            onChange={(e) => setEditFirstName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                            className="text-2xl font-semibold tracking-tighter text-white bg-transparent border-none outline-none focus:ring-1 focus:ring-[#002FA7]/50 rounded px-1 -ml-1 flex-1 min-w-0"
                                            placeholder="First name"
                                            autoFocus
                                        />
                                        <input
                                            type="text"
                                            value={editLastName}
                                            onChange={(e) => setEditLastName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                            className="text-2xl font-semibold tracking-tighter text-white bg-transparent border-none outline-none focus:ring-1 focus:ring-[#002FA7]/50 rounded px-1 flex-1 min-w-0"
                                            placeholder="Last name"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <AnimatePresence mode="wait">
                                            {recentlyUpdatedFields.has('name') ? (
                                                <motion.h1
                                                    key="name-updated"
                                                    initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                                                    animate={{ filter: 'blur(0px)', opacity: 1 }}
                                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                                    className="text-2xl font-semibold tracking-tighter text-white"
                                                >
                                                    <ForensicDataPoint
                                                        value={[editFirstName, editLastName].filter(Boolean).join(' ') || editName || contactName}
                                                        copyValue={[editFirstName, editLastName].filter(Boolean).join(' ') || editName || contactName}
                                                        valueClassName="text-2xl font-semibold tracking-tighter text-white"
                                                        inline
                                                        compact
                                                    />
                                                </motion.h1>
                                            ) : (
                                                <h1 key="name-normal" className="text-2xl font-semibold tracking-tighter text-white">
                                                    <ForensicDataPoint
                                                        value={[editFirstName, editLastName].filter(Boolean).join(' ') || editName || contactName}
                                                        copyValue={[editFirstName, editLastName].filter(Boolean).join(' ') || editName || contactName}
                                                        valueClassName="text-2xl font-semibold tracking-tighter text-white"
                                                        inline
                                                        compact
                                                    />
                                                </h1>
                                            )}
                                        </AnimatePresence>

                                        {/* THE SIGNAL ARRAY */}
                                        <div className="flex items-center gap-1 bg-white/[0.02] rounded-full p-1 border border-white/5 relative group/links">
                                            <div className="flex items-center">
                                                <button
                                                    onClick={() => {
                                                        if (isEditing) {
                                                            setActiveEditField(activeEditField === 'website' ? null : 'website')
                                                        } else {
                                                            const url = editWebsite || contact?.website
                                                            if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank')
                                                        }
                                                    }}
                                                    className={cn(
                                                        "icon-button-forensic p-1.5",
                                                        !editWebsite && !contact?.website && "opacity-50 cursor-not-allowed",
                                                        isEditing && activeEditField === 'website' && "bg-[#002FA7]/20 text-white",
                                                        isEditing && "hover:bg-[#002FA7]/20 transition-colors"
                                                    )}
                                                    title={isEditing ? "Edit Website" : "Visit Website"}
                                                >
                                                    <Globe className="w-3.5 h-3.5" />
                                                </button>

                                                <AnimatePresence>
                                                    {isEditing && activeEditField === 'website' && (
                                                        <motion.div
                                                            key="website-edit"
                                                            initial={{ width: 0, opacity: 0 }}
                                                            animate={{ width: "auto", opacity: 1 }}
                                                            exit={{ width: 0, opacity: 0 }}
                                                            className="flex items-center overflow-hidden"
                                                        >
                                                            <input
                                                                type="text"
                                                                value={editWebsite}
                                                                onChange={(e) => setEditWebsite(e.target.value)}
                                                                placeholder="WEBSITE URL"
                                                                className="bg-transparent border-none focus:ring-0 text-[9px] font-mono text-white w-24 placeholder:text-zinc-700 uppercase tracking-widest h-6"
                                                                autoFocus
                                                                onKeyDown={(e) => e.key === 'Enter' && setActiveEditField(null)}
                                                            />
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            <div className="w-px h-3 bg-white/10" />

                                            <div className="flex items-center">
                                                <button
                                                    onClick={() => {
                                                        if (isEditing) {
                                                            setActiveEditField(activeEditField === 'linkedin' ? null : 'linkedin')
                                                        } else {
                                                            const url = editLinkedinUrl || contact?.linkedinUrl
                                                            if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank')
                                                        }
                                                    }}
                                                    className={cn(
                                                        "icon-button-forensic p-1.5",
                                                        !editLinkedinUrl && !contact?.linkedinUrl && "opacity-50 cursor-not-allowed",
                                                        isEditing && activeEditField === 'linkedin' && "bg-[#002FA7]/20 text-white",
                                                        isEditing && "hover:bg-[#002FA7]/20 transition-colors"
                                                    )}
                                                    title={isEditing ? "Edit LinkedIn" : "View LinkedIn"}
                                                >
                                                    <Linkedin className="w-3.5 h-3.5" />
                                                </button>

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

                                        {/* Status/Sync Indicators */}
                                        <motion.div layout className="flex items-center gap-2 ml-2 overflow-visible">
                                            <AnimatePresence>
                                                {contact.listName && (
                                                    <motion.div
                                                        key="list-membership-badge"
                                                        layout
                                                        initial={{ opacity: 0, width: 0, scale: 0.92 }}
                                                        animate={{ opacity: 1, width: 'auto', scale: 1 }}
                                                        exit={{ opacity: 0, width: 0, scale: 0.92 }}
                                                        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm overflow-hidden shrink-0 origin-left"
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                        <span className="text-[10px] font-mono uppercase tracking-widest font-medium text-emerald-500 whitespace-nowrap">
                                                            {contact.listName}
                                                        </span>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {contact.lastContact && (
                                                <motion.div layout className="flex items-center gap-1.5 px-2 py-0.5 rounded-full nodal-module-glass border border-white/5 shrink-0">
                                                    <Clock className="w-2.5 h-2.5 text-zinc-600" />
                                                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                                                        {(() => {
                                                            try {
                                                                return formatDistanceToNow(new Date(contact.lastContact), { addSuffix: true }).toUpperCase()
                                                            } catch (e) {
                                                                return 'UNKNOWN'
                                                            }
                                                        })()}
                                                    </span>
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    </div>
                                )}

                                <AnimatePresence>
                                    {showSynced && (
                                        <motion.div
                                            key="synced-badge"
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
                                    <div className="flex items-center gap-4 w-full">
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                                className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-full focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                                                placeholder="TITLE"
                                            />
                                            <span className="text-zinc-600 lowercase">at</span>
                                            <input
                                                type="text"
                                                value={editCompany}
                                                onChange={(e) => setEditCompany(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                                className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-full focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                                                placeholder="COMPANY"
                                            />
                                        </div>
                                        <span className="w-1 h-1 rounded-full bg-black/40 shrink-0" />
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
                                            <input
                                                type="text"
                                                value={editLocation}
                                                onChange={(e) => setEditLocation(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && toggleEditing()}
                                                className="bg-transparent border-b border-white/10 text-white text-xs font-mono uppercase tracking-widest w-full focus:outline-none focus:border-[#002FA7] transition-colors placeholder:text-zinc-700"
                                                placeholder="CITY, STATE"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <AnimatePresence mode="wait">
                                            {(recentlyUpdatedFields.has('title') || recentlyUpdatedFields.has('company')) ? (
                                                <motion.div
                                                    key="title-updated"
                                                    initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                                                    animate={{ filter: 'blur(0px)', opacity: 1 }}
                                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                                    className="flex items-center gap-0.5 uppercase tracking-widest text-zinc-400"
                                                >
                                                    {editTitle && (
                                                        <>
                                                            <ForensicDataPoint value={editTitle} copyValue={editTitle} valueClassName="uppercase tracking-widest text-zinc-400" inline compact />
                                                            <span className="text-zinc-600 lowercase mx-0.5">at</span>
                                                        </>
                                                    )}
                                                    {contact?.linkedAccountId ? (
                                                        <Link href={`/network/accounts/${contact.linkedAccountId}`} className="hover:text-white transition-colors">
                                                            <ForensicDataPoint value={editCompany || 'Unknown Entity'} valueClassName="uppercase tracking-widest text-zinc-400 hover:text-white" inline compact />
                                                        </Link>
                                                    ) : (
                                                        <ForensicDataPoint value={editCompany || 'Unknown Entity'} valueClassName="uppercase tracking-widest text-zinc-400" inline compact />
                                                    )}
                                                </motion.div>
                                            ) : (
                                                <div key="title-normal" className="flex items-center gap-0.5 uppercase tracking-widest text-zinc-400">
                                                    {editTitle && (
                                                        <>
                                                            <ForensicDataPoint value={editTitle} copyValue={editTitle} valueClassName="uppercase tracking-widest text-zinc-400" inline compact />
                                                            <span className="text-zinc-600 lowercase mx-0.5">at</span>
                                                        </>
                                                    )}
                                                    {contact?.linkedAccountId ? (
                                                        <Link href={`/network/accounts/${contact.linkedAccountId}`} className="hover:text-white transition-colors">
                                                            <ForensicDataPoint value={editCompany || 'Unknown Entity'} valueClassName="uppercase tracking-widest text-zinc-400 hover:text-white" inline compact />
                                                        </Link>
                                                    ) : (
                                                        <ForensicDataPoint value={editCompany || 'Unknown Entity'} valueClassName="uppercase tracking-widest text-zinc-400" inline compact />
                                                    )}
                                                </div>
                                            )}
                                        </AnimatePresence>
                                        <span className="w-1 h-1 rounded-full bg-zinc-800" />
                                        <AnimatePresence mode="wait">
                                            {recentlyUpdatedFields.has('location') ? (
                                                <motion.div
                                                    key="loc-updated"
                                                    initial={{ filter: 'blur(6px)', opacity: 0.6 }}
                                                    animate={{ filter: 'blur(0px)', opacity: 1 }}
                                                    className="flex items-center gap-1.5 text-zinc-400"
                                                >
                                                    <MapPin className="w-3.5 h-3.5 text-white" />
                                                    <ForensicDataPoint value={editLocation || 'Unknown Location'} valueClassName="text-zinc-400" inline compact />
                                                </motion.div>
                                            ) : (
                                                <div key="loc-normal" className="flex items-center gap-1.5 text-zinc-400">
                                                    <MapPin className="w-3.5 h-3.5 text-white" />
                                                    <ForensicDataPoint value={editLocation || 'Unknown Location'} valueClassName="text-zinc-400" inline compact />
                                                </div>
                                            )}
                                        </AnimatePresence>
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
                            <button
                                onClick={toggleEditing}
                                className={cn(
                                    "w-7 h-7 flex items-center justify-center transition-all duration-300",
                                    isEditing ? "text-blue-400 bg-blue-400/10 border border-blue-400/30 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.2)] scale-110" : "text-zinc-500 hover:text-white"
                                )}
                            >
                                {isEditing ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                        </div>
                        {!hasTasks && (
                            <div className="flex items-center gap-2">
                                <div className={cn("h-2 w-2 rounded-full animate-pulse", isEditing ? "bg-blue-500" : "bg-green-500")} />
                                <span className={cn("text-xs font-mono uppercase tracking-widest", isEditing ? "text-blue-400" : "text-green-500")}>
                                    {isEditing ? "SECURE_FIELD_OVERRIDE" : "ACTIVE_INTELLIGENCE"}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    )
})
