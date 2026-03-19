'use client'

import { useEffect } from 'react'
import { ComposeModal, type ComposeContext } from '@/components/emails/ComposeModal'
import { useComposeStore } from '@/store/composeStore'
import { supabase } from '@/lib/supabase'
import { buildForensicNoteEntries, formatForensicNoteClipboard } from '@/lib/forensic-notes'

type ContactRow = {
  id: string
  name?: string | null
  title?: string | null
  email?: string | null
  notes?: string | null
  company?: string | null
  accountId?: string | null
  accounts?: {
    id?: string | null
    name?: string | null
    industry?: string | null
    description?: string | null
  } | {
    id?: string | null
    name?: string | null
    industry?: string | null
    description?: string | null
  }[] | null
}

function extractPrimaryEmail(raw: string): string {
  const first = String(raw || '').split(',')[0] || ''
  const trimmed = first.trim()
  const match = trimmed.match(/<([^>]+)>/)
  return (match?.[1] || trimmed).trim().toLowerCase()
}

export function GlobalComposeModal() {
  const isOpen = useComposeStore((s) => s.isOpen)
  const to = useComposeStore((s) => s.to)
  const subject = useComposeStore((s) => s.subject)
  const context = useComposeStore((s) => s.context)
  const closeCompose = useComposeStore((s) => s.closeCompose)
  const setComposeContext = useComposeStore((s) => s.setComposeContext)

  useEffect(() => {
    if (!isOpen) return

    const email = extractPrimaryEmail(to)
    if (!email) return
    if (context?.contactId || context?.accountId) return

    let cancelled = false

    const hydrateContextFromEmail = async () => {
      try {
        const { data: contactData, error } = await supabase
          .from('contacts')
          .select(`
            id,
            name,
            title,
            email,
            notes,
            company,
            accountId,
            accounts (
              id,
              name,
              industry,
              description
            )
          `)
          .ilike('email', email)
          .limit(1)
          .maybeSingle()

        if (error || !contactData || cancelled) return

        const contact = contactData as ContactRow
        const account = Array.isArray(contact.accounts) ? contact.accounts[0] : contact.accounts
        const noteEntries = buildForensicNoteEntries([
          {
            label: `CONTACT NOTE • ${contact.name || 'UNKNOWN CONTACT'}`,
            notes: contact.notes || null,
          },
          {
            label: `ACCOUNT NOTE • ${account?.name || 'UNKNOWN ACCOUNT'}`,
            notes: account?.description || null,
          },
        ])
        const noteContext = noteEntries.length > 0 ? formatForensicNoteClipboard(noteEntries) : undefined
        const nextContext: ComposeContext = {
          ...(context || {}),
          contactName: context?.contactName || contact.name || undefined,
          contactTitle: context?.contactTitle || contact.title || undefined,
          companyName: context?.companyName || account?.name || contact.company || undefined,
          accountName: context?.accountName || account?.name || undefined,
          industry: context?.industry || account?.industry || undefined,
          accountDescription: context?.accountDescription || account?.description || undefined,
          contactId: contact.id,
          accountId: account?.id || contact.accountId || undefined,
          contextForAi: context?.contextForAi || noteContext,
        }

        setComposeContext(nextContext)
      } catch {
        // best effort; keep compose usable with existing context
      }
    }

    hydrateContextFromEmail()
    return () => {
      cancelled = true
    }
  }, [isOpen, to, context, setComposeContext])

  return (
    <ComposeModal
      isOpen={isOpen}
      onClose={closeCompose}
      to={to}
      subject={subject}
      context={context}
    />
  )
}
