'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Radar, Edit3, Check, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Target } from '@/types/targets'

interface TargetListCardProps {
    target: Target
    index: number
    isEditing: boolean
    isSaving: boolean
    editingName: string
    setEditingId: (id: string | null) => void
    setEditingName: (name: string) => void
    handleUpdateTarget: (id: string) => void
    setTargetToDelete: (target: Target) => void
    setIsDestructModalOpen: (open: boolean) => void
}

export const TargetListCard = memo(function TargetListCard({
    target,
    index,
    isEditing,
    isSaving,
    editingName,
    setEditingId,
    setEditingName,
    handleUpdateTarget,
    setTargetToDelete,
    setIsDestructModalOpen
}: TargetListCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
                opacity: 1,
                scale: 1,
                boxShadow: isSaving ? '0 0 30px 2px rgba(0, 47, 167, 0.6)' : 'none',
                borderColor: isSaving ? '#002FA7' : ''
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
                duration: 0.3,
                delay: Math.min(index * 0.02, 0.4),
                ease: [0.23, 1, 0.32, 1]
            }}
            className="relative overflow-hidden rounded-2xl"
        >
            <Link
                href={isEditing ? '#' : `/network/targets/${target.id}`}
                onClick={(e) => isEditing && e.preventDefault()}
                className={cn(
                    "group relative nodal-module-glass nodal-monolith-edge rounded-2xl p-6 hover:bg-zinc-950/90 hover:border-white/10 transition-all cursor-pointer flex flex-col justify-between h-44",
                    isEditing && "cursor-default border-[#002FA7]/30 bg-zinc-950/80"
                )}
            >
                {/* Card Header */}
                <div className="flex justify-between items-start">
                    <div className="p-2.5 rounded-2xl bg-black/40 border border-white/5 text-white">
                        <Radar className="w-5 h-5" />
                    </div>
                    <div className={cn(
                        "opacity-0 transition-opacity flex gap-1",
                        "group-hover:opacity-100",
                        isEditing && "opacity-100"
                    )}>
                        <AnimatePresence mode="wait">
                            {isEditing ? (
                                <motion.button
                                    key="save-btn"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleUpdateTarget(target.id)
                                    }}
                                    className="icon-button-forensic h-8 w-8 flex items-center justify-center text-emerald-500 hover:text-emerald-400"
                                >
                                    <Check className="w-4 h-4" />
                                </motion.button>
                            ) : (
                                <motion.button
                                    key="edit-btn"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setEditingId(target.id)
                                        setEditingName(target.name)
                                    }}
                                    className="icon-button-forensic h-8 w-8 flex items-center justify-center text-zinc-500"
                                >
                                    <Edit3 className="w-4 h-4" />
                                </motion.button>
                            )}
                        </AnimatePresence>
                        <button
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setTargetToDelete(target)
                                setIsDestructModalOpen(true)
                            }}
                            className="icon-button-forensic h-8 w-8 flex items-center justify-center text-zinc-500 hover:text-red-500"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Card Body */}
                <div>
                    <AnimatePresence mode="wait">
                        {isEditing ? (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="mb-2"
                            >
                                <input
                                    autoFocus
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdateTarget(target.id)
                                        if (e.key === 'Escape') setEditingId(null)
                                    }}
                                    className="w-full bg-black/40 border border-[#002FA7]/30 rounded-lg px-3 py-1.5 text-lg font-medium text-white focus:outline-none focus:border-[#002FA7] transition-all"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </motion.div>
                        ) : (
                            <motion.h3
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-lg font-medium text-zinc-100 mb-2 group-hover:text-white group-hover:scale-[1.02] transition-all origin-left truncate"
                            >
                                {target.name}
                            </motion.h3>
                        )}
                    </AnimatePresence>
                    <div className="flex flex-col gap-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className={`w-1.5 h-1.5 rounded-full ${(target.count || 0) > 0 ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                            Nodes: <span className="text-zinc-300 tabular-nums">{target.count || 0}</span>
                        </span>
                        <span className="whitespace-nowrap">
                            Updated: <span className="text-zinc-400">
                                {target.createdAt ? formatDistanceToNow(new Date(target.createdAt), { addSuffix: true }) : 'Never'}
                            </span>
                        </span>
                    </div>
                </div>
            </Link>
        </motion.div>
    )
})
