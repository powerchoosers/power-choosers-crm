'use client'

import { useCallStore } from '@/store/callStore'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Mic, PhoneOff, ArrowRightLeft, FileText, RefreshCw, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useEffect } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function TopBar() {
  const { isActive, status, setActive, setStatus } = useCallStore()
  const pathname = usePathname()

  useEffect(() => {
    // Show toast on mount as a replacement for the "System Ready" indicator
    toast.success("System Ready", {
        description: "Connected to Nodal Point Network",
        className: "bg-zinc-900 border-white/10 text-white",
        duration: 4000,
    })
  }, [])

  const handleRefresh = () => {
    toast.info("Refreshing Data...")
    // In a real app, this would invalidate React Query queries
    setTimeout(() => toast.success("Data Synced"), 1000)
  }

  return (
    // Updated positioning: constrained to match main content area (left-16 for sidebar, lg:right-80 for widget panel)
    <div className="fixed top-0 left-16 right-0 lg:right-80 z-40 flex items-start justify-center p-6 pointer-events-none">
      <div className="w-full max-w-5xl flex items-start gap-4 pointer-events-auto">
        <div className="flex-1 min-w-0">
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
                <div className="w-full max-w-2xl h-[50px] bg-zinc-900/90 backdrop-blur-xl border border-signal/50 rounded-full shadow-[0_10px_30px_-10px_rgba(0,47,167,0.5)] flex items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                            <span className="text-zinc-400 font-mono text-[10px]">ID</span>
                        </div>
                        <div>
                            <div className="text-sm font-medium text-white">Unknown Caller</div>
                            <div className="text-xs text-signal font-mono">00:12</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                            <Mic size={16} />
                        </button>
                        <button className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                            <ArrowRightLeft size={16} />
                        </button>
                        <button 
                            onClick={() => { setActive(false); setStatus('ended') }}
                            className="p-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                        >
                            <PhoneOff size={16} />
                        </button>
                    </div>
                </div>
                </motion.div>
            )}
            </AnimatePresence>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-1.5 rounded-full shadow-lg h-12">
             <Link 
                href="/crm-platform/scripts"
                className={cn(
                    "p-2 rounded-full transition-all duration-200",
                    pathname === '/crm-platform/scripts' 
                        ? "bg-white text-black shadow-sm" 
                        : "text-zinc-400 hover:text-white hover:bg-white/10"
                )}
                title="Phone Scripts"
            >
                <FileText size={18} />
            </Link>
            
            <button 
                onClick={handleRefresh}
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Refresh Data"
            >
                <RefreshCw size={18} />
            </button>

            <button 
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors relative"
                title="Notifications"
            >
                <Bell size={18} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-signal rounded-full border border-zinc-900" />
            </button>
            
            {/* Manual Dialer Trigger (if not active) */}
            {!isActive && (
                <button 
                    onClick={() => { setActive(true); setStatus('dialing') }}
                    className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Open Dialer"
                >
                    <Phone size={18} />
                </button>
            )}
        </div>
      </div>
    </div>
  )
}
