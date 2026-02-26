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
import { ArrowUpDown, Calendar, ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock, Plus, Filter, MoreHorizontal, Search, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { useTasks, useTasksCount, Task } from '@/hooks/useTasks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { PriorityBadge, priorityColorClasses } from '@/components/ui/PriorityBadge'
import { format, formatDistanceToNow, subMonths, isAfter } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useTableState } from '@/hooks/useTableState'
import { TaskTableRow } from '@/components/network/TaskTableRow'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import DestructModal from '@/components/network/DestructModal'
import { toast } from 'sonner'

const PAGE_SIZE = 50

export default function TasksPage() {
  const router = useRouter()
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

  const { data, isLoading: queryLoading, isError, addTaskAsync, updateTask, deleteTask, fetchNextPage, hasNextPage, isFetchingNextPage } = useTasks(debouncedFilter)
  const { data: totalTasks } = useTasksCount(debouncedFilter)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isMounted, setIsMounted] = useState(false)
  const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'Medium' as 'Low' | 'Medium' | 'High', dueDate: '' })

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const tasks = useMemo(() => data?.pages.flatMap(page => page.tasks) || [], [data])
  const isLoading = queryLoading || !isMounted

  const effectiveTotalRecords = totalTasks ?? tasks.length
  const totalPages = Math.max(1, Math.ceil(effectiveTotalRecords / PAGE_SIZE))
  const displayTotalPages = totalTasks == null && hasNextPage
    ? Math.max(totalPages, pageIndex + 2)
    : totalPages

  useEffect(() => {
    const needed = (pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && tasks.length < needed) {
      fetchNextPage()
    }
  }, [pageIndex, tasks.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const selectedCount = Object.keys(rowSelection).length
  const handleSelectCount = async (count: number) => {
    if (count > tasks.length && hasNextPage && !isFetchingNextPage) {
      await fetchNextPage()
    }
    const idsToSelect = tasks.slice(0, count).map(t => t.id)
    const newSelection: RowSelectionState = {}
    idsToSelect.forEach(id => { newSelection[id] = true })
    setRowSelection(newSelection)
  }
  const handleBulkAction = async (action: string) => {
    if (action === 'delete') {
      setIsDestructModalOpen(true)
    }
  }

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Task title is required')
      return
    }
    setIsAddingTask(true)
    try {
      await addTaskAsync({
        title: newTask.title.trim(),
        description: newTask.description.trim() || undefined,
        priority: newTask.priority,
        status: 'Pending',
        dueDate: newTask.dueDate || undefined,
      })
      setNewTask({ title: '', description: '', priority: 'Medium', dueDate: '' })
      setIsAddTaskOpen(false)
    } catch {
      // toast handled in hook
    } finally {
      setIsAddingTask(false)
    }
  }
  const handleConfirmPurge = async () => {
    // rowSelection keys are row ids when getRowId is set
    const selectedIds = Object.keys(rowSelection).filter(Boolean)
    selectedIds.forEach(id => deleteTask(id))
    setRowSelection({})
    setIsDestructModalOpen(false)
  }

  const columns: ColumnDef<Task>[] = [
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
          <div className="flex items-center justify-center px-2 relative group/select h-full min-h-[40px]">
            <span className={cn(
              "font-mono text-[10px] text-zinc-700 transition-opacity",
              isSelected ? "opacity-0" : "group-hover/select:opacity-0"
            )}>
              {index.toString().padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); row.toggleSelected(); }}
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
      },
    },
    {
      accessorKey: 'title',
      header: ({ column }) => {
        return (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="icon-button-forensic -ml-4 flex items-center px-4 py-2 transition-all"
          >
            Task
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </button>
        )
      },
      cell: ({ row }) => {
        const task = row.original
        const hasDossier = !!(task.contactId || task.accountId)
        return (
          <div className={cn("flex items-center gap-3 group/task", hasDossier && "cursor-pointer")}>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center border border-white/5",
              priorityColorClasses(task.priority)
            )}>
              {(task.status?.toLowerCase?.() ?? '') === 'completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </div>
            <div>
              <div className={cn(
                "font-medium group-hover/task:scale-[1.02] transition-all origin-left",
                task.status === 'Completed' ? "text-zinc-500 line-through" : "text-zinc-200 group-hover/task:text-white"
              )}>
                {task.title}
              </div>
              {task.description && <div className="text-xs text-zinc-500 truncate max-w-[300px]">{task.description}</div>}
            </div>
          </div>
        )
      }
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => {
        const priority = (row.getValue('priority') as string) ?? ''
        return <PriorityBadge priority={priority} labelStyle="suffix" />
      },
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => {
        const dateStr = row.getValue('dueDate') as string
        if (!dateStr) return <span className="text-zinc-600 font-mono text-xs">--</span>
        try {
          const date = new Date(dateStr)
          const threeMonthsAgo = subMonths(new Date(), 3)
          const isRecent = isAfter(date, threeMonthsAgo)

          return (
            <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs tabular-nums">
              <Calendar size={14} className="text-zinc-600" />
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
      accessorKey: 'relatedTo',
      header: 'Related To',
      cell: ({ row }) => {
        const related = row.original.relatedTo
        if (!related) return <span className="text-zinc-600">-</span>
        return <div className="text-zinc-300 font-medium">{related}</div>
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const task = row.original
        return (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              className={cn("icon-button-forensic h-8 w-8 flex items-center justify-center", task.status === 'Completed' ? "text-green-500" : "text-zinc-400")}
              onClick={() => updateTask({ id: task.id, status: task.status === 'Completed' ? 'Pending' : 'Completed' })}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="icon-button-forensic h-8 w-8 flex items-center justify-center text-zinc-400">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-950 nodal-monolith-edge text-zinc-300">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem className="hover:bg-white/5 cursor-pointer">Edit Task</DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-white/5 cursor-pointer"
                  onClick={() => updateTask({ id: task.id, status: task.status === 'Completed' ? 'Pending' : 'Completed' })}
                >
                  Mark as {task.status === 'Completed' ? 'Pending' : 'Completed'}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                  onClick={() => deleteTask(task.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: tasks || [],
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

  const showingStart = effectiveTotalRecords === 0
    ? 0
    : Math.min(effectiveTotalRecords, pageIndex * PAGE_SIZE + 1)
  const showingEnd = effectiveTotalRecords === 0
    ? 0
    : Math.min(effectiveTotalRecords, (pageIndex + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Tasks"
        description="Stay on top of your daily workflow."
        globalFilter={globalFilter}
        onSearchChange={setGlobalFilter}
        primaryAction={{
          label: "Add Task",
          onClick: () => setIsAddTaskOpen(true),
          icon: <Plus size={18} className="mr-2" />
        }}
      />

      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
          <Table>
            <TableHeader className="sticky top-0 z-20 border-b border-white/5">
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
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-red-400">
                    Error loading tasks. Please check your connection.
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                <AnimatePresence mode="popLayout">
                  {table.getRowModel().rows.map((row, index) => (
                    <TaskTableRow
                      key={row.id}
                      row={row}
                      index={index}
                      router={router}
                    />
                  ))}
                </AnimatePresence>
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                    No tasks found.
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
                if (tasks.length < needed && hasNextPage && !isFetchingNextPage) {
                  await fetchNextPage()
                }

                setPage(nextPageIndex)
              }}
              disabled={pageIndex + 1 >= displayTotalPages || (!hasNextPage && tasks.length < (pageIndex + 2) * PAGE_SIZE)}
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

      {/* Add Task Modal */}
      <AnimatePresence>
        {isAddTaskOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsAddTaskOpen(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md nodal-void-card rounded-2xl p-6 flex flex-col gap-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">New Task // Add_Action</span>
                <button onClick={() => setIsAddTaskOpen(false)} className="icon-button-forensic w-8 h-8">
                  <Plus size={16} className="rotate-45" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Title *</label>
                <Input
                  value={newTask.title}
                  onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                  placeholder="Follow up with client"
                  className="nodal-recessed border-white/10 text-sm font-mono"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateTask() }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Description</label>
                <Input
                  value={newTask.description}
                  onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional details..."
                  className="nodal-recessed border-white/10 text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={e => setNewTask(p => ({ ...p, priority: e.target.value as 'Low' | 'Medium' | 'High' }))}
                    className="nodal-recessed border border-white/10 text-sm font-mono bg-zinc-900 text-zinc-300 rounded-md px-3 py-2"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Due Date</label>
                  <Input
                    type="date"
                    value={newTask.dueDate}
                    onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))}
                    className="nodal-recessed border-white/10 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button variant="ghost" onClick={() => setIsAddTaskOpen(false)} className="hover:bg-white/10 hover:text-white text-zinc-400 font-mono text-xs">Cancel</Button>
                <Button
                  onClick={handleCreateTask}
                  disabled={isAddingTask || !newTask.title.trim()}
                  className="bg-[#002FA7] hover:bg-blue-600 text-white font-mono text-xs uppercase tracking-widest px-5"
                >
                  {isAddingTask ? 'Adding...' : 'Add Task'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
