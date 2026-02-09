'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, FileText, ChevronRight, Filter, ChevronLeft, Loader2 } from 'lucide-react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { format, formatDistanceToNow, isAfter, subMonths } from 'date-fns'
import { useScripts, Script } from '@/hooks/useScripts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function ScriptsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const { data: scripts, isLoading } = useScripts(debouncedSearch)

  const totalRecords = scripts?.length || 0
  const showingCount = scripts?.length || 0

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Scripts"
        description="Access and manage your sales and support scripts."
        globalFilter={searchTerm}
        onSearchChange={setSearchTerm}
        primaryAction={{
          label: "New Script",
          onClick: () => {},
          icon: <Plus size={18} className="mr-2" />
        }}
      />

      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <div className="flex-none px-6 py-3 border-b border-white/5 nodal-recessed sticky top-0 z-20 flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
          <div className="flex items-center gap-4">
            <span>Repository_Index</span>
            <div className="h-1 w-1 rounded-full bg-black/40" />
            <span>Active_Manifest</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-600">Total_Nodes:</span>
            <span className="text-zinc-400 tabular-nums">{totalRecords}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent p-6 np-scroll">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="nodal-glass border-white/5 animate-pulse">
                    <CardHeader className="h-24" />
                    <CardContent className="h-20" />
                    </Card>
                ))
                ) : scripts?.length ? (
                scripts.map((script) => (
                    <Card key={script.id} className="nodal-glass nodal-glass-hover transition-all group cursor-pointer overflow-hidden border-white/5">
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500 mb-3 group-hover:scale-110 transition-transform duration-300">
                            <FileText className="w-5 h-5" />
                        </div>
                        <Badge variant="outline" className={cn(
                            "border-white/10 bg-white/5 text-zinc-400",
                            script.category === 'Sales' && "text-green-400 bg-green-500/10 border-green-500/20",
                            script.category === 'Objection Handling' && "text-red-400 bg-red-500/10 border-red-500/20",
                            script.category === 'Closing' && "text-purple-400 bg-purple-500/10 border-purple-500/20",
                        )}>
                            {script.category}
                        </Badge>
                        </div>
                        <CardTitle className="text-lg text-zinc-100 group-hover:text-white">{script.title}</CardTitle>
                        <CardDescription className="text-zinc-500 text-xs mt-1 font-mono tabular-nums">
                          {(() => {
                            if (!script.lastUpdated) return 'No updates'
                            try {
                              const date = new Date(script.lastUpdated)
                              const threeMonthsAgo = subMonths(new Date(), 3)
                              const isRecent = isAfter(date, threeMonthsAgo)
                              return `Updated ${isRecent ? formatDistanceToNow(date, { addSuffix: true }) : format(date, 'MMM d, yyyy')}`
                            } catch (e) {
                              return `Updated ${script.lastUpdated}`
                            }
                          })()}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-zinc-400 text-sm line-clamp-3 leading-relaxed">
                        {script.content}
                        </p>
                        <div className="mt-4 flex items-center text-xs text-[#002FA7] font-medium opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                        View Script <ChevronRight className="w-3 h-3 ml-1" />
                        </div>
                    </CardContent>
                    </Card>
                ))
                ) : (
                <div className="col-span-full text-center py-12 text-zinc-500">
                    No scripts found matching your search.
                </div>
                )}
            </div>
        </div>

        <div className="flex-none border-t border-white/5 nodal-recessed p-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                  <span>Sync_Block 01–{showingCount.toString().padStart(2, '0')}</span>
                  <div className="h-1 w-1 rounded-full bg-black/40" />
                  <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{totalRecords}</span></span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                  disabled
                  className="icon-button-forensic w-8 h-8 flex items-center justify-center opacity-30 cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
                  01
                </div>
                <button
                  disabled
                  className="icon-button-forensic w-8 h-8 flex items-center justify-center opacity-30 cursor-not-allowed"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
      </div>
    </div>
  )
}
