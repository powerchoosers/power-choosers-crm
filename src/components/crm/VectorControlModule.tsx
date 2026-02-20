'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Radar, GitMerge } from 'lucide-react'
import { useContactListMemberships, useAddContactToList, useRemoveContactFromList } from '@/hooks/useContactListMemberships'
import { useContactProtocolMemberships, useAddContactToProtocol, useRemoveContactFromProtocol } from '@/hooks/useContactProtocolMemberships'
import { useAccountListMemberships, useAddAccountToList, useRemoveAccountFromList } from '@/hooks/useAccountListMemberships'
import { useTargets } from '@/hooks/useTargets'
import { useProtocols } from '@/hooks/useProtocols'
import { useCreateTarget } from '@/hooks/useTargets'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'

interface VectorControlModuleProps {
  /** Contact dossier: protocols + targets (contact lists) */
  contactId?: string
  /** Account dossier: targets only (account lists), no protocols */
  accountId?: string
}

type VectorChip =
  | { type: 'target'; id: string; membershipId: string; name: string }
  | { type: 'protocol'; id: string; membershipId: string; name: string }

const CONTACT_LIST_KINDS = ['people', 'person', 'contact', 'contacts'] as const
const ACCOUNT_LIST_KINDS = ['account', 'accounts', 'company', 'companies'] as const

export function VectorControlModule({ contactId, accountId }: VectorControlModuleProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { user } = useAuth()

  const isAccountMode = !!accountId
  const entityId = isAccountMode ? accountId : contactId

  const { data: contactListMemberships = [], isLoading: isLoadingContactLists } = useContactListMemberships(isAccountMode ? undefined : contactId)
  const { data: accountListMemberships = [], isLoading: isLoadingAccountLists } = useAccountListMemberships(accountId)
  const { data: protocolMemberships = [], isLoading: isLoadingProtocolMemberships } = useContactProtocolMemberships(isAccountMode ? undefined : contactId)

  const { data: targetsData, isLoading: isLoadingTargets } = useTargets()
  const { data: protocolsData, createProtocolAsync, isLoading: isLoadingProtocols } = useProtocols()
  const createTarget = useCreateTarget()
  const addContactToList = useAddContactToList()
  const addAccountToList = useAddAccountToList()
  const addContactToProtocol = useAddContactToProtocol()
  const removeContactFromList = useRemoveContactFromList()
  const removeAccountFromList = useRemoveAccountFromList()
  const removeContactFromProtocol = useRemoveContactFromProtocol()

  const protocols = protocolsData?.pages?.flatMap(p => p.protocols) ?? []
  const listKinds: readonly string[] = isAccountMode ? ACCOUNT_LIST_KINDS : CONTACT_LIST_KINDS
  const targetLists = (targetsData ?? []).filter(list =>
    list.kind && listKinds.includes(list.kind)
  )
  const listMemberships = isAccountMode ? accountListMemberships : contactListMemberships

  const searchLower = searchQuery.trim().toLowerCase()
  const matchingProtocols = protocols.filter(p => p.name.toLowerCase().includes(searchLower))
  const matchingTargets = targetLists.filter(t => t.name.toLowerCase().includes(searchLower))
  const availableProtocols = isAccountMode ? [] : matchingProtocols.filter(p =>
    !protocolMemberships.some(m => m.sequenceId === p.id)
  )
  const availableTargets = matchingTargets.filter(t =>
    !listMemberships.some(m => m.listId === t.id)
  )
  const hasExactMatch = searchLower && (
    (!isAccountMode && protocols.some(p => p.name.toLowerCase() === searchLower)) ||
    targetLists.some(t => t.name.toLowerCase() === searchLower)
  )
  const showCreateOptions = searchLower && !hasExactMatch

  const chips: VectorChip[] = isAccountMode
    ? listMemberships.map(m => ({ type: 'target' as const, id: m.listId, membershipId: m.id, name: m.listName }))
    : [
      ...listMemberships.map(m => ({ type: 'target' as const, id: m.listId, membershipId: m.id, name: m.listName })),
      ...protocolMemberships.map(m => ({ type: 'protocol' as const, id: m.sequenceId, membershipId: m.id, name: m.sequenceName }))
    ]
  const hasAnyAssignments = chips.length > 0
  const isLoading = isAccountMode
    ? (isLoadingAccountLists || isLoadingTargets)
    : (isLoadingContactLists || isLoadingProtocolMemberships || isLoadingTargets || isLoadingProtocols)

  const handleAddToList = async (listId: string) => {
    if (!entityId) return
    try {
      if (isAccountMode) {
        await addAccountToList.mutateAsync({ accountId: entityId, listId })
      } else {
        await addContactToList.mutateAsync({ contactId: entityId, listId })
      }
      setIsPopoverOpen(false)
      setSearchQuery('')
    } catch (_) { }
  }

  const handleAddToProtocol = async (sequenceId: string) => {
    if (!contactId) return
    try {
      await addContactToProtocol.mutateAsync({ contactId, sequenceId })
      setIsPopoverOpen(false)
      setSearchQuery('')
    } catch (_) { }
  }

  const handleRemoveList = async (membershipId: string) => {
    if (!entityId) return
    try {
      if (isAccountMode) {
        await removeAccountFromList.mutateAsync({ accountId: entityId, membershipId })
      } else {
        await removeContactFromList.mutateAsync({ contactId: entityId, membershipId })
      }
    } catch (_) { }
  }

  const handleRemoveProtocol = async (membershipId: string) => {
    if (!contactId) return
    try {
      await removeContactFromProtocol.mutateAsync({ contactId, membershipId })
    } catch (_) { }
  }

  const handleCreateTarget = async () => {
    const name = searchQuery.trim()
    if (!name || !user || !entityId) return
    try {
      const kind = isAccountMode ? 'account' : 'people'
      const newList = await createTarget.mutateAsync({ name, kind })
      if (isAccountMode) {
        await addAccountToList.mutateAsync({ accountId: entityId, listId: newList.id })
        toast.success(`Target list "${name}" created and account added`)
      } else {
        await addContactToList.mutateAsync({ contactId: entityId, listId: newList.id })
        toast.success(`Target list "${name}" created and contact added`)
      }
      setIsPopoverOpen(false)
      setSearchQuery('')
    } catch (_) { }
  }

  const handleCreateProtocol = async () => {
    const name = searchQuery.trim()
    if (!name || !user || !contactId) return
    try {
      const newProtocol = await createProtocolAsync({
        name,
        description: '',
        status: 'draft',
        steps: []
      })
      await addContactToProtocol.mutateAsync({ contactId, sequenceId: newProtocol.id })
      toast.success(`Protocol "${name}" created and contact added`)
      setIsPopoverOpen(false)
      setSearchQuery('')
    } catch (_) { }
  }

  if (!contactId && !accountId) return null

  const renderPopoverContent = () => {
    const hasResults = availableProtocols.length > 0 || availableTargets.length > 0
    const showSections = hasResults

    return (
      <>
        <div className="p-4 border-b border-white/5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">ASSIGN_VECTOR</div>
          <Input
            placeholder="> SEARCH_OR_CREATE..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-black/40 nodal-monolith-edge text-white placeholder:text-zinc-600 font-mono text-xs"
            autoFocus
          />
        </div>
        <motion.div
          layout
          className="max-h-[320px] overflow-y-auto"
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {isLoadingTargets || (!isAccountMode && isLoadingProtocols) ? (
            <div className="p-4 text-center text-zinc-500 font-mono text-xs">Loading...</div>
          ) : (
            <>
              {showSections && (
                <>
                  {!isAccountMode && availableProtocols.length > 0 && (
                    <div className="p-2">
                      <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 px-2 py-1.5 flex items-center gap-1.5">
                        <GitMerge className="w-3 h-3 text-blue-400" /> PROTOCOLS
                      </div>
                      {availableProtocols.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddToProtocol(p.id)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-blue-500/10 hover:text-blue-400 transition-colors text-xs font-mono text-zinc-400"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {availableTargets.length > 0 && (
                    <div className={cn('p-2', !isAccountMode && availableProtocols.length > 0 && 'border-t border-white/5')}>
                      <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 px-2 py-1.5 flex items-center gap-1.5">
                        <Radar className="w-3 h-3 text-emerald-400" /> TARGETS
                      </div>
                      {availableTargets.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleAddToList(t.id)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors text-xs font-mono text-zinc-400"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {showCreateOptions && (
                <div className={cn('p-2', showSections && 'border-t border-white/10', 'space-y-1')}>
                  {!isAccountMode && (
                    <button
                      onClick={handleCreateProtocol}
                      className="w-full text-left px-3 py-2 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs font-mono flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3" /> Create New Protocol: &quot;{searchQuery.trim()}&quot;
                    </button>
                  )}
                  <button
                    onClick={handleCreateTarget}
                    className="w-full text-left px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-mono flex items-center gap-2"
                  >
                    <Plus className="w-3 h-3" /> Create New Target List: &quot;{searchQuery.trim()}&quot;
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </>
    )
  }

  if (!isLoading && !hasAnyAssignments) {
    return (
      <div className="mb-2">
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="w-full py-3 border border-dashed border-zinc-700 hover:border-[#002FA7] hover:bg-[#002FA7]/10 rounded-lg transition-all group flex items-center justify-center gap-2"
            >
              <Radar className="w-4 h-4 text-zinc-500 group-hover:text-[#002FA7] transition-colors" />
              <span className="font-mono text-xs text-zinc-500 group-hover:text-white transition-colors">
                ASSIGN_OPERATIONAL_VECTOR
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 bg-zinc-950 border-white/10 p-0" align="start" side="bottom">
            {renderPopoverContent()}
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  return (
    <div className="mb-2 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase text-zinc-500 font-mono tracking-widest">VECTOR_ASSIGNMENT</h4>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className="icon-button-forensic p-1.5 hover:bg-[#002FA7]/10 hover:text-[#002FA7] transition-colors"
              title="Assign to more vectors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 bg-zinc-950 border-white/10 p-0" align="start" side="bottom">
            {renderPopoverContent()}
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence mode="popLayout">
          {chips.map((chip) => (
            <motion.div
              key={chip.type === 'target' ? `t-${chip.membershipId}` : `p-${chip.membershipId}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                'rounded px-2 py-1 flex items-center gap-2 group',
                chip.type === 'protocol'
                  ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                  : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              )}
            >
              {chip.type === 'protocol' ? (
                <GitMerge className="w-3 h-3 shrink-0" />
              ) : (
                <Radar className="w-3 h-3 shrink-0" />
              )}
              <span className="font-mono text-xs">{chip.name}</span>
              <button
                onClick={() => chip.type === 'target' ? handleRemoveList(chip.membershipId) : handleRemoveProtocol(chip.membershipId)}
                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
