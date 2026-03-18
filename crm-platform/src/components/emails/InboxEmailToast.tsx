'use client'

import React from 'react'
import { Mail } from 'lucide-react'
import { ContactAvatar } from '@/components/ui/ContactAvatar'

const AVATAR_SIZE = 44

export interface InboxEmailToastProps {
  name: string
  company?: string
  subject?: string
  photoUrl?: string | null
  hasAttachments?: boolean
  sourceLabel?: string
}

export function InboxEmailToast({
  name,
  company,
  subject,
  photoUrl,
  hasAttachments = false,
  sourceLabel,
}: InboxEmailToastProps) {
  const contactName = name?.trim() || 'CRM Contact'

  const subtitleParts: string[] = []
  if (company?.trim()) subtitleParts.push(company.trim())
  if (subject?.trim()) subtitleParts.push(subject.trim())
  if (hasAttachments) subtitleParts.push('Attachment')

  return (
    <div className="flex items-start gap-3 min-w-0 w-full">
      <div className="relative shrink-0">
        <ContactAvatar
          name={contactName}
          photoUrl={photoUrl}
          size={AVATAR_SIZE}
        />
        {/* Mail badge — bottom-right corner */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#002FA7] border border-zinc-900 flex items-center justify-center">
          <Mail className="w-2.5 h-2.5 text-white" strokeWidth={2} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-sans font-medium text-white truncate leading-tight">
            {contactName}
          </p>
          {sourceLabel && (
            <span className="shrink-0 font-mono text-[10px] text-zinc-500 border border-zinc-700 rounded px-1 py-px leading-none">
              {sourceLabel}
            </span>
          )}
        </div>
        {subtitleParts.length > 0 && (
          <p className="font-mono text-xs text-zinc-400 mt-0.5 truncate">
            {subtitleParts.join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
