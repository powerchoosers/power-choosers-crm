import { useState } from 'react'
import { format, formatDistanceToNow, isAfter, subMonths } from 'date-fns'
import { Mail, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2, Eye, MousePointerClick, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Email } from '@/hooks/useEmails'
import { cn } from '@/lib/utils'
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

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
}

export function EmailList({ emails, isLoading, onRefresh, isSyncing, onSelectEmail, selectedEmailId, totalEmails, hasNextPage, fetchNextPage, isFetchingNextPage }: EmailListProps) {
  const [filter, setFilter] = useState<'all' | 'received' | 'sent'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15

  const filteredEmails = emails.filter(email => {
    if (filter === 'all') return true
    return email.type === filter || (filter === 'received' ? email.type === 'received' : email.type === 'sent')
  })

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / itemsPerPage))
  const paginatedEmails = filteredEmails.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

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
        <div className="w-16 h-16 rounded-full nodal-glass flex items-center justify-center border border-white/5 shadow-2xl">
          <Mail className="w-8 h-8 text-zinc-600" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-white tracking-tighter">No_Entropy_Detected</p>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Awaiting initial uplink synchronization</p>
        </div>
        <button 
          onClick={onRefresh}
          disabled={isSyncing}
          className="text-[10px] font-mono uppercase tracking-widest border border-white/10 hover:border-signal/50 hover:bg-signal/10 text-zinc-500 hover:text-white px-4 py-2 rounded-lg transition-all flex items-center gap-2 group"
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
    } catch (e) {
      return null;
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950/30">
      {/* Filters Header */}
      <div className="flex-none p-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm z-10">
        <div className="flex gap-2">
            <button
            onClick={() => { setFilter('all'); setCurrentPage(1); }}
            className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                filter === 'all' ? "bg-white/10 text-white shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            )}
            >
            All_Nodes
            </button>
            <button
            onClick={() => { setFilter('received'); setCurrentPage(1); }}
            className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                filter === 'received' ? "bg-white/10 text-white shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            )}
            >
            Uplink_In
            </button>
            <button
            onClick={() => { setFilter('sent'); setCurrentPage(1); }}
            className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                filter === 'sent' ? "bg-white/10 text-white shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            )}
            >
            Uplink_Out
            </button>
        </div>
        <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em]">
          Total_Entropy: <span className="text-zinc-400 tabular-nums">{totalEmails ?? filteredEmails.length}</span>
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex-none px-4 py-3 border-b border-white/5 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-20 grid grid-cols-12 gap-4 text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
        <div className="col-span-1"></div>
        <div className="col-span-3">Entity</div>
        <div className="col-span-6">Transmission</div>
        <div className="col-span-2 text-right">Timestamp</div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto min-h-0 scroll-smooth np-scroll">
        <div className="divide-y divide-white/5">
          {paginatedEmails.map((email) => (
            <div
              key={email.id}
              onClick={() => onSelectEmail(email)}
              className={cn(
                "group grid grid-cols-12 gap-4 p-3 hover:bg-white/5 cursor-pointer transition-all items-center border-l-2",
                selectedEmailId === email.id ? "bg-white/5 border-[#002FA7]" : "border-transparent",
                email.unread ? "bg-[#002FA7]/5" : ""
              )}
            >
              {/* Avatar Icon */}
              <div className="col-span-1 flex justify-center relative">
                 {email.unread && (
                   <div className="absolute top-0 right-1/4 w-2 h-2 rounded-full bg-[#002FA7] animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.8)] z-10" />
                 )}
                 <div className={cn(
                   "w-9 h-9 rounded-full nodal-glass flex items-center justify-center text-[10px] font-mono font-semibold border border-white/10 shadow-sm transition-all",
                   email.type === 'sent' ? "text-zinc-500" : "text-white"
                 )}>
                    {email.type === 'sent' ? 'NP' : (email.from?.[0]?.toUpperCase() || '?')}
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
              <div className="col-span-6 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                    <h4 className={cn(
                      "text-sm truncate tracking-tight transition-all origin-left group-hover:scale-[1.02]", 
                      email.unread ? "font-medium text-zinc-100" : "text-zinc-500 group-hover:text-zinc-300"
                    )}>
                        {email.subject}
                    </h4>
                    {/* Tracking Badges */}
                    {(email.openCount || 0) > 0 && (
                        <Badge variant="secondary" className="h-4 px-1.5 nodal-glass text-green-500/80 border-green-500/20 text-[9px] gap-1 font-mono tabular-nums uppercase tracking-widest">
                            <Eye className="w-2.5 h-2.5" /> {email.openCount}
                        </Badge>
                    )}
                    {(email.clickCount || 0) > 0 && (
                        <Badge variant="secondary" className="h-4 px-1.5 nodal-glass text-blue-500/80 border-blue-500/20 text-[9px] gap-1 font-mono tabular-nums uppercase tracking-widest">
                            <MousePointerClick className="w-2.5 h-2.5" /> {email.clickCount}
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-zinc-600 truncate group-hover:text-zinc-500 transition-colors">
                  {email.snippet || email.text || 'No preview available'}
                </p>
              </div>

              {/* Date */}
              <div className="col-span-2 flex justify-end">
                {formatDate(email.date)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex-none border-t border-white/5 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              <span>Sync_Block {showingStart}–{showingEnd}</span>
              <div className="h-1 w-1 rounded-full bg-zinc-800" />
              <span className="text-zinc-500">Total_Nodes: <span className="text-zinc-400 tabular-nums">{totalEmails ?? filteredEmails.length}</span></span>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <Button 
                variant="outline" 
                size="icon" 
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))} 
                disabled={currentPage === 1}
                className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                aria-label="Previous page"
            >
                <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <div className="min-w-8 text-center text-[10px] font-mono text-zinc-500 tabular-nums">
              {currentPage.toString().padStart(2, '0')}
            </div>
            <Button 
                variant="outline" 
                size="icon" 
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
                className="w-8 h-8 border-white/5 bg-transparent text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
                aria-label="Next page"
            >
                <ChevronRight className="h-3.5 w-3.5" />
            </Button>
        </div>
      </div>
    </div>
  )
}
