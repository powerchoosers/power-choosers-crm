'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { flexRender, Row } from '@tanstack/react-table'
import { TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Contact } from '@/hooks/useContacts'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

interface ContactTableRowProps {
    row: Row<Contact>
    index: number
    router: AppRouterInstance
    saveScroll: () => void
    columnOrder?: string[]
    healthLoading?: boolean
    healthUpdatedAt?: number
    isSelected: boolean
}

export const ContactTableRow = memo(function ContactTableRow({
    row,
    index,
    router,
    saveScroll,
    columnOrder,
    healthLoading,
    healthUpdatedAt,
    isSelected
}: ContactTableRowProps) {
    const isAnimated = index < 12
    const frozenSelectCellClass = cn(
        "sticky left-0 z-30 w-12 min-w-12 max-w-12 bg-zinc-950/60 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/50"
    )
    const frozenNameCellClass = cn(
        "sticky left-12 z-20 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/50 shadow-[14px_0_26px_-20px_rgba(0,0,0,0.95)] border-r border-white/5",
        isSelected ? "bg-[#002FA7]/8" : "bg-zinc-950/60 group-hover:bg-white/[0.03]"
    )
    return (
        <motion.tr
            initial={isAnimated ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
                duration: 0.3,
                delay: isAnimated ? Math.min(index * 0.02, 0.25) : 0,
                ease: [0.23, 1, 0.32, 1]
            }}
            data-state={isSelected && "selected"}
            className={cn(
                "border-b border-white/5 transition-colors group cursor-pointer relative z-10",
                isSelected
                    ? "bg-[#002FA7]/5 hover:bg-[#002FA7]/10"
                    : "hover:bg-white/[0.02]"
            )}
            onClick={(e: React.MouseEvent) => {
                // Don't trigger row click if clicking a link or button
                if ((e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('button')) {
                    return;
                }
                saveScroll()
                router.push(`/network/contacts/${row.original.id}`)
            }}
        >
            {row.getVisibleCells().map((cell) => (
                <TableCell
                    key={cell.id}
                    className={cn(
                        "py-3",
                        cell.column.id === 'select' && frozenSelectCellClass,
                        cell.column.id === 'name' && frozenNameCellClass
                    )}
                >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
            ))}
        </motion.tr>
    )
}, (prev, next) => {
    // Custom comparison to include columnOrder
    return prev.row.id === next.row.id &&
        prev.index === next.index &&
        prev.columnOrder === next.columnOrder &&
        prev.healthLoading === next.healthLoading &&
        prev.healthUpdatedAt === next.healthUpdatedAt &&
        prev.isSelected === next.isSelected
})
