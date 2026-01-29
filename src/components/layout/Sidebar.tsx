'use client'

import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { auth } from '@/lib/firebase'
import { toast } from 'sonner'
import { 
  LayoutGrid, 
  Building2, 
  Users, 
  Map, 
  Radar, 
  GitMerge, 
  CheckSquare, 
  Mail, 
  Phone, 
  Activity, 
  FileText, 
  Settings, 
  LogOut
} from 'lucide-react'

const navigationStructure = [
  // ZONE 1: COMMAND (The Overview)
  {
    group: "Command",
    items: [
      { name: 'Dashboard', href: '/network', icon: LayoutGrid }
    ]
  },
  
  // ZONE 2: ASSET INTELLIGENCE (The Grid Entities)
  {
    group: "Assets",
    items: [
      { name: 'Accounts', href: '/network/accounts', icon: Building2 },
      { name: 'People', href: '/network/people', icon: Users },
      { name: 'Infrastructure', href: '/network/infrastructure', icon: Map } 
    ]
  },

  // ZONE 3: KINETIC OPERATIONS (The Workflows)
  {
    group: "Operations",
    items: [
      { name: 'Targets', href: '/network/targets', icon: Radar },
      { name: 'Protocols', href: '/network/protocols', icon: GitMerge },
      { name: 'Tasks', href: '/network/tasks', icon: CheckSquare }
    ]
  },

  // ZONE 4: TRANSMISSION (The Live Channels)
  {
    group: "Transmission",
    items: [
      { name: 'Emails', href: '/network/emails', icon: Mail },
      { name: 'Calls', href: '/network/calls', icon: Phone }
    ]
  },

  // ZONE 5: DEEP PHYSICS (Market Data & Docs)
  {
    group: "Intelligence",
    items: [
      { name: 'Telemetry', href: '/network/energy', icon: Activity }, // Keeping /network/energy for now
      { name: 'Vault', href: '/network/vault', icon: FileText }
    ]
  },

  // ZONE 6: SYSTEM (Bottom Anchor)
  {
    group: "System",
    items: [
      { name: 'Settings', href: '/network/settings', icon: Settings }
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, role } = useAuth()
  const [isHovered, setIsHovered] = useState(false)

  const handleLogout = async () => {
    try {
        await auth.signOut()
        document.cookie = 'np_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
        toast.success('Logged out successfully')
        router.push('/login')
    } catch (error) {
        console.error('Logout error:', error)
        toast.error('Failed to logout')
    }
  }

  return (
    <motion.aside 
      layout
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 bg-zinc-950 border-r border-white/5 flex flex-col shadow-2xl transition-shadow duration-500"
      )}
      animate={{ 
        width: isHovered ? 280 : 70,
        boxShadow: isHovered ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)" : "0 0 0 0 rgba(0, 0, 0, 0)"
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 30,
        mass: 0.8
      }}
    >
      <motion.div 
        className="h-24 flex items-center justify-start border-b border-white/5 overflow-hidden whitespace-nowrap"
        animate={{ 
          paddingLeft: isHovered ? 18 : 11,
          paddingRight: isHovered ? 18 : 11 
        }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          mass: 0.8
        }}
      >
        <motion.div 
            layout="position"
            className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0 p-2 shadow-lg shadow-black/20"
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 30,
              mass: 0.8
            }}
          >
          <div className="relative w-full h-full">
            <Image src="/images/nodalpoint.png" alt="Nodal Point" fill className="object-contain" />
          </div>
        </motion.div>
        <AnimatePresence>
          {isHovered && (
            <motion.span 
              layout="position"
              initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="ml-4 font-bold text-lg tracking-tight text-white"
            >
              Nodal Point Network
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      
      <motion.nav 
        className={cn(
          "flex-1 py-6 flex flex-col overflow-x-hidden",
          isHovered ? "overflow-y-auto custom-scrollbar" : "overflow-y-hidden"
        )}
        animate={{ 
          paddingLeft: isHovered ? 18 : 11,
          paddingRight: isHovered ? 18 : 11 
        }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          mass: 0.8
        }}
      >
        {navigationStructure.map((group, groupIndex) => (
          <motion.div 
            layout
            key={group.group} 
            className={cn("flex flex-col gap-1", groupIndex !== navigationStructure.length - 1 && "mb-8")}
          >
            <AnimatePresence mode="popLayout">
              {isHovered && (
                <motion.div 
                  layout
                  className="mb-2 px-2 text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] overflow-hidden"
                >
                  {group.group}
                </motion.div>
              )}
            </AnimatePresence>
            
            {group.items.map((item) => {
              const isActive = pathname === item.href
              
              const content = (
                <>
                  <AnimatePresence>
                    {isActive && (
                      <>
                        <motion.div
                          layoutId="activeBackground"
                          className="absolute inset-0 bg-white/[0.05] rounded-xl border border-white/5"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                        {/* Laser Sight Indicator */}
                        <motion.div
                          layoutId="laserSight"
                          className="absolute left-0 w-1 h-6 bg-[#002FA7] rounded-r-full z-20 shadow-[0_0_10px_rgba(0,47,167,0.5)]"
                          initial={{ opacity: 0, x: -2 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -2 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      </>
                    )}
                  </AnimatePresence>
                  
                  <motion.div 
                    layout
                    className="flex-shrink-0 w-12 flex justify-center items-center relative z-10"
                  >
                    <item.icon 
                      size={20} 
                      className={cn(
                        "transition-all duration-300", 
                        isActive 
                          ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" 
                          : "text-zinc-500 group-hover:text-zinc-200 group-hover:scale-110"
                      )} 
                    />
                  </motion.div>
                  
                  <AnimatePresence mode="popLayout">
                    {isHovered && (
                      <motion.span 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="font-medium whitespace-nowrap relative z-10 text-sm text-zinc-300 group-hover:text-white"
                      >
                        {item.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              );

              const buttonClasses = cn(
           "flex items-center rounded-xl group relative h-12 justify-start w-full overflow-hidden",
           isActive 
             ? "text-white" 
             : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]"
         );

              return (
                <motion.div layout key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className={buttonClasses}
                  >
                    {content}
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>
        ))}
      </motion.nav>
      
      <motion.div 
        layout
        className="border-t border-white/5 overflow-hidden whitespace-nowrap bg-zinc-950/50 backdrop-blur-md"
        animate={{ 
           paddingLeft: isHovered ? 18 : 15,
           paddingRight: isHovered ? 18 : 15,
           paddingTop: isHovered ? 15 : 15,
           paddingBottom: isHovered ? 15 : 15
         }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          mass: 0.8
        }}
      >
        <div className="flex items-center gap-3 h-10">
            <motion.div 
              layout="position"
              className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-inner"
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 30,
                mass: 0.8
              }}
            >
                {user?.photoURL ? (
                    <Image 
                        src={user.photoURL} 
                        alt="User" 
                        width={40}
                        height={40}
                        className="w-full h-full object-cover" 
                    />
                ) : (
                    <span className="text-sm font-bold text-zinc-500">
                        {user?.email ? user.email[0].toUpperCase() : 'U'}
                    </span>
                )}
            </motion.div>
            <AnimatePresence>
              {isHovered && (
                <motion.div 
                  layout="position"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex-1 min-w-0"
                >
                    <div className="text-sm text-white font-semibold truncate">{user?.displayName || user?.email?.split('@')[0] || 'User'}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono truncate">{role || 'Network_Agent'}</div>
                </motion.div>
              )}
            </AnimatePresence>
            
            <AnimatePresence>
              {isHovered && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleLogout}
                  className="p-2.5 hover:bg-red-500/10 rounded-xl text-zinc-500 hover:text-red-400 transition-colors"
                  title="Terminate Session"
                >
                  <LogOut size={18} />
                </motion.button>
              )}
            </AnimatePresence>
        </div>
      </motion.div>
    </motion.aside>
  )
}
