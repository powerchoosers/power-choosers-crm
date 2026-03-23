'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from "@/components/ui/skeleton"
import { TableRow, TableCell } from "@/components/ui/table"

interface ForensicTableSkeletonProps {
  columns: number;
  rows?: number;
  type?: 'account' | 'people' | 'task' | 'deal';
}

const ROW_HEIGHT_BY_TYPE: Record<NonNullable<ForensicTableSkeletonProps['type']>, number> = {
  people: 66,
  account: 64,
  task: 58,
  deal: 58,
}

export function ForensicTableSkeleton({ columns, rows = 10, type = 'account' }: ForensicTableSkeletonProps) {
  const [autoRows, setAutoRows] = useState(rows)

  useEffect(() => {
    const computeRows = () => {
      const rowHeight = ROW_HEIGHT_BY_TYPE[type]
      const estimatedVisibleHeight = Math.round(window.innerHeight * 0.62)
      const viewportRows = Math.ceil(estimatedVisibleHeight / rowHeight) + 2
      setAutoRows(Math.max(rows, viewportRows))
    }

    computeRows()
    window.addEventListener('resize', computeRows)
    return () => window.removeEventListener('resize', computeRows)
  }, [rows, type])

  const effectiveRows = Math.max(rows, autoRows)

  const renderSelectCell = () => {
    return (
      <div className="flex items-center justify-center px-2 relative h-full min-h-[40px]">
        <Skeleton className="h-3 w-4 rounded-sm opacity-50" />
        <div className="absolute inset-x-[-8px] inset-y-[-12px] flex items-center justify-center">
          <Skeleton className="h-4 w-4 rounded border border-white/10 bg-white/5 opacity-35" />
        </div>
      </div>
    )
  }

  const renderPeopleCell = (j: number) => {
    if (j === 0) return renderSelectCell()
    if (j === 1) {
      return (
        <div className="flex items-center gap-3 min-w-0">
          <Skeleton className="h-9 w-9 rounded-[14px] shrink-0" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      )
    }
    if (j === 3) {
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="h-9 w-9 rounded-[14px] shrink-0" />
          <Skeleton className="h-4 w-28" />
        </div>
      )
    }
    if (j === columns - 1) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      )
    }
    return <Skeleton className="h-4 w-20" />
  }

  const renderAccountCell = (j: number) => {
    if (j === 0) return renderSelectCell()
    if (j === 1) {
      return (
        <div className="flex items-center gap-3 min-w-0">
          <Skeleton className="h-9 w-9 rounded-[14px] shrink-0" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      )
    }
    if (j === columns - 1) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      )
    }
    return <Skeleton className="h-4 w-20" />
  }

  const renderTaskCell = (j: number) => {
    if (j === 0) return <Skeleton className="h-4 w-4 rounded" />
    if (j === 1) {
      return (
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      )
    }
    if (j === 2) return <Skeleton className="h-6 w-20 rounded-full" />
    if (j === 3) {
      return (
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5 rounded-sm" />
          <Skeleton className="h-3 w-20" />
        </div>
      )
    }
    if (j === columns - 1) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      )
    }
    return <Skeleton className="h-4 w-24" />
  }

  const renderDealCell = (j: number) => {
    if (j === 0) return <Skeleton className="h-4 w-4 rounded" />
    if (j === 1) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      )
    }
    if (j === 2) return <Skeleton className="h-6 w-24 rounded-full" />
    if (j === columns - 1) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      )
    }
    return <Skeleton className="h-4 w-20" />
  }

  return (
    <>
      {Array.from({ length: effectiveRows }).map((_, i) => (
        <TableRow key={i} className="border-white/5 hover:bg-transparent" data-type={type}>
          {Array.from({ length: columns }).map((_, j) => (
            <TableCell key={j} className="py-3">
              {type === 'task'
                ? renderTaskCell(j)
                : type === 'deal'
                  ? renderDealCell(j)
                  : type === 'people'
                    ? renderPeopleCell(j)
                    : renderAccountCell(j)}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
