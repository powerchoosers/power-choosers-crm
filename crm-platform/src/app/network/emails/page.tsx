'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEmails, useEmailsCount, useEmailTypeCounts, Email, EmailListFilter } from '@/hooks/useEmails'
import { extractEmailAddress, useEmailIdentityMap } from '@/hooks/useEmailIdentityMap'
import { useContactIdentityMapByIds } from '@/hooks/useContactIdentityMapByIds'
import { useZohoSync } from '@/hooks/useZohoSync'
import { useAuth } from '@/context/AuthContext'
import { EmailList } from '@/components/emails/EmailList'
import BulkActionDeck from '@/components/network/BulkActionDeck'
import DestructModal from '@/components/network/DestructModal'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, RefreshCw, Mail, Filter } from 'lucide-react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useTableState } from '@/hooks/useTableState'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useComposeStore } from '@/store/composeStore'

const AUTO_SYNC_DELAY_MS = 5 * 1000 // 5 seconds after load

export default function EmailsPage() {
  const { user } = useAuth()
  const { pageIndex, setPage, searchQuery, setSearch } = useTableState({ pageSize: 15 })

  const [searchTerm, setSearchTerm] = useState(searchQuery)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)
  const [emailFilter, setEmailFilter] = useState<EmailListFilter>('received')
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

  const { data, isLoading: isLoadingEmails, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useEmails(debouncedSearch, emailFilter)
  const { data: totalEmails } = useEmailsCount(debouncedSearch)
  const { data: emailTypeCounts } = useEmailTypeCounts(debouncedSearch)
  const { performSync, isSyncing } = useZohoSync()
  const queryClient = useQueryClient()
  const router = useRouter()

  // No manual sync trigger needed here as GlobalSync handles it, 
  // but we keep the manual button for forced refresh.

  const [isDestructModalOpen, setIsDestructModalOpen] = useState(false)
  const openCompose = useComposeStore((s) => s.openCompose)

  const emails = data?.pages.flatMap(page => page.emails) || []
  const identityAddresses = emails.flatMap((e) => {
    const toList = Array.isArray(e.to) ? e.to : [e.to]
    return [e.from, ...toList].map((addr) => extractEmailAddress(String(addr || ''))).filter(Boolean)
  })
  const { data: contactByEmail = {} } = useEmailIdentityMap(identityAddresses)
  const contactIds = emails.map((email) => email.contactId).filter(Boolean) as string[]
  const { data: contactById = {} } = useContactIdentityMapByIds(contactIds)
  const effectiveTotal =
    emailFilter === 'sent'
      ? (emailTypeCounts?.sent ?? emails.length)
      : emailFilter === 'received'
        ? (emailTypeCounts?.received ?? emails.length)
        : (totalEmails ?? emails.length)

  // Hydrate all pages in background so filtered table views have full-node coverage.
  useEffect(() => {
    if (!isLoadingEmails && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [isLoadingEmails, hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleSync = async () => {
    if (!user) return
    await performSync(false)
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['emails-count'] })
    queryClient.invalidateQueries({ queryKey: ['emails-type-counts'] })
    queryClient.refetchQueries({ queryKey: ['emails'], type: 'active' })
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
      if (selectedIds.size === 0) return
      setIsDestructModalOpen(true)
      return
    }
    toast.info(`Bulk action "${action}" for ${selectedIds.size} emails — coming soon.`)
  }

  const handleConfirmDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    const idSet = new Set(ids)
    const sentDeleted = emails.filter((email) => idSet.has(email.id) && email.type === 'sent').length
    const receivedDeleted = emails.filter((email) => idSet.has(email.id) && email.type === 'received').length

    queryClient.setQueriesData({ queryKey: ['emails'] }, (oldData: any) => {
      if (!oldData?.pages) return oldData
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          emails: Array.isArray(page?.emails)
            ? page.emails.filter((email: Email) => !idSet.has(email.id))
            : page?.emails,
        })),
      }
    })

    queryClient.setQueriesData({ queryKey: ['emails-count'] }, (oldCount: any) => {
      if (typeof oldCount !== 'number') return oldCount
      return Math.max(0, oldCount - ids.length)
    })

    queryClient.setQueriesData({ queryKey: ['emails-type-counts'] }, (oldCounts: any) => {
      if (!oldCounts || typeof oldCounts !== 'object') return oldCounts
      return {
        ...oldCounts,
        all: Math.max(0, (oldCounts.all ?? 0) - ids.length),
        sent: Math.max(0, (oldCounts.sent ?? 0) - sentDeleted),
        received: Math.max(0, (oldCounts.received ?? 0) - receivedDeleted),
      }
    })

    const { error } = await supabase
      .from('emails')
      .update({ is_deleted: true })
      .in('id', ids)
    if (error) {
      toast.error('Failed to delete emails')
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['emails-count'] })
      queryClient.invalidateQueries({ queryKey: ['emails-type-counts'] })
      return
    }
    toast.success(`${ids.length} email${ids.length > 1 ? 's' : ''} deleted`)
    setSelectedIds(new Set())
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['emails-count'] })
    queryClient.invalidateQueries({ queryKey: ['emails-type-counts'] })
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
          onClick: () => openCompose({ to: '', subject: '', context: null }),
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
          filter={emailFilter}
          onFilterChange={(next) => {
            setEmailFilter(next)
            setPage(0)
            setSelectedIds(new Set())
          }}
          emails={emails}
          isLoading={isLoadingEmails}
          onRefresh={handleSync}
          isSyncing={isSyncing}
          onSelectEmail={(email) => router.push(`/network/emails/${email.id}`)}
          onOpenContact={(contactId) => router.push(`/network/contacts/${contactId}`)}
          contactByEmail={contactByEmail}
          contactById={contactById}
          totalEmails={totalEmails}
          totalReceived={emailTypeCounts?.received}
          totalSent={emailTypeCounts?.sent}
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

      <DestructModal
        isOpen={isDestructModalOpen}
        onClose={() => setIsDestructModalOpen(false)}
        onConfirm={handleConfirmDelete}
        count={selectedIds.size}
      />
    </div>
  )
}
