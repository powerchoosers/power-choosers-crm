import { useState } from 'react'
import { format, formatDistanceToNow, isAfter, subMonths } from 'date-fns'
import { motion } from 'framer-motion'
import { Mail, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2, Eye, MousePointer2, ChevronLeft, ChevronRight, Clock, Check } from 'lucide-react'
import { Email } from '@/hooks/useEmails'
import { cn } from '@/lib/utils'

interface EmailListProps {
  emails: Email[]
  isLoading: boolean
  onRefresh: () => void
  isSyncing: boolean
  onSelectEmail: (email: Email) => void
  selectedEmailId?: string
  totalEmails?: number
  hasNextPage?: boolean
  fetchNextPage?: () => void
  isFetchingNextPage?: boolean
  currentPage?: number
  onPageChange?: (page: number) => void
  /** Bulk selection: selected email IDs (controlled by parent) */
  selectedIds?: Set<string>
  /** Called when user toggles selection (by row or select-all) */
  onSelectionChange?: (ids: Set<string>) => void
  /** Total count available for "select N" in BulkActionDeck (e.g. filtered list length) */
  totalAvailable?: number
  /** Called when user chooses "select N" from bulk deck */
  onSelectCount?: (count: number) => void
}

export function EmailList({ 
  emails, 
  isLoading, 
  onRefresh, 
  isSyncing, 
  onSelectEmail, 
  selectedEmailId, 
  totalEmails, 
  hasNextPage, 
  fetchNextPage, 
  isFetchingNextPage,
  currentPage: externalPage,
  onPageChange: externalOnPageChange,
  selectedIds = new Set(),
  onSelectionChange,
  totalAvailable,
  onSelectCount,
}: EmailListProps) {
  const [filter, setFilter] = useState<'all' | 'received' | 'sent'>('all')
  const [internalPage, setInternalPage] = useState(1)
  
  const currentPage = externalPage || internalPage
  const setCurrentPage = externalOnPageChange || setInternalPage

  const itemsPerPage = 15

  const filteredEmails = emails.filter(email => {
    if (filter === 'all') return true
    if (filter === 'received') return email.type === 'received'
    if (filter === 'sent') {
      // Uplink out: only emails you sent personally (Gmail synced + CRM-sent)
      return email.type === 'sent'
    }
    return email.type === filter
  })

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / itemsPerPage))
  const paginatedEmails = filteredEmails.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const selectableTotal = totalAvailable ?? filteredEmails.length
  const allOnPageSelected = paginatedEmails.length > 0 && paginatedEmails.every(e => selectedIds.has(e.id))
  const toggleAllOnPage = () => {
    if (!onSelectionChange) return
    if (allOnPageSelected) {
      const next = new Set(selectedIds)
      paginatedEmails.forEach(e => next.delete(e.id))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedIds)
      paginatedEmails.forEach(e => next.add(e.id))
      onSelectionChange(next)
    }
  }
  const toggleRow = (email: Email) => {
    if (!onSelectionChange) return
    const next = new Set(selectedIds)
    if (next.has(email.id)) next.delete(email.id)
    else next.add(email.id)
    onSelectionChange(next)
  }

  const showingStart = filteredEmails.length === 0
    ? 0
    : Math.min(filteredEmails.length, (currentPage - 1) * itemsPerPage + 1)
  const showingEnd = filteredEmails.length === 0
    ? 0
    : Math.min(filteredEmails.length, currentPage * itemsPerPage)

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p>Loading emails...</p>
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4 animate-in fade-in duration-700">
        <div className="w-16 h-16 rounded-2xl nodal-glass flex items-center justify-center border border-white/5 shadow-2xl">
          <Mail className="w-8 h-8 text-zinc-600" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-white tracking-tighter">No_Entropy_Detected</p>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Awaiting initial uplink synchronization</p>
        </div>
        <button 
          onClick={onRefresh}
          disabled={isSyncing}
          className="icon-button-forensic text-[10px] font-mono uppercase tracking-widest !text-zinc-500 hover:!text-white px-4 py-2 flex items-center gap-2 group"
          title="Initialize Sync"
        >
          {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />}
          Initialize_Sync
        </button>
      </div>
    )
  }

  const formatDate = (dateString: string | number | undefined) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      
      const threeMonthsAgo = subMonths(new Date(), 3)
      const isRecent = isAfter(date, threeMonthsAgo)
      
      return (
        <div className="flex items-center gap-2 text-zinc-500 font-mono text-[10px] tabular-nums uppercase tracking-widest">
          <Clock size={12} className="text-zinc-600" />
          <span>
            {isRecent 
              ? formatDistanceToNow(date, { addSuffix: true })
              : format(date, 'MMM d, yyyy')}
          </span>
        </div>
      )
    } catch {
      return null;
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950/30">
      {/* Filters Header - Segmented Control */}
      <div className="flex-none p-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm z-10">
        <div className="bg-black/40 border border-white/5 rounded-lg px-2 py-1.5 flex items-center gap-2 relative">
          <div className="relative inline-flex">
            {filter === 'all' && (
              <motion.div
                layoutId="emails-filter-pill"
                className="absolute inset-0 rounded-md bg-white/10"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <button
              type="button"
              onClick={() => { setFilter('all'); setCurrentPage(1); }}
              className={cn(
                "relative z-10 px-4 py-2 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors duration-200 gap-2 flex items-center shrink-0",
                filter === 'all' ? "text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
              title="All Nodes"
            >
              All_Nodes
            </button>
          </div>
          <div className="relative inline-flex">
            {filter === 'received' && (
              <motion.div
                layoutId="emails-filter-pill"
                className="absolute inset-0 rounded-md bg-white/10"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <button
              type="button"
              onClick={() => { setFilter('received'); setCurrentPage(1); }}
              className={cn(
                "relative z-10 px-4 py-2 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors duration-200 gap-2 flex items-center shrink-0",
                filter === 'received' ? "text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
              title="Uplink In"
            >
              Uplink_In
            </button>
          </div>
          <div className="relative inline-flex">
            {filter === 'sent' && (
              <motion.div
                layoutId="emails-filter-pill"
                className="absolute inset-0 rounded-md bg-white/10"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <button
              type="button"
              onClick={() => { setFilter('sent'); setCurrentPage(1); }}
              className={cn(
                "relative z-10 px-4 py-2 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors duration-200 gap-2 flex items-center shrink-0",
                filter === 'sent' ? "text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
              title="Uplink Out"
            >
              Uplink_Out
            </button>
          </div>
        </div>
        <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em]">
          Total_Entropy: <span className="text-zinc-400 tabular-nums">{filteredEmails.length}</span>
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex-none px-4 py-3 border-b border-white/5 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-20 grid grid-cols-12 gap-4 text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
        <div className="col-span-1 flex items-center justify-center">
          {onSelectionChange ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleAllOnPage(); }}
              className={cn(
                "w-4 h-4 rounded border border-white/20 transition-all flex items-center justify-center",
                allOnPageSelected ? "bg-[#002FA7] border-[#002FA7]" : "bg-transparent opacity-50 hover:opacity-100"
              )}
              aria-label="Select all on page"
            >
              {allOnPageSelected && <Check className="w-3 h-3 text-white" />}
            </button>
          ) : null}
        </div>
        <div className="col-span-1" />
        <div className="col-span-3">Entity</div>
        <div className={filter === 'sent' ? "col-span-3" : "col-span-5"}>Transmission</div>
        {filter === 'sent' && <div className="col-span-2">Telemetry</div>}
        <div className="col-span-2 text-right">Timestamp</div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto min-h-0 scroll-smooth np-scroll">
        <div className="divide-y divide-white/5">
          {paginatedEmails.map((email, index) => {
            const openCount = email.openCount || 0
            const clickCount = email.clickCount || 0
            const hasClicks = clickCount > 0
            const rowIndex = (currentPage - 1) * itemsPerPage + index + 1
            const isSelected = selectedIds.has(email.id)
            
            return (
            <div
              key={email.id}
              onClick={() => onSelectEmail(email)}
              className={cn(
                "group grid grid-cols-12 gap-4 p-3 hover:bg-white/5 cursor-pointer transition-all items-center border-l-2",
                hasClicks ? "border-[#002FA7]" : selectedEmailId === email.id ? "border-[#002FA7]" : "border-transparent",
                email.unread ? "bg-[#002FA7]/5" : "",
                isSelected ? "bg-[#002FA7]/5 hover:bg-[#002FA7]/10" : ""
              )}
            >
              {/* Select / Row number */}
              <div className="col-span-1 flex items-center justify-center relative group/select">
                {onSelectionChange ? (
                  <>
                    <span className={cn(
                      "font-mono text-[10px] text-zinc-700 transition-opacity",
                      isSelected ? "opacity-0" : "group-hover/select:opacity-0"
                    )}>
                      {rowIndex.toString().padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleRow(email); }}
                      className={cn(
                        "absolute inset-0 m-auto w-4 h-4 rounded border transition-all flex items-center justify-center",
                        isSelected
                          ? "bg-[#002FA7] border-[#002FA7] opacity-100"
                          : "bg-white/5 border-white/10 opacity-0 group-hover/select:opacity-100"
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>
                  </>
                ) : (
                  <span className="font-mono text-[10px] text-zinc-700">{rowIndex.toString().padStart(2, '0')}</span>
                )}
              </div>
              {/* Avatar Icon */}
              <div className="col-span-1 flex justify-center relative -ml-4">
                 {email.unread && (
                   <div className="absolute top-0 right-1/4 w-2 h-2 rounded-full bg-[#002FA7] animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.8)] z-10" />
                 )}
                 <div className={cn(
                   "w-9 h-9 rounded-2xl nodal-glass flex items-center justify-center text-[10px] font-mono font-semibold border border-white/10 shadow-sm transition-all",
                   email.type === 'sent' ? "text-zinc-500" : "text-white"
                 )}>
                    {email.type === 'sent' ? 'NP' : (typeof email.from === 'string' ? email.from?.[0]?.toUpperCase() : '?')}
                </div>
              </div>

              {/* Participant */}
              <div className="col-span-3 min-w-0">
                 <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm truncate font-mono tracking-tight transition-all origin-left group-hover:scale-[1.02]", 
                      email.unread ? "font-semibold text-white" : "text-zinc-400 group-hover:text-zinc-200"
                    )}>
                        {email.type === 'sent' ? `To: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}` : email.from}
                    </span>
                    {email.type === 'sent' ? (
                        <ArrowUpRight className="w-3 h-3 text-zinc-700 flex-none group-hover:text-zinc-500" />
                    ) : (
                        <ArrowDownLeft className="w-3 h-3 text-zinc-600 flex-none group-hover:text-zinc-400" />
                    )}
                 </div>
              </div>

              {/* Message Preview */}
              <div className={cn("min-w-0 space-y-1", filter === 'sent' ? "col-span-3" : "col-span-5")}>
                <h4 className={cn(
                  "text-sm truncate tracking-tight transition-all origin-left group-hover:scale-[1.02]", 
                  email.unread ? "font-medium text-zinc-100" : "text-zinc-500 group-hover:text-zinc-300"
                )}>
                    {email.subject}
                </h4>
                <p className="text-xs text-zinc-600 truncate group-hover:text-zinc-500 transition-colors">
                  {email.snippet || email.text || 'No preview available'}
                </p>
              </div>

              {/* Telemetry Column - Only show for sent emails filter */}
              {filter === 'sent' && (
                <div className="col-span-2 flex items-center">
                  <div className="flex items-center gap-3 bg-white/5 rounded px-2 py-1 border border-white/5 w-fit">
                    {/* Opens */}
                    <div className="flex items-center gap-1">
                      <Eye 
                        size={12} 
                        className={cn(
                          openCount > 0 ? "text-emerald-400" : "text-zinc-600"
                        )} 
                      />
                      <span className={cn(
                        "text-[10px] font-mono tabular-nums",
                        openCount > 2 ? "text-white" : openCount > 0 ? "text-emerald-400" : "text-zinc-600"
                      )}>
                        {openCount}
                      </span>
                    </div>
                    {/* Clicks */}
                    <div className="flex items-center gap-1">
                      <MousePointer2 
                        size={12} 
                        className={cn(
                          clickCount > 0 ? "text-[#002FA7]" : "text-zinc-600"
                        )} 
                      />
                      <span className={cn(
                        "text-[10px] font-mono tabular-nums",
                        clickCount > 0 ? "text-[#002FA7]" : "text-zinc-600"
                      )}>
                        {clickCount}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Date */}
              <div className="col-span-2 flex justify-end">
                {formatDate(email.date)}
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <span>Sync_Block {showingStart}–{showingEnd}</span>
              <div className="h-1 w-1 rounded-full bg-zinc-800" />
              <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{filteredEmails.length}</span></span>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))} 
                disabled={currentPage === 1}
                className="icon-button-forensic w-8 h-8 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous page"
            >
                <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
              {currentPage.toString().padStart(2, '0')}
            </div>
            <button 
                onClick={async () => {
                  const nextPage = currentPage + 1
                  const needed = nextPage * itemsPerPage

                  if (
                    fetchNextPage &&
                    hasNextPage &&
                    !isFetchingNextPage &&
                    filteredEmails.length < needed
                  ) {
                    await fetchNextPage()
                  }

                  if (hasNextPage || nextPage <= totalPages) {
                    handlePageChange(nextPage)
                  }
                }}
                disabled={(!hasNextPage && currentPage >= totalPages) || isFetchingNextPage}
                className="icon-button-forensic w-8 h-8 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next page"
            >
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
      </div>
    </div>
  )
}
