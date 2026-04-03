'use client'

import React from 'react'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { Phone, PhoneCall, PhoneOff } from 'lucide-react'

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
  onAnswer,
  onDecline,
}: {
  meta: IncomingCallMeta | null
  from: string
  onAnswer: () => void
  onDecline: () => void
}) {
  const formattedNumber = formatPhoneNumber(from) || from
  const actionButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-[10px] font-mono uppercase tracking-[0.24em] transition-colors duration-200'

  // Account-only = company phone number matched to an account (no individual contact)
  if (meta?.isAccountOnly) {
    const companyName = meta.account?.trim() || meta.name?.trim() || 'Unknown Company'
    const contextParts: string[] = []
    if (meta.industry?.trim()) contextParts.push(meta.industry.trim())
    if (meta.city?.trim()) contextParts.push(meta.city.trim())
    if (meta.state?.trim()) contextParts.push(meta.state.trim())

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
        <div className="min-w-0 flex-1 space-y-2">
          <div className="min-w-0 space-y-0.5">
            <p className="font-sans text-base font-medium text-white truncate">{companyName}</p>
            {contextParts.length > 0 && (
              <p className="font-mono text-sm leading-snug text-zinc-400 whitespace-normal break-words">
                {contextParts.join(' · ')}
              </p>
            )}
            <p className="font-mono text-sm tabular-nums text-zinc-500">
              {formattedNumber}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onDecline}
              className={`${actionButtonClass} border-rose-500/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15`}
            >
              <PhoneOff className="h-3.5 w-3.5" />
              Hang Up
            </button>
            <button
              type="button"
              onClick={onAnswer}
              className={`${actionButtonClass} border-[#002FA7]/40 bg-[#002FA7] text-white hover:bg-[#0038c5]`}
            >
              <PhoneCall className="h-3.5 w-3.5" />
              Answer
            </button>
          </div>
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
    const detailsParts = [...subtitleParts]
    if (locationParts.length) detailsParts.push(locationParts.join(', '))

    return (
      <div className="flex items-start gap-3 min-w-0">
        <ContactAvatar
          name={contactName}
          photoUrl={meta.photoUrl}
          size={INCOMING_AVATAR_SIZE}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="min-w-0 space-y-0.5">
            <p className="font-sans text-base font-medium text-white truncate">{contactName}</p>
            {detailsParts.length > 0 && (
              <p className="font-mono text-sm leading-snug text-zinc-400 whitespace-normal break-words">
                {detailsParts.join(' · ')}
              </p>
            )}
            <p className="font-mono text-sm tabular-nums text-zinc-500">
              {formattedNumber}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onDecline}
              className={`${actionButtonClass} border-rose-500/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15`}
            >
              <PhoneOff className="h-3.5 w-3.5" />
              Hang Up
            </button>
            <button
              type="button"
              onClick={onAnswer}
              className={`${actionButtonClass} border-[#002FA7]/40 bg-[#002FA7] text-white hover:bg-[#0038c5]`}
            >
              <PhoneCall className="h-3.5 w-3.5" />
              Answer
            </button>
          </div>
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
      <div className="min-w-0 flex-1 space-y-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-sans text-base font-medium text-white">Unknown Caller</p>
          <p className="font-mono text-sm tabular-nums text-zinc-500">{formattedNumber}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onDecline}
            className={`${actionButtonClass} border-rose-500/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15`}
          >
            <PhoneOff className="h-3.5 w-3.5" />
            Hang Up
          </button>
          <button
            type="button"
            onClick={onAnswer}
            className={`${actionButtonClass} border-[#002FA7]/40 bg-[#002FA7] text-white hover:bg-[#0038c5]`}
          >
            <PhoneCall className="h-3.5 w-3.5" />
            Answer
          </button>
        </div>
      </div>
    </div>
  )
}
