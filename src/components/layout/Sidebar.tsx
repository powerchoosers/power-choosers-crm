'use client'

import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard, Users, Phone, Sparkles, Zap, Settings, Building2, LogOut, CheckSquare, Play, Mail, List, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useGeminiStore } from '@/store/geminiStore'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/crm-platform' },
  { icon: Users, label: 'People', href: '/crm-platform/people' },
  { icon: Building2, label: 'Accounts', href: '/crm-platform/accounts' },
  { icon: List, label: 'Lists', href: '/crm-platform/lists' },
  { icon: CheckSquare, label: 'Tasks', href: '/crm-platform/tasks' },
  { icon: Play, label: 'Sequences', href: '/crm-platform/sequences' },
  { icon: Mail, label: 'Emails', href: '/crm-platform/emails' },
  { icon: Phone, label: 'Calls', href: '/crm-platform/calls' },
  { icon: Sparkles, label: 'Gemini', href: '#', isChat: true },
  { icon: Zap, label: 'Energy', href: '/crm-platform/energy' },
  { icon: Settings, label: 'Settings', href: '/crm-platform/settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, role } = useAuth()
  const [isHovered, setIsHovered] = useState(false)
  const toggleGemini = useGeminiStore(state => state.toggleChat)

  const handleLogout = async () => {
    try {
        await supabase.auth.signOut()
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
        toast.success('Logged out successfully')
        router.push('/login')
    } catch (error) {
        console.error('Logout error:', error)
        toast.error('Failed to logout')
    }
  }

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 bg-zinc-950 border-r border-white/5 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isHovered ? "w-64 shadow-2xl shadow-black/50" : "w-16"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="h-24 flex items-center justify-start px-3 border-b border-white/5 overflow-hidden whitespace-nowrap">
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0 p-1.5 shadow-lg shadow-black/20">
          <div className="relative w-full h-full">
            <Image src="/images/nodalpoint.png" alt="Nodal Point" fill className="object-contain" />
          </div>
        </div>
        <motion.span 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
          transition={{ duration: 0.2 }}
          className="ml-3 font-bold text-lg tracking-tight text-white"
        >
          Nodal Point
        </motion.span>
      </div>
      
      <nav className="flex-1 py-6 flex flex-col gap-2 px-3 overflow-hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          
          const content = (
            <>
              <AnimatePresence>
                {isActive && (
                  <>
                    <motion.div
                      layoutId="activeBackground"
                      className="absolute inset-0 bg-white/[0.08] rounded-xl shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3)] border border-white/10"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 w-1 bg-white rounded-full z-20"
                      style={{ 
                        left: isHovered ? -6 : -12, // Adjusted to stay at sidebar edge
                        height: 20 
                      }}
                      initial={{ opacity: 0, scaleY: 0 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={{ opacity: 0, scaleY: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  </>
                )}
              </AnimatePresence>
              
              <item.icon 
                size={20} 
                className={cn(
                  "flex-shrink-0 transition-all duration-300 relative z-10", 
                  isActive 
                    ? "text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" 
                    : "group-hover:text-zinc-200 group-hover:scale-110"
                )} 
              />
              
              <AnimatePresence mode="wait">
                {isHovered && (
                  <motion.span 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="ml-3 font-medium whitespace-nowrap relative z-10"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          );

          if ('isChat' in item && item.isChat) {
            return (
              <button
                key={item.label}
                onClick={toggleGemini}
                className={cn(
                  "flex items-center rounded-xl transition-all duration-300 group relative h-11 justify-start w-full text-left",
                  isHovered ? "px-3" : "pl-2.5",
                  "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
                )}
              >
                {content}
              </button>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex items-center rounded-xl transition-all duration-300 group relative h-11 justify-start",
                isHovered ? "px-3" : "pl-2.5",
                isActive 
                  ? "text-white" 
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {content}
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-white/5 overflow-hidden whitespace-nowrap">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
                {user?.photoURL ? (
                    <Image 
                        src={user.photoURL} 
                        alt="User" 
                        width={32}
                        height={32}
                        className="w-full h-full object-cover" 
                    />
                ) : (
                    <span className="text-xs font-bold text-zinc-400">
                        {user?.email ? user.email[0].toUpperCase() : 'U'}
                    </span>
                )}
            </div>
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 min-w-0"
            >
                <div className="text-sm text-white font-medium truncate">{user?.displayName || user?.email?.split('@')[0] || 'User'}</div>
                <div className="text-xs text-zinc-500 truncate capitalize">{role || 'Employee'}</div>
            </motion.div>
            
            <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: isHovered ? 1 : 0, x: isHovered ? 0 : -10 }}
                transition={{ duration: 0.2 }}
                onClick={handleLogout}
                className="p-2 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
                title="Log Out"
            >
                <LogOut size={16} />
            </motion.button>
        </div>
      </div>
    </aside>
  )
}
