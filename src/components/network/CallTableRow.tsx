'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { flexRender, Row } from '@tanstack/react-table'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Call } from '@/hooks/useCalls'

interface CallTableRowProps {
    row: Row<Call>
}

export const CallTableRow = memo(function CallTableRow({
    row
}: CallTableRowProps) {
    return (
        <TableRow
            data-state={row.getIsSelected() ? "selected" : undefined}
            className={cn(
                "border-white/5 transition-colors group",
                row.getIsSelected() ? "bg-[#002FA7]/5 hover:bg-[#002FA7]/10" : "hover:bg-white/[0.02]"
            )}
        >
            {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
            ))}
        </TableRow>
    )
})
