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
} from '@tanstack/react-table'
import { ArrowUpDown, Calendar, ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock, Plus, Filter, MoreHorizontal, Search } from 'lucide-react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { useTasks, useTasksCount, Task } from '@/hooks/useTasks'
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
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow, subMonths, isAfter } from 'date-fns'

const PAGE_SIZE = 50

export default function TasksPage() {
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
    }, 400)
    return () => clearTimeout(timer)
  }, [globalFilter])

  const { data, isLoading: queryLoading, isError, updateTask, deleteTask, fetchNextPage, hasNextPage, isFetchingNextPage } = useTasks(debouncedFilter)
  const { data: totalTasks } = useTasksCount(debouncedFilter)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [isMounted, setIsMounted] = useState(false)
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const tasks = useMemo(() => data?.pages.flatMap(page => page.tasks) || [], [data])
  const isLoading = queryLoading || !isMounted

  const effectiveTotalRecords = totalTasks ?? tasks.length
  const totalPages = Math.max(1, Math.ceil(effectiveTotalRecords / PAGE_SIZE))
  const displayTotalPages = totalTasks == null && hasNextPage
    ? Math.max(totalPages, pagination.pageIndex + 2)
    : totalPages

  useEffect(() => {
    const needed = (pagination.pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && tasks.length < needed) {
      fetchNextPage()
    }
  }, [pagination.pageIndex, tasks.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const columns: ColumnDef<Task>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4 hover:bg-white/5 hover:text-white"
          >
            Task
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const task = row.original
        return (
          <div className="flex items-center gap-3">
             <div className={cn(
               "w-8 h-8 rounded-full flex items-center justify-center border border-white/5",
               task.priority === 'High' ? "bg-red-500/10 text-red-500" :
               task.priority === 'Medium' ? "bg-yellow-500/10 text-yellow-500" :
               "bg-zinc-800 text-zinc-400"
             )}>
                {task.status === 'Completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
             </div>
             <div>
                <div className={cn("font-medium", task.status === 'Completed' ? "text-zinc-500 line-through" : "text-zinc-200")}>
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
        const priority = row.getValue('priority') as string
        return (
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
            priority === 'High' && "bg-red-500/10 text-red-500 border-red-500/20",
            priority === 'Medium' && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
            priority === 'Low' && "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
            priority === 'Sequence' && "bg-purple-500/10 text-purple-500 border-purple-500/20",
          )}>
            {priority}
          </span>
        )
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
          <div className="flex items-center justify-end gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-8 w-8 hover:text-white hover:bg-white/10", task.status === 'Completed' ? "text-green-500" : "text-zinc-400")}
              onClick={() => updateTask({ id: task.id, status: task.status === 'Completed' ? 'Pending' : 'Completed' })}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-zinc-300">
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
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
  })

  const totalRowCount = tasks.length
  const showingStart = totalRowCount === 0
    ? 0
    : Math.min(totalRowCount, pagination.pageIndex * PAGE_SIZE + 1)
  const showingEnd = totalRowCount === 0
    ? 0
    : Math.min(totalRowCount, (pagination.pageIndex + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Tasks"
        description="Stay on top of your daily workflow."
        globalFilter={globalFilter}
        onSearchChange={(value) => {
          setGlobalFilter(value)
          setPagination((p) => ({ ...p, pageIndex: 0 }))
        }}
        primaryAction={{
          label: "Add Task",
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
                    <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                            Loading tasks...
                        </TableCell>
                    </TableRow>
                ) : table.getRowModel().rows?.length ? (
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
                    No tasks found.
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
                      if (tasks.length < needed && hasNextPage && !isFetchingNextPage) {
                        await fetchNextPage()
                      }

                      setPagination((p) => ({ ...p, pageIndex: nextPageIndex }))
                    }}
                    disabled={pagination.pageIndex + 1 >= displayTotalPages || (!hasNextPage && tasks.length < (pagination.pageIndex + 2) * PAGE_SIZE)}
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
