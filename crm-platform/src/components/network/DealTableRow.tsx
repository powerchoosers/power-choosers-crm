'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { flexRender, Row } from '@tanstack/react-table'
import { TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Deal } from '@/types/deals'

interface DealTableRowProps {
    row: Row<Deal>
    index: number
    isSelected: boolean
    isPreviewActive?: boolean
    onSelect: (deal: Deal) => void
}

export const DealTableRow = memo(function DealTableRow({
    row,
    index,
    isSelected,
    isPreviewActive,
    onSelect,
}: DealTableRowProps) {
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
                isPreviewActive
                    ? "bg-[#002FA7]/8 hover:bg-[#002FA7]/12"
                    : undefined,
                isSelected
                    ? "bg-[#002FA7]/5 hover:bg-[#002FA7]/10"
                    : "hover:bg-white/[0.02]"
            )}
            onClick={() => {
                onSelect(row.original)
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
    return prev.row.id === next.row.id &&
        prev.index === next.index &&
        prev.isSelected === next.isSelected &&
        prev.isPreviewActive === next.isPreviewActive &&
        prev.onSelect === next.onSelect
})
