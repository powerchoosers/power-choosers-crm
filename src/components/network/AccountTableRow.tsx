'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { flexRender, Row } from '@tanstack/react-table'
import { TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Account } from '@/hooks/useAccounts'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
    getColumnAfterName,
    getFrozenNameCellClass,
    getFrozenSelectCellClass,
} from '@/components/network/frozenTable'

interface AccountTableRowProps {
    row: Row<Account>
    index: number
    router: AppRouterInstance
    saveScroll: () => void
    columnOrder?: string[]
    healthLoading?: boolean
    healthUpdatedAt?: number
    isSelected: boolean
}

export const AccountTableRow = memo(function AccountTableRow({
    row,
    index,
    router,
    saveScroll,
    columnOrder,
    healthLoading,
    healthUpdatedAt,
    isSelected
}: AccountTableRowProps) {
    const isAnimated = index < 12
    const nextAfterNameColumnId = getColumnAfterName(columnOrder)
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
                "transition-colors group cursor-pointer relative z-10",
                isSelected
                    ? "bg-[#002FA7]/5 hover:bg-[#002FA7]/10"
                    : "hover:bg-white/[0.02]"
            )}
            onClick={() => {
                saveScroll()
                router.push(`/network/accounts/${row.original.id}`)
            }}
        >
            {row.getVisibleCells().map((cell) => {
                const isFrozenCell = cell.column.id === 'select' || cell.column.id === 'name'

                return (
                    <TableCell
                        key={cell.id}
                        className={cn(
                            "py-3",
                            !isFrozenCell && "border-b border-white/5",
                            cell.column.id === 'select' && getFrozenSelectCellClass(isSelected),
                            cell.column.id === 'name' && getFrozenNameCellClass(isSelected),
                            cell.column.id === nextAfterNameColumnId && "pl-5"
                        )}
                    >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                )
            })}
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
