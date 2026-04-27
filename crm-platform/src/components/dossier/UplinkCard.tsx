'use client'

import React, { useState, useEffect } from 'react'
import { Phone, Mail, Clock, Plus, Sparkles, Star, Building2, Smartphone, Landmark, Trash2, ArrowUpRight } from 'lucide-react'
import { format } from 'date-fns'
import { ContactDetail, type ContactAdditionalPhone } from '@/hooks/useContacts'
import { useCallStore } from '@/store/callStore'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import { FieldSyncIndicator } from '@/components/ui/FieldSyncIndicator'
import { SignalStrengthBadge } from '@/components/ui/SignalStrengthBadge'
import {
  type ContactPhoneBucket,
  type ContactSignalCollection,
  formatPhoneBucketLabel,
  getSignalForValue,
  inferPhoneBucketFromText,
  normalizePhoneKey,
} from '@/lib/contact-signals'

interface UplinkCardProps {
  contact: ContactDetail
  isEditing: boolean
  onEmailClick?: () => void
  onEnter?: () => void
  onUpdate: (updates: Partial<ContactDetail>) => void
  isSaving?: boolean
  recentlyUpdatedFields?: Set<string>
}

type PhoneType = 'mobile' | 'workDirectPhone' | 'otherPhone' | 'companyPhone'
type PrimaryPhoneType = Exclude<PhoneType, 'companyPhone'>

interface PhoneEntry {
  id: PhoneType
  label: string
  value: string
  icon: typeof Smartphone
  signalScore?: number
  signalLabel?: string
  signalSource?: string
}

interface AdditionalPhoneEntry {
  id: string
  label: string
  value: string
  icon: typeof Smartphone
  bucket?: ContactPhoneBucket
  signalScore?: number
  signalLabel?: string
  signalSource?: string
  signalKind?: 'phone'
  signalDerived?: boolean
}

// Using normalizePhoneKey from lib/contact-signals for consistency

export const UplinkCard: React.FC<UplinkCardProps> = ({
  contact,
  isEditing,
  onEmailClick,
  onEnter,
  onUpdate,
  isSaving = false,
  recentlyUpdatedFields
}) => {
  const initiateCall = useCallStore((state) => state.initiateCall)
  // Local state for editing phones
  const [phones, setPhones] = useState<PhoneEntry[]>([])
  const [additionalPhones, setAdditionalPhones] = useState<AdditionalPhoneEntry[]>([])
  const [primaryField, setPrimaryField] = useState<PrimaryPhoneType>(contact.primaryPhoneField || 'mobile')
  const [email, setEmail] = useState(contact.email || '')
  const [localTime, setLocalTime] = useState('')
  const communicationSignals = contact.communicationSignals as ContactSignalCollection | null | undefined

  // Update local time every minute (client-side only to avoid hydration mismatch)
  useEffect(() => {
    const updateTime = () => {
      setLocalTime(format(new Date(), 'h:mm a'))
    }
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleCallClick = (phone: PhoneEntry) => {
    if (!phone.value || isEditing) return

    const isCompany = phone.id === 'companyPhone'
    const metadata = isCompany
      ? {
        name: contact.companyName || contact.company,
        account: contact.companyName || contact.company,
        isAccountOnly: true,
        logoUrl: contact.logoUrl,
        domain: contact.companyDomain,
        industry: contact.industry,
        location: contact.location,
        annualUsage: contact.annualUsage,
        supplier: contact.electricitySupplier,
        currentRate: contact.currentRate,
        contractEnd: contact.contractEnd,
        accountId: contact.accountId,
        contactId: contact.id
      }
      : {
        name: contact.name,
        photoUrl: contact.avatarUrl,
        account: contact.companyName || contact.company,
        title: contact.title,
        logoUrl: contact.logoUrl,
        domain: contact.companyDomain,
        // Expanded Context for AI Script Generation
        industry: contact.industry,
        description: contact.accountDescription,
        linkedinUrl: contact.linkedinUrl,
        annualUsage: contact.annualUsage,
        supplier: contact.electricitySupplier,
        currentRate: contact.currentRate,
        contractEnd: contact.contractEnd,
        location: contact.location,
        accountId: contact.accountId,
        contactId: contact.id
      }

    initiateCall(phone.value, metadata)
  }

  useEffect(() => {
    const phoneEntries: PhoneEntry[] = []

    // Add existing phones if they have values (Uplink shows mobile, workDirect, other, company)
    if (contact.mobile) {
      phoneEntries.push({
        id: 'mobile',
        label: 'Mobile',
        value: contact.mobile,
        icon: Smartphone,
        signalScore: getSignalForValue(communicationSignals, contact.mobile, 'phone')?.score,
      })
    }
    if (contact.workDirectPhone) {
      phoneEntries.push({
        id: 'workDirectPhone',
        label: 'Work Direct',
        value: contact.workDirectPhone,
        icon: Landmark,
        signalScore: getSignalForValue(communicationSignals, contact.workDirectPhone, 'phone')?.score,
      })
    }
    if (contact.otherPhone) {
      phoneEntries.push({
        id: 'otherPhone',
        label: 'Other',
        value: contact.otherPhone,
        icon: Phone,
        signalScore: getSignalForValue(communicationSignals, contact.otherPhone, 'phone')?.score,
      })
    }
    if (contact.companyPhone) {
      phoneEntries.push({
        id: 'companyPhone',
        label: 'Company',
        value: contact.companyPhone,
        icon: Building2,
        signalScore: getSignalForValue(communicationSignals, contact.companyPhone, 'phone')?.score,
      })
    }
    // Fallback: contact.phone (e.g. from Org Intelligence before we set mobile) so Uplink always shows it
    if (phoneEntries.length === 0 && contact.phone) {
      phoneEntries.push({
        id: 'mobile',
        label: 'Phone',
        value: contact.phone,
        icon: Smartphone,
        signalScore: getSignalForValue(communicationSignals, contact.phone, 'phone')?.score,
      })
    }

    // Ensure we have at least one entry for editing if empty
    if (isEditing && phoneEntries.length === 0) {
      phoneEntries.push({ id: 'mobile', label: 'Mobile', value: '', icon: Smartphone })
    }

    const firstNonCompany = phoneEntries.find((p) => p.id !== 'companyPhone')
    const nextPrimary = (contact.primaryPhoneField || (firstNonCompany?.id ?? 'mobile')) as PrimaryPhoneType
    const nextEmail = contact.email || ''
    const canonicalValues = new Set(phoneEntries.map((p) => normalizePhoneKey(p.value)))
    const extras = (Array.isArray(contact.additionalPhones) ? contact.additionalPhones : [])
      .filter((p) => p && typeof p.number === 'string' && p.number.trim())
      .filter((p) => {
        const digits = normalizePhoneKey(p.number)
        return digits ? !canonicalValues.has(digits) : true
      })
      .map((p, idx) => {
        const bucket = p.bucket ?? inferPhoneBucketFromText(p.type, p.label, p.signalLabel, p.signalSource)
        const icon = bucket === 'mobile'
          ? Smartphone
          : bucket === 'workDirectPhone'
            ? Landmark
            : bucket === 'companyPhone'
              ? Building2
              : Phone
        return {
          id: `extra-${idx}-${p.number}`,
          label: p.label || formatPhoneBucketLabel(bucket, idx + 1),
          value: p.number,
          icon,
          bucket,
          signalScore: p.signalScore,
          signalLabel: p.signalLabel,
          signalSource: p.signalSource,
        } as AdditionalPhoneEntry
      })

    Promise.resolve().then(() => {
      setPhones((prev) => (JSON.stringify(prev) !== JSON.stringify(phoneEntries) ? phoneEntries : prev))
      setAdditionalPhones((prev) => (JSON.stringify(prev) !== JSON.stringify(extras) ? extras : prev))
      setPrimaryField((prev) => (prev !== nextPrimary ? nextPrimary : prev))
      setEmail((prev) => (prev !== nextEmail ? nextEmail : prev))
    })
  }, [contact, isEditing])

  const handlePhoneChange = (id: PhoneType, value: string) => {
    const formattedValue = formatPhoneNumber(value)
    const updated = phones.map(p => p.id === id ? { ...p, value: formattedValue } : p)
    setPhones(updated)

    // Prepare updates for parent
    const updates: Partial<ContactDetail> = {}
    if (id === 'mobile') updates.mobile = formattedValue
    else if (id === 'workDirectPhone') updates.workDirectPhone = formattedValue
    else if (id === 'otherPhone') updates.otherPhone = formattedValue
    else if (id === 'companyPhone') updates.companyPhone = formattedValue

    onUpdate(updates)
  }

  const handleEmailChange = (val: string) => {
    setEmail(val)
    onUpdate({ email: val })
  }

  const togglePrimary = (id: PhoneType) => {
    if (id === 'companyPhone') return
    setPrimaryField(id)
    onUpdate({ primaryPhoneField: id })
  }

  const addPhoneField = (type: PhoneType) => {
    if (phones.find(p => p.id === type)) return // Already exists

    const labels: Record<PhoneType, string> = {
      mobile: 'Mobile',
      workDirectPhone: 'Work Direct',
      otherPhone: 'Other',
      companyPhone: 'Company'
    }

    const icons: Record<PhoneType, typeof Smartphone> = {
      mobile: Smartphone,
      workDirectPhone: Landmark,
      otherPhone: Phone,
      companyPhone: Building2
    }

    setPhones([...phones, { id: type, label: labels[type], value: '', icon: icons[type] }])
  }

  const removePhoneField = (id: PhoneType) => {
    setPhones(phones.filter(p => p.id !== id))
    const updates: Partial<ContactDetail> = {}
    if (id === 'mobile') updates.mobile = ''
    else if (id === 'workDirectPhone') updates.workDirectPhone = ''
    else if (id === 'otherPhone') updates.otherPhone = ''
    else if (id === 'companyPhone') updates.companyPhone = ''
    onUpdate(updates)
  }

  const persistAdditionalPhones = (entries: AdditionalPhoneEntry[]): ContactAdditionalPhone[] => {
    return entries
      .map((entry) => {
        const digits = normalizePhoneKey(entry.value)
        if (!digits) return null
        const number = formatPhoneNumber(entry.value)
        if (!number) return null
        const phone: ContactAdditionalPhone = {
          number,
          type: entry.bucket || entry.label || undefined,
          label: entry.label || undefined,
          bucket: entry.bucket,
          signalScore: entry.signalScore,
          signalLabel: entry.signalLabel,
          signalSource: entry.signalSource,
          signalKind: entry.signalKind,
          signalDerived: entry.signalDerived,
        }
        return phone
      })
      .filter((entry): entry is ContactAdditionalPhone => !!entry)
  }

  const syncAdditionalPhones = (nextEntries: AdditionalPhoneEntry[]) => {
    setAdditionalPhones(nextEntries)
    onUpdate({ additionalPhones: persistAdditionalPhones(nextEntries) })
  }

  const handleAdditionalPhoneChange = (id: string, value: string) => {
    const formattedValue = formatPhoneNumber(value)
    const updated = additionalPhones.map((phone) =>
      phone.id === id ? { ...phone, value: formattedValue || value } : phone
    )
    syncAdditionalPhones(updated)
  }

  const addAdditionalPhone = () => {
    const nextIndex = additionalPhones.length + 1
    const newEntry: AdditionalPhoneEntry = {
      id: `extra-${crypto.randomUUID()}`,
      label: `Other ${nextIndex}`,
      value: '',
      icon: Phone,
      bucket: 'otherPhone',
    }
    syncAdditionalPhones([...additionalPhones, newEntry])
  }

  const removeAdditionalPhone = (id: string) => {
    const updated = additionalPhones.filter((phone) => phone.id !== id)
    syncAdditionalPhones(updated)
  }

  // Get Hero Number (Primary)
  const heroPhone = phones.find(p => p.id === primaryField) || phones[0]
  const heroPhoneSignal = heroPhone
    ? (heroPhone.signalScore ?? (heroPhone.value ? getSignalForValue(communicationSignals, heroPhone.value, 'phone')?.score : null))
    : null
  const emailSignal = email ? getSignalForValue(communicationSignals, email, 'email') : null

  return (
    <div className={`nodal-void-card transition-all duration-500 p-6 relative overflow-hidden shadow-lg ${isEditing ? 'border-[#002FA7]/30 ring-1 ring-[#002FA7]/20' : ''}`}>

      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Uplinks</h3>
        {isEditing && <Sparkles className="w-3 h-3 text-white animate-pulse" />}
      </div>

      {isEditing ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Phones Editing */}
          <div className="space-y-4">
            <div className="px-2">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Voice Channels</span>
            </div>

            {phones.map((phone) => (
              <div key={phone.id} className="group relative">
                <div className="flex items-center gap-2 mb-1 px-2">
                  <phone.icon className="w-3 h-3 text-zinc-500" />
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{phone.label}</span>
                  {phone.id !== 'companyPhone' && (
                    <button
                      onClick={() => togglePrimary(phone.id)}
                      className={`ml-auto transition-colors ${primaryField === phone.id ? 'text-yellow-500' : 'text-zinc-700 hover:text-zinc-500'}`}
                    >
                      <Star className={`w-3 h-3 ${primaryField === phone.id ? 'fill-current' : ''}`} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={phone.value}
                    onChange={(e) => handlePhoneChange(phone.id, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
                    className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                    placeholder="+1 (000) 000-0000"
                  />
                  {phones.length > 1 && (
                    <button
                      onClick={() => removePhoneField(phone.id)}
                      className="p-2 text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add Phone Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              {(!phones.find(p => p.id === 'mobile')) && (
                <button
                  onClick={() => addPhoneField('mobile')}
                  className="py-2 border border-dashed border-white/10 rounded-xl text-[9px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-2.5 h-2.5" /> Mobile
                </button>
              )}
              {(!phones.find(p => p.id === 'workDirectPhone')) && (
                <button
                  onClick={() => addPhoneField('workDirectPhone')}
                  className="py-2 border border-dashed border-white/10 rounded-xl text-[9px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-2.5 h-2.5" /> Work
                </button>
              )}
              {(!phones.find(p => p.id === 'otherPhone')) && (
                <button
                  onClick={() => addPhoneField('otherPhone')}
                  className="py-2 border border-dashed border-white/10 rounded-xl text-[9px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-2.5 h-2.5" /> Other
                </button>
              )}
              {(!phones.find(p => p.id === 'companyPhone')) && (
                <button
                  onClick={() => addPhoneField('companyPhone')}
                  className="py-2 border border-dashed border-white/10 rounded-xl text-[9px] font-mono text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-2.5 h-2.5" /> Company
                </button>
              )}
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Phone Candidates</span>
                <button
                  onClick={addAdditionalPhone}
                  className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-2.5 h-2.5" />
                  Add Candidate
                </button>
              </div>

              {additionalPhones.length > 0 ? (
                <div className="space-y-3">
                  {additionalPhones.map((phone) => (
                    <div key={phone.id} className="group relative">
                      <div className="flex items-center gap-2 mb-1 px-2">
                        <phone.icon className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{phone.label}</span>
                        <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-zinc-600">
                          Candidate
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={phone.value}
                          onChange={(e) => handleAdditionalPhoneChange(phone.id, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
                          className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                          placeholder="+1 (000) 000-0000"
                        />
                        <button
                          onClick={() => removeAdditionalPhone(phone.id)}
                          className="p-2 text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                  No extra candidates saved.
                </div>
              )}
            </div>
          </div>

          {/* Email Editing */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <Mail className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Electronic Mail</span>
            </div>
            <input
              type="text"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
              className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
              placeholder="analyst@nodalpoint.io"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Hero Number (Primary) */}
          {heroPhone && (
            <div className="space-y-3">
              <button
                type="button"
                className="relative w-full group overflow-hidden px-4 py-3 bg-[#002FA7]/90 hover:bg-[#002FA7] rounded-xl transition-all duration-300 border border-white/10 hover:border-white/20 hover:shadow-[0_0_30px_-5px_rgba(0,47,167,0.6)] hover:-translate-y-0.5 text-left"
                onClick={() => handleCallClick(heroPhone)}
                disabled={!heroPhone.value}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest leading-none">{heroPhone.label}</span>
                    <SignalStrengthBadge score={heroPhoneSignal} compact />
                  </div>
                  <div className="flex items-center gap-3 min-w-0 mt-0.5">
                    <div className="relative shrink-0">
                      <heroPhone.icon className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
                      <Star className="w-2 h-2 fill-yellow-500 text-yellow-500 absolute -top-1 -right-1" />
                    </div>
                    <ForensicDataPoint
                      value={heroPhone.value || 'No phone'}
                      copyValue={heroPhone.value || undefined}
                      valueClassName="font-mono tabular-nums text-[13px] tracking-tight text-white group-hover:text-white whitespace-nowrap leading-none"
                      compact
                      compactFill
                      inline
                      className="flex-1 min-w-0"
                    />
                    <ArrowUpRight className="w-3 h-3 text-white/50 group-hover:text-white transition-colors shrink-0" />
                  </div>
                </div>
              </button>

              <div className="px-1">
                <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  <span className="uppercase tracking-wider">Local Time:</span>
                  <span className="text-zinc-400 font-mono tabular-nums">{localTime || '--:-- --'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Backup Numbers */}
          {(phones.filter(p => p.id !== primaryField).length > 0 || additionalPhones.length > 0) && (
            <div className="space-y-2 pt-2">
              <div className="px-1 mb-2">
                <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em]">Infrastructure / Backup</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {phones.filter(p => p.id !== primaryField).map((phone) => (
                  <button
                    key={phone.id}
                    type="button"
                    className="relative w-full group overflow-hidden px-3 py-2.5 nodal-glass nodal-glass-hover rounded-xl transition-all border border-white/5 text-left"
                    onClick={() => handleCallClick(phone)}
                  >
                  <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider leading-none">{phone.label}</span>
                        <SignalStrengthBadge
                          compact
                          score={phone.signalScore ?? getSignalForValue(communicationSignals, phone.value, 'phone')?.score}
                        />
                      </div>
                      <div className="flex items-center gap-3 min-w-0 mt-0.5">
                        <phone.icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                        <ForensicDataPoint
                          value={phone.value}
                          copyValue={phone.value}
                          valueClassName="font-mono tabular-nums text-xs tracking-tight text-zinc-400 group-hover:text-zinc-200 whitespace-nowrap leading-none"
                          compact
                          compactFill
                          inline
                          className="flex-1 min-w-0"
                        />
                        <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
                      </div>
                    </div>
                  </button>
                ))}
                {additionalPhones.map((phone) => (
                  <button
                    key={phone.id}
                    type="button"
                    className="relative w-full group overflow-hidden px-3 py-2.5 nodal-glass nodal-glass-hover rounded-xl transition-all border border-white/5 text-left"
                    onClick={() => handleCallClick({ ...phone, id: 'otherPhone' as PhoneType })}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider leading-none">{phone.label}</span>
                        <SignalStrengthBadge
                          compact
                          score={phone.signalScore ?? getSignalForValue(communicationSignals, phone.value, 'phone')?.score}
                        />
                      </div>
                      <div className="flex items-center gap-3 min-w-0 mt-0.5">
                        <phone.icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                        <ForensicDataPoint
                          value={formatPhoneNumber(phone.value) || phone.value}
                          copyValue={phone.value}
                          valueClassName="font-mono tabular-nums text-xs tracking-tight text-zinc-400 group-hover:text-zinc-200 whitespace-nowrap leading-none"
                          compact
                          compactFill
                          inline
                          className="flex-1 min-w-0"
                        />
                        <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Email */}
          <div className="pt-2">
            <button
              type="button"
              className="relative w-full group overflow-hidden px-4 py-3 nodal-glass nodal-glass-hover rounded-xl transition-all border border-white/5 text-left"
              onClick={() => {
                if (!email) return
                if (onEmailClick) {
                  onEmailClick()
                } else {
                  window.open(`mailto:${encodeURIComponent(email)}`)
                }
              }}
              disabled={!email}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider leading-none">Electronic Mail</span>
                  <SignalStrengthBadge score={emailSignal?.score} compact />
                </div>
                <div className="flex items-center gap-3 min-w-0 mt-0.5">
                  <Mail className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                  <ForensicDataPoint
                    value={email || 'No email'}
                    copyValue={email || undefined}
                    valueClassName="text-sm text-zinc-400 group-hover:text-zinc-200 whitespace-nowrap leading-none"
                    compact
                    compactFill
                    inline
                    className="flex-1 min-w-0"
                  />
                  <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
                </div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
