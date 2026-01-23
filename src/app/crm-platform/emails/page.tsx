'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useEmails, useEmailsCount, Email } from '@/hooks/useEmails'
import { useGmailSync } from '@/hooks/useGmailSync'
import { useAuth } from '@/context/AuthContext'
import { EmailList } from '@/components/emails/EmailList'
import { ComposeModal } from '@/components/emails/ComposeModal'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, RefreshCw, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function EmailsPage() {
  const { user } = useAuth()
  const { data, isLoading: isLoadingEmails, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useEmails()
  const { data: totalEmails } = useEmailsCount()
  const { syncGmail, isSyncing, syncStatus } = useGmailSync()
  const router = useRouter()
  
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const emails = data?.pages.flatMap(page => page.emails) || []

  // Auto-sync on mount if user is logged in
  useEffect(() => {
    if (user && !isLoadingEmails && (!emails || emails.length === 0)) {
       // Optional: Auto-sync on first load if empty
       // syncGmail(user)
    }
  }, [user, isLoadingEmails, emails, syncGmail])

  const handleSync = () => {
    if (!user) return
    syncGmail(user)
  }

  const filteredEmails = emails?.filter(email => 
    email.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    email.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (typeof email.to === 'string' && email.to.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || []

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-none space-y-4">
        <div className="flex items-center justify-between">
            <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Emails</h1>
            <p className="text-zinc-400 mt-1">Manage your communications and sync with Gmail.</p>
            </div>
            <div className="flex items-center gap-2">
                <Button 
                    variant="outline" 
                    onClick={handleSync} 
                    disabled={isSyncing}
                    className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Inbox'}
                </Button>
                <Button 
                    onClick={() => setIsComposeOpen(true)}
                    className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Compose
                </Button>
            </div>
        </div>

        <div className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
            <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <Input 
                placeholder="Search emails..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-zinc-900 border-white/10 pl-10 text-zinc-200 placeholder:text-zinc-500"
            />
            </div>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col relative">
            <EmailList 
                emails={filteredEmails} 
                isLoading={isLoadingEmails} 
                onRefresh={handleSync}
                isSyncing={isSyncing}
                onSelectEmail={(email) => router.push(`/crm-platform/emails/${email.id}`)}
                totalEmails={totalEmails}
                hasNextPage={hasNextPage}
                fetchNextPage={fetchNextPage}
                isFetchingNextPage={isFetchingNextPage}
            />
      </div>

      <ComposeModal 
        isOpen={isComposeOpen} 
        onClose={() => setIsComposeOpen(false)} 
      />
    </div>
  )
}
