'use client'

import { useState, useEffect } from 'react'
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
} from '@tanstack/react-table'
import { Search, Plus, Filter, MoreHorizontal, Mail, Phone, ArrowUpDown } from 'lucide-react'
import { useAccounts, Account } from '@/hooks/useAccounts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
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

export default function AccountsPage() {
  const { data: accounts, isLoading: queryLoading, isError } = useAccounts()
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const isLoading = queryLoading || !isMounted

  const columns: ColumnDef<Account>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4 hover:bg-white/5 hover:text-white"
          >
            Account Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const account = row.original
        return (
          <div className="flex items-center gap-3">
             <CompanyIcon 
                logoUrl={account.logoUrl} 
                domain={account.domain} 
                name={account.name} 
                size={32}
                className="w-8 h-8 rounded-lg" 
             />
             <div>
                <div className="font-medium text-zinc-200">{account.name}</div>
                {account.domain && (
                    <a href={`https://${account.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:text-signal transition-colors">
                        {account.domain}
                    </a>
                )}
             </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      cell: ({ row }) => <div className="text-zinc-400">{row.getValue('industry')}</div>,
    },
    {
      accessorKey: 'location',
      header: 'Location',
      cell: ({ row }) => <div className="text-zinc-400">{row.getValue('location')}</div>,
    },
    {
      accessorKey: 'companyPhone',
      header: 'Phone',
      cell: ({ row }) => <div className="text-zinc-500 text-sm">{row.getValue('companyPhone')}</div>,
    },
    {
      accessorKey: 'employees',
      header: 'Employees',
      cell: ({ row }) => <div className="text-zinc-500 text-sm">{row.getValue('employees')}</div>,
    },
    {
      accessorKey: 'contractEnd',
      header: 'Contract End',
      cell: ({ row }) => {
        const date = row.getValue('contractEnd') as string
        return <div className="text-zinc-500 text-sm">{date}</div>
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <div className="flex items-center justify-end gap-2">
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

  const table = useReactTable({
    data: accounts || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    initialState: {
        pagination: {
            pageSize: 50
        }
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  })

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-none space-y-4">
        <div className="flex items-center justify-between">
            <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Accounts</h1>
            <p className="text-zinc-400 mt-1">Manage your business accounts and territories.</p>
            </div>
            <Button className="bg-signal hover:bg-blue-700 text-white transition-colors gap-2">
            <Plus size={18} />
            Add Account
            </Button>
        </div>

        <div className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
            <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <Input 
                placeholder="Filter current view..." 
                value={globalFilter ?? ""}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="pl-10 bg-zinc-950 border-white/10 text-white placeholder:text-zinc-600 focus-visible:ring-signal"
            />
            </div>
            <Button variant="outline" className="gap-2 bg-zinc-900 border-white/10 text-zinc-400 hover:text-white hover:bg-white/5">
            <Filter size={16} />
            Filter
            </Button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
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
                        Loading accounts...
                    </TableCell>
                </TableRow>
                ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                    <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="border-white/5 hover:bg-white/5 transition-colors group"
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
                    No accounts found.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
        
        <div className="flex-none border-t border-white/10 bg-zinc-900/50 p-4 flex items-center justify-between z-10 backdrop-blur-md">
            <div className="text-sm text-zinc-500">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="border-white/10 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                >
                    Previous
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="border-white/10 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                >
                    Next
                </Button>
            </div>
        </div>
      </div>
    </div>
  )
}
