'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Contact } from '@/hooks/useContacts'
import { User, ArrowUpRight } from 'lucide-react'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { useContactsInTargetLists } from '@/hooks/useListMemberships'
import { cn } from '@/lib/utils'

interface StakeholderMapProps {
  contacts?: Contact[]
  className?: string
}

export const StakeholderMap: React.FC<StakeholderMapProps> = ({ contacts = [], className }) => {
  const router = useRouter()
  
  // Get all contact IDs
  const contactIds = contacts.map(c => c.id)
  
  // Query which contacts are in target lists
  const { data: contactsInLists } = useContactsInTargetLists(contactIds)

  if (!contacts || contacts.length === 0) return null

  return (
    <div className={cn("nodal-module-glass nodal-monolith-edge rounded-2xl p-4", className)}>
      <h3 className="text-xs font-mono text-zinc-500 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
        <User className="w-3 h-3" /> Command Chain
      </h3>
      
      <div className="space-y-2">
        {contacts.map((contact) => {
          const isInTargetList = contactsInLists?.has(contact.id) || false
          
          return (
            <div 
              key={contact.id}
              onClick={() => router.push(`/network/contacts/${contact.id}`)}
              className="group flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5 transition-all cursor-pointer"
            >
              {/* Avatar with Target Badge */}
              <ContactAvatar 
                name={contact.name || ''} 
                size={32} 
                className="w-8 h-8 rounded-[14px]"
                textClassName="text-[10px]"
                showListBadge={isInTargetList}
              />
              
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-300 group-hover:text-white group-hover:scale-[1.02] transition-all origin-left truncate">
                  {contact.name}
                </div>
                <div className="text-[10px] text-zinc-600 group-hover:text-zinc-500 truncate font-mono">
                  {(contact as any).title || 'Stakeholder'}
                </div>
              </div>

              <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-[#002FA7] transition-colors" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
