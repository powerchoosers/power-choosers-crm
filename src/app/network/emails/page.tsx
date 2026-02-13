'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEmails, useEmailsCount, Email } from '@/hooks/useEmails'
import { useZohoSync } from '@/hooks/useZohoSync'
import { useAuth } from '@/context/AuthContext'
import { EmailList } from '@/components/emails/EmailList'
import { ComposeModal } from '@/components/emails/ComposeModal'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, RefreshCw, Mail, Filter } from 'lucide-react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useTableState } from '@/hooks/useTableState'

const AUTO_SYNC_DELAY_MS = 5 * 1000 // 5 seconds after load

export default function EmailsPage() {
  const { user } = useAuth()
  const { pageIndex, setPage, searchQuery, setSearch } = useTableState({ pageSize: 15 })

  const [searchTerm, setSearchTerm] = useState(searchQuery)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const hasRunAutoSync = useRef(false)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setSearch(searchTerm)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm, setSearch])

  const { data, isLoading: isLoadingEmails, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useEmails(debouncedSearch)
  const { data: totalEmails } = useEmailsCount(debouncedSearch)
  const { performSync, isSyncing } = useZohoSync()
  const router = useRouter()

  // No manual sync trigger needed here as GlobalSync handles it, 
  // but we keep the manual button for forced refresh.

  const [isComposeOpen, setIsComposeOpen] = useState(false)

  const emails = data?.pages.flatMap(page => page.emails) || []
  const effectiveTotal = totalEmails ?? emails.length

  const handleSync = () => {
    if (!user) return
    performSync(false)
  }

  const handleSelectionChange = (ids: Set<string>) => setSelectedIds(ids)
  const handleSelectCount = (count: number) => {
    const all = emails.slice(0, count).map(e => e.id)
    setSelectedIds(new Set(all))
    if (count > emails.length && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }
  const handleBulkAction = (action: string) => {
    if (action === 'delete') {
      toast.info('Bulk delete for emails is not available yet.')
      return
    }
    toast.info(`Bulk action "${action}" for ${selectedIds.size} emails — coming soon.`)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="Emails"
        description="Manage your communications and sync with Zoho Mail."
        globalFilter={searchTerm}
        onSearchChange={setSearchTerm}
        primaryAction={{
          label: "Compose",
          onClick: () => setIsComposeOpen(true),
          icon: <Plus size={18} className="mr-2" />
        }}
        secondaryAction={{
          label: isSyncing ? 'Syncing...' : 'Net_Sync',
          onClick: handleSync,
          disabled: isSyncing,
          icon: (
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isSyncing ? "bg-signal animate-pulse shadow-[0_0_8px_rgba(0,47,167,0.5)]" : "bg-zinc-600"
              )} />
              {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </div>
          )
        }}
      />

      <div className="flex-1 nodal-void-card overflow-hidden flex flex-col relative">
        <EmailList
          emails={emails}
          isLoading={isLoadingEmails}
          onRefresh={handleSync}
          isSyncing={isSyncing}
          onSelectEmail={(email) => router.push(`/network/emails/${email.id}`)}
          totalEmails={totalEmails}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          currentPage={pageIndex + 1}
          onPageChange={(p) => setPage(p - 1)}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          totalAvailable={effectiveTotal}
          onSelectCount={handleSelectCount}
        />
      </div>

      <BulkActionDeck
        selectedCount={selectedIds.size}
        totalAvailable={effectiveTotal}
        onClear={() => setSelectedIds(new Set())}
        onAction={handleBulkAction}
        onSelectCount={handleSelectCount}
      />

      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
      />
    </div>
  )
}
