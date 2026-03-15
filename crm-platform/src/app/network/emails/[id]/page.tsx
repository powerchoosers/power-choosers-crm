'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEmail, useMarkEmailAsRead } from '@/hooks/useEmail'
import { useEmailThread } from '@/hooks/useEmailThread'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Reply, ReplyAll, Forward, Trash2, MoreHorizontal, Printer, Star, Paperclip, Download, Loader2, Send, X, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, ImageIcon, ChevronDown, Eye, MousePointer2, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { playClick } from '@/lib/audio'
import { EmailContent } from '@/components/emails/EmailContent'
import { generateNodalSignature, generateForensicSignature } from '@/lib/signature'
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
import { useContactIdentityMapByIds } from '@/hooks/useContactIdentityMapByIds'
import { supabase } from '@/lib/supabase'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { EmailChipField } from '@/components/emails/EmailChipField'

type ComposerMode = 'reply' | 'reply_all' | 'forward'

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
  const [composerMode, setComposerMode] = useState<ComposerMode>('reply')
  const [composeTargetId, setComposeTargetId] = useState<string | null>(id || null)
  const [toChips, setToChips] = useState<string[]>([])
  const [ccChips, setCcChips] = useState<string[]>([])
  const [draftSubject, setDraftSubject] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [replyHtml, setReplyHtml] = useState('')
  const [replyEditor, setReplyEditor] = useState<Editor | null>(null)
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [replyAttachments, setReplyAttachments] = useState<File[]>([])
  const [previewAttachment, setPreviewAttachment] = useState<{ attachment: EmailAttachment; filename: string; url: string; mimeType?: string } | null>(null)
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [resolvedReplyAddress, setResolvedReplyAddress] = useState('')
  const [pendingFocusMessageId, setPendingFocusMessageId] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const markedAsReadRef = useRef<string | null>(null)
  const ownerEmail = user?.email?.toLowerCase() ?? 'guest'
  const senderPhotoUrl = profile?.hostedPhotoUrl || (user?.user_metadata?.avatar_url as string | undefined) || null
  // Which Zoho account should replies go out from?
  // For outbound emails, prefer email.from (the actual sending address, e.g. getnodalpoint.com)
  // over email.ownerId which is intentionally remapped to nodalpoint.io by the sequence sender.
  // For inbound emails, derive from ownerId (the inbox that received the message).
  // Falls back to the current auth user email.
  const isOutboundType = email?.type === 'sent' || email?.type === 'scheduled'
  const replyFromAccount = (
    isOutboundType
      ? (extractEmailAddress(email?.from || '') || email?.ownerId || user?.email || '')
      : (email?.ownerId || user?.email || '')
  ).toLowerCase()
  const isGetnodalAccount = replyFromAccount.includes('@getnodalpoint.com')
  // Signature rendered as a separate preview element (dark UI version) below the editor,
  // identical to how ComposeModal handles it — keeps inline styles intact.
  // The outgoing (light) version is appended in handleSend.
  const signatureForPreview = profile
    ? (isGetnodalAccount
        ? generateForensicSignature(profile, { senderEmail: replyFromAccount }, true)
        : generateNodalSignature(profile, user, true))
    : ''
  const threadKey = email?.threadId || email?.id
  const threadQueryKey = ['email-thread', threadKey ?? '', ownerEmail, role]
  const { data: threadEmails = [], isLoading: isThreadLoading } = useEmailThread(threadKey)
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(id || null)
  const initializedThreadRef = useRef<string | null>(null)

  useEffect(() => {
    initializedThreadRef.current = null
  }, [threadKey])

  useEffect(() => {
    if (!threadKey || threadEmails.length === 0) return
    if (initializedThreadRef.current === threadKey) return

    const openedEmailInThread = threadEmails.find((threadEmail: Email) => threadEmail.id === id)
    setExpandedThreadId(openedEmailInThread?.id || threadEmails[0].id)
    initializedThreadRef.current = threadKey
  }, [threadKey, threadEmails, id])

  useEffect(() => {
    if (!pendingFocusMessageId || threadEmails.length === 0) return
    const sentReply = threadEmails.find((threadEmail: Email) => threadEmail.id === pendingFocusMessageId)
    if (!sentReply) return
    setExpandedThreadId(sentReply.id)
    setPendingFocusMessageId(null)
  }, [pendingFocusMessageId, threadEmails])

  // #8: Keep compose target in sync when the user expands a different thread message
  // while the reply composer is already open. Updates addressing headers to match the
  // newly focused message but deliberately preserves whatever the user has already typed.
  useEffect(() => {
    if (!isReplyOpen || !expandedThreadId) return
    if (expandedThreadId === composeTargetId) return
    const expandedMessage = threadEmails.find((t: Email) => t.id === expandedThreadId)
    if (!expandedMessage) return
    const defaults = resolveReplyDefaults(composerMode, expandedMessage)
    setComposeTargetId(expandedMessage.id)
    setToChips(chipify(defaults.to))
    setCcChips(chipify(defaults.cc))
    setShowCc(Boolean(defaults.cc))
    setDraftSubject(defaults.subject)
    // replyHtml intentionally NOT reset — user's typed content is preserved
  }, [expandedThreadId, isReplyOpen]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Chrome's PDF viewer inside an iframe doesn't reliably fire onLoad.
  // Force the loading skeleton away after 2.5s as a fallback.
  useEffect(() => {
    if (!previewAttachment) return
    const t = setTimeout(() => setIframeLoaded(true), 2500)
    return () => clearTimeout(t)
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
          attachmentPath: attachment.attachmentPath,
          filename: attachment.filename || ''
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

  const openAttachmentPreview = async (attachment: EmailAttachment, message?: Email) => {
    if (!attachment.attachmentId || !attachment.messageId) {
      toast.info('This attachment cannot be previewed yet');
      return;
    }
    if (!user?.email) {
      toast.error('You must be logged in');
      return;
    }

    setIframeLoaded(false);
    setOpeningAttachment(attachment.attachmentId);

    try {
      const folderId = (message as any)?.metadata?.folderId ||
                       (message as any)?.metadata?.zohoFolder ||
                       (email as any)?.metadata?.folderId ||
                       '6109936000000008014';

      const params = new URLSearchParams({
        userEmail: user.email,
        messageId: attachment.messageId,
        attachmentId: attachment.attachmentId || '',
        attachmentPath: attachment.attachmentPath || '',
        folderId: String(folderId),
        filename: attachment.filename || ''
      });

      // Fetch bytes client-side and convert to a blob URL so the iframe can
      // render the PDF without Next.js proxy security headers blocking it.
      // This mirrors how DataIngestionCard uses Supabase signed URLs directly.
      const response = await fetch(`/api/email/attachment?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to fetch attachment (${response.status})`);

      const contentType = response.headers.get('Content-Type') || attachment.mimeType || 'application/octet-stream';
      const arrayBuffer = await response.arrayBuffer();
      const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: contentType }));

      setPreviewAttachment({
        attachment,
        filename: attachment.filename || 'attachment',
        url: blobUrl,
        mimeType: contentType
      });
    } catch (error) {
      console.error('Error opening attachment:', error);
      toast.error('Failed to open attachment');
    } finally {
      setOpeningAttachment(null);
    }
  };

  const closeAttachmentPreview = () => {
    setPreviewAttachment((prev: any) => {
      if (prev?.url && prev.url.startsWith('blob:')) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
    setIframeLoaded(false);
  };

  // Mark as read when the email is loaded — guarded by a ref so it fires at most once
  // per email ID even in React Strict Mode (which mounts effects twice in dev).
  useEffect(() => {
    if (email && email.unread && markedAsReadRef.current !== id) {
      markedAsReadRef.current = id
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
  const threadContactIds = Array.from(new Set(
    [email?.contactId, ...threadEmails.map((threadEmail: Email) => threadEmail.contactId)]
      .map((contactId: string | null | undefined) => String(contactId || '').trim())
      .filter(Boolean)
  ))
  const { data: contactById = {} } = useContactIdentityMapByIds(threadContactIds)
  const fromAddressKey = extractValidAddress(fromValue)
  const isOutboundEmail = email?.type === 'sent' || email?.type === 'scheduled'
  // For outbound emails contactId is the RECIPIENT's contact, not the sender's.
  // Using it for fromContact would label the recipient as the sender in the header.
  const fromContact = isOutboundEmail
    ? contactByEmail[fromAddressKey]
    : ((email?.contactId ? contactById[email.contactId] : undefined) || contactByEmail[fromAddressKey])
  const toResolved = toList.map((raw: string | null | undefined) => {
    const key = extractEmailAddress(String(raw || ''))
    return {
      raw: String(raw || ''),
      contact: contactByEmail[key],
      key,
    }
  })

  const agentName = profile?.firstName
    ? `${profile.firstName}${profile.lastName ? ' ' + profile.lastName : ''}`.trim()
    : null
  const displayFromName = fromContact?.displayName
    || (isOutboundEmail
      ? (agentName || email.fromName || null)
      : fromMailbox.name)
    || fromValue
  const displayFromAddress =
    extractValidAddress(isOutboundEmail ? fromValue : fromMailbox.address || fromValue)
    // Outbound: fall back to the owning inbox address when from-field is a display name only
    || (isOutboundEmail ? extractValidAddress(email?.ownerId || '') || null : null)
    // Inbound: fall back to the linked contact's stored email when from-field has no address
    || extractValidAddress(fromContact?.email || '')
    || null
  const currentUserEmail = (user?.email || '').toLowerCase().trim()
  // All email addresses that belong to this user across both connected accounts
  const ownedEmailAddresses = new Set([
    currentUserEmail,
    'l.patterson@getnodalpoint.com',
    'l.patterson@nodalpoint.io',
    ...(profile?.email ? [profile.email.toLowerCase()] : [])
  ].filter(Boolean))
  const normalizeRecipients = (value: string | string[] | null | undefined): string[] => {
    const values = Array.isArray(value) ? value : [value]
    return Array.from(new Set(
      values
        .flatMap((entry: any) => String(entry || '').split(','))
        .map((entry: string) => extractValidAddress(entry))
        .filter(Boolean)
    ))
  }
  const messageCcValues = (message: Email): string[] => {
    const ccRaw = (message as any)?.cc
      || (message as any)?.metadata?.cc
      || (message as any)?.metadata?.ccRecipients
      || []
    return normalizeRecipients(ccRaw)
  }
  const toRecipientsText = (values: string[]) => values.join(', ')
  const addPrefix = (subject: string | undefined, prefix: 'Re:' | 'Fwd:') => {
    const clean = String(subject || '').trim()
    if (!clean) return `${prefix} `
    return clean.toLowerCase().startsWith(prefix.toLowerCase()) ? clean : `${prefix} ${clean}`
  }
  const inferredCounterparty = threadEmails
    .flatMap((message: Email) => {
      const fromCandidate = extractValidAddress(message.from)
      const toCandidates = (Array.isArray(message.to) ? message.to : [message.to]).map((addr: string | null | undefined) => extractValidAddress(String(addr || '')))
      const replyToCandidate = extractValidAddress((message as any)?.metadata?.['reply-to'] || (message as any)?.metadata?.replyTo)
      
      // NEW: Look up contact email if raw sender address is missing or is just a name
      const contactCandidate = message.contactId ? extractValidAddress(contactById[message.contactId]?.email) : ''
      
      return [replyToCandidate, fromCandidate, contactCandidate, ...toCandidates]
    })
    .find((address: string) => Boolean(address) && !ownedEmailAddresses.has(address.toLowerCase())) || ''

  const resolveReplyDefaults = (mode: ComposerMode, message: Email) => {
    const rawReplyTo = (message as any)?.metadata?.['reply-to'] || (message as any)?.metadata?.replyTo
    
    // Primary resolution: metadata reply-to -> from string -> contact database -> metadata fromAddress
    const fromAddress = extractValidAddress(rawReplyTo || message.from)
      || (message.contactId ? extractValidAddress(contactById[message.contactId]?.email) : '')
      || extractValidAddress((message as any)?.metadata?.fromAddress)
    
    // Safety check: if fromAddress is us (either account), we need to look at who we sent it to
    const isFromUs = fromAddress && ownedEmailAddresses.has(fromAddress.toLowerCase())

    const toListForMessage = normalizeRecipients(message.to)
    const ccListForMessage = messageCcValues(message)
    const nonSelf = (address: string) => address && !ownedEmailAddresses.has(address.toLowerCase())
    const dedupe = (list: string[]) => Array.from(new Set(list.filter(nonSelf)))

    if (mode === 'forward') {
      return {
        to: '',
        cc: '',
        subject: addPrefix(message.subject, 'Fwd:')
      }
    }

    if (mode === 'reply_all') {
      const participantPool = dedupe([fromAddress, ...toListForMessage, ...ccListForMessage].filter(Boolean) as string[])
      const primaryTo = message.type === 'received' && !isFromUs
        ? (fromAddress && nonSelf(fromAddress) ? fromAddress : participantPool[0] || '')
        : (toListForMessage.find(nonSelf) || participantPool[0] || inferredCounterparty || '')
      const ccPool = dedupe([
        ...toListForMessage,
        ...ccListForMessage
      ].filter((address) => address !== primaryTo))
      return {
        to: primaryTo,
        cc: toRecipientsText(ccPool),
        subject: addPrefix(message.subject, 'Re:')
      }
    }

    const singleReplyTo = (message.type === 'received' && !isFromUs)
      ? (fromAddress || inferredCounterparty || resolvedReplyAddress || '')
      : (toListForMessage.find(nonSelf) || inferredCounterparty || resolvedReplyAddress || '')

    return {
      to: singleReplyTo,
      cc: '',
      subject: addPrefix(message.subject, 'Re:')
    }
  }

  useEffect(() => {
    // AbortController cancels the in-flight Supabase fetch itself, not just the state write.
    // This prevents stale results from a previous email winning a race against the current one
    // when the user navigates between emails quickly.
    const controller = new AbortController()

    const resolveReplyAddressFromContact = async () => {
      setResolvedReplyAddress('')

      if (!email || email.type !== 'received') return
      if (
        extractValidAddress(fromMailbox.address || fromValue)
        || extractValidAddress((email as any)?.metadata?.fromAddress)
        || extractValidAddress(fromContact?.email)
        || inferredCounterparty
      ) return

      const fromName = String(displayFromName || fromValue || '').trim()
      const ownerScope = (user?.email || '').toLowerCase().trim()
      if (!fromName) return

      const escapeLike = (value: string) => value.replace(/[%_]/g, (match) => `\\${match}`)

      // Build name variants to try: full name, then name without middle initials
      // e.g. "Juan B. Carranza" → also try "Juan Carranza"
      const nameWithoutMiddle = fromName.replace(/\s+[A-Z]\.?\s+/g, ' ').trim()
      const namesToTry = Array.from(new Set([fromName, nameWithoutMiddle].filter(Boolean)))

      const getCandidate = async (owned: boolean, name: string): Promise<string> => {
        if (controller.signal.aborted) return ''
        try {
          let query = supabase
            .from('contacts')
            .select('email')
            .ilike('name', `%${escapeLike(name)}%`)
            .limit(1)
            .abortSignal(controller.signal)

          if (owned && ownerScope) {
            query = query.eq('ownerId', ownerScope)
          } else if (!owned) {
            query = query.is('ownerId', null)
          }

          const { data } = await query.maybeSingle()
          return extractValidAddress(data?.email)
        } catch (err: any) {
          if (err?.name === 'AbortError' || controller.signal.aborted) return ''
          throw err
        }
      }

      let fallback = ''
      for (const name of namesToTry) {
        if (controller.signal.aborted) break
        const owned = await getCandidate(true, name)
        if (owned) { fallback = owned; break }
        if (controller.signal.aborted) break
        const shared = await getCandidate(false, name)
        if (shared) { fallback = shared; break }
      }

      if (!controller.signal.aborted && fallback) {
        setResolvedReplyAddress(fallback)
      }
    }

    resolveReplyAddressFromContact().catch((err: any) => {
      if (err?.name !== 'AbortError' && !controller.signal.aborted) {
        console.error('[resolveReplyAddress]', err)
      }
    })

    return () => {
      controller.abort()
    }
  }, [
    email,
    user?.email,
    fromValue,
    displayFromName,
    fromMailbox.address,
    fromContact?.email,
    inferredCounterparty
  ])

  // Backfill To chips if the composer opened before async address lookups resolved
  useEffect(() => {
    if (!isReplyOpen || composerMode === 'forward' || toChips.length > 0) return
    const candidate = resolvedReplyAddress || inferredCounterparty
    if (candidate) setToChips(chipify(candidate))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedReplyAddress, inferredCounterparty, isReplyOpen, composerMode, toChips.length])

  // Parse a comma-separated address string into chip array
  const chipify = (val: string | string[]) =>
    (Array.isArray(val) ? val : val.split(','))
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean)

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

  const getMessageBodyHtml = (message: Email) => (
    message?.html
      ? message.html
      : `<pre style="white-space: pre-wrap; margin: 0;">${escapeHtml(message?.text || message?.snippet || '')}</pre>`
  )

  const buildQuotedThread = (message: Email) => {
    const parsedFrom = parseMailbox(message.from || '')
    const author = message.fromName || parsedFrom.name || parsedFrom.address || message.from || 'Unknown'
    const quotedHeader = `<p style="margin: 0 0 8px 0; color: #71717a; font-size: 12px;">On ${format(new Date(message.date || Date.now()), 'PPpp')}, ${escapeHtml(String(author))} wrote:</p>`
    return `<blockquote style="margin: 12px 0 0 0; padding-left: 12px; border-left: 2px solid #3f3f46;">${quotedHeader}${getMessageBodyHtml(message)}</blockquote>`
  }

  const buildForwardedMessage = (message: Email) => {
    const parsedFrom = parseMailbox(message.from || '')
    const fromLine = parsedFrom.address || message.from || ''
    const toLine = toRecipientsText(normalizeRecipients(message.to))
    const ccLine = toRecipientsText(messageCcValues(message))
    const detailLines = [
      '<p style="margin: 16px 0 8px 0; color: #a1a1aa; font-size: 12px;">---------- Forwarded message ----------</p>',
      `<p style="margin: 0; color: #a1a1aa; font-size: 12px;"><strong>From:</strong> ${escapeHtml(fromLine)}</p>`,
      `<p style="margin: 0; color: #a1a1aa; font-size: 12px;"><strong>Date:</strong> ${escapeHtml(format(new Date(message.date || Date.now()), 'PPpp'))}</p>`,
      `<p style="margin: 0; color: #a1a1aa; font-size: 12px;"><strong>Subject:</strong> ${escapeHtml(message.subject || '(No Subject)')}</p>`,
      `<p style="margin: 0; color: #a1a1aa; font-size: 12px;"><strong>To:</strong> ${escapeHtml(toLine || '-')}</p>`
    ]
    if (ccLine) {
      detailLines.push(`<p style="margin: 0; color: #a1a1aa; font-size: 12px;"><strong>Cc:</strong> ${escapeHtml(ccLine)}</p>`)
    }
    return `${detailLines.join('')}<div style="margin-top: 12px;">${getMessageBodyHtml(message)}</div>`
  }

   const openComposerForMessage = (mode: ComposerMode, message?: Email) => {
    // 1. Target the passed message (from individual button, if any remain)
    // 2. Target the currently expanded message in the thread
    // 3. Fallback to the absolute latest message in the thread (threadEmails[0] is sorted desc)
    // 4. Final fallback to the root email object
    const target = message 
      || (expandedThreadId ? threadEmails.find((t: Email) => t.id === expandedThreadId) : null)
      || threadEmails[0] 
      || email

    if (!target) return
    const defaults = resolveReplyDefaults(mode, target)
    setComposerMode(mode)
    setComposeTargetId(target.id)
    setToChips(chipify(defaults.to))
    setCcChips(chipify(defaults.cc))
    setShowCc(Boolean(defaults.cc))
    setDraftSubject(defaults.subject)

    // Body starts empty — signature is rendered separately below the editor (see signatureForPreview)
    setReplyHtml('<p></p>')
    setReplyAttachments([])
    setIsReplyOpen(true)
  }

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

  const handleSend = async () => {
    const targetMessage = threadEmails.find((threadEmail: Email) => threadEmail.id === composeTargetId) || email
    if (!user?.email) {
      toast.error('You must be logged in to reply')
      return
    }
    if (!targetMessage) {
      toast.error('Could not find message context')
      return
    }

    const toRecipients = toChips
    const ccRecipients = showCc && ccChips.length ? ccChips : []
    if (toRecipients.length === 0) {
      toast.error('No valid reply address found')
      return
    }
    const noteText = stripHtml(replyHtml)
    if (composerMode !== 'forward' && !noteText) {
      toast.error('Reply message is empty')
      return
    }

    playClick()
    setIsSendingReply(true)
    try {
      const firstName = profile?.firstName || profile?.name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || 'Nodal Point'
      const fromName = `${firstName} • Nodal Point`
      const quoteText = stripHtml(targetMessage.text || targetMessage.snippet || '')

      // Handle signature transformation (Dark editor version -> Light outbound version)
      // getnodalpoint.com uses the compact forensic signature (cold-outreach / sequence style)
      // nodalpoint.io uses the full Nodal branded signature
      const outgoingSignature = profile
        ? (isGetnodalAccount
            ? generateForensicSignature(profile, { senderEmail: replyFromAccount })
            : generateNodalSignature(profile, user, false))
        : ''
      const signatureMarker = '<!-- NODAL_COMPOSE_SIGNATURE -->'
      
      let finalBodyHtml = replyHtml
      
      // If the signature is present in the editor content, swap it for the light version
      if (replyHtml.includes(signatureMarker)) {
        // Find the signature block and replace it
        // generateNodalSignature generates a table or div. We can use the marker to find it.
        // Actually, we can just find the first occurrence of the marker and replace from there.
        const parts = replyHtml.split(signatureMarker)
        // parts[0] is content before signature, parts[1] is content after (which should be empty or just closing tags if user didn't type after)
        // We'll replace the signature part with the light version.
        // Note: this is a simple string replace. If the user edited the signature, they might lose those edits 
        // if we replace the whole block, but it's better than sending dark colors to a light-mode client.
        finalBodyHtml = parts[0] + signatureMarker + outgoingSignature
      } else if (profile && composerMode !== 'forward') {
        // Both signatures carry their own margin-top + border-top — append directly
        finalBodyHtml = `${replyHtml}${outgoingSignature}`
      }

      const finalHtml = composerMode === 'forward'
        ? `${finalBodyHtml}${buildForwardedMessage(targetMessage)}`
        : `${finalBodyHtml}${buildQuotedThread(targetMessage)}`

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
        toast.warning(`Skipped attachment "${replyAttachments[idx]?.name}" — could not read file`)
        return []
      })

      const response = await fetch('/api/email/zoho-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toRecipients.join(', '),
          cc: ccRecipients.length ? ccRecipients.join(', ') : undefined,
          subject: draftSubject.trim(),
          content: finalHtml,
          plainTextContent: stripHtml(`${noteText}\n\n${quoteText}`),
          isHtmlEmail: true,
          userEmail: replyFromAccount || user.email,
          from: replyFromAccount || user.email,
          fromName,
          threadId: composerMode === 'forward' ? undefined : threadKey,
          attachments: encodedAttachments,
          // Signal to the backend that this page has already embedded the correct signature.
          // Prevents zoho-send.js from injecting a second one via its fallback path.
          hasSignature: true
        })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || err?.message || 'Failed to send reply')
      }

      const payload = await response.json().catch(() => ({}))
      if (payload?.trackingId) {
        setPendingFocusMessageId(String(payload.trackingId))
      }

      toast.success(composerMode === 'forward' ? 'Forward sent' : 'Reply sent')
      setReplyHtml('')
      setToChips([])
      setCcChips([])
      setDraftSubject('')
      setShowCc(false)
      setReplyAttachments([])
      setIsReplyOpen(false)
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['email', id] })
      queryClient.invalidateQueries({ queryKey: threadQueryKey })
    } catch (error: any) {
      toast.error(error?.message || `Failed to send ${composerMode === 'forward' ? 'forward' : 'reply'}`)
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
          <div className="flex items-start justify-between gap-6">
            <h1 className="text-3xl font-semibold text-white tracking-tighter leading-tight">{email.subject}</h1>
            <div className="flex-shrink-0 pt-1">
              {email.type === 'sent' && (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#002FA7]/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest font-semibold text-[#8ba6ff] border border-[#002FA7]/30 shadow-sm">
                  <ArrowUpRight className="w-3 h-3" />
                  Uplink_Out
                </span>
              )}
              {email.type === 'received' && (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest font-semibold text-emerald-400 border border-emerald-500/30 shadow-sm">
                  <ArrowDownLeft className="w-3 h-3" />
                  Uplink_In
                </span>
              )}
              {email.type === 'scheduled' && (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-amber-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest font-semibold text-amber-500 border border-amber-500/30 shadow-sm">
                  <Clock className="w-3 h-3" />
                  Scheduled
                </span>
              )}
              {email.type === 'draft' && (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-zinc-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest font-semibold text-zinc-400 border border-zinc-500/30 shadow-sm">
                  <Paperclip className="w-3 h-3" />
                  Draft
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {isOutboundEmail ? (
                senderPhotoUrl ? (
                  <img
                    src={senderPhotoUrl}
                    alt={agentName || 'You'}
                    className="w-12 h-12 rounded-[14px] object-cover block border border-white/10 flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-[14px] bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center text-[#8ba6ff] text-base font-bold flex-shrink-0">
                    {profile?.firstName?.[0] || ''}{profile?.lastName?.[0] || ''}
                  </div>
                )
              ) : fromContact ? (
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
                  logoUrl={
                    displayFromAddress?.toLowerCase().endsWith('@nodalpoint.io') ||
                    String(email?.from || '').toLowerCase().includes('@nodalpoint.io') ||
                    String(email?.from || '').toLowerCase().includes('nodal point')
                      ? '/images/nodalpoint-webicon.png'
                      : undefined
                  }
                  size={48}
                  roundedClassName="rounded-[14px]"
                />
              )}
              <div>
                <div className="flex items-baseline gap-2">
                    {!isOutboundEmail && fromContact ? (
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
                initial={{ opacity: 0, y: -12, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.28, ease: [0.19, 1, 0.22, 1] }}
                className="px-8 pt-6 pb-2 overflow-hidden"
                layout
              >
                <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                      {composerMode === 'reply'
                        ? 'Reply'
                        : composerMode === 'reply_all'
                          ? 'Reply all'
                          : 'Forward'}
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

                  <div className="px-4 py-3 border-b border-white/10 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500 w-8 flex-shrink-0">To</span>
                      <EmailChipField
                        chips={toChips}
                        onChange={setToChips}
                        placeholder={composerMode === 'forward' ? 'Recipient emails...' : 'Recipient email...'}
                      />
                      {!showCc && (
                        <button
                          type="button"
                          onClick={() => setShowCc(true)}
                          className="text-[10px] font-mono text-zinc-500 hover:text-[#002FA7] transition-colors px-2 py-1 rounded hover:bg-white/5 flex-shrink-0"
                        >
                          CC
                        </button>
                      )}
                    </div>
                    {showCc && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-500 w-8 flex-shrink-0">Cc</span>
                        <EmailChipField
                          chips={ccChips}
                          onChange={setCcChips}
                          placeholder="CC emails..."
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowCc(false)
                            setCcChips([])
                          }}
                          className="text-zinc-500 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                          title="Hide CC"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500 w-8">Sub</span>
                      <Input
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        placeholder="Subject"
                        className="h-8 bg-transparent border-0 border-b border-transparent hover:border-white/10 focus-visible:border-[#002FA7]/60 rounded-none px-0 text-sm focus-visible:ring-0"
                      />
                    </div>
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
                      placeholder={composerMode === 'forward' ? 'Add a note (optional)...' : 'Write your reply...'}
                      className="min-h-[140px]"
                      autoFocus
                    />

                    {/* Signature preview — rendered outside the editor to preserve full inline styling,
                        same pattern as ComposeModal. The light outbound version is appended in handleSend.
                        Both signatures use isDarkMode=true for this preview so colors stay on-theme. */}
                    {composerMode !== 'forward' && signatureForPreview && (
                      <div className="mt-4 opacity-90">
                        <div
                          className="rounded-lg overflow-hidden"
                          dangerouslySetInnerHTML={{ __html: signatureForPreview }}
                        />
                      </div>
                    )}


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
                    <Button onClick={handleSend} disabled={isSendingReply} className="bg-[#002FA7] text-white hover:bg-[#002FA7]/90 min-w-[130px] shadow-[0_0_15px_-5px_#002FA7]">
                      {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                      {composerMode === 'forward' ? 'Send Forward' : 'Send Reply'}
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
                    const threadIsOutbound = threadEmail.type === 'sent' || threadEmail.type === 'scheduled'
                    const openCount = threadEmail.openCount || 0
                    const clickCount = threadEmail.clickCount || 0
                    const fromKey = extractEmailAddress(threadEmail.from || '')
                    // For outbound messages contactId is the RECIPIENT — don't use it to
                    // resolve the sender's identity or the recipient ends up labeled as sender.
                    const fromContactEntry = threadIsOutbound
                      ? (fromKey ? contactByEmail[fromKey] : undefined)
                      : ((threadEmail.contactId ? contactById[threadEmail.contactId] : undefined) || (fromKey ? contactByEmail[fromKey] : undefined))
                    const parsedFrom = parseMailbox(threadEmail.from || '')
                    const displayName = threadIsOutbound
                      ? (agentName || 'You')
                      : (fromContactEntry?.displayName || threadEmail.fromName || parsedFrom.name || threadEmail.from || 'Unknown')
                    // Resolve recipient display for outbound cards (shown inline next to name)
                    const toRawList = Array.isArray(threadEmail.to)
                      ? threadEmail.to
                      : String(threadEmail.to || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                    const firstToAddr = extractEmailAddress(toRawList[0] || '')
                    const firstToContact = firstToAddr ? contactByEmail[firstToAddr] : undefined
                    const recipientLabel = firstToContact?.displayName || firstToAddr || toRawList[0] || ''
                    const recipientSuffix = toRawList.length > 1 ? ` +${toRawList.length - 1}` : ''
                    const inlineRecipient = recipientLabel ? `${recipientLabel}${recipientSuffix}` : ''
                    // For inbound keep the sender-address row (useful to see exact email)
                    const inboundSegment = threadIsOutbound ? '' : `From ${parsedFrom.address || threadEmail.from || ''}`
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
                            {threadIsOutbound ? (
                              senderPhotoUrl ? (
                                <img
                                  src={senderPhotoUrl}
                                  alt={profile?.name || 'You'}
                                  className="w-10 h-10 rounded-[14px] object-cover block border border-white/10"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-[14px] bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center text-[#8ba6ff] text-sm font-bold">
                                  {profile?.firstName?.[0] || ''}{profile?.lastName?.[0] || ''}
                                </div>
                              )
                            ) : fromContactEntry ? (
                              <ContactAvatar name={fromContactEntry.displayName} size={40} className="rounded-[14px]" />
                            ) : (
                              <CompanyIcon
                                name={displayName}
                                domain={(parsedFrom.address || threadEmail.from || '').includes('@') ? (parsedFrom.address || threadEmail.from || '').split('@')[1] : undefined}
                                logoUrl={
                                  (parsedFrom.address || threadEmail.from || '').toLowerCase().includes('@nodalpoint.io') ||
                                  (parsedFrom.address || threadEmail.from || '').toLowerCase().includes('nodal point')
                                    ? '/images/nodalpoint-webicon.png'
                                    : undefined
                                }
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
                                  <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-400 flex-shrink-0">
                                    Latest
                                  </span>
                                )}
                                {threadIsOutbound && inlineRecipient && (
                                  <span className="text-[10px] font-mono text-zinc-400 truncate flex-shrink-0">
                                    → {inlineRecipient}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {threadIsOutbound && (
                                  <div className="flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/40 px-2.5 py-1 shrink-0">
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
                                {threadIsOutbound ? 'Uplink_Out' : 'Uplink_In'}
                              </span>
                              {inboundSegment && (
                                <span className="text-xs text-zinc-400 truncate">{inboundSegment}</span>
                              )}
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
                                  initialLightMode={threadIsOutbound}
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
                                          onClick={() => openAttachmentPreview(attachment, threadEmail)}
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => openComposerForMessage('reply')}
              className="inline-flex items-center justify-center gap-2.5 bg-[#002FA7] text-white hover:bg-[#002FA7]/90 font-medium h-11 px-6 rounded-xl transition-all shadow-[0_0_20px_-5px_#002FA7] hover:shadow-[0_0_30px_-2px_#002FA7]/50 active:scale-[0.98]"
            >
              <Reply className="w-4 h-4" />
              Reply
            </button>
            <button
              onClick={() => openComposerForMessage('reply_all')}
              className="inline-flex items-center justify-center gap-2 nodal-glass hover:bg-white/5 text-zinc-200 font-medium h-11 px-5 rounded-xl transition-all active:scale-[0.98]"
            >
              <ReplyAll className="w-4 h-4" />
              Reply all
            </button>
            <button
              onClick={() => openComposerForMessage('forward')}
              className="inline-flex items-center justify-center gap-2 nodal-glass hover:bg-white/5 text-zinc-200 font-medium h-11 px-5 rounded-xl transition-all active:scale-[0.98]"
            >
              <Forward className="w-4 h-4" />
              Forward
            </button>
          </div>
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

                    {(() => {
                      const isImage = previewAttachment?.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewAttachment?.filename || '');
                      
                      if (isImage) {
                        return (
                          <div className="w-full h-full flex items-center justify-center p-4">
                            <img
                              src={previewAttachment.url}
                              alt={previewAttachment.filename}
                              className="max-w-full max-h-full object-contain"
                              onLoad={() => setIframeLoaded(true)}
                            />
                          </div>
                        );
                      }
                      
                      const isOffice = /\.(xlsx|xls|docx|doc|pptx|ppt)$/i.test(previewAttachment?.filename || '');
                      const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${previewAttachment?.url}` : '';
                      const iframeSrc = isOffice && fullUrl
                        ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fullUrl)}`
                        : `${previewAttachment?.url}#view=FitH`;

                      return (
                        <iframe
                          src={iframeSrc}
                          title={previewAttachment?.filename || 'Attachment Preview'}
                          className="w-full h-full border-0 absolute inset-0"
                          style={{ opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
                          onLoad={() => setTimeout(() => setIframeLoaded(true), 900)}
                        />
                      );
                    })()}
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
