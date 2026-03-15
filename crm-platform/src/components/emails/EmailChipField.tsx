'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { X, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchContacts } from '@/hooks/useContacts'
import { ContactAvatar } from '@/components/ui/ContactAvatar'

interface EmailChipFieldProps {
  chips: string[]
  onChange: (chips: string[]) => void
  placeholder?: string
  autoFocus?: boolean
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function EmailChipField({ chips, onChange, placeholder = 'Add email...', autoFocus }: EmailChipFieldProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: suggestions = [], isLoading } = useSearchContacts(inputValue)

  // Auto-focus the input on mount when requested
  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [autoFocus])

  const commitChip = (value: string) => {
    const email = value.trim().toLowerCase()
    if (!email) return
    if (isValidEmail(email) && !chips.includes(email)) {
      onChange([...chips, email])
    }
    setInputValue('')
    setShowSuggestions(false)
  }

  const removeChip = (idx: number) => {
    onChange(chips.filter((_, i) => i !== idx))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && inputValue.trim()) {
      e.preventDefault()
      commitChip(inputValue)
      return
    }
    if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      removeChip(chips.length - 1)
    }
  }

  // Commit on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (inputValue.trim()) commitChip(inputValue)
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, chips])

  return (
    <div ref={containerRef} className="relative flex-1">
      {/* Chip + input row */}
      <div
        className="flex flex-wrap items-center gap-1 min-h-[32px] border-b border-transparent hover:border-white/10 focus-within:border-[#002FA7]/60 py-1 cursor-text transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        <AnimatePresence initial={false}>
          {chips.map((chip, idx) => (
            <motion.span
              key={chip}
              initial={{ opacity: 0, scale: 0.7, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.7, y: -4 }}
              transition={{ duration: 0.18, ease: [0.19, 1, 0.22, 1] }}
              style={{ display: 'inline-flex' }}
              className="items-center gap-1 px-2 py-0.5 rounded-md bg-[#002FA7]/15 border border-[#002FA7]/40 text-[#8ba6ff] text-[11px] font-mono flex-shrink-0 max-w-[240px]"
            >
              <span className="truncate">{chip}</span>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); removeChip(idx) }}
                className="hover:text-white transition-colors flex-shrink-0 ml-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setShowSuggestions(e.target.value.length >= 2)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (inputValue.length >= 2) setShowSuggestions(true) }}
          placeholder={chips.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent border-0 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 py-0.5"
        />
      </div>

      {/* Suggestion dropdown */}
      {showSuggestions && (isLoading || suggestions.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[110] nodal-module-glass rounded-xl border border-white/10 shadow-2xl max-h-[250px] overflow-y-auto np-scroll animate-in fade-in slide-in-from-top-2 duration-200">
          {isLoading ? (
            <div className="p-4 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#8ba6ff]" />
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {suggestions.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commitChip(contact.email)
                  }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
                >
                  <ContactAvatar
                    name={contact.name}
                    photoUrl={contact.avatarUrl}
                    size={32}
                    className="w-8 h-8 rounded-lg flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-100 group-hover:text-white truncate">
                      {contact.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="truncate">{contact.email}</span>
                      {contact.company && (
                        <>
                          <span className="text-white/10">·</span>
                          <span className="truncate">{contact.company}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
