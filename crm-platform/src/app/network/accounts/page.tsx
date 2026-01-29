'use client'

import { useState, useEffect, useMemo } from 'react'
import { 
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Clock, Plus, Phone, Mail, MoreHorizontal, ArrowUpRight, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { formatDistanceToNow, format, isAfter, subMonths } from 'date-fns'
import { useAccounts, useAccountsCount, Account } from '@/hooks/useAccounts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { Badge } from '@/components/ui/badge'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import DestructModal from '@/components/network/DestructModal'
import FilterCommandDeck from '@/components/network/FilterCommandDeck'
import { ForensicTableSkeleton } from '@/components/network/ForensicTableSkeleton'
import Link from 'next/link'
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
import { ClickToCallButton } from '@/components/calls/ClickToCallButton'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

export default function AccountsPage() {
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter])

  const accountFilters = useMemo(() => {
    return {
      industry: (columnFilters.find(f => f.id === 'industry')?.value as string[]) || [],
      status: (columnFilters.find(f => f.id === 'status')?.value as string[]) || [],
      location: (columnFilters.find(f => f.id === 'location')?.value as string[]) || [],
    };
  }, [columnFilters]);

  const { data, isLoading: queryLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useAccounts(debouncedFilter, accountFilters)
  const { data: totalAccounts } = useAccountsCount(debouncedFilter, accountFilters)
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isMounted, setIsMounted] = useState(false)
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })
  const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const accounts = useMemo(() => data?.pages.flatMap(page => page.accounts) || [], [data])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const isLoading = queryLoading || !isMounted

  const effectiveTotalRecords = totalAccounts ?? accounts.length
  const totalPages = Math.max(1, Math.ceil(effectiveTotalRecords / PAGE_SIZE))
  const displayTotalPages = totalAccounts == null && hasNextPage
    ? Math.max(totalPages, pagination.pageIndex + 2)
    : totalPages

  const handleFilterChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const existing = prev.find(f => f.id === columnId)
      if (existing) {
        if (value === undefined) {
          return prev.filter(f => f.id !== columnId)
        }
        return prev.map(f => f.id === columnId ? { ...f, value } : f)
      }
      if (value === undefined) return prev
      return [...prev, { id: columnId, value }]
    })
    setPagination(p => ({ ...p, pageIndex: 0 }))
  }

  useEffect(() => {
    const needed = (pagination.pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && accounts.length < needed) {
      fetchNextPage()
    }
  }, [pagination.pageIndex, accounts.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectedCount = Object.keys(rowSelection).length

  const handleSelectCount = async (count: number) => {
    const newSelection: RowSelectionState = {}
    for (let i = 0; i < count; i++) {
      newSelection[i] = true
    }
    setRowSelection(newSelection)
    
    // If the requested count is more than currently loaded, fetch more
    if (count > accounts.length && hasNextPage && !isFetchingNextPage) {
      const pagesToFetch = Math.ceil((count - accounts.length) / PAGE_SIZE)
      for (let i = 0; i < pagesToFetch; i++) {
        await fetchNextPage()
      }
    }
  }

  const handleBulkAction = async (action: string) => {
    // Lazy load if selection exceeds current data
    if (selectedCount > accounts.length && hasNextPage && !isFetchingNextPage) {
      const pagesToFetch = Math.ceil((selectedCount - accounts.length) / PAGE_SIZE)
      for (let i = 0; i < pagesToFetch; i++) {
        await fetchNextPage()
      }
    }

    if (action === 'delete') {
      setIsDestructModalOpen(true)
    } else {
      console.log(`Executing ${action} for ${selectedCount} nodes`)
      // Implement other actions as needed
    }
  }

  const handleConfirmPurge = () => {
    console.log(`Purging ${selectedCount} nodes`)
    setIsDestructModalOpen(false)
    setRowSelection({})
    // Implement actual deletion logic here
  }

  const columns = useMemo<ColumnDef<Account>[]>(() => {
    return [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center px-2">
            <button
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
          const index = row.index + 1 + pagination.pageIndex * PAGE_SIZE
          const isSelected = row.getIsSelected()
          return (
            <div className="flex items-center justify-center px-2 relative group/select">
              {/* Default State: Row Number */}
              <span className={cn(
                "font-mono text-[10px] text-zinc-700 transition-opacity",
                isSelected ? "opacity-0" : "group-hover/select:opacity-0"
              )}>
                {index.toString().padStart(2, '0')}
              </span>
              
              {/* Hover/Selected State: Ghost Checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  row.toggleSelected()
                }}
                className={cn(
                  "absolute inset-0 m-auto w-4 h-4 rounded border transition-all flex items-center justify-center",
                  isSelected 
                    ? "bg-[#002FA7] border-[#002FA7] opacity-100" 
                    : "bg-white/5 border-white/10 opacity-0 group-hover/select:opacity-100"
                )}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </button>
            </div>
          )
        }
      },
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4 hover:bg-white/5 hover:text-white"
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              Account Name
            </Button>
          )
        },
        cell: ({ row }) => {
          const account = row.original
          return (
            <Link 
              href={`/network/accounts/${account.id}`}
              className="flex items-center gap-3 group/acc cursor-pointer"
            >
              <div className="relative">
                <CompanyIcon
                  logoUrl={account.logoUrl}
                  domain={account.domain}
                  name={account.name}
                  size={32}
                  className="w-9 h-9 rounded-lg nodal-glass p-1 border border-white/10 shadow-sm transition-all"
                />
              </div>
              <div>
                <div className="font-medium text-zinc-200 group-hover/acc:text-white group-hover/acc:scale-[1.02] transition-all flex items-center gap-1.5 origin-left">
                  {account.name}
                </div>
                {account.domain && (
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    {account.domain}
                  </div>
                )}
              </div>
            </Link>
          )
        },
      },
      {
        accessorKey: 'industry',
        header: 'Industry',
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const val = row.getValue(id) as string;
          if (!val) return false;
          // Check if the row's industry matches ANY of the selected industries in the filter array
          return value.includes(val);
        },
        cell: ({ row }) => <div className="text-zinc-400">{row.getValue('industry')}</div>,
      },
      {
        id: 'status',
        header: 'Status',
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => {
          const account = row.original
          const hasContract = !!account.contractEnd
          const isExpired = hasContract && new Date(account.contractEnd) < new Date()
          const isActive = hasContract && !isExpired

          return (
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isActive ? "bg-signal animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.5)]" : 
                isExpired ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : 
                "bg-zinc-600"
              )} />
              <span className={cn(
                "text-[10px] font-mono uppercase tracking-wider tabular-nums",
                isActive ? "text-signal" : 
                isExpired ? "text-red-500/80" : 
                "text-zinc-500"
              )}>
                {isActive ? 'Active' : isExpired ? 'Expired' : 'No Contract'}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: 'location',
        header: 'Location',
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const val = row.getValue(id) as string;
          if (!val) return false;
          return value.some((v: string) => val.toLowerCase().includes(v.toLowerCase()));
        },
        cell: ({ row }) => <div className="text-zinc-400">{row.getValue('location')}</div>,
      },
      {
        accessorKey: 'companyPhone',
        header: 'Phone',
        cell: ({ row }) => <div className="text-zinc-500 text-sm font-mono tabular-nums">{row.getValue('companyPhone')}</div>,
      },
      {
        accessorKey: 'employees',
        header: 'Employees',
        cell: ({ row }) => <div className="text-zinc-500 text-sm font-mono tabular-nums">{row.getValue('employees')}</div>,
      },
      {
        accessorKey: 'contractEnd',
        header: 'Contract End',
        cell: ({ row }) => {
          const dateStr = row.getValue('contractEnd') as string
          if (!dateStr) return <span className="text-zinc-600 font-mono text-xs">--</span>
          try {
            const date = new Date(dateStr)
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
            return <span className="text-zinc-600 font-mono text-xs">{dateStr}</span>
          }
        },
      },
      {
        accessorKey: 'updated',
        header: 'Last Update',
        cell: ({ row }) => {
          const val = row.original.updated
          if (!val) return <span className="text-zinc-600 font-mono text-xs">--</span>
          
          try {
            const date = new Date(val)
            const threeMonthsAgo = subMonths(new Date(), 3)
            const isRecent = isAfter(date, threeMonthsAgo)
            
            return (
              <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs tabular-nums">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isRecent ? "bg-signal animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.5)]" : "bg-zinc-600"
                )} />
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
        id: 'actions',
        cell: ({ row }) => {
          const account = row.original
          return (
            <div className="flex items-center justify-end gap-2">
              <ClickToCallButton 
                phoneNumber={account.companyPhone}
                account={account.name}
                logoUrl={account.logoUrl}
                isCompany={true}
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10">
                <Mail className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-zinc-300">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer">View Details</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer">Edit Account</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem className="text-red-400 hover:bg-red-500/10 cursor-pointer">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ]
  }, [pagination.pageIndex])

  const table = useReactTable({
    data: accounts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    autoResetPageIndex: false,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      rowSelection,
    },
  })

  const filteredRowCount = table.getFilteredRowModel().rows.length
  const showingStart = filteredRowCount === 0
    ? 0
    : Math.min(filteredRowCount, pagination.pageIndex * PAGE_SIZE + 1)
  const showingEnd = filteredRowCount === 0
    ? 0
    : Math.min(filteredRowCount, (pagination.pageIndex + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Accounts"
        description="Manage your business accounts and territories."
        globalFilter={globalFilter}
        onSearchChange={(value) => {
          setGlobalFilter(value)
          setPagination((p) => ({ ...p, pageIndex: 0 }))
        }}
        onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
        isFilterActive={isFilterOpen || columnFilters.length > 0}
        primaryAction={{
          label: "Add Account",
          onClick: () => {},
          icon: <Plus size={18} className="mr-2" />
        }}
      />

      <FilterCommandDeck 
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        type="account"
        columnFilters={columnFilters}
        onFilterChange={handleFilterChange}
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
                        onClick={() => router.push(`/network/accounts/${row.original.id}`)}
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
                    No accounts found.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
        
        <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                  <span>Sync_Block {showingStart}–{showingEnd}</span>
                  <div className="h-1 w-1 rounded-full bg-zinc-800" />
                  <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{effectiveTotalRecords}</span></span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPagination((p) => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }))}
                    disabled={pagination.pageIndex === 0}
                    className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
                  {(pagination.pageIndex + 1).toString().padStart(2, '0')}
                </div>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      const nextPageIndex = pagination.pageIndex + 1
                      if (nextPageIndex >= displayTotalPages) return

                      const needed = (nextPageIndex + 1) * PAGE_SIZE
                      if (accounts.length < needed && hasNextPage && !isFetchingNextPage) {
                        await fetchNextPage()
                      }

                      setPagination((p) => ({ ...p, pageIndex: nextPageIndex }))
                    }}
                    disabled={pagination.pageIndex + 1 >= displayTotalPages || (!hasNextPage && accounts.length < (pagination.pageIndex + 2) * PAGE_SIZE)}
                    className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                    aria-label="Next page"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
      </div>

      <BulkActionDeck 
        selectedCount={selectedCount}
        totalAvailable={effectiveTotalRecords}
        onClear={() => setRowSelection({})}
        onAction={handleBulkAction}
        onSelectCount={handleSelectCount}
      />

      <DestructModal 
        isOpen={isDestructModalOpen}
        onClose={() => setIsDestructModalOpen(false)}
        onConfirm={handleConfirmPurge}
        count={selectedCount}
      />
    </div>
  )
}
