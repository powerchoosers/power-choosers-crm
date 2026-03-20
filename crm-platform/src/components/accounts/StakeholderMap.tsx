'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Contact } from '@/hooks/useContacts'
import { Users, ArrowUpRight, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { useContactsInTargetLists } from '@/hooks/useListMemberships'
import { cn } from '@/lib/utils'

interface StakeholderMapProps {
  contacts?: Contact[]
  className?: string
  onAddContact?: () => void
}

export const StakeholderMap: React.FC<StakeholderMapProps> = ({ contacts = [], className, onAddContact }) => {
  const router = useRouter()

  // Get all contact IDs
  const contactIds = contacts.map(c => c.id)

  // Query which contacts are in target lists
  const { data: contactsInLists } = useContactsInTargetLists(contactIds)

  return (
    <motion.div layout className={cn("nodal-module-glass nodal-monolith-edge rounded-2xl p-4", className)}>
      <div className={cn("flex items-center justify-between", contacts.length > 0 && "mb-4")}>
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <Users className="w-3 h-3" /> Command Chain
        </h3>
        <button
          onClick={onAddContact}
          className="icon-button-forensic w-7 h-7"
          title="Add contact to command chain"
          disabled={!onAddContact}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false} mode="sync">
        <div className="space-y-2 overflow-hidden">
          {contacts.map((contact) => {
            const isInTargetList = contactsInLists?.has(contact.id) || false

            return (
              <motion.div
                key={contact.id}
                layout="position"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => router.push(`/network/contacts/${contact.id}`)}
                className="group flex items-center gap-3 p-2 rounded-lg border border-transparent hover:border-white/5 transition-all cursor-pointer"
              >
                {/* Avatar with Target Badge */}
                <ContactAvatar
                  name={contact.name || ''}
                  photoUrl={contact.avatarUrl}
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
              </motion.div>
            )
          })}
        </div>
      </AnimatePresence>
    </motion.div>
  )
}
