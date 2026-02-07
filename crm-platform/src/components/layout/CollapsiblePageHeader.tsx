'use client'

import { useState } from 'react'
import { Search, Plus, X, Filter, ChevronLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface CollapsiblePageHeaderProps {
  title: string | React.ReactNode
  description?: string | React.ReactNode
  backHref?: string
  hideTitle?: boolean
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
  globalFilter?: string
  onSearchChange?: (value: string) => void
  onFilterToggle?: () => void
  isFilterActive?: boolean
  placeholder?: string
}

export function CollapsiblePageHeader({
  title,
  description,
  backHref,
  hideTitle = false,
  primaryAction,
  secondaryAction,
  globalFilter,
  onSearchChange,
  onFilterToggle,
  isFilterActive,
  placeholder = "Filter current view..."
}: CollapsiblePageHeaderProps) {
  const [isSearchVisible, setIsSearchVisible] = useState(false)

  return (
    <div className="flex-none space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {backHref && (
            <Link 
              href={backHref} 
              className="icon-button-forensic flex items-center justify-center w-8 h-8"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          {!hideTitle && (
            <div className="min-w-0">
              {typeof title === 'string' ? (
                <h1 className="text-4xl font-semibold tracking-tighter text-white truncate">{title}</h1>
              ) : (
                title
              )}
              {description && (
                typeof description === 'string' ? (
                  <p className="text-zinc-500 mt-1 truncate">{description}</p>
                ) : (
                  description
                )
              )}
            </div>
          )}
        </div>
        <div className={cn("flex items-center gap-3 shrink-0", hideTitle && "w-full justify-end")}>
          <AnimatePresence mode="wait">
            {onSearchChange != null && !isSearchVisible && (
              <motion.div
                key="search-button"
                initial={{ opacity: 0, x: 20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <button 
                  onClick={() => setIsSearchVisible(true)}
                  className="icon-button-forensic h-10 w-10"
                >
                  <Search size={20} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {secondaryAction && (
            <Button 
              variant="outline"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 nodal-glass h-10 px-4 rounded-xl flex items-center gap-2 transition-all"
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
          {primaryAction && (
            <Button 
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium h-10 px-4 rounded-xl transition-all hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)] flex items-center gap-2"
            >
              {primaryAction.icon || <Plus size={18} />}
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {onSearchChange != null && isSearchVisible && (
          <motion.div
            key="search-bar-container"
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
                  onChange={(event) => onSearchChange?.(event.target.value)}
                  className="pl-10 bg-transparent border-none text-white placeholder:text-zinc-600 focus-visible:ring-0 h-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline"
                  onClick={onFilterToggle}
                  className={cn(
                    "gap-2 transition-all h-9 px-3 rounded-lg flex items-center border",
                    isFilterActive 
                      ? "text-white border-[#002FA7]/50 bg-[#002FA7]/5 shadow-[0_0_15px_-5px_rgba(0,47,167,0.4)]" 
                      : "bg-white/5 border-white/10 text-zinc-500 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Filter size={16} className={cn(isFilterActive ? "text-white" : "text-inherit")} />
                  <span className="text-sm font-medium">Filter</span>
                </Button>
                <button 
                  onClick={() => setIsSearchVisible(false)}
                  className="icon-button-forensic h-9 w-9"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
