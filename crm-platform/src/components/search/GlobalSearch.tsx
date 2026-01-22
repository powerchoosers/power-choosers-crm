'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Building2 } from 'lucide-react'
import { useContacts } from '@/hooks/useContacts'
import { useAccounts } from '@/hooks/useAccounts'

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: contacts } = useContacts()
  const { data: accounts } = useAccounts()

  // Filter contacts logic
  const filteredContacts = contacts?.filter(contact => 
    contact.name.toLowerCase().includes(query.toLowerCase()) ||
    contact.email.toLowerCase().includes(query.toLowerCase()) ||
    contact.company.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 3)

  // Filter accounts logic
  const filteredAccounts = accounts?.filter(account => 
    account.name.toLowerCase().includes(query.toLowerCase()) ||
    account.industry.toLowerCase().includes(query.toLowerCase()) ||
    account.domain.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 3)

  const hasResults = (filteredContacts?.length || 0) + (filteredAccounts?.length || 0) > 0

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (id: string, type: 'people' | 'account') => {
    setIsOpen(false)
    setQuery('')
    console.log(`Selected ${type}:`, id)
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
          placeholder="Global Search..."
          className="w-full h-12 bg-zinc-900/50 border border-white/10 rounded-full pl-12 pr-12 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-signal/50 focus:bg-zinc-900/80 transition-all backdrop-blur-xl shadow-lg"
        />
        {query && (
          <button 
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && query && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-2 max-h-[60vh] overflow-y-auto">
            
            {/* People Section */}
            {filteredContacts && filteredContacts.length > 0 && (
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
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors">
                        {contact.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{contact.name}</div>
                        <div className="text-xs text-zinc-500 truncate">{contact.company}</div>
                      </div>
                      <div className="text-xs text-zinc-600 group-hover:text-zinc-400">
                        Jump to
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Accounts Section */}
            {filteredAccounts && filteredAccounts.length > 0 && (
              <div className="mb-2">
                 <div className="text-xs font-semibold text-zinc-500 px-3 py-2 uppercase tracking-wider flex justify-between">
                  <span>Accounts</span>
                  <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-zinc-400">{filteredAccounts.length} found</span>
                </div>
                <div className="space-y-1">
                  {filteredAccounts.map(account => (
                    <button
                      key={account.id}
                      onClick={() => handleSelect(account.id, 'account')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white border border-white/5 group-hover:border-white/10 transition-colors">
                        <Building2 size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">{account.name}</div>
                        <div className="text-xs text-zinc-500 truncate">{account.industry || account.domain}</div>
                      </div>
                      <div className="text-xs text-zinc-600 group-hover:text-zinc-400">
                        Jump to
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {!hasResults && (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-zinc-400">No results found for &quot;{query}&quot;</p>
                <p className="text-xs text-zinc-600 mt-1">Try searching for a name, company, or account</p>
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

