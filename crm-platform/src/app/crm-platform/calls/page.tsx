'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { ArrowUpDown, ChevronLeft, ChevronRight, Clock, PhoneIncoming, PhoneOutgoing, Plus, Search, Filter, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { formatDistanceToNow, format, isAfter, subMonths } from 'date-fns'
import { useCalls, useCallsCount, Call } from '@/hooks/useCalls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { useRouter } from 'next/navigation'

export default function CallsPage() {
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter])

  const { data, isLoading: queryLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useCalls(debouncedFilter)
  const { data: totalCallsCount } = useCallsCount(debouncedFilter)
  const calls = useMemo(() => data?.pages.flatMap(page => page.calls) || [], [data])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const columns: ColumnDef<Call>[] = [
    {
      accessorKey: 'contactName',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4 hover:bg-white/5 hover:text-white"
          >
            Contact
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const call = row.original
        return (
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 border border-white/5">
                {call.contactName === 'Unknown' ? '?' : call.contactName.split(' ').map(n => n[0]).join('').substring(0, 2)}
             </div>
             <div>
                <div className="font-medium text-zinc-200">{call.contactName}</div>
                <div className="text-xs text-zinc-500 font-mono tabular-nums">{call.phoneNumber}</div>
             </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.getValue('type') as string
        return (
          <div className="flex items-center gap-2 text-zinc-400">
            {type === 'Inbound' ? <PhoneIncoming className="w-4 h-4 text-green-500" /> : <PhoneOutgoing className="w-4 h-4 text-[#002FA7]" />}
            <span className="text-[10px] font-mono uppercase tracking-wider">{type}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        const isCompleted = status === 'Completed'
        const isMissed = status === 'Missed'
        const isVoicemail = status === 'Voicemail'
        
        return (
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.4)]",
              isCompleted ? "bg-green-500 animate-pulse shadow-green-500/50" : 
              isMissed ? "bg-red-500 shadow-red-500/50" : 
              isVoicemail ? "bg-yellow-500 shadow-yellow-500/50" :
              "bg-zinc-600 shadow-zinc-600/50"
            )} />
            <span className={cn(
              "text-[10px] font-mono uppercase tracking-wider",
              isCompleted ? "text-green-500/80" : 
              isMissed ? "text-red-500/80" : 
              isVoicemail ? "text-yellow-500/80" :
              "text-zinc-500"
            )}>
              {status}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'duration',
      header: 'Duration',
      cell: ({ row }) => <div className="text-zinc-500 font-mono tabular-nums">{row.getValue('duration')}</div>,
    },
    {
      accessorKey: 'date',
      header: 'Date/Time',
      cell: ({ row }) => {
        const val = row.getValue('date') as string
        if (!val) return <span className="text-zinc-600 font-mono text-xs">--</span>
        
        try {
          const date = new Date(val)
          const threeMonthsAgo = subMonths(new Date(), 3)
          const isRecent = isAfter(date, threeMonthsAgo)
          
          return (
            <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs tabular-nums">
              <Clock size={12} className="text-zinc-600" />
              <span>
                {isRecent 
                  ? formatDistanceToNow(date, { addSuffix: true })
                  : format(date, 'MMM d, yyyy')}
              </span>
            </div>
          )
        } catch (e) {
          return <span className="text-zinc-600 font-mono text-xs">{val}</span>
        }
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-white/10 hover:text-white">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-zinc-400">
              <DropdownMenuLabel className="text-zinc-200">Actions</DropdownMenuLabel>
              <DropdownMenuItem className="focus:bg-white/10 focus:text-white cursor-pointer">View Details</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="focus:bg-white/10 focus:text-white cursor-pointer">Call Back</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data: calls || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalRecords = totalCallsCount || 0
  const showingStart = totalRecords === 0
    ? 0
    : Math.min(totalRecords, pageIndex * pageSize + 1)
  const showingEnd = totalRecords === 0
    ? 0
    : Math.min(totalRecords, (pageIndex + 1) * pageSize)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Call Logs"
        description="Monitor grid-wide communications and dialer activity."
        globalFilter={globalFilter}
        onSearchChange={(value) => {
          setGlobalFilter(value)
        }}
        primaryAction={{
          label: "Log Call",
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
                {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                    <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="border-white/5 hover:bg-white/[0.02] transition-colors group"
                    >
                    {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                    ))}
                    </TableRow>
                ))
                ) : (
                <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                    {queryLoading ? 'Loading calls...' : 'No calls found.'}
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
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
                  {(pageIndex + 1).toString().padStart(2, '0')}
                </div>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                    aria-label="Next page"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
      </div>
    </div>
  )
}
