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
    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
                duration: 0.3,
                delay: Math.min(index * 0.02, 0.4),
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
                <TableCell key={cell.id} className="py-3">
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
