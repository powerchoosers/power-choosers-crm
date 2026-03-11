'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEmail, useMarkEmailAsRead } from '@/hooks/useEmail'
import { useEmailThread } from '@/hooks/useEmailThread'
import { Button } from "@/components/ui/button"
import { ArrowLeft, Reply, Trash2, MoreHorizontal, Printer, Star, Paperclip, Download, Loader2, Send, X, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, ImageIcon, ChevronDown, Eye, MousePointer2 } from 'lucide-react'
import { format } from 'date-fns'
import { EmailContent } from '@/components/emails/EmailContent'
import { LoadingOrb } from '@/components/ui/LoadingOrb'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { RichTextEditor } from '@/components/emails/RichTextEditor'
import type { Editor } from '@tiptap/react'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import type { Email, EmailAttachment } from '@/hooks/useEmails'
import { useEmailIdentityMap, extractEmailAddress } from '@/hooks/useEmailIdentityMap'
import { supabase } from '@/lib/supabase'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { CompanyIcon } from '@/components/ui/CompanyIcon'

export default function EmailDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, profile, role } = useAuth()
  const id = params?.id as string
  const { data: email, isLoading } = useEmail(id)
  const { mutate: markAsRead } = useMarkEmailAsRead()
  const [isPrintRequested, setIsPrintRequested] = useState(false)
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null)
  const [isReplyOpen, setIsReplyOpen] = useState(false)
  const [replyHtml, setReplyHtml] = useState('')
  const [replyEditor, setReplyEditor] = useState<Editor | null>(null)
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [replyAttachments, setReplyAttachments] = useState<File[]>([])
  const [previewAttachment, setPreviewAttachment] = useState<{ attachment: EmailAttachment; filename: string; url: string; mimeType?: string } | null>(null)
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [resolvedReplyAddress, setResolvedReplyAddress] = useState('')
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const ownerEmail = user?.email?.toLowerCase() ?? 'guest'
  const threadKey = email?.threadId || email?.id
  const threadQueryKey = ['email-thread', threadKey ?? '', ownerEmail, role]
  const { data: threadEmails = [], isLoading: isThreadLoading } = useEmailThread(threadKey)
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null)

  useEffect(() => {
    setExpandedThreadId(null)
  }, [threadKey])

  useEffect(() => {
    if (threadEmails.length === 0) return
    setExpandedThreadId((prev) => prev ?? threadEmails[0].id)
  }, [threadEmails])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    return () => {
      if (previewAttachment?.url) {
        URL.revokeObjectURL(previewAttachment.url)
      }
    }
  }, [previewAttachment])

  useEffect(() => {
    if (!isReplyOpen) return
    const container = scrollContainerRef.current
    if (!container) return

    container.scrollTo({ top: 0, behavior: 'smooth' })
  }, [isReplyOpen])

  const handleDownloadAttachment = async (attachment: EmailAttachment) => {
    if (!attachment.attachmentId || !attachment.messageId) {
      toast.info('This attachment cannot be downloaded yet')
      return
    }

    setDownloadingAttachment(attachment.attachmentId)
    try {
      if (!user?.email) {
        throw new Error('You must be logged in')
      }

      const response = await fetch('/api/email/attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: user.email,
          messageId: attachment.messageId,
          attachmentId: attachment.attachmentId,
          attachmentPath: attachment.attachmentPath
        })
      })

      if (!response.ok) {
        throw new Error('Failed to download attachment')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.filename || 'attachment'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading attachment:', error)
      toast.error('Failed to download attachment')
    } finally {
      setDownloadingAttachment(null)
    }
  }

  const openAttachmentPreview = async (attachment: EmailAttachment) => {
    if (!attachment.attachmentId || !attachment.messageId) {
      toast.info('This attachment cannot be previewed yet')
      return
    }
    if (!user?.email) {
      toast.error('You must be logged in')
      return
    }

    setIframeLoaded(false)
    setOpeningAttachment(attachment.attachmentId)
    try {
      const response = await fetch('/api/email/attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: user.email,
          messageId: attachment.messageId,
          attachmentId: attachment.attachmentId,
          attachmentPath: attachment.attachmentPath
        })
      })

      if (!response.ok) {
        throw new Error('Failed to open attachment')
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)

      setPreviewAttachment((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url)
        return {
          attachment,
          filename: attachment.filename || 'attachment',
          url: objectUrl,
          mimeType: attachment.mimeType || blob.type || 'application/octet-stream'
        }
      })
    } catch (error) {
      console.error('Error opening attachment:', error)
      toast.error('Failed to open attachment')
    } finally {
      setOpeningAttachment(null)
    }
  }

  const closeAttachmentPreview = () => {
    setPreviewAttachment((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return null
    })
    setIframeLoaded(false)
  }

  // Mark as read when the email is loaded
  useEffect(() => {
    if (email && email.unread) {
      markAsRead(id)
    }
  }, [email, id, markAsRead])

  const handleBack = () => {
    router.back()
  }

  const handlePrint = () => {
    setIsPrintRequested(true)
    // Reset after a short delay
    setTimeout(() => setIsPrintRequested(false), 100)
  }

  const parseMailbox = (value: string) => {
    const v = String(value || '').trim()
    const angleMatch = v.match(/^(.*)<\s*([^>]+)\s*>\s*$/)
    if (angleMatch) {
      const name = angleMatch[1].trim().replace(/^"|"$/g, '')
      const address = angleMatch[2].trim()
      return { name: name || null, address: address || null }
    }
    return { name: null, address: v || null }
  }

  const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  const extractValidAddress = (value: string | null | undefined) => {
    const extracted = extractEmailAddress(String(value || ''))
    return isLikelyEmail(extracted) ? extracted : ''
  }

  const fromValue = email?.from || ''
  const toList = email ? (Array.isArray(email.to) ? email.to : [email.to]) : []
  const fromMailbox = parseMailbox(fromValue)
  const threadAddressPool: Array<string | null | undefined> = threadEmails.length
    ? threadEmails.flatMap((message: { from?: string | null; to?: string | string[] | null }) => {
        const toCollection = Array.isArray(message.to) ? message.to : [message.to]
        return [message.from, ...toCollection]
      })
    : [fromValue, ...toList]
  const identityAddresses: string[] = Array.from(
    new Set(
      threadAddressPool
        .map((addr: string | null | undefined) => extractValidAddress(String(addr || '')))
        .filter((address: string): boolean => Boolean(address))
    )
  )
  const { data: contactByEmail = {} } = useEmailIdentityMap(identityAddresses)
  const fromAddressKey = extractValidAddress(fromValue)
  const fromContact = contactByEmail[fromAddressKey]
  const toResolved = toList.map((raw) => {
    const key = extractEmailAddress(String(raw || ''))
    return {
      raw: String(raw || ''),
      contact: contactByEmail[key],
      key,
    }
  })

  const displayFromName = fromContact?.displayName || (email?.type === 'sent' ? (email.fromName || null) : fromMailbox.name) || fromValue
  const displayFromAddress = extractValidAddress(email?.type === 'sent' ? fromValue : fromMailbox.address || fromValue) || null
  const currentUserEmail = (user?.email || '').toLowerCase().trim()
  const inferredCounterparty = threadEmails
    .flatMap((message: Email) => {
      const fromCandidate = extractValidAddress(message.from)
      const toCandidates = (Array.isArray(message.to) ? message.to : [message.to]).map((addr) => extractValidAddress(String(addr || '')))
      return [fromCandidate, ...toCandidates]
    })
    .find((address: string) => Boolean(address) && address !== currentUserEmail) || ''

  const replyFromAddress = extractValidAddress(fromMailbox.address || fromValue)
  const replyFromMetadata = extractValidAddress((email as any)?.metadata?.fromAddress)
  const replyFromContact = extractValidAddress(fromContact?.email)
  const firstToAddress = extractValidAddress(String(toList[0] || ''))
  const replyToAddress = email?.type === 'received'
    ? (replyFromAddress || replyFromMetadata || replyFromContact || inferredCounterparty || resolvedReplyAddress || '')
    : (firstToAddress || inferredCounterparty || resolvedReplyAddress || '')
  const replySubject = email?.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email?.subject || ''}`

  useEffect(() => {
    let cancelled = false

    const resolveReplyAddressFromContact = async () => {
      setResolvedReplyAddress('')

      if (!email || email.type !== 'received') return
      if (replyFromAddress || replyFromMetadata || replyFromContact || inferredCounterparty) return

      const fromName = String(displayFromName || fromValue || '').trim()
      const ownerScope = (user?.email || '').toLowerCase().trim()
      if (!fromName) return

      const escapeLike = (value: string) => value.replace(/[%_]/g, (match) => `\\${match}`)
      const nameLike = `%${escapeLike(fromName)}%`

      const getCandidate = async (owned: boolean) => {
        let query = supabase
          .from('contacts')
          .select('email')
          .ilike('name', nameLike)
          .limit(1)

        if (owned && ownerScope) {
          query = query.eq('ownerId', ownerScope)
        } else if (!owned) {
          query = query.is('ownerId', null)
        }

        const { data } = await query.maybeSingle()
        return extractValidAddress(data?.email)
      }

      const ownedCandidate = await getCandidate(true)
      const sharedCandidate = ownedCandidate ? '' : await getCandidate(false)
      const fallback = ownedCandidate || sharedCandidate

      if (!cancelled && fallback) {
        setResolvedReplyAddress(fallback)
      }
    }

    resolveReplyAddressFromContact()
    return () => {
      cancelled = true
    }
  }, [
    email,
    user?.email,
    fromValue,
    displayFromName,
    replyFromAddress,
    replyFromMetadata,
    replyFromContact,
    inferredCounterparty
  ])

  const stripHtml = (value: string) => value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const quotedBody = email?.html
    ? email.html
    : `<pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(email?.text || email?.snippet || '')}</pre>`

  const quotedHeader = `<p style="margin: 0 0 8px 0; color: #71717a; font-size: 12px;">On ${email ? format(new Date(email.date), 'PPpp') : ''}, ${escapeHtml(String(displayFromName))} wrote:</p>`
  const quotedThread = `<blockquote style="margin: 12px 0 0 0; padding-left: 12px; border-left: 2px solid #3f3f46;">${quotedHeader}${quotedBody}</blockquote>`

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4">
        <LoadingOrb label="Loading email..." />
      </div>
    )
  }

  if (!email) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4">
        <p className="text-zinc-500">Email not found</p>
        <Button onClick={handleBack} variant="outline">Go Back</Button>
      </div>
    )
  }

  const handleReply = async () => {
    if (!user?.email) {
      toast.error('You must be logged in to reply')
      return
    }
    if (!replyToAddress) {
      toast.error('No valid reply address found')
      return
    }
    if (!stripHtml(replyHtml)) {
      toast.error('Reply message is empty')
      return
    }

    setIsSendingReply(true)
    try {
      const firstName = profile?.firstName || profile?.name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || 'Nodal Point'
      const fromName = `${firstName} • Nodal Point`
      const finalHtml = `${replyHtml}${quotedThread}`

      const encodedAttachments = await Promise.all(
        replyAttachments.map(async (file) => {
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

      const response = await fetch('/api/email/zoho-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: replyToAddress,
          subject: replySubject,
          content: finalHtml,
          plainTextContent: stripHtml(`${replyHtml}\n\n${stripHtml(email.text || email.snippet || '')}`),
          isHtmlEmail: true,
          userEmail: user.email,
          from: user.email,
          fromName,
          threadId: threadKey,
          attachments: encodedAttachments
        })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || err?.message || 'Failed to send reply')
      }

      toast.success('Reply sent')
      setReplyHtml('')
      setReplyAttachments([])
      setIsReplyOpen(false)
      setExpandedThreadId(null)
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['email', id] })
      queryClient.invalidateQueries({ queryKey: threadQueryKey })
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send reply')
    } finally {
      setIsSendingReply(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Actions */}
      <div className="flex items-center justify-between nodal-glass p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <button onClick={handleBack} className="icon-button-forensic w-9 h-9">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-white/10 mx-2" />
          <button className="icon-button-forensic w-9 h-9">
            <Trash2 className="w-4 h-4" />
          </button>
          <button className="icon-button-forensic w-9 h-9">
            <Star className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="icon-button-forensic w-9 h-9">
            <Printer className="w-4 h-4" />
          </button>
          <button className="icon-button-forensic w-9 h-9">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden flex flex-col relative shadow-2xl">
        <div className="flex-none p-8 border-b border-white/5 space-y-6 nodal-module-glass">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold text-white tracking-tighter leading-tight">{email.subject}</h1>
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-black/40 px-2 py-1 text-xs font-medium text-zinc-400 ring-1 ring-inset ring-white/10">
                    {email.type === 'sent' ? 'Sent' : 'Inbox'}
                </span>
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {fromContact ? (
                <ContactAvatar
                  name={fromContact.displayName}
                  photoUrl={fromContact.avatarUrl}
                  size={48}
                  className="rounded-[14px]"
                />
              ) : (
                <CompanyIcon
                  name={displayFromName}
                  domain={displayFromAddress?.includes('@') ? displayFromAddress.split('@')[1] : undefined}
                  size={48}
                  roundedClassName="rounded-[14px]"
                />
              )}
              <div>
                <div className="flex items-baseline gap-2">
                    {fromContact ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/network/contacts/${fromContact.id}`)}
                        className="font-medium text-white text-lg hover:text-[#8ba6ff] underline-offset-4 hover:underline transition-all hover:scale-[1.01] origin-left"
                        title={`Open ${fromContact.displayName} dossier`}
                      >
                        {displayFromName}
                      </button>
                    ) : (
                      <span className="font-medium text-white text-lg">{displayFromName}</span>
                    )}
                    {displayFromAddress ? (
                      <span className="text-sm text-zinc-500">&lt;{displayFromAddress}&gt;</span>
                    ) : null}
                </div>
                <div className="text-sm text-zinc-300">
                  To:{' '}
                  <span className="text-white font-medium">
                    {toResolved.map((entry, idx) => (
                      entry.contact ? (
                        <button
                          key={`${entry.key}-${idx}`}
                          type="button"
                          onClick={() => router.push(`/network/contacts/${entry.contact!.id}`)}
                          className="hover:text-[#8ba6ff] underline-offset-4 hover:underline transition-all hover:scale-[1.01] origin-left"
                          title={`Open ${entry.contact.displayName} dossier`}
                        >
                          {entry.contact.displayName}{idx < toResolved.length - 1 ? ', ' : ''}
                        </button>
                      ) : (
                        <span key={`${entry.raw}-${idx}`}>{entry.raw}{idx < toResolved.length - 1 ? ', ' : ''}</span>
                      )
                    ))}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-zinc-300">
                {format(new Date(email.date), 'MMM d, yyyy, h:mm a')}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {format(new Date(email.date), 'PP')}
              </div>
            </div>
          </div>
        </div>

        <motion.div
          ref={scrollContainerRef}
          layout
          transition={{ type: 'spring', stiffness: 220, damping: 28 }}
          className="flex-1 overflow-y-auto bg-white/0 np-scroll"
        >
          <AnimatePresence initial={false}>
            {isReplyOpen && (
              <motion.div
                key="reply-box"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.28, ease: [0.19, 1, 0.22, 1] }}
                className="px-8 pt-6 pb-2"
                layout
              >
                <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                      Replying to <span className="text-zinc-200 normal-case tracking-normal font-sans">{replyToAddress}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsReplyOpen(false)}
                      className="icon-button-forensic w-8 h-8"
                      title="Close reply"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="px-4 py-2 border-b border-white/10 flex flex-wrap items-center gap-1.5">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleBold().run() }} className="icon-button-forensic w-8 h-8" title="Bold">
                      <Bold className="w-4 h-4" />
                    </button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleItalic().run() }} className="icon-button-forensic w-8 h-8" title="Italic">
                      <Italic className="w-4 h-4" />
                    </button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleUnderline().run() }} className="icon-button-forensic w-8 h-8" title="Underline">
                      <UnderlineIcon className="w-4 h-4" />
                    </button>
                    <div className="h-4 w-px bg-white/10 mx-1" />
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleBulletList().run() }} className="icon-button-forensic w-8 h-8" title="Bullet List">
                      <List className="w-4 h-4" />
                    </button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); replyEditor?.chain().focus().toggleOrderedList().run() }} className="icon-button-forensic w-8 h-8" title="Numbered List">
                      <ListOrdered className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.onchange = async () => {
                          const file = input.files?.[0]
                          if (!file || !replyEditor) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            replyEditor.chain().focus().setImage({ src: reader.result as string }).run()
                          }
                          reader.readAsDataURL(file)
                        }
                        input.click()
                      }}
                      className="icon-button-forensic w-8 h-8"
                      title="Insert Image"
                    >
                      <ImageIcon className="w-4 h-4" />
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
                      className="icon-button-forensic w-8 h-8"
                      title="Attach Files"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 min-h-[180px]">
                    <RichTextEditor
                      content={replyHtml}
                      onChange={setReplyHtml}
                      onEditorReady={setReplyEditor}
                      placeholder="Write your reply..."
                      className="min-h-[140px]"
                      autoFocus
                    />
                    {replyAttachments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {replyAttachments.map((file, idx) => (
                          <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs text-zinc-200 truncate">{file.name}</p>
                              <p className="text-[10px] text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReplyAttachments((prev) => prev.filter((_, i) => i !== idx))}
                              className="icon-button-forensic w-7 h-7"
                              title="Remove attachment"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                    <Button variant="ghost" onClick={() => setIsReplyOpen(false)} className="text-zinc-400 hover:text-white hover:bg-white/5">
                      Cancel
                    </Button>
                    <Button onClick={handleReply} disabled={isSendingReply} className="bg-white text-zinc-950 hover:bg-zinc-200 min-w-[110px]">
                      {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                      Send Reply
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            className="px-8 pt-6 pb-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-mono uppercase tracking-[0.5em] text-zinc-500">Conversation</h2>
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-400">
                {threadEmails.length} {threadEmails.length === 1 ? 'message' : 'messages'}
              </span>
            </div>

            {isThreadLoading ? (
              <div className="text-center text-xs font-mono text-zinc-500 py-6">
                Loading conversation...
              </div>
            ) : threadEmails.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-zinc-950/30 px-6 py-10 text-center">
                <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-500">Conversation unavailable</p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {threadEmails.map((threadEmail: Email, index: number) => {
                    const isExpanded = expandedThreadId === threadEmail.id
                    const openCount = threadEmail.openCount || 0
                    const clickCount = threadEmail.clickCount || 0
                    const fromKey = extractEmailAddress(threadEmail.from || '')
                    const fromContactEntry = fromKey ? contactByEmail[fromKey] : undefined
                    const parsedFrom = parseMailbox(threadEmail.from || '')
                    const displayName = fromContactEntry?.displayName || (threadEmail.type === 'sent'
                      ? (profile?.firstName ? `${profile.firstName} • You` : 'You')
                      : threadEmail.fromName || parsedFrom.name || threadEmail.from || 'Unknown')
                    const displaySegment = threadEmail.type === 'sent'
                      ? `To ${Array.isArray(threadEmail.to) ? threadEmail.to.join(', ') : threadEmail.to}`
                      : `From ${parsedFrom.address || threadEmail.from}`
                    const snippet = threadEmail.snippet || (threadEmail.text || '').slice(0, 140)
                    const isLatest = index === 0

                    return (
                      <motion.article
                        key={threadEmail.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className={cn(
                          "group rounded-2xl border transition-all duration-300 overflow-hidden",
                          isExpanded ? "bg-zinc-950/90 border-white/10 shadow-2xl" : "bg-zinc-950/40 border-white/5 hover:bg-zinc-950/80 hover:border-white/10"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedThreadId((prev) => (prev === threadEmail.id ? null : threadEmail.id))}
                          className="w-full text-left p-4 flex items-start gap-3 focus:outline-none"
                        >
                          <div className="flex-shrink-0">
                            {fromContactEntry ? (
                              <ContactAvatar name={fromContactEntry.displayName} size={40} className="rounded-[14px]" />
                            ) : (
                              <CompanyIcon
                                name={displayName}
                                domain={(parsedFrom.address || threadEmail.from || '').includes('@') ? (parsedFrom.address || threadEmail.from || '').split('@')[1] : undefined}
                                size={40}
                                roundedClassName="rounded-[14px]"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={cn("font-semibold text-sm truncate", isExpanded ? "text-white" : "text-zinc-200")}>
                                  {displayName}
                                </span>
                                {isLatest && (
                                  <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-400">
                                    Latest
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {threadEmail.type === 'sent' && (
                                  <div className="flex items-center gap-3 bg-white/5 rounded px-2 py-1 border border-white/5">
                                    <div className="flex items-center gap-1">
                                      <Eye
                                        size={12}
                                        className={cn(openCount > 0 ? "text-emerald-400" : "text-zinc-600")}
                                      />
                                      <span className={cn(
                                        "text-[10px] font-mono tabular-nums",
                                        openCount > 2 ? "text-white" : openCount > 0 ? "text-emerald-400" : "text-zinc-600"
                                      )}>
                                        {openCount}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <MousePointer2
                                        size={12}
                                        className={cn(clickCount > 0 ? "text-[#002FA7]" : "text-zinc-600")}
                                      />
                                      <span className={cn(
                                        "text-[10px] font-mono tabular-nums",
                                        clickCount > 0 ? "text-[#002FA7]" : "text-zinc-600"
                                      )}>
                                        {clickCount}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.3em]">
                                  {format(new Date(threadEmail.date || Date.now()), 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-500">
                                {threadEmail.type === 'sent' ? 'Outbound' : 'Inbox'}
                              </span>
                              <span className="text-xs text-zinc-400 truncate">{displaySegment}</span>
                            </div>
                            {!isExpanded && snippet && (
                              <p className="text-sm text-zinc-400 line-clamp-3">
                                {snippet}
                              </p>
                            )}
                          </div>
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2, ease: [0.19, 1, 0.22, 1] }}
                            className="flex items-center justify-center"
                          >
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          </motion.span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              key="thread-content"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                              className="overflow-hidden border-t border-white/5"
                            >
                              <div className="bg-zinc-900/80 p-4 space-y-4">
                                <EmailContent
                                  html={threadEmail.html}
                                  text={threadEmail.text}
                                  subject={threadEmail.subject}
                                  initialLightMode={threadEmail.type === 'sent'}
                                  className="rounded-2xl border border-white/10"
                                />
                                {threadEmail.attachments && threadEmail.attachments.length > 0 && (
                                  <div className="px-4 py-3 border border-white/5 rounded-xl bg-black/30 space-y-3">
                                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-400">
                                      <Paperclip className="w-3 h-3" />
                                      <span>Attachments ({threadEmail.attachments.length})</span>
                                    </div>
                                    <div className="space-y-2">
                                      {threadEmail.attachments.map((attachment: EmailAttachment, idx: number) => (
                                        <div
                                          key={`${attachment.filename}-${idx}`}
                                          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-white/10 bg-black/20 hover:bg-black/30 transition-colors group cursor-pointer"
                                          onClick={() => openAttachmentPreview(attachment)}
                                        >
                                          <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-10 h-10 rounded-xl nodal-glass flex items-center justify-center border border-white/10 flex-shrink-0">
                                              {openingAttachment === attachment.attachmentId ? (
                                                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                                              ) : (
                                                <Paperclip className="w-4 h-4 text-zinc-400" />
                                              )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="text-sm font-medium text-zinc-200 truncate">{attachment.filename}</p>
                                              <p className="text-[10px] text-zinc-500">
                                                {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : 'Unknown size'}
                                              </p>
                                            </div>
                                          </div>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(attachment) }}
                                            disabled={!!attachment.downloadUnavailable || !attachment.attachmentId || !attachment.messageId || downloadingAttachment === attachment.attachmentId}
                                            className="icon-button-forensic h-9 px-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider"
                                          >
                                            {downloadingAttachment === attachment.attachmentId ? (
                                              <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                              <Download className="w-4 h-4" />
                                            )}
                                            Download
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.article>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </motion.div>

        <div className="p-4 border-t border-white/5 nodal-recessed">
            <button 
          onClick={() => setIsReplyOpen(true)}
          className="inline-flex items-center justify-center gap-2.5 bg-white text-zinc-950 hover:bg-zinc-200 font-medium h-11 px-5 rounded-xl transition-all shadow-[0_0_30px_-5px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.4)]"
          title="Reply to Email"
        >
          <Reply className="w-4 h-4" />
          Reply
        </button>
        </div>
      </div>

      {isMounted && createPortal(
        <AnimatePresence>
          {!!previewAttachment && (
            <>
              <motion.div
                key="preview-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md"
                onClick={closeAttachmentPreview}
              />
              <motion.div
                key="preview-panel"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
              >
                <div
                  className="w-[78vw] h-[92vh] bg-zinc-950 border border-white/10 shadow-2xl flex flex-col overflow-hidden rounded-2xl pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-zinc-900/50 shrink-0">
                    <h2 className="text-zinc-200 font-mono text-sm uppercase tracking-widest truncate flex-1 min-w-0 pr-4">
                      {previewAttachment?.filename}
                    </h2>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => previewAttachment?.attachment && handleDownloadAttachment(previewAttachment.attachment)}
                        disabled={!previewAttachment?.attachment || downloadingAttachment === previewAttachment?.attachment?.attachmentId}
                        className="flex items-center gap-2 px-4 py-1.5 bg-[#002FA7]/20 border border-[#002FA7]/40 text-white rounded-md text-xs font-mono uppercase tracking-widest hover:bg-[#002FA7]/30 transition-colors shadow-[0_0_15px_-5px_#002FA7] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloadingAttachment === previewAttachment?.attachment?.attachmentId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        Download
                      </button>
                      <button
                        onClick={closeAttachmentPreview}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 bg-zinc-900 relative overflow-hidden">
                    {!iframeLoaded && (
                      <div className="absolute inset-0 z-10 flex flex-col bg-zinc-900 gap-3 p-8">
                        <div className="w-1/2 h-4 bg-zinc-800 rounded animate-pulse mx-auto" />
                        <div className="w-full h-3 bg-zinc-800/60 rounded animate-pulse mt-4" />
                        <div className="w-full h-3 bg-zinc-800/60 rounded animate-pulse" />
                        <div className="w-4/5 h-3 bg-zinc-800/60 rounded animate-pulse" />
                        <div className="w-full h-3 bg-zinc-800/60 rounded animate-pulse mt-2" />
                        <div className="w-full h-3 bg-zinc-800/60 rounded animate-pulse" />
                        <div className="w-3/4 h-3 bg-zinc-800/60 rounded animate-pulse" />
                        <div className="mt-4 text-[10px] font-mono text-zinc-600 uppercase tracking-widest text-center animate-pulse">
                          Loading document...
                        </div>
                      </div>
                    )}

                    {previewAttachment?.mimeType?.startsWith('image/') ? (
                      <div className="w-full h-full flex items-center justify-center p-4">
                        <img
                          src={previewAttachment.url}
                          alt={previewAttachment.filename}
                          className="max-w-full max-h-full object-contain"
                          onLoad={() => setIframeLoaded(true)}
                        />
                      </div>
                    ) : (
                      <iframe
                        src={`${previewAttachment?.url}#view=FitH`}
                        title={previewAttachment?.filename || 'Attachment Preview'}
                        className="w-full h-full border-0 absolute inset-0"
                        style={{ opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
                        onLoad={() => setTimeout(() => setIframeLoaded(true), 900)}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
