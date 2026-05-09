'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { flexRender, Header } from '@tanstack/react-table'
import { TableHead } from '@/components/ui/table'
import { GripVertical } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface DraggableTableHeaderProps {
    header: Header<any, unknown>
}

export function DraggableTableHeader({ header }: DraggableTableHeaderProps) {
    const isFrozenSelectColumn = header.column.id === 'select'
    const isFrozenNameColumn = header.column.id === 'name'
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: header.id,
    })

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined,
        position: 'relative',
    }

    const containerVariants = {
        initial: {},
        hover: {}
    }

    const handleVariants = {
        initial: {
            x: -12,
            opacity: 0,
            width: 0,
            marginRight: 0
        },
        hover: {
            x: 0,
            opacity: 1,
            width: 'auto',
            marginRight: 8 // Space after handle
        }
    }

    const textVariants = {
        initial: { x: 0 },
        hover: { x: 0 } // Text naturally moves because of width: 'auto' on handle
    }

    return (
        <TableHead
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            style={style}
            className={cn(
                "text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3 relative select-none overflow-hidden cursor-grab active:cursor-grabbing",
                (isFrozenSelectColumn || isFrozenNameColumn) && "overflow-visible",
                isFrozenSelectColumn && "sticky left-0 z-50 w-12 min-w-12 max-w-12 bg-zinc-950/60 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/50",
                isFrozenNameColumn && "sticky left-12 z-40 bg-zinc-950/60 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/50 shadow-[14px_0_26px_-20px_rgba(0,0,0,0.95)] border-r border-white/5",
                isDragging && "bg-zinc-900 border-x border-[#002FA7]/30"
            )}
        >
            <motion.div
                className={cn(
                    "flex items-center relative h-full",
                    isFrozenSelectColumn && "justify-center",
                )}
                initial="initial"
                whileHover="hover"
                variants={containerVariants}
            >
                {/* Animated Drag Handle Wrapper */}
                <motion.div
                    variants={handleVariants}
                    className="flex items-center pointer-events-none"
                    transition={{
                        duration: 0.25,
                        ease: [0.23, 1, 0.32, 1]
                    }}
                >
                    <div
                        className="p-1 -ml-1 text-zinc-600 hover:text-[#002FA7] transition-colors"
                        title="Reorder Column"
                    >
                        <GripVertical className="w-3.5 h-3.5" />
                    </div>
                </motion.div>

                {/* Animated Text Content */}
                <motion.div
                    layout
                    variants={textVariants}
                    className="flex-1 whitespace-nowrap"
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30
                    }}
                >
                    {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                </motion.div>
            </motion.div>

            {/* Forensic Accent - only visible during drag */}
            <AnimatePresence>
                {isDragging && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 border-t border-[#002FA7] pointer-events-none"
                    />
                )}
            </AnimatePresence>
        </TableHead>
    )
}
