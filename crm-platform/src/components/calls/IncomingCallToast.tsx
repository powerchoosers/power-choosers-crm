'use client'

import React from 'react'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { Phone } from 'lucide-react'

/** Meta shape for incoming call (matches VoiceContext VoiceMetadata). */
export interface IncomingCallMeta {
  name?: string
  account?: string
  title?: string
  logoUrl?: string
  domain?: string
  city?: string
  state?: string
}

// 56px so the squircle is clearly visible (too small reads as a circle per global rules)
const INCOMING_AVATAR_SIZE = 56

/**
 * Incoming call toast: who's calling — company logo (or contact avatar), company name,
 * city, state, and number. Uses rounded-[14px] so the avatar reads as squircle.
 */
export function IncomingCallToast({
  meta,
  from,
}: {
  meta: IncomingCallMeta | null
  from: string
}) {
  const companyName = meta?.account?.trim()
  const contactName = meta?.name?.trim()
  const title = companyName || contactName || 'Unknown Caller'
  const hasCompanyLogo = Boolean(meta?.logoUrl?.trim() || meta?.domain?.trim() || companyName)
  const locationParts: string[] = []
  if (meta?.city?.trim()) locationParts.push(meta.city.trim())
  if (meta?.state?.trim()) locationParts.push(meta.state.trim())
  const location = locationParts.length > 0 ? locationParts.join(', ') : ''
  const formattedNumber = formatPhoneNumber(from) || from
  const subtitleParts: string[] = []
  if (contactName && companyName && contactName !== companyName) subtitleParts.push(contactName)
  if (location) subtitleParts.push(location)
  subtitleParts.push(formattedNumber)
  const subtitle = subtitleParts.join(' · ') || 'Unknown number'

  return (
    <div className="flex items-start gap-3 min-w-0">
      {/* Squircle avatar: 56px + rounded-[14px] so it doesn't look like a circle */}
      {hasCompanyLogo ? (
        <CompanyIcon
          logoUrl={meta?.logoUrl}
          domain={meta?.domain}
          name={companyName || contactName || 'Company'}
          size={INCOMING_AVATAR_SIZE}
          roundedClassName="rounded-[14px]"
          className="shrink-0 border border-white/5"
        />
      ) : contactName ? (
        <ContactAvatar name={contactName} size={INCOMING_AVATAR_SIZE} />
      ) : (
        <div
          className="shrink-0 rounded-[14px] bg-black/20 border border-white/5 flex items-center justify-center text-zinc-400"
          style={{ width: INCOMING_AVATAR_SIZE, height: INCOMING_AVATAR_SIZE }}
        >
          <Phone className="w-7 h-7" strokeWidth={1.8} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-sans font-medium text-white truncate">{title}</p>
        <p className="font-mono text-sm tabular-nums text-zinc-400 mt-0.5 truncate">
          {subtitle}
        </p>
      </div>
    </div>
  )
}
