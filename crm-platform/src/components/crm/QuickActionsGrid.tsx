'use client'

import { useState } from 'react'
import { Users, Building2, FileSpreadsheet, Plus } from 'lucide-react'
import { BulkImportModal } from '@/components/modals/BulkImportModal'
import { useUIStore } from '@/store/uiStore'

export default function QuickActionsGrid() {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const { setRightPanelMode } = useUIStore()

  const actions = [
    { 
      icon: Users, 
      label: 'Contact', 
      onClick: () => setRightPanelMode('INGEST_CONTACT'),
      type: 'button',
      isAction: true 
    },
    { 
      icon: Building2, 
      label: 'Account', 
      onClick: () => setRightPanelMode('INGEST_ACCOUNT'),
      type: 'button',
      isAction: true 
    },
    { 
      icon: FileSpreadsheet, 
      label: 'Bulk Import', 
      onClick: () => setIsImportModalOpen(true), 
      type: 'button',
      isAction: false
    },
  ]

  return (
    <>
      <div className="p-1.5 rounded-2xl bg-zinc-900/40 border border-white/5 backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-1.5">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="icon-button-forensic group flex flex-col items-center justify-center rounded-2xl transition-all duration-300 !pt-[10px] !pb-1.5 !px-2"
              title={action.label}
            >
              <div className="relative mt-0 mb-1 flex flex-col items-center">
                <action.icon size={18} className="transition-all duration-300 text-zinc-400 group-hover:text-white" />
                {action.isAction && (
                  <div className="absolute -top-1 -right-1">
                    <Plus size={8} className="text-white fill-white" />
                  </div>
                )}
              </div>
              <span className="text-[8px] font-mono text-zinc-500 group-hover:text-white uppercase tracking-widest transition-colors duration-300 text-center leading-none">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <BulkImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
      />
    </>
  )
}
