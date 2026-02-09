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
  RowSelectionState,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Clock, PhoneIncoming, PhoneOutgoing, Plus, Search, Filter, MoreHorizontal, Check } from 'lucide-react'
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
import { useTableState } from '@/hooks/useTableState'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import { toast } from 'sonner'

const PAGE_SIZE = 50

export default function CallsPage() {
  const { pageIndex, setPage, searchQuery, setSearch, pagination } = useTableState({ pageSize: PAGE_SIZE })
  const [globalFilter, setGlobalFilter] = useState(searchQuery)
  const [debouncedFilter, setDebouncedFilter] = useState(searchQuery)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
      setSearch(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter, setSearch])

  const { data, isLoading: queryLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useCalls(debouncedFilter)
  const { data: totalCallsCount } = useCallsCount(debouncedFilter)
  const calls = useMemo(() => data?.pages.flatMap(page => page.calls) || [], [data])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  useEffect(() => {
    const needed = (pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && calls.length < needed) {
      fetchNextPage()
    }
  }, [pageIndex, calls.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectedCount = Object.keys(rowSelection).length
  const handleSelectCount = (count: number) => {
    const idsToSelect = calls.slice(0, count).map(c => c.id)
    const newSelection: RowSelectionState = {}
    idsToSelect.forEach(id => { newSelection[id] = true })
    setRowSelection(newSelection)
  }
  const handleBulkAction = (action: string) => {
    if (action === 'delete') {
      toast.info('Bulk delete for call logs is not available.')
      return
    }
    toast.info(`Bulk action "${action}" for ${selectedCount} calls — coming soon.`)
  }

  const columns: ColumnDef<Call>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <div className="flex items-center justify-center px-2">
          <button
            type="button"
            onClick={table.getToggleAllPageRowsSelectedHandler()}
            className={cn(
              "w-4 h-4 rounded border border-white/20 transition-all flex items-center justify-center",
              table.getIsAllPageRowsSelected() ? "bg-[#002FA7] border-[#002FA7]" : "bg-transparent opacity-50 hover:opacity-100"
            )}
          >
            {table.getIsAllPageRowsSelected() && <Check className="w-3 h-3 text-white" />}
          </button>
        </div>
      ),
      cell: ({ row, table }) => {
        const pageIndex = table.getState().pagination.pageIndex
        const index = row.index + 1 + pageIndex * PAGE_SIZE
        const isSelected = row.getIsSelected()
        return (
          <div className="flex items-center justify-center px-2 relative group/select">
            <span className={cn(
              "font-mono text-[10px] text-zinc-700 transition-opacity",
              isSelected ? "opacity-0" : "group-hover/select:opacity-0"
            )}>
              {index.toString().padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); row.toggleSelected(); }}
              className={cn(
                "absolute inset-0 m-auto w-4 h-4 rounded border transition-all flex items-center justify-center",
                isSelected ? "bg-[#002FA7] border-[#002FA7] opacity-100" : "bg-white/5 border-white/10 opacity-0 group-hover/select:opacity-100"
              )}
            >
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </button>
          </div>
        )
      },
    },
    {
      accessorKey: 'contactName',
      header: ({ column }) => {
        return (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="icon-button-forensic -ml-4 flex items-center px-4 py-2 transition-all"
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Contact
          </button>
        )
      },
      cell: ({ row }) => {
        const call = row.original
        return (
          <div className="flex items-center gap-3 group/call cursor-pointer">
             <div className="w-8 h-8 rounded-2xl bg-black/40 flex items-center justify-center text-xs font-medium text-zinc-400 border border-white/5 transition-all">
                {call.contactName === 'Unknown' ? '?' : call.contactName.split(' ').map(n => n[0]).join('').substring(0, 2)}
             </div>
             <div>
                <div className="font-medium text-zinc-200 group-hover/call:text-white group-hover/call:scale-[1.02] transition-all origin-left">{call.contactName}</div>
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
            {type === 'Inbound' ? <PhoneIncoming className="w-4 h-4 text-emerald-500" /> : <PhoneOutgoing className="w-4 h-4 text-zinc-500" />}
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
              <button className="icon-button-forensic h-8 w-8 flex items-center justify-center">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-950 nodal-monolith-edge text-zinc-400">
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
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    autoResetPageIndex: false,
    state: {
      sorting,
      columnFilters,
      pagination: {
        pageIndex,
        pageSize: PAGE_SIZE,
      },
      rowSelection,
    },
  })

  const totalRecords = totalCallsCount || 0
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE))
  const displayTotalPages = totalCallsCount == null && hasNextPage
    ? Math.max(totalPages, pageIndex + 2)
    : totalPages

  const showingStart = totalRecords === 0
    ? 0
    : Math.min(totalRecords, pageIndex * PAGE_SIZE + 1)
  const showingEnd = totalRecords === 0
    ? 0
    : Math.min(totalRecords, (pageIndex + 1) * PAGE_SIZE)

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

      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
            <Table>
            <TableHeader className="sticky top-0 nodal-recessed z-20 border-b border-white/5">
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
        
        <div className="flex-none border-t border-white/5 nodal-recessed p-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                  <span>Sync_Block {showingStart.toString().padStart(2, '0')}–{showingEnd.toString().padStart(2, '0')}</span>
                  <div className="h-1 w-1 rounded-full bg-black/40" />
                  <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{totalRecords}</span></span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setPage(Math.max(0, pageIndex - 1))}
                    disabled={pageIndex === 0}
                    className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
                  {(pageIndex + 1).toString().padStart(2, '0')}
                </div>
                <button
                    onClick={async () => {
                      const nextPageIndex = pageIndex + 1
                      if (nextPageIndex >= displayTotalPages) return

                      const needed = (nextPageIndex + 1) * PAGE_SIZE
                      if (calls.length < needed && hasNextPage && !isFetchingNextPage) {
                        await fetchNextPage()
                      }

                      setPage(nextPageIndex)
                    }}
                    disabled={pageIndex + 1 >= displayTotalPages || (!hasNextPage && calls.length < (pageIndex + 2) * PAGE_SIZE)}
                    className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next page"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
      </div>

      <BulkActionDeck
        selectedCount={selectedCount}
        totalAvailable={totalRecords}
        onClear={() => setRowSelection({})}
        onAction={handleBulkAction}
        onSelectCount={handleSelectCount}
      />
    </div>
  )
}
