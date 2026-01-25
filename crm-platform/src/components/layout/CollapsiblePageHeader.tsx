'use client'

import { useState } from 'react'
import { Search, Plus, X, Filter } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CollapsiblePageHeaderProps {
  title: string
  description: string
  primaryAction?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
    disabled?: boolean
  }
  secondaryAction?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
    disabled?: boolean
  }
  globalFilter: string
  onSearchChange: (value: string) => void
  placeholder?: string
}

export function CollapsiblePageHeader({
  title,
  description,
  primaryAction,
  secondaryAction,
  globalFilter,
  onSearchChange,
  placeholder = "Filter current view..."
}: CollapsiblePageHeaderProps) {
  const [isSearchVisible, setIsSearchVisible] = useState(false)

  return (
    <div className="flex-none space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tighter text-white">{title}</h1>
          <p className="text-zinc-500 mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {!isSearchVisible && (
              <motion.div
                key="search-button"
                initial={{ opacity: 0, x: 20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsSearchVisible(true)}
                  className="text-zinc-400 hover:text-white hover:bg-white/10 rounded-full h-10 w-10"
                >
                  <Search size={20} />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          {secondaryAction && (
            <Button 
              variant="outline"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 nodal-glass h-10 px-4"
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
          {primaryAction && (
            <Button 
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium h-10 px-4 transition-all hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)]"
            >
              {primaryAction.icon || <Plus size={18} className="mr-2" />}
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isSearchVisible && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -10 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-4 nodal-glass p-4 rounded-xl border border-white/5 shadow-lg my-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                <Input 
                  placeholder={placeholder}
                  value={globalFilter ?? ""}
                  onChange={(event) => onSearchChange(event.target.value)}
                  className="pl-10 bg-transparent border-none text-white placeholder:text-zinc-600 focus-visible:ring-0 h-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="gap-2 bg-transparent border-white/10 text-zinc-500 hover:text-white hover:bg-white/5 transition-all h-9">
                  <Filter size={16} />
                  Filter
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsSearchVisible(false)}
                  className="h-9 w-9 text-zinc-500 hover:text-white hover:bg-white/5"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
