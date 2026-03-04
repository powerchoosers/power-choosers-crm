'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, X, Check, Send, Loader2, User, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Contact {
    id: string
    firstName: string | null
    lastName: string | null
    name: string | null
    email: string | null
    title: string | null
}

export function PortalAccessPanel() {
    const { portalAccessContext, setRightPanelMode, setPortalAccessContext } = useUIStore()
    const [contacts, setContacts] = useState<Contact[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [isLoadingContacts, setIsLoadingContacts] = useState(true)
    const [isSending, setIsSending] = useState(false)
    const [sentIds, setSentIds] = useState<Set<string>>(new Set())

    const accountId = portalAccessContext?.accountId
    const accountName = portalAccessContext?.accountName

    useEffect(() => {
        if (!accountId) return
        setIsLoadingContacts(true)
        setSelected(new Set())
        setSentIds(new Set())

        supabase
            .from('contacts')
            .select('id, firstName, lastName, name, email, title')
            .eq('accountId', accountId)
            .order('firstName', { ascending: true })
            .then(({ data }) => {
                setContacts(data || [])
                setIsLoadingContacts(false)
            })
    }, [accountId])

    const displayName = (c: Contact) =>
        c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed Contact'

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleSend = async () => {
        if (selected.size === 0) return
        setIsSending(true)

        const contactsToInvite = contacts.filter(c => selected.has(c.id) && c.email)
        const missing = contacts.filter(c => selected.has(c.id) && !c.email)

        if (missing.length > 0) {
            toast.error(`${missing.length} contact(s) have no email — skipped.`)
        }

        try {
            const res = await fetch('/api/portal/send-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactIds: contactsToInvite.map(c => c.id) }),
            })
            const json = await res.json()

            if (!res.ok) throw new Error(json.error || 'Unknown error')

            const newSent = new Set(sentIds)
            contactsToInvite.forEach(c => newSent.add(c.id))
            setSentIds(newSent)
            setSelected(new Set())

            toast.success(`Portal access sent to ${contactsToInvite.length} contact(s).`)
        } catch (err: any) {
            toast.error(err.message || 'Failed to send portal access')
        } finally {
            setIsSending(false)
        }
    }

    const handleClose = () => {
        setRightPanelMode('DEFAULT')
        setPortalAccessContext(null)
    }

    const contactsWithEmail = contacts.filter(c => c.email)
    const contactsNoEmail = contacts.filter(c => !c.email)

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeInOut' }}
            className="h-full flex flex-col bg-zinc-950 text-white relative overflow-hidden"
        >
            {/* HEADER */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 nodal-recessed shrink-0">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#002FA7]" />
                    <span className="font-mono text-[10px] tracking-widest text-zinc-300 uppercase">
                        SEND_PORTAL_ACCESS
                    </span>
                </div>
                <button onClick={handleClose} className="text-zinc-500 hover:text-white text-[10px] font-mono tracking-wider transition-colors">
                    [ ESC ]
                </button>
            </div>

            {/* ACCOUNT CONTEXT */}
            {accountName && (
                <div className="px-6 pt-4 shrink-0">
                    <div className="px-4 py-3 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/20">
                        <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">Account</p>
                        <p className="text-sm font-semibold text-white">{accountName}</p>
                    </div>
                </div>
            )}

            {/* INSTRUCTION */}
            <div className="px-6 pt-4 pb-2 shrink-0">
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest leading-relaxed">
                    Select contacts to grant portal access. Each contact will receive a secure invitation email to set up their login.
                </p>
            </div>

            {/* CONTACT LIST */}
            <div className="flex-1 overflow-y-auto px-6 pb-4 np-scroll">
                {isLoadingContacts ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                    </div>
                ) : contacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                        <AlertCircle className="w-6 h-6 text-zinc-700" />
                        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">No contacts found for this account.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {contactsWithEmail.length > 0 && (
                            <>
                                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest pt-2 pb-1">
                                    Contacts · {contactsWithEmail.length}
                                </p>
                                {contactsWithEmail.map(contact => {
                                    const isSelected = selected.has(contact.id)
                                    const isSent = sentIds.has(contact.id)
                                    return (
                                        <button
                                            key={contact.id}
                                            type="button"
                                            onClick={() => !isSent && toggle(contact.id)}
                                            disabled={isSent}
                                            className={cn(
                                                'w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3',
                                                isSent
                                                    ? 'bg-emerald-500/5 border-emerald-500/20 cursor-default'
                                                    : isSelected
                                                        ? 'bg-[#002FA7]/10 border-[#002FA7]/40'
                                                        : 'bg-zinc-900/40 border-white/5 hover:border-white/15 hover:bg-zinc-900/60'
                                            )}
                                        >
                                            {/* Checkbox / sent indicator */}
                                            <div className={cn(
                                                'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
                                                isSent
                                                    ? 'bg-emerald-500/20 border-emerald-500/50'
                                                    : isSelected
                                                        ? 'bg-[#002FA7] border-[#002FA7]'
                                                        : 'bg-transparent border-white/20'
                                            )}>
                                                {isSent
                                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                                    : isSelected
                                                        ? <Check className="w-2.5 h-2.5 text-white" />
                                                        : null
                                                }
                                            </div>

                                            {/* Avatar placeholder */}
                                            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/5 flex items-center justify-center shrink-0">
                                                <User className="w-3.5 h-3.5 text-zinc-500" />
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-zinc-200 truncate">
                                                    {displayName(contact)}
                                                </p>
                                                <p className="font-mono text-[9px] text-zinc-500 truncate">{contact.email}</p>
                                                {contact.title && (
                                                    <p className="font-mono text-[9px] text-zinc-600 truncate uppercase tracking-wider">{contact.title}</p>
                                                )}
                                            </div>

                                            {isSent && (
                                                <span className="font-mono text-[9px] text-emerald-400 uppercase tracking-wider shrink-0">Sent</span>
                                            )}
                                        </button>
                                    )
                                })}
                            </>
                        )}

                        {contactsNoEmail.length > 0 && (
                            <>
                                <p className="font-mono text-[9px] text-zinc-700 uppercase tracking-widest pt-4 pb-1">
                                    No email · {contactsNoEmail.length}
                                </p>
                                {contactsNoEmail.map(contact => (
                                    <div
                                        key={contact.id}
                                        className="w-full px-4 py-3 rounded-xl border border-white/5 bg-zinc-900/20 flex items-center gap-3 opacity-40"
                                    >
                                        <div className="w-4 h-4 rounded border border-white/10 shrink-0" />
                                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/5 flex items-center justify-center shrink-0">
                                            <User className="w-3.5 h-3.5 text-zinc-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-zinc-400 truncate">{displayName(contact)}</p>
                                            <p className="font-mono text-[9px] text-zinc-600">No email on file</p>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* SEND BUTTON */}
            <div className="px-6 pb-6 pt-4 border-t border-white/5 shrink-0">
                <button
                    onClick={handleSend}
                    disabled={selected.size === 0 || isSending}
                    className="w-full h-11 flex items-center justify-center gap-2 bg-white text-black font-mono text-xs font-bold tracking-[0.2em] uppercase rounded-xl hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                    {isSending ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            TRANSMITTING...
                        </>
                    ) : (
                        <>
                            <Send className="w-4 h-4" />
                            {selected.size > 0
                                ? `[ SEND_ACCESS · ${selected.size} ]`
                                : '[ SELECT_CONTACTS ]'
                            }
                        </>
                    )}
                </button>
                <p className="font-mono text-[9px] text-zinc-700 uppercase tracking-widest text-center mt-3">
                    Invitation includes secure link to set up portal password
                </p>
            </div>
        </motion.div>
    )
}
