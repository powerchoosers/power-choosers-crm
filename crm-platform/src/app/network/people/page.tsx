'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
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
import { ArrowUpDown, ChevronLeft, ChevronRight, Clock, Plus, Phone, Mail, MoreHorizontal, ArrowUpRight, Check, Filter, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { motion, AnimatePresence } from 'framer-motion'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { formatDistanceToNow, format, isAfter, subMonths } from 'date-fns'
import { useContacts, useContactsCount, useDeleteContacts, useCreateContact, Contact } from '@/hooks/useContacts'
import { TargetListBadges } from '@/components/ui/TargetListBadges'
import { useContactLastTouch, computeHealthScore } from '@/hooks/useLastTouch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { Badge } from '@/components/ui/badge'
import { ContactAvatar, type ContactHealthScore } from '@/components/ui/ContactAvatar'
import { ComposeModal, type ComposeContext } from '@/components/emails/ComposeModal'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import DestructModal from '@/components/network/DestructModal'
import FilterCommandDeck from '@/components/network/FilterCommandDeck'
import { ForensicTableSkeleton } from '@/components/network/ForensicTableSkeleton'
import Link from 'next/link'
import { ContactTableRow } from '@/components/network/ContactTableRow'
import { DraggableTableHeader } from '@/components/network/DraggableTableHeader'
import { useTableColumnOrder } from '@/hooks/useTableColumnOrder'
import { SequenceAssignmentModal } from '@/components/network/SequenceAssignmentModal'
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
import { useTableState } from '@/hooks/useTableState'
import { useTableScrollRestore } from '@/hooks/useTableScrollRestore'
import { toast } from 'sonner'

const PAGE_SIZE = 50

export default function PeoplePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { pageIndex, setPage, searchQuery, setSearch, pagination } = useTableState({ pageSize: PAGE_SIZE })
  const scrollKey = (pathname ?? '/network/people') + (searchParams?.toString() ? `?${searchParams.toString()}` : '')

  const [globalFilter, setGlobalFilter] = useState(searchQuery)
  const [debouncedFilter, setDebouncedFilter] = useState(searchQuery)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
      setSearch(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter, setSearch])

  const contactFilters = useMemo(() => {
    return {
      industry: (columnFilters.find(f => f.id === 'industry')?.value as string[]) || [],
      status: (columnFilters.find(f => f.id === 'status')?.value as string[]) || [],
      location: (columnFilters.find(f => f.id === 'location')?.value as string[]) || [],
    };
  }, [columnFilters]);

  const { data, isLoading: queryLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useContacts(debouncedFilter, contactFilters)
  const { data: totalContacts } = useContactsCount(debouncedFilter, contactFilters)
  const { mutateAsync: deleteContacts } = useDeleteContacts()
  const createContact = useCreateContact()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isMounted, setIsMounted] = useState(false)
  const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newPerson, setNewPerson] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '' })
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeTarget, setComposeTarget] = useState<{ email: string; name: string; company: string } | null>(null)
  const [isSequenceModalOpen, setIsSequenceModalOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const contacts = useMemo(() => data?.pages.flatMap(page => page.contacts) || [], [data])
  const contactIds = useMemo(() => contacts.map(c => c.id), [contacts])
  const { data: lastTouchMap, isLoading: lastTouchLoading } = useContactLastTouch(contactIds)
  const pendingSelectCountRef = useRef<number | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // After handleSelectCount fetches more, apply selection once we have enough contacts
  useEffect(() => {
    const target = pendingSelectCountRef.current
    if (target != null && contacts.length >= target) {
      pendingSelectCountRef.current = null
      const newSelection: RowSelectionState = {}
      contacts.slice(0, target).forEach((c) => {
        newSelection[c.id] = true
      })
      setRowSelection(newSelection)
    }
  }, [contacts.length, contacts])

  const isLoading = queryLoading || !isMounted
  const { scrollContainerRef, saveScroll } = useTableScrollRestore(scrollKey, pageIndex, !isLoading)

  const effectiveTotalRecords = totalContacts ?? contacts.length
  const totalPages = Math.max(1, Math.ceil(effectiveTotalRecords / PAGE_SIZE))
  const displayTotalPages = totalContacts == null && hasNextPage
    ? Math.max(totalPages, pagination.pageIndex + 2)
    : totalPages

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  )

  const initialColumnOrder = useMemo(() => [
    'select',
    'name',
    'title',
    'company',
    'industry',
    'location',
    'phone',
    'status',
    'targetLists',
    'actions'
  ], [])

  const [columnOrder, setColumnOrder] = useTableColumnOrder('people', initialColumnOrder)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as string)
        const newIndex = items.indexOf(over.id as string)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleFilterChange = useCallback((columnId: string, value: any) => {
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
    setPage(0)
  }, [setPage])

  useEffect(() => {
    const needed = (pagination.pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && contacts.length < needed) {
      fetchNextPage()
    }
  }, [pagination.pageIndex, contacts.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectedCount = Object.keys(rowSelection).length

  const handleSelectCount = async (count: number) => {
    if (count > contacts.length && hasNextPage && !isFetchingNextPage) {
      pendingSelectCountRef.current = count
      const pagesToFetch = Math.ceil((count - contacts.length) / PAGE_SIZE)
      for (let i = 0; i < pagesToFetch; i++) {
        await fetchNextPage()
      }
    } else {
      const newSelection: RowSelectionState = {}
      contacts.slice(0, count).forEach((c) => {
        newSelection[c.id] = true
      })
      setRowSelection(newSelection)
    }
  }

  const handleBulkAction = async (action: string) => {
    // Lazy load if selection exceeds current data
    if (selectedCount > contacts.length && hasNextPage && !isFetchingNextPage) {
      const pagesToFetch = Math.ceil((selectedCount - contacts.length) / PAGE_SIZE)
      for (let i = 0; i < pagesToFetch; i++) {
        await fetchNextPage()
      }
    }

    if (action === 'delete') {
      setIsDestructModalOpen(true)
    } else if (action === 'sequence') {
      setIsSequenceModalOpen(true)
    }
  }

  const handleConfirmPurge = async () => {
    if (deleteTargetId) {
      await deleteContacts([deleteTargetId])
      setDeleteTargetId(null)
      return
    }
    const selectedIds = Object.keys(rowSelection).filter(Boolean)
    if (selectedIds.length > 0) {
      await deleteContacts(selectedIds)
      setRowSelection({})
      setIsDestructModalOpen(false)
    }
  }

  const columns = useMemo<ColumnDef<Contact>[]>(() => {
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
            <div className="flex items-center justify-center px-2 relative group/select h-full min-h-[40px]">
              {/* Default State: Row Number */}
              <span className={cn(
                "font-mono text-[10px] text-zinc-700 transition-opacity",
                isSelected ? "opacity-0" : "group-hover/select:opacity-0"
              )}>
                {index.toString().padStart(2, '0')}
              </span>

              {/* Hover/Selected State: Larger Invisible Click Area */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  row.toggleSelected()
                }}
                className="absolute inset-x-[-8px] inset-y-[-12px] z-20 flex items-center justify-center group/check"
              >
                <div className={cn(
                  "w-4 h-4 rounded border transition-all flex items-center justify-center",
                  isSelected
                    ? "bg-[#002FA7] border-[#002FA7] opacity-100"
                    : "bg-white/5 border-white/10 opacity-0 group-hover/select:opacity-100 group-hover/check:opacity-100"
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>
            </div>
          )
        }
      },
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <button
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="icon-button-forensic flex items-center -ml-1 text-sm font-medium gap-2"
            >
              Name
              <ArrowUpDown className="ml-1 h-4 w-4" />
              {/* Health legend — 3 dots showing what top-left badge means */}
              <span
                className="flex items-center gap-0.5 ml-1"
                title="Relationship health: green <30d · amber 30–90d · rose >90d since last touch"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 opacity-60" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 opacity-60" />
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 opacity-60" />
              </span>
            </button>
          )
        },
        cell: ({ row, table }) => {
          const contact = row.original
          const meta = table.options.meta as any
          const lastTouchMap = meta?.lastTouchMap
          const lastTouchLoading = meta?.lastTouchLoading

          // No dot until: (a) loading OR (b) map hasn't settled
          const healthScore = (lastTouchLoading || lastTouchMap === undefined)
            ? undefined
            : computeHealthScore(lastTouchMap.get(contact.id))

          return (
            <Link
              href={`/network/contacts/${contact.id}`}
              className="flex items-center gap-3 group/person"
              onClick={(e) => { e.stopPropagation(); saveScroll(); }}
            >
              <ContactAvatar
                name={contact.name}
                size={36}
                className="w-9 h-9 transition-all"
                healthScore={healthScore}
                healthLoading={lastTouchLoading || lastTouchMap === undefined}
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
        accessorKey: 'company',
        header: 'Company',
        cell: ({ row }) => {
          const companyName = row.getValue('company') as string
          const contact = row.original
          return (
            <Link
              href={`/network/accounts/${contact.accountId}`}
              className="flex items-center gap-2 group/acc"
              onClick={(e) => { e.stopPropagation(); saveScroll(); }}
            >
              <CompanyIcon
                logoUrl={contact.logoUrl}
                domain={contact.companyDomain}
                name={companyName}
                size={36}
                className="w-9 h-9 transition-all"
              />
              <span className="text-zinc-400 group-hover/acc:text-white group-hover/acc:scale-[1.02] transition-all origin-left">
                {companyName}
              </span>
            </Link>
          )
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => <div className="text-zinc-500 text-sm font-mono tabular-nums">{row.getValue('phone')}</div>,
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
        accessorKey: 'industry',
        header: 'Industry',
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const val = row.getValue(id) as string;
          if (!val) return false;
          return value.includes(val);
        },
        cell: ({ row }) => <div className="text-zinc-400">{row.getValue('industry')}</div>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => {
          const status = row.getValue('status') as string
          const isCustomer = status === 'Customer'
          const isLead = status === 'Lead'

          return (
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCustomer ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                  isLead ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" :
                    "bg-zinc-600"
              )} />
              <span className={cn(
                "text-[10px] font-mono uppercase tracking-wider tabular-nums",
                isCustomer ? "text-emerald-500" :
                  isLead ? "text-blue-500/80" :
                    "text-zinc-500"
              )}>
                {isCustomer ? 'Client' : status}
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
        id: 'targetLists',
        header: 'Target Lists',
        cell: ({ row }) => (
          <TargetListBadges
            entityId={row.original.id}
            entityType="contact"
          />
        ),
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
                className="h-8 w-8 icon-button-forensic"
              />
              <button
                className="h-8 w-8 icon-button-forensic flex items-center justify-center"
                onClick={() => {
                  setComposeTarget({
                    email: contact.email || '',
                    name: contact.name,
                    company: contact.company || ''
                  })
                  setIsComposeOpen(true)
                }}
                disabled={!contact.email}
                title={contact.email ? `Email ${contact.name}` : 'No email available'}
              >
                <Mail className={cn("h-4 w-4", !contact.email && "opacity-30")} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-8 w-8 icon-button-forensic flex items-center justify-center">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-950 nodal-monolith-edge text-zinc-300">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem
                    className="hover:bg-white/5 cursor-pointer"
                    onClick={() => {
                      saveScroll()
                      router.push(`/network/contacts/${contact.id}`)
                    }}
                  >
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="hover:bg-white/5 cursor-pointer"
                    onClick={() => { saveScroll(); router.push(`/network/contacts/${contact.id}`) }}
                  >Edit Person</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                    onClick={() => setDeleteTargetId(contact.id)}
                  >Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ]
  }, [router, pageIndex])

  const onPaginationChange = useCallback(
    (updaterOrValue: PaginationState | ((old: PaginationState) => PaginationState)) => {
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(pagination) : updaterOrValue
      setPage(next.pageIndex)
    },
    [pagination, setPage]
  )

  const table = useReactTable({
    data: contacts,
    columns,
    meta: {
      lastTouchMap,
      lastTouchLoading
    },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    autoResetPageIndex: false,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      rowSelection,
      columnOrder,
    },
  })

  const headerSearchChange = useCallback((value: string) => {
    setGlobalFilter(value)
    setPage(0)
  }, [setPage])

  const headerFilterToggle = useCallback(() => {
    setIsFilterOpen(prev => !prev)
  }, [])

  const handleCreatePerson = async () => {
    if (!newPerson.firstName.trim() && !newPerson.lastName.trim()) {
      toast.error('First or last name is required')
      return
    }
    try {
      const fullName = [newPerson.firstName.trim(), newPerson.lastName.trim()].filter(Boolean).join(' ')
      await createContact.mutateAsync({
        name: fullName,
        firstName: newPerson.firstName.trim(),
        lastName: newPerson.lastName.trim(),
        email: newPerson.email.trim(),
        phone: newPerson.phone.trim(),
        company: newPerson.company.trim(),
        status: 'Lead',
        lastContact: new Date().toISOString(),
        metadata: { title: newPerson.title.trim() },
      } as any)
      toast.success(`${fullName} added`)
      setNewPerson({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '' })
      setIsCreateOpen(false)
    } catch {
      toast.error('Failed to create contact')
    }
  }

  const primaryAction = useMemo(() => ({
    label: "Add Person",
    onClick: () => setIsCreateOpen(true),
    icon: <Plus size={18} className="mr-2" />
  }), [])

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
        onSearchChange={headerSearchChange}
        onFilterToggle={headerFilterToggle}
        isFilterActive={isFilterOpen || columnFilters.length > 0}
        primaryAction={primaryAction}
      />

      <FilterCommandDeck
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        type="people"
        columnFilters={columnFilters}
        onFilterChange={handleFilterChange}
      />

      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto relative scroll-smooth scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
          <Table>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <TableHeader className="sticky top-0 z-20 border-b border-white/5">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-none hover:bg-transparent">
                    <SortableContext
                      items={columnOrder}
                      strategy={horizontalListSortingStrategy}
                    >
                      {headerGroup.headers.map((header) => (
                        <DraggableTableHeader key={header.id} header={header} />
                      ))}
                    </SortableContext>
                  </TableRow>
                ))}
              </TableHeader>
            </DndContext>
            <TableBody>
              {isLoading ? (
                <ForensicTableSkeleton columns={columns.length} rows={12} type="people" />
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-red-400">
                    Error loading people. Please check your internet connection or permissions.
                  </TableCell>
                </TableRow>
              ) : rows?.length ? (
                <AnimatePresence mode="popLayout">
                  {rows.map((row, index) => (
                    <ContactTableRow
                      key={row.id}
                      row={row}
                      index={index}
                      router={router}
                      saveScroll={saveScroll}
                      columnOrder={columnOrder}
                    />
                  ))}
                </AnimatePresence>
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

        <div className="flex-none border-t border-white/5 nodal-recessed p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <span>Sync_Block {showingStart}–{showingEnd}</span>
              <div className="h-1 w-1 rounded-full bg-black/40" />
              <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{effectiveTotalRecords}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, pagination.pageIndex - 1))}
              disabled={pagination.pageIndex === 0}
              className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
              {(pagination.pageIndex + 1).toString().padStart(2, '0')}
            </div>
            <button
              onClick={async () => {
                const nextPageIndex = pagination.pageIndex + 1
                if (nextPageIndex >= displayTotalPages) return

                const needed = (nextPageIndex + 1) * PAGE_SIZE
                if (contacts.length < needed && hasNextPage && !isFetchingNextPage) {
                  await fetchNextPage()
                }

                setPage(nextPageIndex)
              }}
              disabled={pagination.pageIndex + 1 >= displayTotalPages || (!hasNextPage && contacts.length < (pagination.pageIndex + 2) * PAGE_SIZE)}
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
        totalAvailable={effectiveTotalRecords}
        onClear={() => setRowSelection({})}
        onAction={handleBulkAction}
        onSelectCount={handleSelectCount}
      />

      <DestructModal
        isOpen={isDestructModalOpen || !!deleteTargetId}
        onClose={() => { setIsDestructModalOpen(false); setDeleteTargetId(null) }}
        onConfirm={handleConfirmPurge}
        count={deleteTargetId ? 1 : selectedCount}
      />

      <SequenceAssignmentModal
        isOpen={isSequenceModalOpen}
        onClose={() => setIsSequenceModalOpen(false)}
        selectedContactIds={Object.keys(rowSelection).filter(Boolean)}
        onSuccess={() => setRowSelection({})}
      />

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => {
          setIsComposeOpen(false)
          setComposeTarget(null)
        }}
        to={composeTarget?.email}
        subject=""
        context={composeTarget ? { contactName: composeTarget.name, companyName: composeTarget.company || undefined } : null}
      />

      {/* Add Person Modal */}
      <AnimatePresence>
        {isCreateOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsCreateOpen(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md nodal-void-card rounded-2xl p-6 flex flex-col gap-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">New Contact // Add_Person</span>
                <button onClick={() => setIsCreateOpen(false)} className="icon-button-forensic w-8 h-8">
                  <Plus size={16} className="rotate-45" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">First Name</label>
                  <Input
                    value={newPerson.firstName}
                    onChange={e => setNewPerson(p => ({ ...p, firstName: e.target.value }))}
                    placeholder="Jane"
                    className="nodal-recessed border-white/10 text-sm font-mono"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Last Name</label>
                  <Input
                    value={newPerson.lastName}
                    onChange={e => setNewPerson(p => ({ ...p, lastName: e.target.value }))}
                    placeholder="Smith"
                    className="nodal-recessed border-white/10 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Email</label>
                <Input
                  value={newPerson.email}
                  onChange={e => setNewPerson(p => ({ ...p, email: e.target.value }))}
                  placeholder="jane@company.com"
                  type="email"
                  className="nodal-recessed border-white/10 text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Phone</label>
                  <Input
                    value={newPerson.phone}
                    onChange={e => setNewPerson(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                    className="nodal-recessed border-white/10 text-sm font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Title</label>
                  <Input
                    value={newPerson.title}
                    onChange={e => setNewPerson(p => ({ ...p, title: e.target.value }))}
                    placeholder="Energy Manager"
                    className="nodal-recessed border-white/10 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Company</label>
                <Input
                  value={newPerson.company}
                  onChange={e => setNewPerson(p => ({ ...p, company: e.target.value }))}
                  placeholder="Acme Corp"
                  className="nodal-recessed border-white/10 text-sm font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="hover:bg-white/10 hover:text-white text-zinc-400 font-mono text-xs">Cancel</Button>
                <Button
                  onClick={handleCreatePerson}
                  disabled={createContact.isPending || (!newPerson.firstName.trim() && !newPerson.lastName.trim())}
                  className="bg-[#002FA7] hover:bg-blue-600 text-white font-mono text-xs uppercase tracking-widest px-5"
                >
                  {createContact.isPending ? 'Adding...' : 'Add Person'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
