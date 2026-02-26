'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { flexRender, Row } from '@tanstack/react-table'
import { TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Task } from '@/hooks/useTasks'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

interface TaskTableRowProps {
    row: Row<Task>
    index: number
    router: AppRouterInstance
}

export const TaskTableRow = memo(function TaskTableRow({
    row,
    index,
    router
}: TaskTableRowProps) {
    const task = row.original
    return (
        <motion.tr
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
                duration: 0.3,
                delay: Math.min(index * 0.02, 0.4),
                ease: [0.23, 1, 0.32, 1]
            }}
            data-state={row.getIsSelected() ? "selected" : undefined}
            onClick={() => {
                if (task.contactId) {
                    router.push(`/network/contacts/${task.contactId}`)
                } else if (task.accountId) {
                    router.push(`/network/accounts/${task.accountId}`)
                }
            }}
            className={cn(
                "border-b border-white/5 transition-colors group relative z-10",
                (task.contactId || task.accountId)
                    ? "cursor-pointer hover:bg-white/[0.02]"
                    : "",
                row.getIsSelected()
                    ? "bg-[#002FA7]/5 hover:bg-[#002FA7]/10"
                    : ""
            )}
        >
            {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-3">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                    >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </motion.div>
                </TableCell>
            ))}
        </motion.tr>
    )
})
