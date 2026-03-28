'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutGrid,
  Building2,
  Users,
  CheckSquare,
  MoreHorizontal,
  Radar,
  Mail,
  Phone,
  FileText,
  Settings,
  GitMerge,
  Zap,
  Activity,
  Map,
  X,
  UserCog,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'

const primaryNav = [
  { name: 'Dashboard', href: '/network', icon: LayoutGrid, exact: true },
  { name: 'Accounts', href: '/network/accounts', icon: Building2 },
  { name: 'People', href: '/network/people', icon: Users },
  { name: 'Tasks', href: '/network/tasks', icon: CheckSquare },
]

const moreNav = [
  { name: 'Targets', href: '/network/targets', icon: Radar },
  { name: 'Contracts', href: '/network/contracts', icon: FileText },
  { name: 'Protocols', href: '/network/protocols', icon: GitMerge },
  { name: 'Foundry', href: '/network/foundry', icon: Zap },
  { name: 'Emails', href: '/network/emails', icon: Mail },
  { name: 'Calls', href: '/network/calls', icon: Phone },
  { name: 'Telemetry', href: '/network/telemetry', icon: Activity },
  { name: 'Vault', href: '/network/vault', icon: FileText },
  { name: 'Infra', href: '/network/infrastructure', icon: Map },
  { name: 'Admin', href: '/network/admin', icon: ShieldCheck, roles: ['admin', 'dev'] },
  { name: 'Agents', href: '/network/agents', icon: UserCog, roles: ['admin', 'dev'] },
  { name: 'Settings', href: '/network/settings', icon: Settings },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const { role } = useAuth()

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href
    return pathname === href || (pathname?.startsWith(href + '/') ?? false)
  }

  return (
    <>
      {/* More drawer */}
      <AnimatePresence>
        {isMoreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMoreOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed bottom-16 left-0 right-0 z-50 bg-zinc-950 border-t border-white/5 rounded-t-2xl lg:hidden"
            >
              {/* Drawer handle + header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="w-8 h-1 bg-white/10 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest pt-2">Navigation</span>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Grid of nav items */}
              <div className="grid grid-cols-5 gap-1 px-3 pb-5">
                {moreNav.filter((item) => !item.roles || item.roles.includes(role || '')).map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMoreOpen(false)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-colors',
                        active ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                      )}
                    >
                      <item.icon
                        size={20}
                        className={cn(
                          'transition-colors',
                          active ? 'text-white' : 'text-zinc-500'
                        )}
                      />
                      <span
                        className={cn(
                          'text-[9px] font-mono uppercase tracking-wide text-center leading-tight',
                          active ? 'text-white' : 'text-zinc-500'
                        )}
                      >
                        {item.name}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-zinc-950/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 lg:hidden">
        {primaryNav.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-1 py-1 px-4"
            >
              {active && (
                <motion.div
                  layoutId="mobile-nav-active"
                  className="absolute inset-0 bg-white/[0.05] rounded-xl"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <item.icon
                size={20}
                className={cn(
                  'relative z-10 transition-colors',
                  active ? 'text-white' : 'text-zinc-500'
                )}
              />
              <span
                className={cn(
                  'relative z-10 text-[9px] font-mono uppercase tracking-wide',
                  active ? 'text-white' : 'text-zinc-500'
                )}
              >
                {item.name}
              </span>
            </Link>
          )
        })}

        {/* More button */}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className="relative flex flex-col items-center gap-1 py-1 px-4"
        >
          {isMoreOpen && (
            <motion.div
              layoutId="mobile-nav-active"
              className="absolute inset-0 bg-white/[0.05] rounded-xl"
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
          )}
          <MoreHorizontal
            size={20}
            className={cn(
              'relative z-10 transition-colors',
              isMoreOpen ? 'text-white' : 'text-zinc-500'
            )}
          />
          <span
            className={cn(
              'relative z-10 text-[9px] font-mono uppercase tracking-wide',
              isMoreOpen ? 'text-white' : 'text-zinc-500'
            )}
          >
            More
          </span>
        </button>
      </nav>
    </>
  )
}
