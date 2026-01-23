'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { AlertTriangle, ArrowLeft, Building2, Mail, MapPin, Phone } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useContact } from '@/hooks/useContacts'
import { useAccounts } from '@/hooks/useAccounts'
import { Button } from '@/components/ui/button'
import { CompanyIcon } from '@/components/ui/CompanyIcon'

type AccountLike = {
  id: string
  name?: string
  accountName?: string
  companyName?: string
  domain?: string
  website?: string
  logoUrl?: string
  companyPhone?: string
  phone?: string
  electricitySupplier?: string
  annualUsage?: number | string
  currentRate?: number | string
  contractEnd?: string
  contractEndDate?: string
  contract_end_date?: string
  shortDescription?: string
  serviceAddresses?: Array<{ address?: string; isPrimary?: boolean }>
}

function parseContractEndDate(raw: unknown): Date | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  const iso = parseISO(s)
  if (isValid(iso)) return iso
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const mm = Number(mdy[1])
    const dd = Number(mdy[2])
    const yyyy = Number(mdy[3])
    const d = new Date(yyyy, mm - 1, dd)
    return isValid(d) ? d : null
  }
  const fallback = new Date(s)
  return isValid(fallback) ? fallback : null
}

function clamp01(n: number) {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export default function ContactDossierPage() {
  const params = useParams()
  const router = useRouter()
  const id = (params?.id as string) || ''

  const { data: contact, isLoading: isLoadingContact } = useContact(id)
  const { data: accountsData } = useAccounts()
  const accounts = useMemo(() => accountsData?.pages.flatMap((p) => p.accounts) || [], [accountsData])

  const resolvedAccountId =
    (contact as { accountId?: string; account_id?: string; linkedAccountId?: string } | null)?.accountId ||
    (contact as { accountId?: string; account_id?: string; linkedAccountId?: string } | null)?.account_id ||
    (contact as { accountId?: string; account_id?: string; linkedAccountId?: string } | null)?.linkedAccountId ||
    (contact?.company
      ? accounts.find((a) => String(a.name || '').trim().toLowerCase() === String(contact.company).trim().toLowerCase())?.id
      : undefined) ||
    ''

  const { data: linkedAccount, isLoading: isLoadingAccount } = useQuery({
    queryKey: ['account-raw', resolvedAccountId],
    queryFn: async () => {
      if (!resolvedAccountId) return null
      const docRef = doc(db, 'accounts', resolvedAccountId)
      const docSnap = await getDoc(docRef)
      if (!docSnap.exists()) return null
      return { id: docSnap.id, ...(docSnap.data() as object) } as AccountLike
    },
    enabled: !!resolvedAccountId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,
  })

  const contactName = contact?.name || 'Unknown Contact'
  const contactTitle = (contact as { title?: string } | null)?.title || ''
  const companyName = contact?.company || (contact as { companyName?: string } | null)?.companyName || ''
  const email = contact?.email || ''
  const phone = contact?.phone || ''

  const contractEndRaw =
    linkedAccount?.contractEnd || linkedAccount?.contractEndDate || linkedAccount?.contract_end_date || ''
  const contractEndDate = useMemo(() => parseContractEndDate(contractEndRaw), [contractEndRaw])
  const daysRemaining = contractEndDate ? differenceInCalendarDays(contractEndDate, new Date()) : null
  const maturityPct = useMemo(() => {
    if (daysRemaining == null) return 0
    return clamp01(1 - daysRemaining / 365)
  }, [daysRemaining])

  const maturityColor = useMemo(() => {
    if (daysRemaining == null) return 'bg-zinc-700'
    if (daysRemaining < 90) return 'bg-red-500'
    if (daysRemaining < 180) return 'bg-yellow-500'
    if (daysRemaining > 365) return 'bg-[#002FA7]'
    return 'bg-[#002FA7]'
  }, [daysRemaining])

  const maturityHint = useMemo(() => {
    if (!contractEndDate || daysRemaining == null) return null
    return `Renew by ${format(contractEndDate, 'MMMM')}`
  }, [contractEndDate, daysRemaining])

  const supplier = linkedAccount?.electricitySupplier || ''
  const strikePrice = linkedAccount?.currentRate != null ? String(linkedAccount.currentRate) : ''
  const annualUsage = linkedAccount?.annualUsage != null ? String(linkedAccount.annualUsage) : ''
  const forensicNotes =
    (contact as { notes?: string } | null)?.notes || linkedAccount?.shortDescription || ''

  const primaryServiceAddress = useMemo(() => {
    const addrs = Array.isArray(linkedAccount?.serviceAddresses) ? linkedAccount?.serviceAddresses : []
    const primary = addrs.find((a) => a?.isPrimary) || addrs[0]
    return primary?.address ? String(primary.address) : ''
  }, [linkedAccount?.serviceAddresses])

  if (isLoadingContact || isLoadingAccount) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-zinc-400" />
        <p className="text-zinc-500">Loading dossier...</p>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center space-y-4">
        <p className="text-zinc-500">Contact not found</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    )
  }

  const domain =
    linkedAccount?.domain ||
    (linkedAccount?.website ? String(linkedAccount.website).replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] : '') ||
    contact.companyDomain ||
    ''

  const logoUrl = linkedAccount?.logoUrl || undefined
  const companyLabel = companyName || linkedAccount?.name || linkedAccount?.accountName || ''

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#002FA7]/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="flex-none p-6 md:p-8 border-b border-white/5 relative z-10">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-zinc-400 hover:text-white hover:bg-white/5"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>

              <div className="flex items-center gap-4">
                {companyLabel ? (
                  <CompanyIcon logoUrl={logoUrl} domain={domain} name={companyLabel} size={56} className="rounded-2xl" />
                ) : (
                  <div className="h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center text-lg font-medium border border-white/10">
                    {contactName
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}

                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-white">{contactName}</h1>
                  <div className="flex items-center gap-2 text-zinc-400 mt-1">
                    <Building2 className="w-4 h-4" />
                    <span className="font-medium">
                      {contactTitle ? `${contactTitle}${companyLabel ? ' at ' : ''}` : ''}
                      {companyLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">Position Maturity</div>
              <div className="text-3xl font-semibold tracking-tighter text-white tabular-nums">
                {daysRemaining == null ? (
                  <span className="text-zinc-500">--</span>
                ) : (
                  <>
                    {Math.max(daysRemaining, 0)} <span className="text-sm text-zinc-500 font-sans">Days</span>
                  </>
                )}
              </div>
              <div className="w-56 h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full ${maturityColor}`}
                  style={{ width: `${Math.round(maturityPct * 100)}%` }}
                />
              </div>
              {maturityHint ? (
                <div className="text-xs mt-1 font-medium flex items-center justify-end gap-1 text-zinc-300">
                  {(daysRemaining != null && daysRemaining < 180) ? <AlertTriangle className="w-3 h-3" /> : null}
                  <span>{maturityHint}</span>
                </div>
              ) : (
                <div className="text-xs mt-1 font-medium text-zinc-600">No contract end on file</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 relative z-10 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent np-scroll">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-3 space-y-4 lg:sticky lg:top-0 self-start">
              <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-6">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-6">Uplinks</h3>

                <button
                  type="button"
                  className="w-full group flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-[#002FA7] rounded-xl transition-all mb-3 border border-white/5 hover:border-[#002FA7]"
                  onClick={() => {
                    if (!phone) return
                    window.open(`tel:${encodeURIComponent(phone)}`)
                  }}
                  disabled={!phone}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Phone className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                    <span className="font-mono text-sm truncate">{phone || 'No phone'}</span>
                  </div>
                  <span className="opacity-0 group-hover:opacity-100 text-xs font-semibold uppercase">Call</span>
                </button>

                <div className="-mt-2 mb-4">
                  <div className="text-[11px] text-zinc-500 group-hover:text-zinc-300">
                    Local Time: <span className="font-mono">{format(new Date(), 'h:mm a')}</span> — Good time to call.
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full group flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-700 rounded-xl transition-all border border-white/5"
                  onClick={() => {
                    if (!email) return
                    window.open(`mailto:${encodeURIComponent(email)}`)
                  }}
                  disabled={!email}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Mail className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                    <span className="text-sm truncate">{email || 'No email'}</span>
                  </div>
                  <span className="opacity-0 group-hover:opacity-100 text-xs font-semibold uppercase">Email</span>
                </button>
              </div>

              <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-6">
                <div className="mb-6">
                  <div className="text-zinc-500 text-xs uppercase mb-1">Current Supplier</div>
                  <div className="text-xl font-semibold tracking-tighter text-white">{supplier || '--'}</div>
                </div>
                <div className="mb-6">
                  <div className="text-zinc-500 text-xs uppercase mb-1">Strike Price</div>
                  <div className="text-xl font-semibold tracking-tighter text-[#002FA7] font-mono">
                    {strikePrice || '--'} <span className="text-sm text-zinc-500 font-sans">/ kWh</span>
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs uppercase mb-1">Annual Usage</div>
                  <div className="text-xl font-semibold tracking-tighter text-white font-mono">
                    {annualUsage || '--'} <span className="text-sm text-zinc-500 font-sans">kWh</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-9 space-y-6">
              <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-8 min-h-[200px]">
                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  <h3 className="text-sm font-semibold tracking-tighter text-white">Forensic Intelligence</h3>
                </div>
                <p className="font-mono text-zinc-400 leading-relaxed text-sm whitespace-pre-wrap">
                  <span className="text-[#002FA7] mr-2">root@nodal:~$</span>
                  {forensicNotes || 'No notes yet.'}
                </p>
              </div>

              <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-8 flex items-start gap-6">
                <div className="p-3 bg-zinc-800 rounded-xl text-zinc-400">
                  <MapPin className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold tracking-tighter text-white mb-1">Primary Asset Location</h3>
                  <p className="text-zinc-400 font-mono break-words">{primaryServiceAddress || 'No service address on file'}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="px-2 py-1 rounded bg-zinc-800 border border-white/5 text-xs text-zinc-500 font-mono">ASSET</span>
                    <span className="px-2 py-1 rounded bg-zinc-800 border border-white/5 text-xs text-zinc-500 font-mono">ERCOT</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
    </div>
  )
}
