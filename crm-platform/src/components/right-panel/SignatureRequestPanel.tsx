'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PenTool, ChevronRight, CheckCircle, Loader2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/context/AuthContext'
import { useAccountContacts, Contact } from '@/hooks/useContacts'
import { useDealsByAccount } from '@/hooks/useDeals'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'

const DocumentPreparationModal = dynamic(
    () => import('../modals/DocumentPreparationModal').then(m => m.DocumentPreparationModal),
    { ssr: false }
)

export function SignatureRequestPanel() {
    const { setRightPanelMode, signatureRequestContext, setSignatureRequestContext } = useUIStore()
    const { user } = useAuth()
    const queryClient = useQueryClient()

    const [selectedContactId, setSelectedContactId] = useState<string>('')
    const [selectedDealId, setSelectedDealId] = useState<string>('')
    const [message, setMessage] = useState('Please review and execute the following document.')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showPrepModal, setShowPrepModal] = useState(false)

    // Fetch contacts for the account to populate the dropdown
    const { data: contacts, isLoading: loadingContacts } = useAccountContacts(signatureRequestContext?.accountId || '')
    const { data: deals, isLoading: loadingDeals } = useDealsByAccount(signatureRequestContext?.accountId)

    const handleClose = () => {
        setSignatureRequestContext(null)
        setRightPanelMode('DEFAULT')
    }

    const handleInitialSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedContactId) {
            toast.error('Please select a contact to sign the document')
            return
        }
        setShowPrepModal(true)
    }

    const executeDispatch = async (signatureFields: any[]) => {
        setShowPrepModal(false)
        setIsSubmitting(true)
        const toastId = toast.loading('Generating secure token & dispatching email...')

        try {
            const res = await fetch('/api/signatures/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId: signatureRequestContext?.documentId,
                    accountId: signatureRequestContext?.accountId,
                    contactId: selectedContactId,
                    dealId: selectedDealId || undefined,
                    userEmail: user?.email || 'test@nodalpoint.io',
                    message,
                    signatureFields
                })
            })

            const result = await res.json()

            if (!res.ok) {
                throw new Error(result.error || 'Failed to dispatch request')
            }

            toast.success('Signature request dispatched successfully', { id: toastId })

            // Immediately bust email + deal caches so email intel and
            // right-panel contract sections reflect the new request without a page refresh
            queryClient.invalidateQueries({ queryKey: ['emails'] })
            queryClient.invalidateQueries({ queryKey: ['entity-emails'] })
            queryClient.invalidateQueries({ queryKey: ['emails-count'] })
            queryClient.invalidateQueries({ queryKey: ['deals'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
            queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })

            handleClose()
        } catch (error: any) {
            toast.error(error.message, { id: toastId })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex-1 flex flex-col h-full bg-zinc-950 border-white/5 relative z-50 shadow-2xl"
        >
            <DocumentPreparationModal
                isOpen={showPrepModal}
                onClose={() => setShowPrepModal(false)}
                onComplete={executeDispatch}
                pdfUrl={signatureRequestContext?.documentUrl || ''}
            />
            <div className="h-24 px-6 flex items-center justify-between border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center text-[#002FA7]">
                        <PenTool className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">Request Signature</h2>
                        <div className="text-zinc-200 font-sans text-sm truncate max-w-[180px]">
                            {signatureRequestContext?.documentName || 'Unknown Document'}
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleClose}
                    className="icon-button-forensic"
                    title="Cancel"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto np-scroll p-6">
                <form id="sig-form" onSubmit={handleInitialSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                            Assign Signatory <span className="text-rose-500">*</span>
                        </label>
                        {loadingContacts ? (
                            <div className="text-xs font-mono text-zinc-600">Loading contacts...</div>
                        ) : contacts && contacts.length > 0 ? (
                            <select
                                value={selectedContactId}
                                onChange={(e) => setSelectedContactId(e.target.value)}
                                required
                                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] outline-none transition-all"
                            >
                                <option value="">-- Select Contact --</option>
                                {contacts.map((c: Contact) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown'} ({c.email || 'No email'})
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="text-xs font-mono text-rose-400">
                                No contacts found for this account.
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                            Link to Contract/Deal (Optional)
                        </label>
                        {loadingDeals ? (
                            <div className="text-xs font-mono text-zinc-600">Loading contracts...</div>
                        ) : deals && deals.length > 0 ? (
                            <select
                                value={selectedDealId}
                                onChange={(e) => setSelectedDealId(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] outline-none transition-all"
                            >
                                <option value="">-- None --</option>
                                {deals.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.title} ({d.stage})
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="text-xs font-mono text-zinc-600">
                                No active contracts to link.
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                            Message to Signatory
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={4}
                            className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] outline-none transition-all resize-none"
                        />
                    </div>
                </form>
            </div>

            <div className="shrink-0 p-6 border-t border-white/5 bg-zinc-950">
                <button
                    type="submit"
                    form="sig-form"
                    disabled={isSubmitting || !selectedContactId}
                    className="w-full h-10 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-xs uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <>
                            <CheckCircle className="w-4 h-4" />
                            Next: Place Signatures
                        </>
                    )}
                </button>
            </div>
        </motion.div>
    )
}
