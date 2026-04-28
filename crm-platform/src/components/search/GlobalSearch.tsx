'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Building2, Users, Plus, Sparkles, Loader2, GitMerge, CheckCircle2, Phone, Mail, Radar } from 'lucide-react'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { useSearchContacts } from '@/hooks/useContacts'
import { useSearchAccounts } from '@/hooks/useAccounts'
import { useSearchProtocols, type Protocol } from '@/hooks/useProtocols'
import { useSearchTasks } from '@/hooks/useTasks'
import { useSearchCalls } from '@/hooks/useCalls'
import { useSearchEmails } from '@/hooks/useEmails'
import { useSearchTargets } from '@/hooks/useTargets'
import { useRouter } from 'next/navigation'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { AnimatePresence, motion } from 'framer-motion'
import { useGeminiStore } from '@/store/geminiStore'
import { useUIStore } from '@/store/uiStore'
import { buildProtocolContext } from '@/lib/protocol-context'

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const setGeminiContext = useGeminiStore((state) => state.setContext)
  const setActiveSequenceId = useUIStore((state) => state.setActiveSequenceId)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: filteredContacts = [], isLoading: isSearchingContacts } = useSearchContacts(debouncedQuery)
  const { data: filteredAccounts = [], isLoading: isSearchingAccounts } = useSearchAccounts(debouncedQuery)
  const { data: filteredProtocols = [], isLoading: isSearchingProtocols } = useSearchProtocols(debouncedQuery)
  const { data: filteredTargets = [], isLoading: isSearchingTargets } = useSearchTargets(debouncedQuery)
  const { data: filteredTasks = [], isLoading: isSearchingTasks } = useSearchTasks(debouncedQuery)
  const { data: filteredCalls = [], isLoading: isSearchingCalls } = useSearchCalls(debouncedQuery)
  const { data: filteredEmails = [], isLoading: isSearchingEmails } = useSearchEmails(debouncedQuery)

  const isSearching = isSearchingContacts || isSearchingAccounts || isSearchingProtocols || isSearchingTargets || isSearchingTasks || isSearchingCalls || isSearchingEmails

  useEffect(() => {
    const open = () => {
      setIsOpen(true)
      setTimeout(() => inputRef.current?.focus(), 10)
    }

    window.addEventListener('nodal:open-command-bar', open as EventListener)
    return () => window.removeEventListener('nodal:open-command-bar', open as EventListener)
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [isOpen])

  const hasResults =
    (filteredContacts?.length || 0) +
    (filteredAccounts?.length || 0) +
    (filteredProtocols?.length || 0) +
    (filteredTargets?.length || 0) +
    (filteredTasks?.length || 0) +
    (filteredCalls?.length || 0) +
    (filteredEmails?.length || 0) > 0
  const shouldShowResults = query.length >= 2
  const shouldShowSkeletons = shouldShowResults && isSearching && !hasResults

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (id: string, type: 'people' | 'account' | 'protocol' | 'target' | 'task' | 'call' | 'email', protocol?: Protocol) => {
    setIsOpen(false)
    setQuery('')
    if (type === 'people') {
      router.push(`/network/contacts/${id}`)
    } else if (type === 'account') {
      router.push(`/network/accounts/${id}`)
    } else if (type === 'protocol') {
      if (protocol) {
        setActiveSequenceId(protocol.id)
        setGeminiContext(buildProtocolContext(protocol))
        router.push(`/network/protocols/${protocol.id}/builder`)
      } else {
        router.push(`/network/protocols`)
      }
    } else if (type === 'target') {
      router.push(`/network/targets`)
    } else if (type === 'task') {
      router.push(`/network/tasks`)
    } else if (type === 'call') {
      router.push(`/network/calls`)
    } else if (type === 'email') {
      router.push(`/network/emails`)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full z-50">
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-zinc-200 transition-colors" size={18} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (query) setIsOpen(true)
          }}
          placeholder="Query Database [CMD+K]..."
          className="w-full h-12 bg-zinc-950/90 backdrop-blur-md border border-white/5 rounded-full pl-12 pr-16 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 focus-visible:ring-white/30 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_10px_rgba(255,255,255,0.25)] transition-all shadow-[0_0_12px_rgba(0,0,0,0.4)]"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
          {isSearching && (
            <Loader2 className="animate-spin text-zinc-200" size={16} />
          )}
          {query && (
            <ForensicClose 
              onClick={() => { setQuery(''); setDebouncedQuery(''); inputRef.current?.focus() }}
              size={16}
            />
          )}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/10 bg-transparent shadow-inner">
            <kbd className="font-mono text-[10px] font-medium text-zinc-500">⌘</kbd>
            <kbd className="font-mono text-[10px] font-medium text-zinc-500">K</kbd>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="absolute top-full left-0 right-0 mt-2 glass-panel rounded-2xl overflow-visible z-[100]"
          style={{ isolation: 'isolate' }}
        >
          <motion.div
            layout
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className={`max-h-[70vh] flex flex-col nodal-recessed ${shouldShowResults ? 'min-h-[22rem]' : ''}`}
          >
          <div className="p-2 flex-1 overflow-y-auto np-scroll">
            {shouldShowResults && (
              <>
                {shouldShowSkeletons && (
                  <div className="space-y-2 px-2 py-1">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`search-skeleton-${index}`}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
                      >
                        <div className="w-8 h-8 rounded-2xl bg-white/10" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-3.5 w-1/3 rounded bg-white/10" />
                          <div className="h-2.5 w-1/2 rounded bg-white/[0.08]" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* People Section */}
                {filteredContacts.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                      <span>People</span>
                      <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredContacts.length} found</span>
                    </div>
                    <div className="space-y-1">
                      {filteredContacts.map(contact => (
                        <button
                          key={contact.id}
                          onClick={() => handleSelect(contact.id, 'people')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                        >
                          <ContactAvatar
                            name={contact.name}
                            photoUrl={contact.avatarUrl}
                            size={32}
                            className="w-8 h-8 transition-all"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{contact.name}</div>
                            <div className="text-xs text-zinc-500 truncate">{contact.company}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Accounts Section */}
                {filteredAccounts.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                      <span>Accounts</span>
                      <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredAccounts.length}</span>
                    </div>
                    <div className="space-y-1">
                      {filteredAccounts.map(account => (
                        <button
                          key={account.id}
                          onClick={() => handleSelect(account.id, 'account')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                        >
                          <CompanyIcon
                            logoUrl={account.logoUrl}
                            domain={account.domain}
                            name={account.name}
                            size={32}
                            className="w-8 h-8"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{account.name}</div>
                            <div className="text-xs text-zinc-500 truncate">{account.industry}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Targets Section */}
                {filteredTargets.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                      <span>Targets</span>
                      <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredTargets.length}</span>
                    </div>
                    <div className="space-y-1">
                      {filteredTargets.map(target => (
                        <button
                          key={target.id}
                          onClick={() => handleSelect(target.id, 'target')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                        >
                          <div className="w-8 h-8 rounded-2xl bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
                            <Radar size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{target.name}</div>
                            <div className="text-xs text-zinc-500 truncate">{target.count || 0} nodes</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Protocols Section */}
                {filteredProtocols.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                      <span>Protocols</span>
                      <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredProtocols.length}</span>
                    </div>
                    <div className="space-y-1">
                      {filteredProtocols.map(protocol => (
                        <button
                          key={protocol.id}
                          onClick={() => handleSelect(protocol.id, 'protocol', protocol)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                        >
                          <div className="w-8 h-8 rounded-2xl bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
                            <GitMerge size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{protocol.name}</div>
                            <div className="text-xs text-zinc-500 truncate">{protocol.steps?.length || 0} steps</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasks Section */}
                {filteredTasks.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                      <span>Tasks</span>
                      <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredTasks.length}</span>
                    </div>
                    <div className="space-y-1">
                      {filteredTasks.map(task => (
                        <button
                          key={task.id}
                          onClick={() => handleSelect(task.id, 'task')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                        >
                          <div className="w-8 h-8 rounded-2xl bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
                            <CheckCircle2 size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{task.title}</div>
                            <div className="text-xs text-zinc-500 truncate">{task.status}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Calls Section */}
                {filteredCalls.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                      <span>Calls</span>
                      <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredCalls.length}</span>
                    </div>
                    <div className="space-y-1">
                      {filteredCalls.map(call => (
                        <button
                          key={call.id}
                          onClick={() => handleSelect(call.id, 'call')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                        >
                          <div className="w-8 h-8 rounded-2xl bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
                            <Phone size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{call.contactName}</div>
                            <div className="text-xs text-zinc-500 truncate">{call.summary || 'No summary'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Emails Section */}
                {filteredEmails.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                      <span>Emails</span>
                      <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredEmails.length}</span>
                    </div>
                    <div className="space-y-1">
                      {filteredEmails.map(email => (
                        <button
                          key={email.id}
                          onClick={() => handleSelect(email.id, 'email')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                        >
                          <div className="w-8 h-8 rounded-2xl bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
                            <Mail size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{email.subject}</div>
                            <div className="text-xs text-zinc-500 truncate">From: {email.from}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!isSearching && !hasResults && shouldShowResults && (
                  <div className="p-8 text-center">
                    <Search className="mx-auto h-8 w-8 text-zinc-700 mb-3" />
                    <div className="text-zinc-500 text-sm">
                      No results found for &quot;{query}&quot;
                    </div>
                    <div className="text-zinc-600 text-[10px] mt-1">
                      Try searching for names, emails, or company domains
                    </div>
                  </div>
                )}
              </>
            )}

            {query && query.length < 2 && (
              <div className="p-4 text-center text-zinc-600 text-[10px] uppercase tracking-widest">
                Type at least 2 characters to search...
              </div>
            )}
          </div>
          <div className="border-t border-white/5 px-3 py-2 flex justify-between items-center text-[10px] text-zinc-600 shrink-0 bg-zinc-950/70 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-left text-[10px] text-zinc-600 hover:text-white transition-colors flex items-center gap-1"
            >
              <span>Press</span>
              <kbd className="font-sans bg-white/5 px-1 rounded text-zinc-500">Esc</kbd>
              <span>to close</span>
            </button>
            <span>Global Search</span>
          </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
