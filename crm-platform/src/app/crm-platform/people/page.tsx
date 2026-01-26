'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Clock, Plus, Phone, Mail, MoreHorizontal } from 'lucide-react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { formatDistanceToNow, format, isAfter, subMonths } from 'date-fns'
import { useContacts, useContactsCount, Contact } from '@/hooks/useContacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
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
import { ClickToCallButton } from '@/components/calls/ClickToCallButton'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

export default function PeoplePage() {
  const router = useRouter()
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter])

  const { data, isLoading: queryLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useContacts(debouncedFilter)
  const { data: totalContacts } = useContactsCount(debouncedFilter)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [isMounted, setIsMounted] = useState(false)
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })

  const contacts = useMemo(() => data?.pages.flatMap(page => page.contacts) || [], [data])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const isLoading = queryLoading || !isMounted

  const effectiveTotalRecords = totalContacts ?? contacts.length
  const totalPages = Math.max(1, Math.ceil(effectiveTotalRecords / PAGE_SIZE))
  const displayTotalPages = totalContacts == null && hasNextPage
    ? Math.max(totalPages, pagination.pageIndex + 2)
    : totalPages

  useEffect(() => {
    const needed = (pagination.pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && contacts.length < needed) {
      fetchNextPage()
    }
  }, [pagination.pageIndex, contacts.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const columns = useMemo<ColumnDef<Contact>[]>(() => {
    return [
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4 hover:bg-white/5 hover:text-white"
            >
              Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const contact = row.original
          const initials = contact.name
            .split(' ')
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase()
          return (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full nodal-glass flex items-center justify-center text-[10px] font-semibold text-white/90 border border-white/10 shadow-sm group-hover:shadow-[#002FA7]/20 transition-all">
                {initials}
              </div>
              <div>
                <div className="font-medium text-zinc-200 group-hover:text-white transition-colors">{contact.name}</div>
                <div className="text-xs text-zinc-500 font-mono tracking-tight">{contact.email}</div>
              </div>
            </div>
          )
        }
      },
      {
        accessorKey: 'company',
        header: 'Company',
        cell: ({ row }) => {
          const companyName = row.getValue('company') as string
          const contact = row.original
          return (
            <div className="flex items-center gap-2 group/acc">
              <CompanyIcon
                logoUrl={contact.logoUrl}
                domain={contact.companyDomain}
                name={companyName}
                size={32}
                className="w-9 h-9 rounded-lg nodal-glass p-1 border border-white/10 shadow-sm group-hover/acc:border-[#002FA7]/30 transition-all"
              />
              <span className="text-zinc-400 group-hover/acc:text-white transition-colors">{companyName}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => <div className="text-zinc-500 text-sm font-mono tabular-nums">{row.getValue('phone')}</div>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          const isCustomer = status === 'Customer'
          const isLead = status === 'Lead'
          
          return (
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCustomer ? "bg-signal animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.5)]" : 
                isLead ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : 
                "bg-zinc-600"
              )} />
              <span className={cn(
                "text-[10px] font-mono uppercase tracking-wider tabular-nums",
                isCustomer ? "text-signal" : 
                isLead ? "text-blue-500/80" : 
                "text-zinc-500"
              )}>
                {isCustomer ? 'Active' : status}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: 'lastContact',
        header: 'Last Contact',
        cell: ({ row }) => {
          const val = row.getValue('lastContact') as string
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
          const contact = row.original
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <ClickToCallButton 
                phoneNumber={contact.phone}
                name={contact.name}
                account={contact.company}
                logoUrl={contact.logoUrl}
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
                  <DropdownMenuItem
                    className="hover:bg-white/5 cursor-pointer"
                    onClick={() => router.push(`/crm-platform/contacts/${contact.id}`)}
                  >
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer">Edit Person</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem className="text-red-400 hover:bg-red-500/10 cursor-pointer">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ]
  }, [router])

  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
    },
  })

  const rows = table.getRowModel().rows
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
        title="People"
        description="Manage your clients and prospects."
        globalFilter={globalFilter}
        onSearchChange={(value) => {
          setGlobalFilter(value)
          setPagination((p) => ({ ...p, pageIndex: 0 }))
        }}
        primaryAction={{
          label: "Add Person",
          onClick: () => {}, // Add your add person logic here
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
                <TableRow>
                    <TableCell colSpan={columns.length} className="h-24">
                        <div className="flex items-center justify-center gap-3 text-zinc-500">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-800 border-t-[#002FA7]" />
                          <span className="font-mono text-xs uppercase tracking-widest">Initialising...</span>
                        </div>
                    </TableCell>
                </TableRow>
                ) : isError ? (
                <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-red-400">
                        Error loading people. Please check your internet connection or permissions.
                    </TableCell>
                </TableRow>
                ) : rows?.length ? (
                rows.map((row) => (
                    <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="border-white/5 hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => router.push(`/crm-platform/contacts/${row.original.id}`)}
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
                        No people found.
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
                      if (contacts.length < needed && hasNextPage && !isFetchingNextPage) {
                        await fetchNextPage()
                      }

                      setPagination((p) => ({ ...p, pageIndex: nextPageIndex }))
                    }}
                    disabled={pagination.pageIndex + 1 >= displayTotalPages || (!hasNextPage && contacts.length < (pagination.pageIndex + 2) * PAGE_SIZE)}
                    className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
      </div>
    </div>
  )
}
