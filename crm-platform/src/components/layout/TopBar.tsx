'use client'

import { useCallStore } from '@/store/callStore'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Mic, PhoneOff, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useEffect } from 'react'
import { toast } from 'sonner'

export function TopBar() {
  const { isActive, status, setActive, setStatus } = useCallStore()

  useEffect(() => {
    // Show toast on mount as a replacement for the "System Ready" indicator
    toast.success("System Ready", {
        description: "Connected to Nodal Point Network",
        className: "bg-zinc-900 border-white/10 text-white",
        duration: 4000,
    })
  }, [])

  return (
    // Updated positioning: constrained to match main content area (left-16 for sidebar, lg:right-80 for widget panel)
    <div className="fixed top-0 left-16 right-0 lg:right-80 z-40 flex items-start justify-center p-6 pointer-events-none">
      <div className="w-full max-w-3xl pointer-events-auto">
        <AnimatePresence mode="wait">
          {!isActive ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <GlobalSearch />
            </motion.div>
          ) : (
            <motion.div
              key="active-call"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex justify-center"
            >
               <div className="w-[600px] h-[80px] bg-zinc-900/90 backdrop-blur-xl border border-signal/50 rounded-full shadow-[0_10px_30px_-10px_rgba(0,47,167,0.5)] flex items-center justify-between px-6">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                        <span className="text-zinc-400 font-mono text-xs">ID</span>
                     </div>
                     <div>
                        <div className="text-sm font-medium text-white">Unknown Caller</div>
                        <div className="text-xs text-signal font-mono">00:12</div>
                     </div>
                  </div>

                  <div className="flex items-center gap-4">
                     <button className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                        <Mic size={20} />
                     </button>
                     <button className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                        <ArrowRightLeft size={20} />
                     </button>
                     <button 
                        onClick={() => { setActive(false); setStatus('ended') }}
                        className="p-2 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                     >
                        <PhoneOff size={20} />
                     </button>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
