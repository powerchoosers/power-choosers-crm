'use client'

import React from 'react'
import { Mail } from 'lucide-react'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import Link from 'next/link'

const AVATAR_SIZE = 44

export interface InboxEmailToastProps {
  name: string
  company?: string
  subject?: string
  snippet?: string
  photoUrl?: string | null
  hasAttachments?: boolean
  emailId?: string
}

export function InboxEmailToast({
  name,
  company,
  subject,
  snippet,
  photoUrl,
  hasAttachments = false,
  emailId,
}: InboxEmailToastProps) {
  const contactName = name?.trim() || 'CRM Contact'

  const subtitleParts: string[] = []
  if (company?.trim()) subtitleParts.push(company.trim())
  if (subject?.trim()) subtitleParts.push(subject.trim())
  if (hasAttachments) subtitleParts.push('Attachment')

  const content = (
    <div className="flex items-start gap-3 min-w-0 w-full hover:opacity-90 transition-opacity cursor-pointer">
      <div className="relative shrink-0">
        <ContactAvatar
          name={contactName}
          photoUrl={photoUrl}
          size={AVATAR_SIZE}
        />
        {/* Mail badge — bottom-right corner */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#002FA7] border border-zinc-900 grid place-items-center">
          <Mail className="w-2.5 h-2.5 text-white" strokeWidth={2} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-sans font-medium text-white truncate leading-tight">
          {contactName}
        </p>
        {subtitleParts.length > 0 && (
          <p className="font-mono text-xs text-zinc-400 mt-0.5 truncate">
            {subtitleParts.join(' · ')}
          </p>
        )}
        {snippet?.trim() && (
          <p className="font-sans text-xs text-zinc-500 mt-0.5 line-clamp-1">
            {snippet.trim()}
          </p>
        )}
      </div>
    </div>
  )

  if (emailId) {
    return (
      <Link href={`/network/emails/${emailId}`} className="block w-full no-underline">
        {content}
      </Link>
    )
  }

  return content
}
