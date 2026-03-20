'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Paperclip, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { RichTextEditor } from '@/components/emails/RichTextEditor'
import { EmailChipField } from '@/components/emails/EmailChipField'
import { generateNodalSignature, generateForensicSignature } from '@/lib/signature'
import { useAuth } from '@/context/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { playClick } from '@/lib/audio'
import type { Email } from '@/hooks/useEmails'
import type { Editor } from '@tiptap/react'

function extractEmailAddress(value: string): string {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const angle = raw.match(/<\s*([^>]+)\s*>/)
    const candidate = (angle?.[1] || raw).trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : ''
}

interface InlineReplyComposerProps {
    email: Email
    variant: 'default' | 'skinny'
    onClose: () => void
    onSent?: () => void
}

export function InlineReplyComposer({ email, variant, onClose, onSent }: InlineReplyComposerProps) {
    const { user, profile } = useAuth()
    const queryClient = useQueryClient()
    const isSkinny = variant === 'skinny'

    const [replyHtml, setReplyHtml] = useState('<p></p>')
    const [replyEditor, setReplyEditor] = useState<Editor | null>(null)
    const [isSending, setIsSending] = useState(false)
    const [toAddress, setToAddress] = useState('')
    const [replyAttachments, setReplyAttachments] = useState<File[]>([])

    // Resolve the reply-to address
    useEffect(() => {
        const resolveReplyTo = () => {
            // For received emails: reply to sender
            if (email.type === 'received') {
                const fromAddr = extractEmailAddress(email.from || '')
                if (fromAddr) return [fromAddr]
            }

            // For sent emails: reply to the recipient(s)
            const toList = Array.isArray(email.to) ? email.to : [email.to]
            const addresses = toList
                .map((addr: string | null | undefined) => extractEmailAddress(String(addr || '')))
                .filter(Boolean)
            if (addresses.length > 0) return addresses

            return []
        }
        const initialTo = resolveReplyTo()
        setToAddress(initialTo[0] || '')
    }, [email])

    // Determine which account to send from
    const isOutboundType = email.type === 'sent' || email.type === 'scheduled'
    const replyFromAccount = (
        isOutboundType
            ? (extractEmailAddress(email.from || '') || user?.email || '')
            : (email.ownerId || user?.email || '')
    ).toLowerCase()
    const isGetnodalAccount = replyFromAccount.includes('@getnodalpoint.com')

    // Signature for preview (dark mode)
    const signatureForPreview = profile
        ? (isGetnodalAccount
            ? generateForensicSignature(profile, { senderEmail: replyFromAccount }, true)
            : generateNodalSignature(profile, user, true))
        : ''

    const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const stripHtml = (value: string) => value
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const getMessageBodyHtml = (message: Email) => (
        message?.html
            ? message.html
            : `<pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(message?.text || message?.snippet || '')}</pre>`
    )

    const buildQuotedThread = (message: Email) => {
        const author = message.fromName || extractEmailAddress(message.from || '') || message.from || 'Unknown'
        const quotedHeader = `<p style="margin: 0 0 8px 0; color: #71717a; font-size: 12px;">On ${format(new Date(message.date || Date.now()), 'PPpp')}, ${escapeHtml(String(author))} wrote:</p>`
        return `<blockquote style="margin: 12px 0 0 0; padding-left: 12px; border-left: 2px solid #3f3f46;">${quotedHeader}${getMessageBodyHtml(message)}</blockquote>`
    }

    const handleSend = async () => {
        if (!user?.email) {
            toast.error('You must be logged in to reply')
            return
        }
        const targetTo = toAddress.trim()
        if (!targetTo) {
            toast.error('No valid reply address found')
            return
        }
        const noteText = stripHtml(replyHtml)
        if (!noteText) {
            toast.error('Reply message is empty')
            return
        }

        playClick()
        setIsSending(true)

        try {
            const firstName = profile?.firstName || profile?.name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || 'Nodal Point'
            const fromName = `${firstName} • Nodal Point`

            // Build outgoing signature (light mode for recipients)
            const outgoingSignature = profile
                ? (isGetnodalAccount
                    ? generateForensicSignature(profile, { senderEmail: replyFromAccount })
                    : generateNodalSignature(profile, user, false))
                : ''

            const signatureMarker = '<!-- NODAL_COMPOSE_SIGNATURE -->'
            let finalBodyHtml = replyHtml

            if (replyHtml.includes(signatureMarker)) {
                const parts = replyHtml.split(signatureMarker)
                finalBodyHtml = parts[0] + signatureMarker + outgoingSignature
            } else if (profile) {
                finalBodyHtml = `${replyHtml}${outgoingSignature}`
            }

            const finalHtml = `${finalBodyHtml}${buildQuotedThread(email)}`
            const quoteText = stripHtml(email.text || email.snippet || '')

            const subject = (email.subject || '').startsWith('Re:')
                ? email.subject
                : `Re: ${email.subject || ''}`

            // Encode attachments
            const encodedAttachments = (
                await Promise.allSettled(
                    replyAttachments.map(async (file: File) => {
                        const buffer = await file.arrayBuffer()
                        const bytes = new Uint8Array(buffer)
                        let binary = ''
                        bytes.forEach((b) => { binary += String.fromCharCode(b) })
                        return {
                            filename: file.name,
                            type: file.type || 'application/octet-stream',
                            size: file.size,
                            content: btoa(binary),
                        }
                    })
                )
            ).flatMap((result, idx) => {
                if (result.status === 'fulfilled') return [result.value]
                console.error(`Failed to encode attachment "${replyAttachments[idx]?.name}":`, result.reason)
                return []
            })

            const response = await fetch('/api/email/zoho-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: targetTo,
                    subject: subject?.trim(),
                    content: finalHtml,
                    plainTextContent: stripHtml(`${noteText}\n\n${quoteText}`),
                    isHtmlEmail: true,
                    userEmail: replyFromAccount || user.email,
                    from: replyFromAccount || user.email,
                    fromName,
                    threadId: email.threadId || email.id,
                    attachments: encodedAttachments,
                    contactId: email.contactId || null,
                    hasSignature: true
                })
            })

            if (!response.ok) {
                const err = await response.json().catch(() => null)
                throw new Error(err?.error || err?.message || 'Failed to send reply')
            }

            toast.success('Reply sent')
            setReplyHtml('')
            setToAddress('')
            setReplyAttachments([])

            // Invalidate related caches
            queryClient.invalidateQueries({ queryKey: ['emails'] })
            queryClient.invalidateQueries({ queryKey: ['emails-count'] })
            queryClient.invalidateQueries({ queryKey: ['entity-emails'] })
            setTimeout(() => {
                queryClient.refetchQueries({ queryKey: ['emails'] })
                queryClient.refetchQueries({ queryKey: ['entity-emails'] })
            }, 500)

            onSent?.()
            onClose()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to send reply'
            toast.error(message)
        } finally {
            setIsSending(false)
        }
    }

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
        >
            <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 pr-1">
                    <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 uppercase translate-y-[0.5px]">To:</span>
                    <input
                        type="email"
                        value={toAddress}
                        onChange={(e) => setToAddress(e.target.value)}
                        placeholder="Recipient email..."
                        className="flex-1 min-w-0 bg-transparent border-0 text-[11px] font-mono text-zinc-200 outline-none placeholder:text-zinc-600 py-1"
                    />
                    
                    <button
                        type="button"
                        onClick={onClose}
                        className="icon-button-forensic w-6 h-6 flex-shrink-0"
                        title="Close reply"
                    >
                        <X className="w-3.5 h-3.5 text-zinc-500 hover:text-white" />
                    </button>
                </div>

                {/* Formatting toolbar */}
                <div className="flex items-center gap-1 border-t border-b border-white/5 py-1.5">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleBold().run() }} className="icon-button-forensic w-6 h-6" title="Bold">
                        <Bold className="w-3 h-3" />
                    </button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleItalic().run() }} className="icon-button-forensic w-6 h-6" title="Italic">
                        <Italic className="w-3 h-3" />
                    </button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleUnderline().run() }} className="icon-button-forensic w-6 h-6" title="Underline">
                        <UnderlineIcon className="w-3 h-3" />
                    </button>
                    <div className="h-3 w-px bg-white/10 mx-0.5" />
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleBulletList().run() }} className="icon-button-forensic w-6 h-6" title="Bullet List">
                        <List className="w-3 h-3" />
                    </button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleOrderedList().run() }} className="icon-button-forensic w-6 h-6" title="Numbered List">
                        <ListOrdered className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault()
                            const input = document.createElement('input')
                            input.type = 'file'
                            input.multiple = true
                            input.onchange = () => {
                                const files = Array.from(input.files || [])
                                if (files.length === 0) return
                                setReplyAttachments((prev) => [...prev, ...files])
                            }
                            input.click()
                        }}
                        className="icon-button-forensic w-6 h-6"
                        title="Attach Files"
                    >
                        <Paperclip className="w-3 h-3" />
                    </button>
                </div>

                {/* Editor */}
                <div className={cn("min-h-[100px]", isSkinny ? "max-h-[200px]" : "max-h-[300px]", "overflow-y-auto np-scroll")}>
                    <RichTextEditor
                        content={replyHtml}
                        onChange={setReplyHtml}
                        onEditorReady={setReplyEditor}
                        placeholder="Write your reply..."
                        className="min-h-[80px] text-sm"
                        autoFocus
                    />

                    {/* Signature preview */}
                    {signatureForPreview && (
                        <div className="mt-2 opacity-80 scale-[0.85] origin-top-left">
                            <div
                                className="rounded-lg overflow-hidden"
                                dangerouslySetInnerHTML={{ __html: signatureForPreview }}
                            />
                        </div>
                    )}
                </div>

                {/* Attachments */}
                {replyAttachments.length > 0 && (
                    <div className="space-y-1">
                        {replyAttachments.map((file, idx) => (
                            <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                                <div className="min-w-0">
                                    <p className="text-[10px] text-zinc-200 truncate">{file.name}</p>
                                    <p className="text-[9px] text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setReplyAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                    className="icon-button-forensic w-5 h-5"
                                    title="Remove attachment"
                                >
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Send Transmission */}
                <div className="flex items-center pt-1 w-full">
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={isSending}
                        className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-mono uppercase tracking-wider text-white bg-[#002FA7] hover:bg-[#002FA7]/90 rounded-md shadow-[0_0_12px_-4px_#002FA7] transition-all duration-300 disabled:opacity-50"
                    >
                        {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {isSending ? 'Sending Intelligence...' : 'Send Transmission'}
                    </button>
                </div>
            </div>
        </motion.div>
    )
}
