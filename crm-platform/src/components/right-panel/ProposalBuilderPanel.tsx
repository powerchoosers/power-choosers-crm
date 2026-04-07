'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileText,
  Loader2,
  Plus,
  Trash2,
  Download,
  Copy,
  Save,
  Sparkles,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/context/AuthContext'
import { useAccount } from '@/hooks/useAccounts'
import { useAccountContacts } from '@/hooks/useContacts'
import { useDeal } from '@/hooks/useDeals'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { panelTheme, useEscClose } from '@/components/right-panel/panelTheme'
import {
  buildProposalEmailHtml,
  buildProposalEmailText,
  buildProposalFileName,
  buildProposalStoragePath,
  generateProposalPdfBytes,
  normalizeRateDisplay,
  type ProposalRateStructure,
} from '@/lib/proposal'
import { generateNodalSignature } from '@/lib/signature'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const DEFAULT_CONFIDENTIALITY = 'Please keep the pricing confidential and review it internally only.'

function makeRateStructure(index: number, seed?: Partial<ProposalRateStructure>): ProposalRateStructure {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    label: seed?.label || `Option ${index + 1}`,
    termMonths: seed?.termMonths ?? 24,
    rate: seed?.rate?.toString() || '',
  }
}

function cleanNumberInput(value: string) {
  return value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
}

function EmailPreview({ html }: { html: string }) {
  if (typeof document === 'undefined') return null
  return (
    <iframe
      title="Proposal Email Preview"
      className="h-[560px] w-full rounded-xl border border-white/10 bg-white"
      ref={(iframe) => {
        if (!iframe) return
        const doc = iframe.contentDocument
        if (!doc) return
        doc.open()
        doc.write(html)
        doc.close()
      }}
    />
  )
}

export function ProposalBuilderPanel() {
  const {
    proposalContext,
    setProposalContext,
    setRightPanelMode,
  } = useUIStore()
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()

  const accountId = proposalContext?.accountId || ''
  const dealId = proposalContext?.dealId || ''

  const { data: account } = useAccount(accountId)
  const { data: deal } = useDeal(dealId)
  const { data: contacts = [] } = useAccountContacts(accountId)

  const [attentionLine, setAttentionLine] = useState('')
  const [subject, setSubject] = useState('')
  const [supplierName, setSupplierName] = useState('ENGIE')
  const [confidentialityNote, setConfidentialityNote] = useState(DEFAULT_CONFIDENTIALITY)
  const [terminationFee, setTerminationFee] = useState('0')
  const [blendAndExtend, setBlendAndExtend] = useState(true)
  const [blendExtendMonths, setBlendExtendMonths] = useState(12)
  const [rateStructures, setRateStructures] = useState<ProposalRateStructure[]>([
    makeRateStructure(0),
  ])
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCopying, setIsCopying] = useState(false)

  const accountName = account?.name || proposalContext?.accountName || deal?.account?.name || 'Account'
  const facilityAddress = account?.address || ''
  const annualUsage = account?.annualUsage != null
    ? String(account.annualUsage)
    : deal?.account?.annualUsage != null
      ? String(deal.account.annualUsage)
      : ''
  const currentRate = account?.currentRate != null
    ? String(account.currentRate)
    : proposalContext?.defaultRate != null
      ? String(proposalContext.defaultRate)
      : ''
  const currentSupplier = account?.electricitySupplier || proposalContext?.supplierName || 'ENGIE'
  const accountLogoUrl = account?.logoUrl || proposalContext?.accountLogoUrl || deal?.account?.logoUrl || deal?.account?.logo_url

  const primaryContacts = useMemo(() => {
    const ordered = [...contacts]
    if (proposalContext?.contactId) {
      const idx = ordered.findIndex((contact) => contact.id === proposalContext.contactId)
      if (idx > 0) {
        const [primary] = ordered.splice(idx, 1)
        ordered.unshift(primary)
      }
    } else if (deal?.contactId) {
      const idx = ordered.findIndex((contact) => contact.id === deal.contactId)
      if (idx > 0) {
        const [primary] = ordered.splice(idx, 1)
        ordered.unshift(primary)
      }
    }

    return ordered
      .map((contact) => contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '')
      .filter(Boolean)
      .slice(0, 2)
  }, [contacts, deal?.contactId, proposalContext?.contactId])

  const signatureHtml = useMemo(() => {
    if (!profile) return ''
    return generateNodalSignature(profile, user, false)
  }, [profile, user])

  useEffect(() => {
    if (!proposalContext) return

    const defaultTerm = proposalContext.defaultTermMonths || deal?.contractLength || 24
    const defaultRate =
      proposalContext.defaultRate ??
      (deal?.metadata as Record<string, unknown> | undefined)?.sellRate ??
      account?.currentRate ??
      ''

    setAttentionLine(proposalContext.attentionLine || primaryContacts.join(' and ') || accountName)
    setSubject(proposalContext.dealTitle ? `${proposalContext.dealTitle} - ${supplierName} Proposal` : `${accountName} ${supplierName} Proposal`)
    setSupplierName(proposalContext.supplierName || 'ENGIE')
    setConfidentialityNote(DEFAULT_CONFIDENTIALITY)
    setTerminationFee('0')
    setBlendAndExtend(true)
    setBlendExtendMonths(12)
    setRateStructures([
      makeRateStructure(0, {
        label: 'Option 1',
        termMonths: defaultTerm,
        rate: defaultRate ? String(defaultRate) : '',
      }),
    ])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalContext?.accountId, proposalContext?.dealId])

  useEffect(() => {
    if (!attentionLine && primaryContacts.length > 0) {
      setAttentionLine(primaryContacts.join(' and '))
    }
  }, [attentionLine, primaryContacts])

  const handleClose = () => {
    setProposalContext(null)
    setRightPanelMode('DEFAULT')
  }

  useEscClose(handleClose)

  const updateRateStructure = (id: string, updates: Partial<ProposalRateStructure>) => {
    setRateStructures((current) =>
      current.map((structure) => (structure.id === id ? { ...structure, ...updates } : structure))
    )
  }

  const addRateStructure = () => {
    setRateStructures((current) => {
      if (current.length >= 3) return current
      return [...current, makeRateStructure(current.length)]
    })
  }

  const removeRateStructure = (id: string) => {
    setRateStructures((current) => {
      if (current.length <= 1) return current
      return current.filter((structure) => structure.id !== id)
    })
  }

  const draft = useMemo(() => ({
    accountName,
    facilityAddress,
    annualUsage,
    currentRate,
    currentSupplier,
    defaultTermMonths: rateStructures[0]?.termMonths || proposalContext?.defaultTermMonths || deal?.contractLength || 24,
    primaryContacts,
    attentionLine: attentionLine.trim(),
    subject: subject.trim() || `${accountName} ${supplierName} Proposal`,
    supplierName: supplierName.trim() || 'ENGIE',
    confidentialityNote: confidentialityNote.trim() || DEFAULT_CONFIDENTIALITY,
    terminationFee: terminationFee.trim() || '0',
    blendAndExtend,
    blendExtendMonths,
    dealTitle: deal?.title || proposalContext?.dealTitle || '',
    rateStructures,
  }), [
    accountName,
    attentionLine,
    annualUsage,
    blendAndExtend,
    blendExtendMonths,
    confidentialityNote,
    currentRate,
    currentSupplier,
    deal?.title,
    deal?.contractLength,
    facilityAddress,
    primaryContacts,
    proposalContext?.dealTitle,
    proposalContext?.defaultTermMonths,
    rateStructures,
    supplierName,
    subject,
    terminationFee,
  ])

  const emailHtml = useMemo(() => {
    return buildProposalEmailHtml({
      draft,
      signatureHtml,
    })
  }, [draft, signatureHtml])

  const emailText = useMemo(() => buildProposalEmailText(draft), [draft])

  const copyHtml = async () => {
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(emailHtml)
      toast.success('HTML email copied')
    } catch {
      toast.error('Failed to copy HTML email')
    } finally {
      setIsCopying(false)
    }
  }

  const downloadPdf = async () => {
    setIsGeneratingPdf(true)
    try {
      const bytes = await generateProposalPdfBytes(draft, profile)
      const pdfBuffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(pdfBuffer).set(bytes)
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildProposalFileName(draft)
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF generated')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to generate PDF')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const saveProposal = async () => {
    if (!accountId) {
      toast.error('Missing account context')
      return
    }

    setIsSaving(true)
    const toastId = toast.loading('Saving proposal to Vault...')
    try {
      const bytes = await generateProposalPdfBytes(draft, profile)
      const storagePath = buildProposalStoragePath(accountId, draft)
      const pdfName = buildProposalFileName(draft)

      const { error: uploadError } = await supabase.storage
        .from('vault')
        .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })

      if (uploadError) throw uploadError

      const { error: insertError } = await supabase.from('documents').insert({
        account_id: accountId,
        name: pdfName,
        size: `${Math.max(bytes.byteLength / 1024, 0.1).toFixed(1)} KB`,
        type: 'application/pdf',
        url: '',
        storage_path: storagePath,
        document_type: 'PROPOSAL',
        metadata: {
          proposal: {
            accountName: draft.accountName,
            dealId: dealId || null,
            dealTitle: draft.dealTitle || null,
            attentionLine: draft.attentionLine,
            subject: draft.subject,
            supplierName: draft.supplierName,
            terminationFee: draft.terminationFee,
            blendAndExtend: draft.blendAndExtend,
            blendExtendMonths: draft.blendExtendMonths,
            annualUsage: draft.annualUsage || null,
            currentRate: draft.currentRate || null,
            facilityAddress: draft.facilityAddress || null,
            primaryContacts: draft.primaryContacts,
            rateStructures: draft.rateStructures,
            emailText,
            emailHtml,
            generatedBy: user?.email || profile?.email || null,
          },
        },
      })

      if (insertError) throw insertError

      queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
      toast.success('Proposal saved to Vault', { id: toastId })
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save proposal', { id: toastId })
    } finally {
      setIsSaving(false)
    }
  }

  const canAddRate = rateStructures.length < 3

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={panelTheme.shell}
    >
      <div className={panelTheme.header}>
        <div className={panelTheme.headerTitleWrap}>
          <div className="h-8 w-8 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
              Create Proposal
            </h2>
            <div className="text-zinc-200 font-sans text-sm truncate max-w-[190px]">
              {accountName}
            </div>
          </div>
        </div>
        <ForensicClose onClick={handleClose} size={16} />
      </div>

      <div className={panelTheme.body}>
        <div className="space-y-5">
          <div className="nodal-glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <CompanyIcon
                domain={proposalContext?.accountDomain || account?.domain || deal?.account?.domain}
                logoUrl={accountLogoUrl || undefined}
                name={accountName}
                size={36}
              />
              <div className="min-w-0">
                <div className="font-sans text-sm text-zinc-100 truncate">{accountName}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 truncate">
                  {proposalContext?.dealTitle || deal?.title || 'Proposal Draft'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[10px] font-mono text-zinc-400">
              <div>
                <div className="uppercase tracking-[0.2em] text-zinc-600">Facility</div>
                <div className="mt-1 text-zinc-200 leading-snug">{facilityAddress || '—'}</div>
              </div>
              <div>
                <div className="uppercase tracking-[0.2em] text-zinc-600">Annual Usage</div>
                <div className="mt-1 text-zinc-200 leading-snug">{annualUsage ? `${annualUsage} kWh` : '—'}</div>
              </div>
              <div>
                <div className="uppercase tracking-[0.2em] text-zinc-600">Current Rate</div>
                <div className="mt-1 text-zinc-200 leading-snug">{currentRate || '—'}</div>
              </div>
              <div>
                <div className="uppercase tracking-[0.2em] text-zinc-600">Contacts</div>
                <div className="mt-1 text-zinc-200 leading-snug">{primaryContacts.join(' and ') || '—'}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Attention Line</label>
              <Input
                value={attentionLine}
                onChange={(e) => setAttentionLine(e.target.value)}
                placeholder="Glenn and Tammy"
                className={panelTheme.field}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Thermo Plastics ENGIE Proposal"
                className={panelTheme.field}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Supplier</label>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="ENGIE"
                className={panelTheme.field}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Exit Fee</label>
                <Input
                  value={terminationFee}
                  onChange={(e) => setTerminationFee(cleanNumberInput(e.target.value))}
                  placeholder="0"
                  className={panelTheme.field}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Blend & Extend</label>
                <Select value={blendAndExtend ? 'on' : 'off'} onValueChange={(v) => setBlendAndExtend(v === 'on')}>
                  <SelectTrigger className={panelTheme.selectTrigger}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-white/10 text-white">
                    <SelectItem value="on" className="text-[10px] font-mono focus:bg-[#002FA7]/20">On</SelectItem>
                    <SelectItem value="off" className="text-[10px] font-mono focus:bg-[#002FA7]/20">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {blendAndExtend && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Extension Months</label>
                <Select value={String(blendExtendMonths)} onValueChange={(v) => setBlendExtendMonths(Number(v))}>
                  <SelectTrigger className={panelTheme.selectTrigger}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-white/10 text-white">
                    {[12, 24].map((months) => (
                      <SelectItem key={months} value={String(months)} className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                        {months} months
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Rate Structures</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                {rateStructures.length}/3
              </div>
            </div>

            <div className="space-y-3">
              {rateStructures.map((structure, index) => (
                <div key={structure.id} className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                      Rate Option {index + 1}
                    </div>
                    {rateStructures.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRateStructure(structure.id)}
                        className="text-zinc-600 hover:text-rose-400 transition-colors"
                        aria-label={`Remove option ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Label</label>
                      <Input
                        value={structure.label}
                        onChange={(e) => updateRateStructure(structure.id, { label: e.target.value })}
                        className={panelTheme.field}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Term</label>
                      <Select
                        value={structure.termMonths === '' ? '' : String(structure.termMonths)}
                        onValueChange={(v) => updateRateStructure(structure.id, { termMonths: Number(v) })}
                      >
                        <SelectTrigger className={panelTheme.selectTrigger}>
                          <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-white/10 text-white">
                          {[12, 24, 36, 48, 60].map((months) => (
                            <SelectItem key={months} value={String(months)} className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                              {months} months
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Rate</label>
                    <Input
                      value={structure.rate}
                      onChange={(e) => updateRateStructure(structure.id, { rate: cleanNumberInput(e.target.value) })}
                      placeholder="0.06275"
                      className={panelTheme.field}
                    />
                    <div className="font-mono text-[9px] text-zinc-600">
                      Display: {normalizeRateDisplay(structure.rate)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addRateStructure}
              disabled={!canAddRate}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-xl border border-[#002FA7]/30 px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors',
                canAddRate
                  ? 'bg-[#002FA7]/10 text-zinc-200 hover:bg-[#002FA7]/20'
                  : 'bg-black/20 text-zinc-700 cursor-not-allowed'
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rate Structure
            </button>
          </div>

          <div className="space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Preview</div>
            <div className="rounded-2xl overflow-hidden border border-white/5 bg-white">
              <EmailPreview html={DOMPurify.sanitize(emailHtml)} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[#002FA7]" />
              Draft Copy
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-zinc-300 leading-relaxed">
              {emailText}
            </pre>
          </div>
        </div>
      </div>

      <div className="shrink-0 p-6 border-t border-white/5 bg-zinc-950/90 space-y-2">
        <button
          type="button"
          onClick={saveProposal}
          disabled={isSaving || isGeneratingPdf || rateStructures.length === 0 || !accountId}
          className={panelTheme.cta}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Save className="w-4 h-4 text-white" />}
          Save Proposal
        </button>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={isSaving || isGeneratingPdf || rateStructures.length === 0}
          className="w-full h-10 rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Download className="w-4 h-4 text-white" />}
          Download PDF
        </button>
        <button
          type="button"
          onClick={copyHtml}
          disabled={isCopying || rateStructures.length === 0}
          className="w-full h-10 rounded-xl border border-[#002FA7]/20 bg-[#002FA7]/5 text-zinc-200 hover:bg-[#002FA7]/10 font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCopying ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Copy className="w-4 h-4 text-white" />}
          Copy HTML Email
        </button>
      </div>
    </motion.div>
  )
}
