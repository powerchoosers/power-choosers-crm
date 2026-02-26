'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Users,
  Building2,
  Plus,
  Search,
  FolderOpen,
  Trash2,
  Edit3,
  Check,
  Radar,
  Loader2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTargets, useCreateTarget, useDeleteTarget, useUpdateTarget } from '@/hooks/useTargets'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { TargetListCard } from '@/components/network/TargetListCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import DestructModal from '@/components/network/DestructModal'
import { Target } from '@/types/targets'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function TargetSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 flex flex-col justify-between h-44 animate-pulse">
          <Skeleton className="h-10 w-10 rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const TARGETS_MODE_STORAGE_KEY = 'targets-page-mode'

export default function TargetOverviewPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // STATE: Active Mode (People vs Accounts) — URL only for initial render (avoids hydration mismatch; localStorage is synced in useEffect)
  const [activeMode, setActiveMode] = useState<'people' | 'account'>(() => {
    const urlMode = searchParams?.get('mode') as 'people' | 'account' | null
    if (urlMode === 'people' || urlMode === 'account') return urlMode
    return 'people'
  })
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') || '')

  // Sync mode from localStorage when navigating back (if URL doesn't have mode param)
  useEffect(() => {
    const isListPage = pathname === '/network/targets' || pathname?.endsWith('/network/targets')
    if (!isListPage || searchParams?.get('mode')) return

    try {
      const stored = localStorage.getItem(TARGETS_MODE_STORAGE_KEY) as 'people' | 'account' | null
      if (stored === 'people' || stored === 'account') {
        setActiveMode(stored)
      }
    } catch (_) { }
  }, [pathname, searchParams])

  // Update URL and persist mode to localStorage when state changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (activeMode !== 'people') params.set('mode', activeMode)
    else params.delete('mode')

    if (searchQuery) params.set('q', searchQuery)
    else params.delete('q')

    const newString = params.toString()
    const oldString = searchParams?.toString() || ''

    if (newString !== oldString) {
      router.replace(`${pathname}?${newString}`, { scroll: false })
    }

    try {
      localStorage.setItem(TARGETS_MODE_STORAGE_KEY, activeMode)
    } catch (_) { }
  }, [activeMode, searchQuery, pathname, router, searchParams])

  // DATA FETCHING
  const { data: targets, isLoading, error } = useTargets()
  const createTarget = useCreateTarget()
  const deleteTarget = useDeleteTarget()
  const updateTarget = useUpdateTarget()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
  const [targetToDelete, setTargetToDelete] = useState<Target | null>(null)
  const [newTargetName, setNewTargetName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  // Filter based on toggle and search
  const filteredTargets = targets?.filter(l => {
    if (!l.kind) return false
    const normalizedKind = l.kind.toLowerCase()

    const isPeopleKind = ['people', 'person', 'contact', 'contacts'].includes(normalizedKind)
    const isAccountKind = ['account', 'accounts', 'company', 'companies'].includes(normalizedKind)

    // Mode filtering
    const matchesMode = activeMode === 'account' ? isAccountKind : isPeopleKind

    if (!matchesMode) return false

    // Search filtering
    if (searchQuery) {
      return l.name.toLowerCase().includes(searchQuery.toLowerCase())
    }

    return true
  }) || []

  const handleCreateTarget = async () => {
    if (!newTargetName.trim()) return
    try {
      await createTarget.mutateAsync({
        name: newTargetName.trim(),
        kind: activeMode === 'people' ? 'people' : 'account',
      })
      setIsCreateOpen(false)
      setNewTargetName('')
      toast.success('Target initialized successfully')
    } catch {
      toast.error('Failed to initialize target')
    }
  }

  const handleConfirmPurge = async () => {
    if (targetToDelete) {
      try {
        await deleteTarget.mutateAsync(targetToDelete.id)
        setIsDestructModalOpen(false)
        setTargetToDelete(null)
      } catch {
        toast.error('Failed to purge target')
      }
    }
  }

  const handleUpdateTarget = async (id: string) => {
    if (!editingName.trim()) return
    setSavingId(id)
    try {
      await updateTarget.mutateAsync({ id, name: editingName.trim() })
      setEditingId(null)
      setTimeout(() => setSavingId(null), 2000)
    } catch {
      setSavingId(null)
    }
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-500">
        Error loading targets: {error.message}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* 1. TOP PAGE HEADER (Matches People page style) */}
      <div className="flex-none px-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter text-white uppercase">Targets</h1>
            <p className="text-zinc-500 mt-1">
              Manage your {activeMode} target arrays and node clusters.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="h-10 px-4 rounded-xl flex items-center gap-2 bg-white text-zinc-950 hover:bg-zinc-200 transition-all hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)] font-medium"
            >
              <Plus className="w-4 h-4" /> Initialize Target
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-zinc-950 nodal-monolith-edge text-zinc-100">
          <DialogHeader>
            <DialogTitle>Initialize New Target</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="target-name">Name</Label>
              <Input
                id="target-name"
                value={newTargetName}
                onChange={(e) => setNewTargetName(e.target.value)}
                placeholder={`e.g. ${activeMode === 'people' ? 'Q1 Contacts' : 'Enterprise Accounts'}`}
                className="bg-black/40 nodal-monolith-edge"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="hover:bg-white/10 hover:text-white text-zinc-400">Cancel</Button>
            <Button onClick={handleCreateTarget} disabled={createTarget.isPending || !newTargetName.trim()} className="bg-white text-zinc-950 hover:bg-zinc-200">
              {createTarget.isPending ? 'Creating...' : 'Initialize Target'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. THE DATA CONTAINER (Contained & Scrollable) */}
      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">

        {/* INNER HEADER: Houses Search & Switcher */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 nodal-recessed sticky top-0 z-20">
          <div className="flex items-center gap-6">
            {/* Search Bar Div */}
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeMode} arrays...`}
                className="w-full bg-black/40 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-[#002FA7]/50 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
              <span className="text-zinc-600">Layer:</span>
              <span className="text-emerald-500 font-semibold">{activeMode === 'people' ? 'HUMAN_INTEL' : 'ASSET_INTEL'}</span>
            </div>

            {/* Target Switcher — sliding pill animation */}
            <div className="bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 flex items-center gap-2 relative">
              <div className="relative inline-flex">
                {activeMode === 'people' && (
                  <motion.div
                    layoutId="targets-toggle-pill"
                    className="absolute inset-0 rounded-md bg-white/10"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <button
                  onClick={() => setActiveMode('people')}
                  className={cn(
                    "relative z-10 px-4 py-2 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors duration-200 gap-2 flex items-center shrink-0",
                    activeMode === 'people'
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  )}
                  title="Human Intel Layer"
                >
                  <Users className="w-3 h-3 shrink-0" /> People
                </button>
              </div>
              <div className="relative inline-flex">
                {activeMode === 'account' && (
                  <motion.div
                    layoutId="targets-toggle-pill"
                    className="absolute inset-0 rounded-md bg-white/10"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <button
                  onClick={() => setActiveMode('account')}
                  className={cn(
                    "relative z-10 px-4 py-2 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors duration-200 gap-2 flex items-center shrink-0",
                    activeMode === 'account'
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  )}
                  title="Asset Intel Layer"
                >
                  <Building2 className="w-3 h-3 shrink-0" /> Accounts
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 scroll-smooth scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll relative z-0">
          {isLoading ? (
            <TargetSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
              <AnimatePresence mode="popLayout">
                {filteredTargets.map((target, index) => (
                  <TargetListCard
                    key={target.id}
                    target={target}
                    index={index}
                    isEditing={editingId === target.id}
                    isSaving={savingId === target.id}
                    editingName={editingName}
                    setEditingId={setEditingId}
                    setEditingName={setEditingName}
                    handleUpdateTarget={handleUpdateTarget}
                    setTargetToDelete={setTargetToDelete}
                    setIsDestructModalOpen={setIsDestructModalOpen}
                  />
                ))}
              </AnimatePresence>

              {/* Add New Target Card */}
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="nodal-monolith-edge border border-dashed border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-zinc-500 hover:text-zinc-400 hover:border-white/20 hover:bg-black/20 transition-all h-44"
              >
                <div className="w-10 h-10 rounded-2xl bg-black/40 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest">Initialize_New_Target</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredTargets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 font-mono text-xs uppercase tracking-widest">
              No matching nodes found in current target array.
            </div>
          )}
        </div>

        {/* Sync_Block Footer */}
        <div className="flex-none border-t border-white/5 nodal-recessed p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <span>Sync_Block 01–{filteredTargets.length.toString().padStart(2, '0')}</span>
              <div className="h-1 w-1 rounded-full bg-black/40" />
              <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{filteredTargets.length}</span></span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">System_Operational</span>
            </div>
            <div className="h-4 w-[1px] bg-white/5" />
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">v2.0.4_TARGET</span>
          </div>
        </div>
      </div>

      <DestructModal
        isOpen={isDestructModalOpen}
        onClose={() => {
          setIsDestructModalOpen(false)
          setTargetToDelete(null)
        }}
        onConfirm={handleConfirmPurge}
        count={targetToDelete?.count || 0}
      />
    </div>
  );
}
