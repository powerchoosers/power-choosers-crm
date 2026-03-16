'use client'

import React from 'react'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { Phone } from 'lucide-react'

/** Meta shape for incoming call (matches VoiceContext VoiceMetadata). */
export interface IncomingCallMeta {
  name?: string
  photoUrl?: string
  account?: string
  title?: string
  logoUrl?: string
  domain?: string
  city?: string
  state?: string
  industry?: string
  isAccountOnly?: boolean
}

// 56px so the squircle is clearly visible (too small reads as a circle per global rules)
const INCOMING_AVATAR_SIZE = 56

/**
 * Incoming call toast: who's calling.
 *
 * - Individual contact (mobile/work-direct/other): ContactAvatar + name + title · company · location · number
 * - Company phone (account-only): CompanyIcon + company name + industry · location · number
 * - Unknown: Phone glyph + "Unknown Caller" + number
 */
export function IncomingCallToast({
  meta,
  from,
}: {
  meta: IncomingCallMeta | null
  from: string
}) {
  const formattedNumber = formatPhoneNumber(from) || from

  // Account-only = company phone number matched to an account (no individual contact)
  if (meta?.isAccountOnly) {
    const companyName = meta.account?.trim() || meta.name?.trim() || 'Unknown Company'
    const subtitleParts: string[] = []
    if (meta.industry?.trim()) subtitleParts.push(meta.industry.trim())
    if (meta.city?.trim()) subtitleParts.push(meta.city.trim())
    if (meta.state?.trim()) subtitleParts.push(meta.state.trim())
    subtitleParts.push(formattedNumber)

    return (
      <div className="flex items-start gap-3 min-w-0">
        <CompanyIcon
          logoUrl={meta.logoUrl}
          domain={meta.domain}
          name={companyName}
          size={INCOMING_AVATAR_SIZE}
          roundedClassName="rounded-[14px]"
          className="shrink-0 border border-white/5"
        />
        <div className="min-w-0 flex-1">
          <p className="font-sans font-medium text-white truncate">{companyName}</p>
          <p className="font-mono text-sm tabular-nums text-zinc-400 mt-0.5 truncate">
            {subtitleParts.join(' · ')}
          </p>
        </div>
      </div>
    )
  }

  // Known individual contact
  if (meta?.name?.trim()) {
    const contactName = meta.name.trim()
    const subtitleParts: string[] = []
    if (meta.title?.trim()) subtitleParts.push(meta.title.trim())
    if (meta.account?.trim()) subtitleParts.push(meta.account.trim())
    const locationParts: string[] = []
    if (meta.city?.trim()) locationParts.push(meta.city.trim())
    if (meta.state?.trim()) locationParts.push(meta.state.trim())
    if (locationParts.length) subtitleParts.push(locationParts.join(', '))
    subtitleParts.push(formattedNumber)

    return (
      <div className="flex items-start gap-3 min-w-0">
        <ContactAvatar
          name={contactName}
          photoUrl={meta.photoUrl}
          size={INCOMING_AVATAR_SIZE}
        />
        <div className="min-w-0 flex-1">
          <p className="font-sans font-medium text-white truncate">{contactName}</p>
          <p className="font-mono text-sm tabular-nums text-zinc-400 mt-0.5 truncate">
            {subtitleParts.join(' · ')}
          </p>
        </div>
      </div>
    )
  }

  // Unknown caller
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div
        className="shrink-0 rounded-[14px] bg-black/20 border border-white/5 flex items-center justify-center text-zinc-400"
        style={{ width: INCOMING_AVATAR_SIZE, height: INCOMING_AVATAR_SIZE }}
      >
        <Phone className="w-7 h-7" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-sans font-medium text-white">Unknown Caller</p>
        <p className="font-mono text-sm tabular-nums text-zinc-400 mt-0.5">{formattedNumber}</p>
      </div>
    </div>
  )
}
