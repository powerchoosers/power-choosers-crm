'use client'

import { useState } from 'react'
import { UserPlus, Building2, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import { BulkImportModal } from '@/components/modals/BulkImportModal'

export default function QuickActionsGrid() {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  const actions = [
    { icon: UserPlus, label: 'Contact', href: '/network/people?action=new', type: 'link' },
    { icon: Building2, label: 'Account', href: '/network/accounts?action=new', type: 'link' },
    { icon: FileSpreadsheet, label: 'Bulk Import', onClick: () => setIsImportModalOpen(true), type: 'button' },
  ]

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Rapid Ingestion</h3>
      <div className="grid grid-cols-3 gap-3">
        {actions.map((action) => (
          action.type === 'link' ? (
            <Link
              key={action.label}
              href={action.href || '#'}
              className="icon-button-forensic group flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300"
              title={action.label}
            >
              <action.icon size={20} className="mb-2 transition-all duration-300" />
              <span className="text-[8px] font-mono text-zinc-500 group-hover:text-white uppercase tracking-widest transition-colors duration-300 text-center">{action.label}</span>
            </Link>
          ) : (
            <button
              key={action.label}
              onClick={action.onClick}
              className="icon-button-forensic group flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300"
              title={action.label}
            >
              <action.icon size={20} className="mb-2 transition-all duration-300" />
              <span className="text-[8px] font-mono text-zinc-500 group-hover:text-white uppercase tracking-widest transition-colors duration-300 text-center">{action.label}</span>
            </button>
          )
        ))}
      </div>

      <BulkImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
      />
    </div>
  )
}
