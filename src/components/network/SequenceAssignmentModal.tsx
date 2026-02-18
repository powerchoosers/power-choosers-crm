'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, GitMerge } from 'lucide-react'
import { useProtocols } from '@/hooks/useProtocols'
import { useEnrollContactsInProtocol } from '@/hooks/useContactProtocolMemberships'
import { cn } from '@/lib/utils'

interface SequenceAssignmentModalProps {
    isOpen: boolean
    onClose: () => void
    selectedContactIds: string[]
    onSuccess?: () => void
}

export function SequenceAssignmentModal({ isOpen, onClose, selectedContactIds, onSuccess }: SequenceAssignmentModalProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null)

    const { data: protocolsData, isLoading: isLoadingProtocols } = useProtocols()
    const enrollContacts = useEnrollContactsInProtocol()

    const protocols = protocolsData?.pages?.flatMap(p => p.protocols) ?? []
    const filteredProtocols = protocols.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleEnroll = async () => {
        if (!selectedProtocolId || selectedContactIds.length === 0) return

        try {
            await enrollContacts.mutateAsync({
                contactIds: selectedContactIds,
                sequenceId: selectedProtocolId
            })
            onSuccess?.()
            onClose()
            setSelectedProtocolId(null)
            setSearchQuery('')
        } catch (error) {
            console.error('Enrollment failed:', error)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10 text-white p-0 overflow-hidden gap-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
                        <GitMerge className="w-5 h-5 text-blue-500" />
                        Initiate Protocol
                    </DialogTitle>
                    <div className="text-xs text-zinc-500 font-mono mt-1">
                        Enrolling <span className="text-white font-bold">{selectedContactIds.length}</span> contacts into sequence automation.
                    </div>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4">
                    <Input
                        placeholder="Search protocols..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 font-mono text-xs focus:ring-blue-500/50"
                        autoFocus
                    />

                    <div className="h-[240px] overflow-y-auto pr-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {isLoadingProtocols ? (
                            <div className="flex items-center justify-center h-20 text-zinc-500">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading protocols...
                            </div>
                        ) : filteredProtocols.length === 0 ? (
                            <div className="text-center py-8 text-zinc-500 text-xs font-mono uppercase tracking-widest">
                                No matching protocols found
                            </div>
                        ) : (
                            filteredProtocols.map(protocol => (
                                <button
                                    key={protocol.id}
                                    onClick={() => setSelectedProtocolId(protocol.id)}
                                    className={cn(
                                        "w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between group",
                                        selectedProtocolId === protocol.id
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                                            : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span>{protocol.name}</span>
                                        <span className="text-[10px] opacity-60 font-mono uppercase tracking-wider mt-0.5">
                                            {protocol.steps?.length || 0} Steps
                                        </span>
                                    </div>
                                    {selectedProtocolId === protocol.id && (
                                        <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <DialogFooter className="p-4 border-t border-white/5 nodal-recessed flex items-center justify-between gap-2">
                    <Button variant="ghost" onClick={onClose} className="text-zinc-500 hover:text-white">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEnroll}
                        disabled={!selectedProtocolId || enrollContacts.isPending}
                        className="bg-white hover:bg-zinc-200 text-zinc-950 min-w-[100px] font-mono tracking-wide text-xs border border-white/10"
                    >
                        {enrollContacts.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            'Initiate Protocol'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
