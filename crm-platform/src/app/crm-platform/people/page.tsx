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
import { Search, Plus, Filter, MoreHorizontal, Mail, Phone, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

export default function PeoplePage() {
  const router = useRouter()
  const { data, isLoading: queryLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useContacts()
  const { data: totalContacts } = useContactsCount()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
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
          return (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 border border-white/5">
                {initials}
              </div>
              <div>
                <div className="font-medium text-zinc-200">{contact.name}</div>
                <div className="text-xs text-zinc-500">{contact.email}</div>
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
            <div className="flex items-center gap-2">
              <CompanyIcon
                logoUrl={contact.logoUrl}
                domain={contact.companyDomain}
                name={companyName}
                size={20}
                className="w-5 h-5 rounded-sm"
              />
              <span className="text-zinc-400">{companyName}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          return (
            <span className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
              status === 'Customer' && "bg-green-500/10 text-green-500 border-green-500/20",
              status === 'Lead' && "bg-blue-500/10 text-blue-500 border-blue-500/20",
              status === 'Churned' && "bg-red-500/10 text-red-500 border-red-500/20",
            )}>
              {status}
            </span>
          )
        },
      },
      {
        accessorKey: 'lastContact',
        header: 'Last Contact',
        cell: ({ row }) => <div className="text-zinc-500">{row.getValue('lastContact')}</div>,
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const contact = row.original
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10">
                <Phone className="h-4 w-4" />
              </Button>
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
      <div className="flex-none space-y-4">
        <div className="flex items-center justify-between">
            <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">People</h1>
            <p className="text-zinc-400 mt-1">Manage your clients and prospects.</p>
            </div>
            <Button className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium">
            <Plus size={18} className="mr-2" />
            Add Person
            </Button>
        </div>

        <div className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
            <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <Input 
                placeholder="Filter current view..." 
                value={globalFilter ?? ""}
                onChange={(event) => {
                  setGlobalFilter(event.target.value)
                  setPagination((p) => ({ ...p, pageIndex: 0 }))
                }}
                className="pl-10 bg-zinc-950 border-white/10 text-white placeholder:text-zinc-600 focus-visible:ring-indigo-500"
            />
            </div>
            <Button variant="outline" className="gap-2 bg-zinc-900 border-white/10 text-zinc-400 hover:text-white hover:bg-white/5">
            <Filter size={16} />
            Filter
            </Button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
            <Table>
            <TableHeader className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-20 shadow-sm border-b border-white/5">
                {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-white/5 hover:bg-transparent">
                    {headerGroup.headers.map((header) => {
                    return (
                        <TableHead key={header.id} className="text-zinc-400 font-medium">
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
                    <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                        Loading people...
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
                    className="border-white/5 hover:bg-white/5 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/crm-platform/contacts/${row.original.id}`)}
                    >
                    {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-4">
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
        
        <div className="flex-none border-t border-white/10 bg-zinc-900/50 p-4 flex items-center justify-between z-10 backdrop-blur-md">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-sm text-zinc-500">
                  <span>Showing {showingStart}–{showingEnd}</span>
                  <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400">
                    Total {effectiveTotalRecords}
                  </Badge>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPagination((p) => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }))}
                    disabled={pagination.pageIndex === 0}
                    className="border-white/10 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    aria-label="Previous page"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-8 text-center text-sm text-zinc-400 tabular-nums">
                  {pagination.pageIndex + 1}
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
                    className="border-white/10 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                    aria-label="Next page"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </div>
    </div>
  )
}
