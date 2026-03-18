import React from 'react'
import { toast } from 'sonner'
import { playPing } from './audio'
import { useUIStore } from '@/store/uiStore'
import { InboxEmailToast } from '@/components/emails/InboxEmailToast'

export type InboxEmailToastInput = {
  name: string
  company?: string
  subject?: string
  snippet?: string
  hasAttachments?: boolean
  sourceLabel?: string
  photoUrl?: string | null
  duration?: number
}

export function showInboxEmailToast({
  name,
  company,
  subject,
  snippet,
  hasAttachments = false,
  sourceLabel,
  photoUrl = null,
  duration = 6500,
}: InboxEmailToastInput) {
  const soundEnabled = useUIStore.getState().soundEnabled
  if (soundEnabled) playPing()

  toast(
    <InboxEmailToast
      name={name}
      company={company}
      subject={subject || snippet}
      photoUrl={photoUrl}
      hasAttachments={hasAttachments}
      sourceLabel={sourceLabel}
    />,
    { duration }
  )
}
