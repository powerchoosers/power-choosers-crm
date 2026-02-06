'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
import { ArrowUpDown, Clock, Plus, Phone, Mail, MoreHorizontal, Check, Radar, Users, Building2, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { formatDistanceToNow, format, isAfter, subMonths } from 'date-fns'
import { useContacts, useContactsCount, useDeleteContacts, Contact } from '@/hooks/useContacts'
import { useAccounts, useAccountsCount, useDeleteAccounts, Account } from '@/hooks/useAccounts'
import { useTarget } from '@/hooks/useTargets'
import { useTableState } from '@/hooks/useTableState'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
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

export default function TargetDetailPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const [isMounted, setIsMounted] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  // Use state-preserving table state
  const { 
    pageIndex, 
    pageSize, 
    searchQuery, 
    setPage, 
    setSearch, 
  } = useTableState({
    pageSize: PAGE_SIZE
  })

  // Sync the local globalFilter state with the URL search query if needed
  useEffect(() => {
    if (searchQuery !== globalFilter) {
      setGlobalFilter(searchQuery)
    }
  }, [searchQuery])

  // Sync the search back to the URL search query
  const debouncedSearch = useDebounce(globalFilter, 300)
  useEffect(() => {
    setSearch(debouncedSearch)
  }, [debouncedSearch, setSearch])

  const { data: target, isLoading: targetLoading } = useTarget(id)

  const isPeopleList = target?.kind === 'people' || target?.kind === 'person' || target?.kind === 'contact' || target?.kind === 'contacts'
  const isAccountList = target?.kind === 'account' || target?.kind === 'accounts' || target?.kind === 'company' || target?.kind === 'companies'

  const filters = useMemo(() => {
    return {
      industry: (columnFilters.find(f => f.id === 'industry')?.value as string[]) || [],
      status: (columnFilters.find(f => f.id === 'status')?.value as string[]) || [],
      location: (columnFilters.find(f => f.id === 'location')?.value as string[]) || [],
      title: (columnFilters.find(f => f.id === 'title')?.value as string[]) || [],
    };
  }, [columnFilters]);

  const contactQuery = useContacts(
    searchQuery, 
    filters,
    isPeopleList ? id : undefined, 
    isPeopleList && !!target
  )
  const contactCount = useContactsCount(searchQuery, filters, isPeopleList ? id : undefined, isPeopleList && !!target)
  
  const accountQuery = useAccounts(
    searchQuery, 
    filters, 
    isAccountList ? id : undefined, 
    isAccountList && !!target
  )
  const accountCount = useAccountsCount(searchQuery, filters, isAccountList ? id : undefined, isAccountList && !!target)

  const { mutateAsync: deleteContacts } = useDeleteContacts()
  const { mutateAsync: deleteAccounts } = useDeleteAccounts()

  const query = isPeopleList ? contactQuery : accountQuery
  const data = useMemo(() => {
    if (isPeopleList) return contactQuery.data?.pages.flatMap(page => page.contacts) || []
    if (isAccountList) return accountQuery.data?.pages.flatMap(page => page.accounts) || []
    return []
  }, [isPeopleList, isAccountList, contactQuery.data, accountQuery.data])

  const totalRecords = (isPeopleList ? contactCount.data : isAccountList ? accountCount.data : 0) || 0
  const pageCount = Math.ceil(totalRecords / pageSize)

  // Fetch next page when table state changes
  useEffect(() => {
    if (pageIndex > 0 && query.hasNextPage && data.length < (pageIndex + 1) * pageSize) {
      query.fetchNextPage()
    }
  }, [pageIndex, query.hasNextPage, query.fetchNextPage, data.length, pageSize])

  const isLoading = targetLoading || (isPeopleList ? contactQuery.isLoading : isAccountList ? accountQuery.isLoading : false) || !isMounted
  const isError = isPeopleList ? contactQuery.isError : isAccountList ? accountQuery.isError : false

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleFilterChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const existing = prev.find(f => f.id === columnId)
      if (existing) {
        if (value === undefined) return prev.filter(f => f.id !== columnId)
        return prev.map(f => f.id === columnId ? { ...f, value } : f)
      }
      if (value === undefined) return prev
      return [...prev, { id: columnId, value }]
    })
    setPage(0)
  }

  const selectedCount = Object.keys(rowSelection).length

  const handleSelectCount = async (count: number) => {
    const newSelection: RowSelectionState = {}
    for (let i = 0; i < count; i++) {
      newSelection[i] = true
    }
    setRowSelection(newSelection)
  }

  const handleBulkAction = async (action: string) => {
    if (action === 'delete') {
      setIsDestructModalOpen(true)
    } else {
      console.log(`Executing ${action} for ${selectedCount} nodes`)
      // Implement other actions as needed
    }
  }

  const handleConfirmPurge = async () => {
    const selectedIndices = Object.keys(rowSelection).map(Number)
    const selectedIds = selectedIndices.map(index => data[index]?.id).filter(Boolean)
    
    if (selectedIds.length > 0) {
      if (isPeopleList) {
        await deleteContacts(selectedIds)
      } else {
        await deleteAccounts(selectedIds)
      }
      setRowSelection({})
      setIsDestructModalOpen(false)
    }
  }

  // Column definitions for People
  const peopleColumns = useMemo<ColumnDef<Contact>[]>(() => [
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
      cell: ({ row }) => {
        const index = row.index + 1 + pageIndex * pageSize
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
      header: 'Name',
      cell: ({ row }) => {
        const contact = row.original
        return (
          <Link 
            href={`/network/contacts/${contact.id}`}
            className="flex items-center gap-3 group/person whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
          >
            <ContactAvatar 
                name={contact.name} 
                size={36} 
                className="w-9 h-9 transition-all"
                textClassName="text-[10px]"
                showListBadge={isPeopleList}
              />
            <div>
              <div className="font-medium text-zinc-200 group-hover/person:text-white group-hover/person:scale-[1.02] transition-all origin-left">
                {contact.name}
              </div>
              <div className="text-xs text-zinc-500 font-mono tracking-tight">{contact.email}</div>
            </div>
          </Link>
        )
      }
    },
    {
      accessorKey: 'title',
      header: 'Title',
      filterFn: () => true, // Server-side filtered
      cell: ({ row }) => <div className="text-zinc-400 whitespace-nowrap">{row.getValue('title')}</div>,
    },
    {
      accessorKey: 'company',
      header: 'Company',
      cell: ({ row }) => {
        const contact = row.original
        return (
          <Link 
            href={`/network/accounts/${contact.accountId}`}
            className="flex items-center gap-2 group/acc whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
          >
            <CompanyIcon
              logoUrl={contact.logoUrl}
              domain={contact.companyDomain}
              name={contact.company}
              size={36}
              className="w-8 h-8"
            />
            <span className="text-zinc-400 group-hover/acc:text-white group-hover/acc:scale-[1.02] transition-all origin-left">
              {contact.company}
            </span>
          </Link>
        )
      }
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      filterFn: () => true, // Server-side filtered
      cell: ({ row }) => <div className="text-zinc-400 whitespace-nowrap">{row.getValue('industry')}</div>,
    },
    {
      accessorKey: 'location',
      header: 'Location',
      filterFn: () => true, // Server-side filtered
      cell: ({ row }) => <div className="text-zinc-400 whitespace-nowrap">{row.getValue('location')}</div>,
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => <div className="text-zinc-500 text-sm font-mono tabular-nums whitespace-nowrap">{row.getValue('phone')}</div>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      filterFn: () => true, // Server-side filtered
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        return (
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              status === 'Customer' ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
            )} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{status}</span>
          </div>
        )
      }
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
              className="h-8 w-8"
            />
            <button 
              className="icon-button-forensic h-8 w-8 flex items-center justify-center"
              title="More Actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        )
      }
    }
  ], [pageIndex, pageSize, isPeopleList])

  // Column definitions for Accounts
  const accountColumns = useMemo<ColumnDef<Account>[]>(() => [
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
      cell: ({ row }) => {
        const index = row.index + 1 + pageIndex * pageSize
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
      header: 'Account Name',
      cell: ({ row }) => {
        const account = row.original
        return (
          <Link 
            href={`/network/accounts/${account.id}`}
            className="flex items-center gap-3 group/acc whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
          >
            <CompanyIcon
              logoUrl={account.logoUrl}
              domain={account.domain}
              name={account.name}
              size={36}
              className="w-9 h-9"
            />
            <div>
              <div className="font-medium text-zinc-200 group-hover/acc:text-white group-hover/acc:scale-[1.02] transition-all origin-left">
                {account.name}
              </div>
              {account.domain && <div className="text-[10px] font-mono text-zinc-500 uppercase">{account.domain}</div>}
            </div>
          </Link>
        )
      }
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      filterFn: () => true, // Server-side filtered
      cell: ({ row }) => <div className="text-zinc-400 whitespace-nowrap">{row.getValue('industry')}</div>,
    },
    {
      accessorKey: 'location',
      header: 'Location',
      filterFn: () => true, // Server-side filtered
      cell: ({ row }) => <div className="text-zinc-400 whitespace-nowrap">{row.getValue('location')}</div>,
    },
    {
      accessorKey: 'companyPhone',
      header: 'Phone',
      cell: ({ row }) => <div className="text-zinc-500 text-sm font-mono tabular-nums whitespace-nowrap">{row.getValue('companyPhone')}</div>,
    },
    {
      id: 'status',
      header: 'Status',
      filterFn: () => true, // Server-side filtered
      cell: ({ row }) => {
        const account = row.original
        const hasContract = !!account.contractEnd
        const isExpired = hasContract && new Date(account.contractEnd) < new Date()
        const isCustomer = account.status === 'CUSTOMER'
        const isActiveLoad = (hasContract && !isExpired) || account.status === 'ACTIVE_LOAD'
        const displayStatus = isCustomer ? 'Customer' : isActiveLoad ? 'Active' : isExpired ? 'Expired' : 'No Contract'
        const isActive = isCustomer || isActiveLoad
        return (
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isActive ? "bg-emerald-500 animate-pulse" : isExpired ? "bg-red-500" : "bg-zinc-600"
            )} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{displayStatus}</span>
          </div>
        )
      }
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const account = row.original
        return (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <ClickToCallButton 
              phoneNumber={account.companyPhone}
              account={account.name}
              logoUrl={account.logoUrl}
              isCompany={true}
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
            />
            <button 
              className="icon-button-forensic h-8 w-8 flex items-center justify-center"
              title="More Actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        )
      }
    }
  ], [pageIndex, pageSize, router])

  const tableColumns = useMemo(() => isPeopleList ? peopleColumns : accountColumns, [isPeopleList, peopleColumns, accountColumns])

  const table = useReactTable({
    data,
    columns: tableColumns as ColumnDef<any>[],
    state: {
      pagination: {
        pageIndex,
        pageSize
      },
      rowSelection,
    },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize })
        setPage(newState.pageIndex)
      }
    },
    onRowSelectionChange: setRowSelection,
    manualPagination: false,
    pageCount,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const filteredRowCount = totalRecords || data.length
  const showingStart = filteredRowCount === 0
    ? 0
    : Math.min(filteredRowCount, pageIndex * pageSize + 1)
  const showingEnd = filteredRowCount === 0
    ? 0
    : Math.min(filteredRowCount, (pageIndex + 1) * pageSize)

  if (isError) {
    return (
      <div className="h-full flex items-center justify-center text-red-500 font-mono text-xs uppercase tracking-widest">
        Error loading target array data.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4">
      
      <CollapsiblePageHeader
        backHref="/network/targets"
        title={
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tighter text-white uppercase">
              {targetLoading ? 'Loading...' : target?.name}
            </h1>
            <Badge className="bg-white/5 text-zinc-500 border-white/10 uppercase font-mono text-[10px] tracking-widest">
              {isPeopleList ? 'Human_Intel' : 'Asset_Intel'}
            </Badge>
          </div>
        }
        description={
          <p className="text-zinc-500 mt-1">
            Target Array Cluster: {target?.id?.slice(0, 8)}
          </p>
        }
        globalFilter={globalFilter}
        onSearchChange={(value) => {
          setGlobalFilter(value)
          setPage(0)
        }}
        onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
        isFilterActive={isFilterOpen || columnFilters.length > 0}
        primaryAction={{
          label: "Initialize Node",
          onClick: () => {},
          icon: <Plus size={18} />
        }}
      />

      <FilterCommandDeck 
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        type={isPeopleList ? 'people' : 'account'}
        columnFilters={columnFilters}
        onFilterChange={handleFilterChange}
      />

      {/* DATA CONTAINER */}
      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none bg-gradient-to-b from-white/5 to-transparent z-10" />
        
        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
          <Table>
            <TableHeader className="sticky top-0 bg-zinc-900/80 backdrop-blur-sm z-20 border-b border-white/5">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-none hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <ForensicTableSkeleton columns={tableColumns.length} rows={12} type={isPeopleList ? 'people' : 'account'} />
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={(e) => {
                      // Don't trigger row click if clicking a link or button
                      if ((e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('button')) {
                        return;
                      }
                      router.push(`/network/${isPeopleList ? 'contacts' : 'accounts'}/${row.original.id}`)
                    }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-pointer"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={tableColumns.length} className="h-32 text-center align-middle">
                    <div className="flex flex-col items-center justify-center gap-2 text-zinc-500">
                      <div className="text-sm font-medium">No results found</div>
                      <div className="text-xs font-mono uppercase tracking-widest opacity-50">Sync_Block_Empty</div>
                    </div>
                  </td>
                </tr>
              )}
            </TableBody>
          </Table>
        </div>

        {/* SYNC_BLOCK FOOTER */}
        <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <span>Sync_Block {showingStart.toString().padStart(2, '0')}–{showingEnd.toString().padStart(2, '0')}</span>
              <div className="h-1 w-1 rounded-full bg-zinc-800" />
              <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{totalRecords || data.length}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, pageIndex - 1))}
              disabled={pageIndex === 0}
              className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
              {(pageIndex + 1).toString().padStart(2, '0')}
            </div>
            <button
              onClick={() => setPage(pageIndex + 1)}
              disabled={(pageIndex + 1) * pageSize >= totalRecords}
              className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
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

      <DestructModal 
        isOpen={isDestructModalOpen}
        onClose={() => setIsDestructModalOpen(false)}
        onConfirm={handleConfirmPurge}
        count={selectedCount}
      />
    </div>
  )
}
