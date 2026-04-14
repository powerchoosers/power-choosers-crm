'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, Mail, ArrowUpRight, X, Search, Smartphone, Landmark, Phone, Building2, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallStore } from '@/store/callStore'
import { useComposeStore } from '@/store/composeStore'
import type { ComposeContext } from '@/components/emails/ComposeModal'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { DottedEmptyState } from '@/components/dossier/DottedEmptyState'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'
import { SignalStrengthBadge } from '@/components/ui/SignalStrengthBadge'
import { formatPhoneNumber } from '@/lib/formatPhone'
import { cn } from '@/lib/utils'
import { type ContactSignalCollection, getSignalForValue } from '@/lib/contact-signals'

interface HolderContact {
  id: string
  name: string
  title?: string
  email?: string
  mobile?: string
  workDirectPhone?: string
  otherPhone?: string
  companyPhone?: string
  phone?: string
  avatarUrl?: string
  primaryPhoneField?: 'mobile' | 'workDirectPhone' | 'otherPhone' | 'companyPhone'
  communicationSignals?: ContactSignalCollection | null
}

interface AccountHolderCardProps {
  accountId: string
  accountName: string
  contacts: HolderContact[]
  primaryContactId?: string | null
  onSetHolder: (contactId: string | null) => void
  composeContext?: ComposeContext | null
  isLoadingContacts?: boolean
}

export function AccountHolderCard({
  accountId,
  accountName,
  contacts,
  primaryContactId,
  onSetHolder,
  composeContext,
  isLoadingContacts = false,
}: AccountHolderCardProps) {
  const initiateCall = useCallStore(s => s.initiateCall)
  const router = useRouter()
  const openCompose = useComposeStore(s => s.openCompose)
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const holder = primaryContactId ? contacts.find(c => c.id === primaryContactId) : null

  // Determine hero phone and its icon/label based on primaryPhoneField
  const getHeroPhoneInfo = (contact: HolderContact) => {
    const primaryField = contact.primaryPhoneField || 'mobile'
    const phoneLabels: Record<string, string> = {
      mobile: 'Mobile',
      workDirectPhone: 'Work Direct',
      otherPhone: 'Other',
      companyPhone: 'Company'
    }
    const phoneIcons: Record<string, typeof Smartphone> = {
      mobile: Smartphone,
      workDirectPhone: Landmark,
      otherPhone: Phone,
      companyPhone: Building2
    }

    let phone = ''
    if (primaryField === 'mobile') phone = contact.mobile || ''
    else if (primaryField === 'workDirectPhone') phone = contact.workDirectPhone || ''
    else if (primaryField === 'otherPhone') phone = contact.otherPhone || ''
    else if (primaryField === 'companyPhone') phone = contact.companyPhone || ''

    // Fallback to any available phone if primary is empty
    if (!phone) {
      if (contact.mobile) { phone = contact.mobile; return { phone, label: 'Mobile', icon: Smartphone } }
      if (contact.workDirectPhone) { phone = contact.workDirectPhone; return { phone, label: 'Work Direct', icon: Landmark } }
      if (contact.otherPhone) { phone = contact.otherPhone; return { phone, label: 'Other', icon: Phone } }
      if (contact.companyPhone) { phone = contact.companyPhone; return { phone, label: 'Company', icon: Building2 } }
      phone = contact.phone || ''
    }

    return { phone, label: phoneLabels[primaryField] || 'Phone', icon: phoneIcons[primaryField] || Smartphone }
  }

  const heroPhoneInfo = holder ? getHeroPhoneInfo(holder) : { phone: '', label: 'Phone', icon: Smartphone }
  const heroPhone = heroPhoneInfo.phone
  const heroPhoneSignal = holder ? getSignalForValue(holder.communicationSignals, heroPhone, 'phone') : null
  const emailSignal = holder?.email ? getSignalForValue(holder.communicationSignals, holder.email, 'email') : null

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    (c.title || '').toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (picking) setTimeout(() => inputRef.current?.focus(), 50)
  }, [picking])

  const handleCall = () => {
    if (!heroPhone || !holder) return
    initiateCall(heroPhone, {
      name: holder.name,
      photoUrl: holder.avatarUrl,
      account: accountName,
      title: holder.title,
      contactId: holder.id,
    })
  }

  const handleEmail = () => {
    if (!holder?.email) return
    openCompose({
      to: holder.email,
      context: {
        ...(composeContext || {}),
        contactId: holder.id,
        contactName: holder.name,
        contactTitle: holder.title,
        accountId: composeContext?.accountId || accountId,
        accountName: composeContext?.accountName || accountName,
      },
    })
  }

  const openContactDossier = () => {
    if (!holder) return
    router.push(`/network/contacts/${holder.id}`)
  }

  const handleSelect = (c: HolderContact) => {
    onSetHolder(c.id)
    setPicking(false)
    setQuery('')
  }

  return (
    <div className="nodal-module-glass nodal-monolith-edge rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">Decision Maker</span>
        </div>
        <button
          onClick={() => setPicking(prev => !prev)}
          className="icon-button-forensic w-7 h-7"
          title={picking ? 'Close search' : (holder ? 'Change decision maker' : 'Assign decision maker')}
        >
          <Plus className={cn('w-3.5 h-3.5 transition-transform duration-300', picking && 'rotate-45')} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {/* Holder set — show UplinkCard-style */}
        {holder && !picking && (
          <motion.div
            key="holder-view"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 mt-3">
              {/* Identity row */}
              <div
                role="button"
                tabIndex={0}
                onClick={openContactDossier}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openContactDossier()
                  }
                }}
                className="group flex items-center gap-3 p-2 rounded-lg border border-transparent hover:border-white/5 transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[#002FA7]/50"
                title="Open contact dossier"
              >
                <ContactAvatar
                  name={holder.name}
                  photoUrl={holder.avatarUrl}
                  size={40}
                  className="rounded-xl shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{holder.name}</p>
                  {holder.title && (
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">{holder.title}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetHolder(null)
                  }}
                  className="text-zinc-700 hover:text-zinc-400 hover:scale-110 transition-all shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Clear decision maker"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Call button — solid Klein blue like UplinkCard hero */}
              {heroPhone && (
                <button
                  onClick={handleCall}
                  className="relative w-full group overflow-hidden text-left p-3.5 bg-[#002FA7]/90 hover:bg-[#002FA7] rounded-xl transition-all duration-300 border border-white/10 hover:border-white/20 hover:shadow-[0_0_24px_-5px_rgba(0,47,167,0.6)] hover:-translate-y-0.5"
                >
                  <div className="pointer-events-none absolute right-3 top-3 z-10">
                    <SignalStrengthBadge score={heroPhoneSignal?.score} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start gap-3 min-w-0">
                      <heroPhoneInfo.icon className="w-4 h-4 text-white/70 group-hover:text-white transition-colors shrink-0 mt-0.5" />
                      <div className="flex flex-col items-start min-w-0 flex-1">
                        <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest leading-none">
                          {heroPhoneInfo.label}
                        </span>
                        <div className="mt-0.5 flex items-center justify-between gap-3 min-w-0 w-full">
                          <ForensicDataPoint
                            value={formatPhoneNumber(heroPhone)}
                            copyValue={heroPhone}
                            valueClassName="text-[13px] font-mono tabular-nums text-white tracking-tight whitespace-nowrap leading-none"
                            compact
                            compactFill
                            inline
                          />
                          <ArrowUpRight className="w-3 h-3 text-white/50 group-hover:text-white transition-colors shrink-0" />
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {/* Email button */}
              {holder.email && (
                <button
                  onClick={handleEmail}
                  className="relative w-full group overflow-hidden text-left p-3 nodal-glass nodal-glass-hover rounded-xl transition-all border border-white/5"
                >
                  <div className="pointer-events-none absolute right-3 top-3 z-10">
                    <SignalStrengthBadge score={emailSignal?.score} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start gap-3 min-w-0">
                      <Mail className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0 mt-0.5" />
                      <div className="flex flex-col items-start min-w-0 flex-1">
                        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest leading-none">Email</span>
                        <div className="mt-0.5 flex items-center justify-between gap-3 min-w-0 w-full">
                          <ForensicDataPoint
                            value={holder.email}
                            copyValue={holder.email}
                            valueClassName="text-xs text-zinc-400 group-hover:text-zinc-200 whitespace-nowrap leading-none"
                            compact
                            compactFill
                            inline
                          />
                          <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </motion.div>
        )}

        {!holder && !picking && !isLoadingContacts && (
          <motion.div
            key="holder-empty"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden mt-3"
          >
            <DottedEmptyState message="No decision maker assigned" />
          </motion.div>
        )}

        {/* Picker — open */}
        {picking && (
          <motion.div
            key="picker-view"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 mt-3 p-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 pointer-events-none" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full bg-black/40 border border-white/5 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-[#002FA7]/50 focus:ring-1 focus:ring-[#002FA7]/30 transition-all"
                />
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto np-scroll">
                {filtered.length === 0 && (
                  <p className="text-[10px] font-mono text-zinc-700 text-center py-4 uppercase tracking-widest">No contacts found</p>
                )}
                {filtered.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-transparent hover:border-white/5 transition-all text-left"
                  >
                    <ContactAvatar
                      name={c.name}
                      photoUrl={c.avatarUrl}
                      size={32}
                      className="rounded-lg shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{c.name}</p>
                      {c.title && <p className="text-[10px] font-mono text-zinc-600 uppercase truncate">{c.title}</p>}
                    </div>
                  </button>
                ))}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
