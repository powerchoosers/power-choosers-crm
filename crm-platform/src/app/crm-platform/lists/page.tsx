'use client'

import { useState } from 'react'
import { 
  Users, 
  Building2, 
  Plus, 
  Search, 
  FolderOpen, 
  Trash2, 
  Edit3,
  ListFilter,
  Loader2
} from 'lucide-react'
import { useLists } from '@/hooks/useLists'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

export default function ListOverviewPage() {
  // STATE: Active Mode (People vs Accounts)
  const [activeMode, setActiveMode] = useState<'people' | 'account'>('people')
  const [searchQuery, setSearchQuery] = useState('')
  
  // DATA FETCHING
  const { data: lists, isLoading, error } = useLists()

  // Filter based on toggle and search
  const filteredLists = lists?.filter(l => {
    if (!l.kind) return false
    const normalizedKind = l.kind.toLowerCase()
    
    // Mode filtering
    const matchesMode = activeMode === 'account' 
      ? normalizedKind.includes('account')
      : normalizedKind === activeMode
      
    if (!matchesMode) return false
    
    // Search filtering
    if (searchQuery) {
      return l.name.toLowerCase().includes(searchQuery.toLowerCase())
    }
    
    return true
  }) || []

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-500">
        Error loading lists: {error.message}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* 1. TOP PAGE HEADER (Matches People page style) */}
      <div className="flex-none px-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter text-white">Segmentation</h1>
            <p className="text-zinc-500 mt-1">
              Manage your {activeMode} segmentation arrays and node clusters.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium h-10 px-4 rounded-lg transition-all hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)] flex items-center gap-2">
              <Plus className="w-4 h-4" /> Initialize Array
            </button>
          </div>
        </div>
      </div>

      {/* 2. THE DATA CONTAINER (Contained & Scrollable) */}
      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none bg-gradient-to-b from-white/5 to-transparent z-10" />
        
        {/* INNER HEADER: Houses Search & Switcher */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-20">
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

            {/* List Switcher */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-1 flex items-center">
              <button 
                onClick={() => setActiveMode('people')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all ${
                  activeMode === 'people' 
                  ? 'bg-zinc-800 text-white shadow-lg' 
                  : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <Users className="w-3 h-3" /> People
              </button>
              <button 
                onClick={() => setActiveMode('account')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all ${
                  activeMode === 'account' 
                  ? 'bg-zinc-800 text-white shadow-lg' 
                  : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <Building2 className="w-3 h-3" /> Accounts
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll relative z-0">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-[#002FA7] animate-spin" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Synchronizing_Arrays...</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
              {filteredLists.map((list) => (
                <Link 
                  key={list.id}
                  href={`/crm-platform/lists/${list.id}`}
                  className="group relative bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-6 hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer flex flex-col justify-between h-44"
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start">
                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 text-white">
                      <ListFilter className="w-5 h-5" />
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div>
                    <h3 className="text-lg font-medium text-zinc-100 mb-2 group-hover:text-white truncate">
                      {list.name}
                    </h3>
                    <div className="flex flex-col gap-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className={`w-1.5 h-1.5 rounded-full ${(list.count || 0) > 0 ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                        Nodes: <span className="text-zinc-300 tabular-nums">{list.count || 0}</span>
                      </span>
                      <span className="whitespace-nowrap">
                        Updated: <span className="text-zinc-400">
                          {list.createdAt ? formatDistanceToNow(new Date(list.createdAt), { addSuffix: true }) : 'Never'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Hover Bloom Effect */}
                  <div className="absolute bottom-0 right-0 w-8 h-8 bg-gradient-to-tl from-[#002FA7]/20 to-transparent rounded-br-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}

              {/* Add New List Card */}
              <button className="border border-dashed border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 hover:bg-white/[0.02] transition-all h-44">
                <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest">Initialize_New_Array</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredLists.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 font-mono text-xs uppercase tracking-widest">
              No matching nodes found in current array.
            </div>
          )}
        </div>

        {/* Sync_Block Footer */}
        <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <span>Sync_Block 01–{filteredLists.length.toString().padStart(2, '0')}</span>
              <div className="h-1 w-1 rounded-full bg-zinc-800" />
              <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{filteredLists.length}</span></span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">System_Operational</span>
            </div>
            <div className="h-4 w-[1px] bg-white/5" />
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">v2.0.4_SEGMENT</span>
          </div>
        </div>
      </div>
    </div>
  );
}
