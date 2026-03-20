'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, Mail, ArrowUpRight, X, Search, Smartphone, Landmark, Phone, Building2, Plus } from 'lucide-react'
import { useCallStore } from '@/store/callStore'
import { useComposeStore } from '@/store/composeStore'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { formatPhoneNumber } from '@/lib/formatPhone'

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
}

interface AccountHolderCardProps {
  accountId: string
  accountName: string
  contacts: HolderContact[]
  primaryContactId?: string | null
  onSetHolder: (contactId: string | null) => void
}

export function AccountHolderCard({
  accountId,
  accountName,
  contacts,
  primaryContactId,
  onSetHolder,
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
        contactId: holder.id,
        contactName: holder.name,
        contactTitle: holder.title,
        accountId: accountId,
        accountName: accountName,
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
          onClick={() => setPicking(true)}
          className="icon-button-forensic w-7 h-7"
          title={holder ? 'Change decision maker' : 'Assign decision maker'}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Holder set — show UplinkCard-style */}
      {holder && !picking && (
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
              className="w-full group flex items-center justify-between p-3.5 bg-[#002FA7]/90 hover:bg-[#002FA7] rounded-xl transition-all duration-300 border border-white/10 hover:border-white/20 hover:shadow-[0_0_24px_-5px_rgba(0,47,167,0.6)] hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <heroPhoneInfo.icon className="w-4 h-4 text-white/70 group-hover:text-white transition-colors shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">
                    {heroPhoneInfo.label}
                  </span>
                  <span className="text-[13px] font-mono tabular-nums text-white tracking-tight truncate w-full">
                    {formatPhoneNumber(heroPhone)}
                  </span>
                </div>
              </div>
              <ArrowUpRight className="w-3 h-3 text-white/50 group-hover:text-white transition-colors shrink-0" />
            </button>
          )}

          {/* Email button */}
          {holder.email && (
            <button
              onClick={handleEmail}
              className="w-full group flex items-center justify-between p-3 nodal-glass nodal-glass-hover rounded-xl transition-all border border-white/5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Mail className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Email</span>
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-200 truncate w-full">{holder.email}</span>
                </div>
              </div>
              <ArrowUpRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* Picker — open */}
      {picking && (
        <div className="space-y-2 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
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
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
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

          <button
            onClick={() => { setPicking(false); setQuery('') }}
            className="w-full py-2 text-[10px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

    </div>
  )
}
