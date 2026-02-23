'use client'

import { Skeleton } from "@/components/ui/skeleton"
import { TableRow, TableCell } from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface ForensicTableSkeletonProps {
  columns: number;
  rows?: number;
  type?: 'account' | 'people';
}

export function ForensicTableSkeleton({ columns, rows = 10, type = 'account' }: ForensicTableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i} className="border-white/5 hover:bg-transparent" data-type={type}>
          {Array.from({ length: columns }).map((_, j) => (
            <TableCell key={j} className="py-3">
              {j === 0 ? (
                // Checkbox/Selection area
                <Skeleton className="h-4 w-4 rounded" />
              ) : j === 1 ? (
                // Primary identity area (Avatar + Name + Subtitle)
                <div className="flex items-center gap-3">
                  <Skeleton className={cn(
                    "h-10 w-10",
                    "rounded-[14px]"
                  )} />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ) : j === columns - 1 ? (
                // Actions area
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              ) : (
                // Generic data cell
                <Skeleton className="h-4 w-20" />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
