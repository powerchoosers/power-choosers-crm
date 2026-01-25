'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSequences, useSequencesCount, Sequence } from '@/hooks/useSequences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { 
  Search, 
  Plus, 
  MoreHorizontal, 
  Play, 
  Pause, 
  Edit, 
  Trash2, 
  ListOrdered,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter
} from 'lucide-react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { toast } from 'sonner'
import { formatDistanceToNow, format, isAfter, subMonths } from 'date-fns'
import { Badge } from '@/components/ui/badge'

const PAGE_SIZE = 50

function toDisplayDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value

  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds?: unknown }).seconds
    if (typeof seconds === 'number') return new Date(seconds * 1000)
  }

  return null
}

export default function SequencesPage() {
  const { data, isLoading, addSequence, updateSequence, deleteSequence, fetchNextPage, hasNextPage, isFetchingNextPage } = useSequences()
  const { data: totalSequences } = useSequencesCount()
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newSequenceName, setNewSequenceName] = useState('')
  const [newSequenceDesc, setNewSequenceDesc] = useState('')
  const [pageIndex, setPageIndex] = useState(0)

  const sequences = useMemo(() => data?.pages.flatMap(page => page.sequences) || [], [data])

  const filteredSequences = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sequences
    return sequences.filter((seq) => {
      return (
        (seq.name?.toLowerCase() ?? "").includes(q) ||
        (seq.description?.toLowerCase() ?? "").includes(q)
      )
    })
  }, [sequences, searchQuery])

  const effectiveTotalRecords = totalSequences ?? sequences.length
  const totalPages = Math.max(1, Math.ceil(effectiveTotalRecords / PAGE_SIZE))
  const displayTotalPages = totalSequences == null && hasNextPage
    ? Math.max(totalPages, pageIndex + 2)
    : totalPages

  useEffect(() => {
    const needed = (pageIndex + 2) * PAGE_SIZE
    if (hasNextPage && !isFetchingNextPage && sequences.length < needed) {
      fetchNextPage()
    }
  }, [pageIndex, sequences.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const pagedSequences = useMemo(() => {
    const start = pageIndex * PAGE_SIZE
    return filteredSequences.slice(start, start + PAGE_SIZE)
  }, [filteredSequences, pageIndex])

  const filteredCount = filteredSequences.length
  const showingStart = filteredCount === 0 ? 0 : Math.min(filteredCount, pageIndex * PAGE_SIZE + 1)
  const showingEnd = filteredCount === 0 ? 0 : Math.min(filteredCount, (pageIndex + 1) * PAGE_SIZE)

  const handleCreate = async () => {
    if (!newSequenceName.trim()) return
    
    try {
      addSequence({
        name: newSequenceName,
        description: newSequenceDesc,
        status: 'draft',
        steps: []
      })
      setIsCreateOpen(false)
      setNewSequenceName('')
      setNewSequenceDesc('')
      toast.success('Sequence created successfully')
    } catch (error) {
      toast.error('Failed to create sequence')
    }
  }

  const handleToggleStatus = (sequence: Sequence) => {
    const newStatus = sequence.status === 'active' ? 'inactive' : 'active'
    updateSequence({ id: sequence.id, status: newStatus })
    toast.success(`Sequence ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this sequence?')) {
      deleteSequence(id)
      toast.success('Sequence deleted')
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Sequences"
        description="Automate your outreach with smart multi-step sequences."
        globalFilter={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val)
          setPageIndex(0)
        }}
        primaryAction={{
          label: "Create Sequence",
          onClick: () => setIsCreateOpen(true),
          icon: <Plus size={18} className="mr-2" />
        }}
      />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Create New Sequence</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Start a new automated outreach campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input 
                id="name" 
                value={newSequenceName} 
                onChange={(e) => setNewSequenceName(e.target.value)} 
                placeholder="e.g. Cold Outreach Q1"
                className="bg-zinc-900 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desc">Description</Label>
              <Input 
                id="desc" 
                value={newSequenceDesc} 
                onChange={(e) => setNewSequenceDesc(e.target.value)} 
                placeholder="Optional description"
                className="bg-zinc-900 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="hover:bg-white/10 hover:text-white text-zinc-400">Cancel</Button>
            <Button onClick={handleCreate} className="bg-white text-zinc-950 hover:bg-zinc-200">Create Sequence</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none bg-gradient-to-b from-white/5 to-transparent z-10" />
        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
            {isLoading ? (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
            </div>
            ) : filteredSequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <ListOrdered className="h-12 w-12 mb-4 opacity-20" />
                <p>No sequences found</p>
                {searchQuery && <Button variant="link" onClick={() => setSearchQuery('')} className="text-indigo-400">Clear search</Button>}
            </div>
            ) : (
            <Table>
                <TableHeader className="sticky top-0 bg-zinc-900/80 backdrop-blur-sm z-20 border-b border-white/5">
                <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3 w-[300px]">Name</TableHead>
                    <TableHead className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Steps</TableHead>
                    <TableHead className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Status</TableHead>
                    <TableHead className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Created</TableHead>
                    <TableHead className="text-right text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] py-3">Actions</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {pagedSequences.map((sequence) => (
                    <TableRow key={sequence.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <TableCell className="font-medium text-zinc-200">
                        <div className="flex flex-col">
                        <span>{sequence.name}</span>
                        {sequence.description && <span className="text-xs text-zinc-500">{sequence.description}</span>}
                        </div>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                        <div className="flex items-center gap-1.5 font-mono tabular-nums">
                        <span className="bg-white/10 px-2 py-0.5 rounded text-xs text-zinc-300 font-medium">
                            {sequence.steps?.length || 0}
                        </span>
                        <span className="text-xs">steps</span>
                        </div>
                    </TableCell>
                    <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                        <Switch 
                            checked={sequence.status === 'active'}
                            onCheckedChange={() => handleToggleStatus(sequence)}
                            className="data-[state=checked]:bg-green-500"
                        />
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shadow-sm transition-all duration-500 ${
                            sequence.status === 'active' 
                              ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' 
                              : sequence.status === 'draft'
                              ? 'bg-zinc-600 shadow-[0_0_8px_rgba(113,113,122,0.4)]'
                              : 'bg-zinc-500'
                          }`} />
                          <span className={`text-xs font-mono uppercase tracking-widest ${
                              sequence.status === 'active' ? 'text-green-400' : 
                              sequence.status === 'draft' ? 'text-zinc-500' : 'text-zinc-400'
                          }`}>
                              {sequence.status ? sequence.status : 'Draft'}
                          </span>
                        </div>
                        </div>
                    </TableCell>
                    <TableCell className="py-3">
                        {(() => {
                          const date = toDisplayDate(sequence.createdAt)
                          if (!date) return <span className="text-zinc-600 font-mono text-xs">--</span>
                          
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
                        })()}
                    </TableCell>
                    <TableCell className="text-right py-3">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10" onClick={() => toast.info('Builder coming soon')}>
                            <Edit className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 text-zinc-300">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem className="hover:bg-white/5 cursor-pointer" onClick={() => handleToggleStatus(sequence)}>
                                {sequence.status === 'active' ? <><Pause className="mr-2 h-4 w-4" /> Pause Sequence</> : <><Play className="mr-2 h-4 w-4" /> Activate Sequence</>}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-red-400 focus:text-red-400" onClick={() => handleDelete(sequence.id)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            )}
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
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  disabled={pageIndex === 0}
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
                  onClick={async () => {
                    const nextPageIndex = pageIndex + 1
                    if (nextPageIndex >= displayTotalPages) return

                    const needed = (nextPageIndex + 1) * PAGE_SIZE
                    if (sequences.length < needed && hasNextPage && !isFetchingNextPage) {
                      await fetchNextPage()
                    }

                    setPageIndex(nextPageIndex)
                  }}
                  disabled={pageIndex + 1 >= displayTotalPages || (!hasNextPage && sequences.length < (pageIndex + 2) * PAGE_SIZE)}
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
