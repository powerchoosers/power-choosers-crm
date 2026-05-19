'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { flexRender, Header } from '@tanstack/react-table'
import { TableHead } from '@/components/ui/table'
import { GripVertical } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
    getColumnAfterName,
    getFrozenNameHeaderClass,
    getFrozenSelectHeaderClass,
} from '@/components/network/frozenTable'

interface DraggableTableHeaderProps {
    header: Header<any, unknown>
    columnOrder?: string[]
}

export function DraggableTableHeader({ header, columnOrder }: DraggableTableHeaderProps) {
    const isFrozenSelectColumn = header.column.id === 'select'
    const isFrozenNameColumn = header.column.id === 'name'
    const isFrozenColumn = isFrozenSelectColumn || isFrozenNameColumn
    const isAfterNameColumn = getColumnAfterName(columnOrder) === header.column.id
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: header.id,
        disabled: isFrozenColumn,
    })

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined,
    }

    const containerVariants = {
        initial: {},
        hover: {},
    }

    const handleVariants = {
        initial: {
            x: -12,
            opacity: 0,
            width: 0,
            marginRight: 0,
        },
        hover: {
            x: 0,
            opacity: 1,
            width: 'auto',
            marginRight: 8,
        },
    }

    const textVariants = {
        initial: { x: 0 },
        hover: { x: 0 },
    }

    return (
        <TableHead
            ref={setNodeRef}
            {...(isFrozenColumn ? {} : attributes)}
            {...(isFrozenColumn ? {} : listeners)}
            style={style}
            className={cn(
                "text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3 select-none",
                isFrozenColumn ? "overflow-visible cursor-default" : "overflow-hidden cursor-grab active:cursor-grabbing",
                isFrozenSelectColumn && getFrozenSelectHeaderClass(),
                isFrozenNameColumn && getFrozenNameHeaderClass(),
                isAfterNameColumn && "pl-5",
                isDragging && !isFrozenColumn && "bg-zinc-900 border-x border-[#002FA7]/30"
            )}
        >
            {isFrozenColumn ? (
                <div className={cn("relative z-10 flex items-center h-full", isFrozenSelectColumn && "justify-center")}>
                    {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
            ) : (
                <motion.div
                    className="flex items-center relative h-full"
                    initial="initial"
                    whileHover="hover"
                    variants={containerVariants}
                >
                    <motion.div
                        className="flex items-center pointer-events-none"
                        variants={handleVariants}
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

                    <motion.div
                        layout
                        className="flex-1 whitespace-nowrap"
                        variants={textVariants}
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
            )}

            {/* Forensic Accent - only visible during drag */}
            <AnimatePresence>
                {isDragging && !isFrozenColumn && (
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
