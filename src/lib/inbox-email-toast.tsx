import React from 'react'
import { toast } from 'sonner'
import { playSoftPing } from './audio'
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
  emailId?: string
}

export function showInboxEmailToast({
  name,
  company,
  subject,
  snippet,
  hasAttachments = false,
  photoUrl = null,
  duration = 6500,
  emailId,
}: InboxEmailToastInput) {
  const soundEnabled = useUIStore.getState().soundEnabled
  if (soundEnabled) playSoftPing()

  toast(
    <InboxEmailToast
      name={name}
      company={company}
      subject={subject}
      snippet={snippet}
      photoUrl={photoUrl}
      hasAttachments={hasAttachments}
      emailId={emailId}
    />,
    { duration }
  )
}
