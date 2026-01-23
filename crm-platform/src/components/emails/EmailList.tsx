import { useState } from 'react'
import { format } from 'date-fns'
import { Mail, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2, Eye, MousePointerClick, ChevronLeft, ChevronRight } from 'lucide-react'
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
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
        <div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center">
          <Mail className="w-8 h-8 text-zinc-600" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-zinc-300">No emails yet</p>
          <p className="text-sm">Sync your inbox to get started.</p>
        </div>
        <button 
          onClick={onRefresh}
          disabled={isSyncing}
          className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-2"
        >
          {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Sync Now
        </button>
      </div>
    )
  }

  const formatDate = (dateString: string | number | undefined) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return format(date, 'MMM d, h:mm a');
    } catch (e) {
      return '';
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
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                filter === 'all' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
            >
            All Emails
            </button>
            <button
            onClick={() => { setFilter('received'); setCurrentPage(1); }}
            className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                filter === 'received' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
            >
            Inbox
            </button>
            <button
            onClick={() => { setFilter('sent'); setCurrentPage(1); }}
            className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                filter === 'sent' ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
            )}
            >
            Sent
            </button>
        </div>
        <div className="text-xs text-zinc-500">
          Total {totalEmails ?? filteredEmails.length}
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex-none px-4 py-2 border-b border-white/5 bg-zinc-900/30 grid grid-cols-12 gap-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">
        <div className="col-span-1"></div>
        <div className="col-span-3">Participant</div>
        <div className="col-span-6">Message</div>
        <div className="col-span-2 text-right">Date</div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto min-h-0 scroll-smooth np-scroll">
        <div className="divide-y divide-white/5">
          {paginatedEmails.map((email) => (
            <div
              key={email.id}
              onClick={() => onSelectEmail(email)}
              className={cn(
                "group grid grid-cols-12 gap-4 p-4 hover:bg-white/5 cursor-pointer transition-colors items-center border-l-2",
                selectedEmailId === email.id ? "bg-white/5 border-indigo-500" : "border-transparent",
                email.unread ? "bg-indigo-500/5" : ""
              )}
            >
              {/* Avatar Icon */}
              <div className="col-span-1 flex justify-center">
                 <Avatar className="w-8 h-8 border border-white/10">
                  <AvatarFallback className={cn("text-xs", email.type === 'sent' ? "bg-zinc-800 text-zinc-400" : "bg-indigo-900/50 text-indigo-200")}>
                    {email.type === 'sent' ? 'ME' : (email.from?.[0]?.toUpperCase() || '?')}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Participant */}
              <div className="col-span-3 min-w-0">
                 <div className="flex items-center gap-2">
                    <span className={cn("text-sm truncate", email.unread ? "font-semibold text-white" : "text-zinc-300")}>
                        {email.type === 'sent' ? `To: ${Array.isArray(email.to) ? email.to.join(', ') : email.to}` : email.from}
                    </span>
                    {email.type === 'sent' ? (
                        <ArrowUpRight className="w-3 h-3 text-zinc-600 flex-none" />
                    ) : (
                        <ArrowDownLeft className="w-3 h-3 text-indigo-400 flex-none" />
                    )}
                 </div>
              </div>

              {/* Message Preview */}
              <div className="col-span-6 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                    <h4 className={cn("text-sm truncate", email.unread ? "font-medium text-zinc-100" : "text-zinc-400")}>
                        {email.subject}
                    </h4>
                    {/* Tracking Badges */}
                    {(email.openCount || 0) > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 bg-green-500/10 text-green-400 border-green-500/20 text-[10px] gap-1">
                            <Eye className="w-3 h-3" /> {email.openCount}
                        </Badge>
                    )}
                    {(email.clickCount || 0) > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] gap-1">
                            <MousePointerClick className="w-3 h-3" /> {email.clickCount}
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-zinc-500 truncate">
                  {email.snippet || email.text || 'No preview available'}
                </p>
              </div>

              {/* Date */}
              <div className="col-span-2 text-right">
                <span className="text-xs text-zinc-500 whitespace-nowrap">
                    {formatDate(email.date)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex-none border-t border-white/10 bg-zinc-900/90 p-4 flex items-center justify-between backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-sm text-zinc-500">
              <span>Showing {showingStart}–{showingEnd}</span>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400">
                Total {totalEmails ?? filteredEmails.length}
              </Badge>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <Button 
                variant="outline" 
                size="icon" 
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))} 
                disabled={currentPage === 1}
                className="border-white/10 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                aria-label="Previous page"
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-8 text-center text-sm text-zinc-400 tabular-nums">
              {currentPage}
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
                className="border-white/10 bg-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                aria-label="Next page"
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
      </div>
    </div>
  )
}
