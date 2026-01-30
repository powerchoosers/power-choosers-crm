'use client'

import { useState, useEffect } from 'react'
import { 
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Plus, Zap, Filter, Search, MoreHorizontal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { useEnergyPlans, EnergyPlan } from '@/hooks/useEnergy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ForensicTableSkeleton } from '@/components/network/ForensicTableSkeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from '@/lib/utils'
import { Badge } from "@/components/ui/badge"

export default function EnergyPage() {
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter])

  const { data: plans, isLoading } = useEnergyPlans(debouncedFilter)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const columns: ColumnDef<EnergyPlan>[] = [
    {
      accessorKey: 'provider',
      header: ({ column }) => {
        return (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="icon-button-forensic -ml-4 flex items-center px-4 py-2 transition-all"
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Provider
          </button>
        )
      },
      cell: ({ row }) => (
        <div className="font-medium text-zinc-200 group-hover:text-white group-hover:scale-[1.02] transition-all origin-left cursor-pointer">
          {row.getValue('provider')}
        </div>
      ),
    },
    {
      accessorKey: 'planName',
      header: 'Plan Name',
      cell: ({ row }) => <div className="text-zinc-400">{row.getValue('planName')}</div>,
    },
    {
      accessorKey: 'rate',
      header: ({ column }) => {
        return (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="icon-button-forensic -ml-4 flex items-center px-4 py-2 transition-all"
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Rate (¢/kWh)
          </button>
        )
      },
      cell: ({ row }) => <div className="text-zinc-200 font-mono tabular-nums">{row.getValue<number>('rate').toFixed(1)}¢</div>,
    },
    {
      accessorKey: 'term',
      header: 'Term',
      cell: ({ row }) => <div className="text-zinc-400 font-mono tabular-nums">{row.getValue('term')} mo</div>,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400 font-mono tabular-nums uppercase tracking-wider text-[10px]">{row.getValue('type')}</Badge>,
    },
    {
      accessorKey: 'renewable',
      header: 'Renewable',
      cell: ({ row }) => {
        const renewable = row.getValue<number>('renewable')
        return (
          <div className={cn("flex items-center gap-1.5 font-mono tabular-nums", renewable === 100 ? "text-green-500" : "text-zinc-500")}>
            <Zap className={cn("w-3.5 h-3.5", renewable === 100 && "fill-current")} />
            <span>{renewable}%</span>
          </div>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="icon-button-forensic h-8 w-8 flex items-center justify-center">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-zinc-400">
              <DropdownMenuLabel className="text-zinc-200">Actions</DropdownMenuLabel>
              <DropdownMenuItem className="focus:bg-white/10 focus:text-white cursor-pointer">View Details</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="focus:bg-white/10 focus:text-white cursor-pointer">Select Plan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data: plans || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    autoResetPageIndex: false,
    state: {
      sorting,
      columnFilters,
    },
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalRecords = plans?.length || 0
  const showingStart = totalRecords === 0
    ? 0
    : Math.min(totalRecords, pageIndex * pageSize + 1)
  const showingEnd = totalRecords === 0
    ? 0
    : Math.min(totalRecords, (pageIndex + 1) * pageSize)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Energy Plans"
        description="Compare real-time grid rates and plan availability."
        globalFilter={globalFilter}
        onSearchChange={(value) => {
          setGlobalFilter(value)
        }}
        primaryAction={{
          label: "Add Plan",
          onClick: () => {},
          icon: <Plus size={18} className="mr-2" />
        }}
      />

      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none bg-gradient-to-b from-white/5 to-transparent z-10" />
        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
          <Table>
            <TableHeader className="sticky top-0 bg-zinc-900/80 backdrop-blur-sm z-20 border-b border-white/5">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-none hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <ForensicTableSkeleton columns={columns.length} rows={12} />
              ) : table.getRowModel().rows?.length ? (
                <AnimatePresence mode="popLayout">
                  {table.getRowModel().rows.map((row, index) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ 
                        duration: 0.3, 
                        delay: Math.min(index * 0.02, 0.4),
                        ease: [0.23, 1, 0.32, 1] 
                      }}
                      data-state={row.getIsSelected() && "selected"}
                      className={cn(
                        "border-b border-white/5 transition-colors group cursor-pointer relative z-10",
                        row.getIsSelected() 
                          ? "bg-[#002FA7]/5 hover:bg-[#002FA7]/10" 
                          : "hover:bg-white/[0.02]"
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
                  ))}
                </AnimatePresence>
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                    No plans found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                <span>Sync_Block {showingStart.toString().padStart(2, '0')}–{showingEnd.toString().padStart(2, '0')}</span>
                <div className="h-1 w-1 rounded-full bg-zinc-800" />
                <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{totalRecords}</span></span>
              </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
              {(pageIndex + 1).toString().padStart(2, '0')}
            </div>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
