'use client'

import Link from 'next/link'
import { LayoutDashboard, Users, Phone, FileText, Zap, Settings, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/crm-platform' },
  { icon: Users, label: 'People', href: '/crm-platform/people' },
  { icon: Building2, label: 'Accounts', href: '/crm-platform/accounts' },
  { icon: Phone, label: 'Calls', href: '/crm-platform/calls' },
  { icon: FileText, label: 'Scripts', href: '/crm-platform/scripts' },
  { icon: Zap, label: 'Energy', href: '/crm-platform/energy' },
  { icon: Settings, label: 'Settings', href: '/crm-platform/settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isHovered, setIsHovered] = useState(false)

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 bg-zinc-950/90 backdrop-blur-xl border-r border-white/5 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isHovered ? "w-64 shadow-2xl shadow-black/50" : "w-16"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="h-24 flex items-center justify-start px-4 border-b border-white/5 overflow-hidden whitespace-nowrap">
        <div className="w-8 h-8 bg-gradient-to-br from-white to-zinc-500 rounded-lg flex-shrink-0" />
        <motion.span 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
          transition={{ duration: 0.2 }}
          className="ml-3 font-bold text-lg tracking-tight text-white"
        >
          Nodal Point
        </motion.span>
      </div>
      
      <nav className="flex-1 py-6 flex flex-col gap-2 px-2 overflow-hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all group whitespace-nowrap",
                isActive && "bg-white/5 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
              )}
            >
              <item.icon size={20} strokeWidth={1.5} className={cn("flex-shrink-0 transition-colors", isActive ? "text-signal" : "group-hover:text-signal")} />
              <motion.span 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
                transition={{ duration: 0.2 }}
                className="text-sm font-medium"
              >
                {item.label}
              </motion.span>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-white/5 overflow-hidden whitespace-nowrap">
        <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex-shrink-0" />
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
              transition={{ duration: 0.2 }}
            >
                <div className="text-sm text-white font-medium truncate">Trey</div>
                <div className="text-xs text-zinc-500 truncate">Admin</div>
            </motion.div>
        </div>
      </div>
    </aside>
  )
}
