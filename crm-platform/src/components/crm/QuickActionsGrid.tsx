'use client'

import { UserPlus, Building2, FileUp, PlusCircle } from 'lucide-react'
import Link from 'next/link'

export default function QuickActionsGrid() {
  const actions = [
    { icon: UserPlus, label: 'Contact', href: '/network/people?action=new' },
    { icon: Building2, label: 'Account', href: '/network/accounts?action=new' },
    { icon: FileUp, label: 'Upload Bill', href: '/network/energy?action=upload' },
    { icon: PlusCircle, label: 'New Deal', href: '/network/deals?action=new' },
  ]

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Rapid Ingestion</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="icon-button-forensic group flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-300"
            title={action.label}
          >
            <action.icon size={20} className="mb-2 transition-all duration-300" />
            <span className="text-[10px] font-mono text-zinc-500 group-hover:text-white uppercase tracking-widest transition-colors duration-300">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
