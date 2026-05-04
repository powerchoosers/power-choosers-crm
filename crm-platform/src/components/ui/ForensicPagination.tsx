'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ForensicPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  className?: string
}

/**
 * Nodal Point Forensic Pagination
 * A precision instrument for navigating large datasets.
 * Features a "Monospace Scrubber" that expands on hover to allow rapid page jumping.
 */
export function ForensicPagination({
  currentPage,
  totalPages,
  onPageChange,
  hasNextPage,
  isFetchingNextPage,
  className
}: ForensicPaginationProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [scrubPage, setScrubPage] = useState(currentPage)
  const trackRef = useRef<HTMLDivElement>(null)
  const isLoading = Boolean(isFetchingNextPage)

  // Sync scrub page with current page when not hovering
  useEffect(() => {
    if (!isHovered) {
      setScrubPage(currentPage)
    }
  }, [currentPage, isHovered])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    
    // Calculate page. If totalPages is 1, it's always page 1.
    const targetPage = totalPages <= 1 ? 1 : Math.max(1, Math.round(percentage * (totalPages - 1)) + 1)
    
    if (targetPage !== scrubPage) {
      setScrubPage(targetPage)
    }
  }

  const handleScrubClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPageChange(scrubPage)
    setIsHovered(false)
  }

  const handlePrev = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1)
    }
  }

  const handleNext = () => {
    if (currentPage < totalPages || hasNextPage) {
      onPageChange(currentPage + 1)
    }
  }

  const displayPage = isHovered ? scrubPage : currentPage
  const progress = totalPages <= 1 ? 100 : ((displayPage - 1) / (totalPages - 1)) * 100

  return (
    <motion.div
      className={cn("relative flex items-center gap-1 group/pagination", className)}
      animate={{ x: isLoading ? -2 : 0 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
    >
      {/* Prev Button */}
      <motion.button
        onClick={handlePrev}
        disabled={currentPage <= 1 || isFetchingNextPage}
        className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-opacity"
        aria-label="Previous page"
        animate={{ x: isLoading ? -1 : 0, opacity: isLoading ? 0.85 : 1 }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      >
        <ChevronLeft className="h-4 w-4" />
      </motion.button>

      {/* The Scrubber Instrument */}
      <div 
        className="relative flex items-center justify-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div
          className="relative h-8 flex items-center justify-center cursor-pointer overflow-hidden rounded-md border border-white/5 bg-zinc-950/40 px-3 hover:border-white/10 transition-colors"
          animate={{
            width: isHovered ? 160 : 44,
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 35
          }}
          onClick={handleScrubClick}
          ref={trackRef}
          onMouseMove={handleMouseMove}
        >
          {/* Progress Track (Visible on Hover) */}
          <AnimatePresence>
            {isHovered && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-3 h-0.5 bg-zinc-800 rounded-full"
              >
                <motion.div 
                  className="absolute h-full bg-[#002FA7] rounded-full shadow-[0_0_8px_rgba(0,47,167,0.5)]"
                  style={{ width: `${progress}%` }}
                />
                {/* Scrub Handle */}
                <motion.div 
                  className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] z-10"
                  style={{ left: `${progress}%`, marginLeft: '-3px' }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Page Display */}
          <div className={cn(
            "relative z-20 font-mono text-[10px] tabular-nums transition-all duration-200",
            isHovered ? "text-white mb-4" : "text-zinc-500"
          )}>
            {displayPage.toString().padStart(2, '0')}
            {isHovered && (
              <span className="text-zinc-600 ml-1">/ {totalPages.toString().padStart(2, '0')}</span>
            )}
          </div>
          
          {/* Instructional Tooltip (Minimalist) */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute bottom-1 text-[8px] font-sans uppercase tracking-[0.1em] text-zinc-500 whitespace-nowrap pointer-events-none"
              >
                Jump to Node
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Next Button */}
      <motion.button
        onClick={handleNext}
        disabled={(currentPage >= totalPages && !hasNextPage) || isFetchingNextPage}
        className="icon-button-forensic w-8 h-8 flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-opacity"
        aria-label="Next page"
        animate={{ x: isLoading ? 1 : 0, opacity: isLoading ? 0.85 : 1 }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      >
        <ChevronRight className="h-4 w-4" />
      </motion.button>

      <AnimatePresence initial={false}>
        {isLoading && (
          <motion.div
            key="pagination-loading-dot"
            initial={{ opacity: 0, scale: 0.65, x: -2 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.65, x: 2 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            className="pointer-events-none absolute right-0 top-1/2 ml-2 -translate-y-1/2 translate-x-full"
          >
            <div className="h-1 w-1 rounded-full bg-[#002FA7] animate-ping" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
