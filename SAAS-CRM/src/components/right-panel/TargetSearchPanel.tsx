'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, Plus, X } from 'lucide-react'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { useSearchContacts } from '@/hooks/useContacts'
import { useSearchAccounts } from '@/hooks/useAccounts'
import { useAddContactToList } from '@/hooks/useContactListMemberships'
import { useAddAccountToList } from '@/hooks/useAccountListMemberships'
import { useUIStore } from '@/store/uiStore'
import { motion } from 'framer-motion'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { panelTheme, useEscClose } from '@/components/right-panel/panelTheme'
import { toast } from 'sonner'

interface TargetSearchPanelProps {
  listId: string
  listName: string
  listKind: string
}

export function TargetSearchPanel({ listId, listName, listKind }: TargetSearchPanelProps) {
  const { setRightPanelMode } = useUIStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const isPeopleList = listKind === 'people' || listKind === 'person' || listKind === 'contact' || listKind === 'contacts'
  const isAccountList = listKind === 'account' || listKind === 'accounts' || listKind === 'company' || listKind === 'companies'

  const { data: contactResults = [], isLoading: isSearchingContacts } = useSearchContacts(
    isPeopleList ? debouncedQuery : ''
  )
  const { data: accountResults = [], isLoading: isSearchingAccounts } = useSearchAccounts(
    isAccountList ? debouncedQuery : ''
  )

  const { mutateAsync: addContactToList, isPending: isAddingContact } = useAddContactToList()
  const { mutateAsync: addAccountToList, isPending: isAddingAccount } = useAddAccountToList()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim())
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleClose = useCallback(() => {
    setRightPanelMode('DEFAULT')
  }, [setRightPanelMode])

  useEscClose(handleClose)

  const handleAddContact = async (contactId: string, contactName: string) => {
    try {
      await addContactToList({ contactId, listId })
      setAddedIds(prev => new Set(prev).add(contactId))
      toast.success(`${contactName} added to ${listName}`)
    } catch (error: any) {
      if (error.message?.includes('already in this list')) {
        toast.info(`${contactName} is already in this list`)
      } else {
        toast.error(`Failed to add ${contactName}`)
      }
    }
  }

  const handleAddAccount = async (accountId: string, accountName: string) => {
    try {
      await addAccountToList({ accountId, listId })
      setAddedIds(prev => new Set(prev).add(accountId))
      toast.success(`${accountName} added to ${listName}`)
    } catch (error: any) {
      if (error.message?.includes('already in this list')) {
        toast.info(`${accountName} is already in this list`)
      } else {
        toast.error(`Failed to add ${accountName}`)
      }
    }
  }

  const isSearching = isSearchingContacts || isSearchingAccounts
  const isAdding = isAddingContact || isAddingAccount

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
      className={panelTheme.shell}
    >
      {/* HEADER */}
      <div className={panelTheme.header}>
        <div className={panelTheme.headerTitleWrap}>
          <div className="h-8 w-8 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center">
            <Plus className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
              Initialize Node
            </span>
            <span className="font-mono text-[9px] tracking-wider text-zinc-600">
              {listName}
            </span>
          </div>
        </div>
        <ForensicClose onClick={handleClose} size={16} />
      </div>

      <div className={`${panelTheme.body} space-y-6`}>
        {/* SEARCH INPUT */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <div className="w-1 h-1 bg-[#002FA7] rounded-full" />
            Search {isPeopleList ? 'Contacts' : 'Accounts'}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${isPeopleList ? 'contacts' : 'accounts'}...`}
              className={`${panelTheme.field} pl-10 pr-10 h-11`}
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* SEARCH RESULTS */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center justify-between">
            <span>Results</span>
            {isSearching && (
              <span className="flex items-center gap-2 text-zinc-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                Scanning
              </span>
            )}
          </div>

          <div className="bg-zinc-950/40 rounded-xl border border-white/5 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto np-scroll">
            {searchQuery.trim().length < 2 ? (
              <div className="h-[400px] flex flex-col items-center justify-center text-center px-6">
                <Search className="w-12 h-12 text-zinc-800 mb-4" />
                <div className="text-sm text-zinc-500 font-medium mb-1">
                  Start typing to search
                </div>
                <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
                  Type at least 2 characters
                </div>
              </div>
            ) : isSearching ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 rounded-lg bg-zinc-800/10 border border-white/[0.02] animate-pulse" />
                ))}
              </div>
            ) : isPeopleList && contactResults.length > 0 ? (
              <div className="p-3 space-y-1">
                {contactResults.map((contact) => {
                  const isAdded = addedIds.has(contact.id)
                  return (
                    <div
                      key={contact.id}
                      className="p-3 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all flex items-center gap-3 group"
                    >
                      <ContactAvatar
                        name={contact.name}
                        photoUrl={contact.avatarUrl}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                          {contact.name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider truncate">
                          {contact.email}
                        </div>
                        {contact.company && (
                          <div className="text-[10px] text-zinc-600 truncate mt-0.5">
                            {contact.company}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddContact(contact.id, contact.name)}
                        disabled={isAdded || isAdding}
                        className={`
                          h-8 px-3 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all
                          ${isAdded
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : 'bg-[#002FA7] text-white hover:bg-[#002FA7]/90 border border-[#002FA7]/50'
                          }
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : isAccountList && accountResults.length > 0 ? (
              <div className="p-3 space-y-1">
                {accountResults.map((account) => {
                  const isAdded = addedIds.has(account.id)
                  return (
                    <div
                      key={account.id}
                      className="p-3 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all flex items-center gap-3 group"
                    >
                      <CompanyIcon
                        logoUrl={account.logoUrl}
                        domain={account.domain}
                        name={account.name}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                          {account.name}
                        </div>
                        {account.domain && (
                          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider truncate">
                            {account.domain}
                          </div>
                        )}
                        {account.industry && (
                          <div className="text-[10px] text-zinc-600 truncate mt-0.5">
                            {account.industry}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddAccount(account.id, account.name)}
                        disabled={isAdded || isAdding}
                        className={`
                          h-8 px-3 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-all
                          ${isAdded
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : 'bg-[#002FA7] text-white hover:bg-[#002FA7]/90 border border-[#002FA7]/50'
                          }
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-[400px] flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center mb-4">
                  <Search className="w-6 h-6 text-zinc-700" />
                </div>
                <div className="text-sm text-zinc-500 font-medium mb-1">
                  No results found
                </div>
                <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
                  Try a different search term
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ADDED COUNT */}
        {addedIds.size > 0 && (
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest text-center">
              {addedIds.size} {isPeopleList ? 'Contact' : 'Account'}{addedIds.size === 1 ? '' : 's'} Added
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
