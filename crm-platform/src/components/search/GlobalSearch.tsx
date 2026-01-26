'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Building2, Users, Plus, Sparkles, Loader2, ListOrdered, CheckCircle2, Phone, Mail } from 'lucide-react'
import { useSearchContacts } from '@/hooks/useContacts'
import { useSearchAccounts } from '@/hooks/useAccounts'
import { useSearchSequences } from '@/hooks/useSequences'
import { useSearchTasks } from '@/hooks/useTasks'
import { useSearchCalls } from '@/hooks/useCalls'
import { useSearchEmails } from '@/hooks/useEmails'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: filteredContacts = [], isLoading: isSearchingContacts } = useSearchContacts(debouncedQuery)
  const { data: filteredAccounts = [], isLoading: isSearchingAccounts } = useSearchAccounts(debouncedQuery)
  const { data: filteredSequences = [], isLoading: isSearchingSequences } = useSearchSequences(debouncedQuery)
  const { data: filteredTasks = [], isLoading: isSearchingTasks } = useSearchTasks(debouncedQuery)
  const { data: filteredCalls = [], isLoading: isSearchingCalls } = useSearchCalls(debouncedQuery)
  const { data: filteredEmails = [], isLoading: isSearchingEmails } = useSearchEmails(debouncedQuery)

  const isSearching = isSearchingContacts || isSearchingAccounts || isSearchingSequences || isSearchingTasks || isSearchingCalls || isSearchingEmails

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen((open) => !open)
        if (!isOpen) {
          setTimeout(() => inputRef.current?.focus(), 10)
        }
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [isOpen])

  const hasResults = 
    (filteredContacts?.length || 0) + 
    (filteredAccounts?.length || 0) + 
    (filteredSequences?.length || 0) + 
    (filteredTasks?.length || 0) +
    (filteredCalls?.length || 0) +
    (filteredEmails?.length || 0) > 0

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (id: string, type: 'people' | 'account' | 'sequence' | 'task' | 'call' | 'email') => {
    setIsOpen(false)
    setQuery('')
    if (type === 'people') {
        router.push(`/crm-platform/contacts/${id}`)
    } else if (type === 'account') {
        router.push(`/crm-platform/accounts/${id}`)
    } else if (type === 'sequence') {
        router.push(`/crm-platform/sequences`)
    } else if (type === 'task') {
        router.push(`/crm-platform/tasks`)
    } else if (type === 'call') {
        router.push(`/crm-platform/calls`)
    } else if (type === 'email') {
        router.push(`/crm-platform/emails`)
    }
  }

  const handleProspect = (type: 'people' | 'account') => {
    setIsOpen(false)
    if (type === 'people') {
        router.push('/crm-platform/people?mode=prospect')
    } else {
        router.push('/crm-platform/accounts?mode=prospect')
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-signal transition-colors" size={18} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Query Database [CMD+K]..."
          className="w-full h-12 nodal-glass rounded-full pl-12 pr-16 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#002FA7]/40 focus:bg-zinc-900/80 transition-all shadow-2xl"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
          {isSearching && (
            <Loader2 className="animate-spin text-signal" size={16} />
          )}
          {query && (
            <button 
              onClick={() => { setQuery(''); setDebouncedQuery(''); inputRef.current?.focus() }}
              className="text-zinc-500 hover:text-white transition-colors p-1 hover:bg-white/5 rounded-full"
            >
              <X size={16} />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/10 bg-white/5 shadow-inner">
            <kbd className="font-mono text-[10px] font-medium text-zinc-500">⌘</kbd>
            <kbd className="font-mono text-[10px] font-medium text-zinc-500">K</kbd>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950/95 border border-white/10 rounded-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-3xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-2 max-h-[70vh] overflow-y-auto np-scroll">
            
            {/* Quick Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 p-1">
                <button 
                    onClick={() => handleProspect('people')}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all group"
                >
                    <Users size={18} className="text-zinc-400 group-hover:text-signal transition-colors" />
                    <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider">People</span>
                </button>
                <button 
                    onClick={() => handleProspect('account')}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all group"
                >
                    <Building2 size={18} className="text-zinc-400 group-hover:text-signal transition-colors" />
                    <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider">Accounts</span>
                </button>
                <button 
                    onClick={() => { setIsOpen(false); router.push('/crm-platform/tasks?action=new') }}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all group"
                >
                    <Plus size={18} className="text-zinc-400 group-hover:text-signal transition-colors" />
                    <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider">Task</span>
                </button>
                <button 
                    onClick={() => { setIsOpen(false); router.push('/crm-platform/analysis') }}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all group"
                >
                    <Sparkles size={18} className="text-zinc-400 group-hover:text-signal transition-colors" />
                    <span className="text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider">4CP AI</span>
                </button>
            </div>

            {query && query.length >= 2 && (
                <>
                    <div className="h-px bg-white/5 my-2 mx-2" />
                    
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
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden relative">
                                {contact.logoUrl ? (
                                    <Image 
                                        src={contact.logoUrl} 
                                        alt="" 
                                        fill
                                        className="object-cover" 
                                    />
                                ) : (
                                    contact.name.charAt(0)
                                )}
                            </div>
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
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden relative">
                                {account.logoUrl ? (
                                    <Image 
                                        src={account.logoUrl} 
                                        alt="" 
                                        fill
                                        className="object-cover" 
                                    />
                                ) : (
                                    <Building2 size={14} />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{account.name}</div>
                                <div className="text-xs text-zinc-500 truncate">{account.industry}</div>
                            </div>
                            </button>
                        ))}
                        </div>
                    </div>
                    )}

                    {/* Sequences Section */}
                    {filteredSequences.length > 0 && (
                    <div className="mb-2">
                        <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                        <span>Sequences</span>
                        <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredSequences.length}</span>
                        </div>
                        <div className="space-y-1">
                        {filteredSequences.map(sequence => (
                            <button
                            key={sequence.id}
                            onClick={() => handleSelect(sequence.id, 'sequence')}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                            >
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
                                <ListOrdered size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{sequence.name}</div>
                                <div className="text-xs text-zinc-500 truncate">{sequence.steps?.length || 0} steps</div>
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
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
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
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
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
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors overflow-hidden">
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

                    {!isSearching && !hasResults && query.length >= 2 && (
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
            
            <div className="border-t border-white/5 mt-2 pt-2 px-3 py-1.5 flex justify-between items-center text-[10px] text-zinc-600">
               <span>Press <kbd className="font-sans bg-white/5 px-1 rounded text-zinc-500">Esc</kbd> to close</span>
               <span>Global Search</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
