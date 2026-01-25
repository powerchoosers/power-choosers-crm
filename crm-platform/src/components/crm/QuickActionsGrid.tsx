'use client'

import { UserPlus, Building2, FileUp, PlusCircle } from 'lucide-react'
import Link from 'next/link'

export default function QuickActionsGrid() {
  const actions = [
    { icon: UserPlus, label: 'Contact', href: '/crm-platform/people?action=new' },
    { icon: Building2, label: 'Account', href: '/crm-platform/accounts?action=new' },
    { icon: FileUp, label: 'Upload Bill', href: '/crm-platform/energy?action=upload' },
    { icon: PlusCircle, label: 'New Deal', href: '/crm-platform/deals?action=new' },
  ]

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Rapid Ingestion</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl hover:bg-white/5 transition-all duration-300"
          >
            <action.icon size={20} className="text-zinc-500 group-hover:text-white group-hover:scale-110 transition-all duration-300 mb-2" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-300 uppercase tracking-widest">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
