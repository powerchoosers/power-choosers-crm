'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  PenTool,
  ChevronRight,
  CheckCircle,
  Loader2,
  UploadCloud,
  FileText,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/context/AuthContext'
import { useAccountContacts, Contact } from '@/hooks/useContacts'
import { useDealsByAccount } from '@/hooks/useDeals'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import dynamic from 'next/dynamic'

const DocumentPreparationModal = dynamic(
  () =>
    import('../modals/DocumentPreparationModal').then(
      (m) => m.DocumentPreparationModal
    ),
  { ssr: false }
)

interface ContractDocument {
  id: string
  name: string
  storage_path: string
  created_at: string
  document_type?: string | null
  metadata?: any
}

export function SignatureRequestPanel() {
  const { setRightPanelMode, signatureRequestContext, setSignatureRequestContext } =
    useUIStore()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [selectedContactId, setSelectedContactId] = useState<string>('')
  const [selectedDealId, setSelectedDealId] = useState<string>('')
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
  const [message, setMessage] = useState(
    'Please review and execute the following document.'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreparingDocument, setIsPreparingDocument] = useState(false)
  const [uploadingContract, setUploadingContract] = useState(false)
  const [showPrepModal, setShowPrepModal] = useState(false)

  const accountId = signatureRequestContext?.accountId || ''

  const { data: contacts, isLoading: loadingContacts } = useAccountContacts(accountId)
  const { data: deals, isLoading: loadingDeals } = useDealsByAccount(accountId)

  const {
    data: contractDocuments = [],
    isLoading: loadingContractDocuments,
    refetch: refetchContractDocuments,
  } = useQuery({
    queryKey: ['signature-contract-documents', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, storage_path, created_at, document_type, metadata')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const docs = (data ?? []) as ContractDocument[]
      return docs.filter((doc) => {
        const aiType = doc?.metadata?.ai_extraction?.type
        return (
          doc.document_type === 'CONTRACT' ||
          aiType === 'CONTRACT' ||
          aiType === 'SIGNED_CONTRACT'
        )
      })
    },
  })

  const selectedDocument = useMemo(
    () => contractDocuments.find((d) => d.id === selectedDocumentId) ?? null,
    [contractDocuments, selectedDocumentId]
  )

  useEffect(() => {
    setSelectedDocumentId(signatureRequestContext?.documentId || '')
    setSelectedDealId(signatureRequestContext?.dealId || '')
  }, [
    signatureRequestContext?.accountId,
    signatureRequestContext?.documentId,
    signatureRequestContext?.dealId,
  ])

  useEffect(() => {
    if (!selectedDocumentId && contractDocuments.length > 0) {
      setSelectedDocumentId(contractDocuments[0].id)
    }
  }, [selectedDocumentId, contractDocuments])

  const handleClose = () => {
    setSignatureRequestContext(null)
    setRightPanelMode('DEFAULT')
  }

  const buildNextSignatureContext = (
    document: ContractDocument,
    documentUrl?: string
  ) => ({
    ...(signatureRequestContext || {}),
    accountId,
    documentId: document.id,
    documentName: document.name,
    storagePath: document.storage_path,
    documentUrl,
  })

  const hydrateDocumentUrl = async (document: ContractDocument) => {
    const { data, error } = await supabase.storage
      .from('vault')
      .createSignedUrl(document.storage_path, 3600)

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Failed to access secure contract')
    }

    setSignatureRequestContext(buildNextSignatureContext(document, data.signedUrl))
  }

  const handleContractSelection = (documentId: string) => {
    setSelectedDocumentId(documentId)
    const doc = contractDocuments.find((d) => d.id === documentId)
    if (doc) {
      setSignatureRequestContext(buildNextSignatureContext(doc))
    }
  }

  const handleUploadContract = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || [])
    if (!accountId || files.length === 0) return

    setUploadingContract(true)
    const toastId = toast.loading('Uploading contract...')

    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `accounts/${accountId}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('vault')
          .upload(filePath, file)
        if (uploadError) throw uploadError

        const { data: insertedDoc, error: insertError } = await supabase
          .from('documents')
          .insert({
            account_id: accountId,
            name: file.name,
            size: `${Math.max(file.size / 1024, 0.1).toFixed(1)} KB`,
            type: file.type,
            storage_path: filePath,
            url: '',
            document_type: 'CONTRACT',
          })
          .select('id, name, storage_path, created_at, document_type')
          .single()

        if (insertError || !insertedDoc) throw insertError

        const analyzeRes = await fetch('/api/analyze-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            filePath,
            fileName: file.name,
          }),
        })

        const analyzeJson = await analyzeRes.json().catch(() => null)
        const analysisType = analyzeJson?.analysis?.type
        if (
          analysisType &&
          analysisType !== 'CONTRACT' &&
          analysisType !== 'SIGNED_CONTRACT'
        ) {
          toast.warning(
            `Uploaded, but AI labeled this as ${analysisType}. It may not appear in contract filters.`,
            { id: toastId }
          )
        } else {
          toast.success('Contract uploaded and indexed for signature flow.', {
            id: toastId,
          })
        }

        setSelectedDocumentId(insertedDoc.id)
        setSignatureRequestContext(
          buildNextSignatureContext(insertedDoc as ContractDocument)
        )
      }

      await refetchContractDocuments()
      queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
      queryClient.invalidateQueries({ queryKey: ['vault-accounts'] })
    } catch (error: any) {
      toast.error(error?.message || 'Contract upload failed', { id: toastId })
    } finally {
      setUploadingContract(false)
      e.target.value = ''
    }
  }

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedDocument) {
      toast.error('Please select a contract first')
      return
    }
    if (!selectedContactId) {
      toast.error('Please select a contact to sign the document')
      return
    }

    setIsPreparingDocument(true)
    try {
      await hydrateDocumentUrl(selectedDocument)
      setShowPrepModal(true)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to prepare document for signing')
    } finally {
      setIsPreparingDocument(false)
    }
  }

  const executeDispatch = async (signatureFields: any[]) => {
    if (!signatureRequestContext?.documentId) {
      toast.error('No contract selected')
      return
    }

    setShowPrepModal(false)
    setIsSubmitting(true)
    const toastId = toast.loading('Generating secure token & dispatching email...')

    try {
      const res = await fetch('/api/signatures/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: signatureRequestContext.documentId,
          accountId: signatureRequestContext.accountId,
          contactId: selectedContactId,
          dealId: selectedDealId || undefined,
          userEmail: user?.email || 'test@nodalpoint.io',
          message,
          signatureFields,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Failed to dispatch request')
      }

      toast.success('Signature request dispatched successfully', { id: toastId })

      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['entity-emails'] })
      queryClient.invalidateQueries({ queryKey: ['emails-count'] })
      queryClient.invalidateQueries({ queryKey: ['deals'] })
      queryClient.invalidateQueries({ queryKey: ['deals-by-account'] })
      queryClient.invalidateQueries({ queryKey: ['deals-by-contact'] })

      handleClose()
    } catch (error: any) {
      toast.error(error.message, { id: toastId })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex-1 flex flex-col h-full bg-zinc-950 border-white/5 relative z-50 shadow-2xl"
    >
      <DocumentPreparationModal
        isOpen={showPrepModal}
        onClose={() => setShowPrepModal(false)}
        onComplete={executeDispatch}
        pdfUrl={signatureRequestContext?.documentUrl || ''}
      />

      <div className="h-24 px-6 flex items-center justify-between border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center text-[#002FA7]">
            <PenTool className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
              Request Signature
            </h2>
            <div className="text-zinc-200 font-sans text-sm truncate max-w-[190px]">
              {selectedDocument?.name || 'Select contract'}
            </div>
          </div>
        </div>
        <button onClick={handleClose} className="icon-button-forensic" title="Cancel">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto np-scroll p-6">
        <form id="sig-form" onSubmit={handleInitialSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Contract Source <span className="text-rose-500">*</span>
            </label>

            {accountId ? (
              <>
                {loadingContractDocuments ? (
                  <div className="text-xs font-mono text-zinc-600">
                    Loading uploaded contracts...
                  </div>
                ) : contractDocuments.length > 0 ? (
                  <select
                    value={selectedDocumentId}
                    onChange={(e) => handleContractSelection(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] outline-none transition-all"
                  >
                    {contractDocuments.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs font-mono text-zinc-600">
                    No contract documents found for this account yet.
                  </div>
                )}

                {selectedDocument && (
                  <div className="rounded-md border border-white/10 bg-black/30 px-3 py-2 flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="truncate">{selectedDocument.name}</span>
                    <span className="ml-auto tabular-nums text-zinc-600">
                      {formatDistanceToNow(new Date(selectedDocument.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                )}

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#002FA7]/40 bg-[#002FA7]/10 text-[#9db4ff] text-[10px] font-mono uppercase tracking-widest cursor-pointer hover:bg-[#002FA7]/20 transition-colors">
                  {uploadingContract ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      Upload Contract
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleUploadContract}
                    disabled={uploadingContract}
                  />
                </label>
              </>
            ) : (
              <div className="text-xs font-mono text-rose-400">
                No account context found. Open this panel from an account or contract.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Assign Signatory <span className="text-rose-500">*</span>
            </label>
            {loadingContacts ? (
              <div className="text-xs font-mono text-zinc-600">Loading contacts...</div>
            ) : contacts && contacts.length > 0 ? (
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] outline-none transition-all"
              >
                <option value="">-- Select Contact --</option>
                {contacts.map((c: Contact) => (
                  <option key={c.id} value={c.id}>
                    {c.name ||
                      [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                      'Unknown'}{' '}
                    ({c.email || 'No email'})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs font-mono text-rose-400">
                No contacts found for this account.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Link to Contract/Deal (Optional)
            </label>
            {loadingDeals ? (
              <div className="text-xs font-mono text-zinc-600">Loading contracts...</div>
            ) : deals && deals.length > 0 ? (
              <select
                value={selectedDealId}
                onChange={(e) => setSelectedDealId(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] outline-none transition-all"
              >
                <option value="">-- None --</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.stage})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs font-mono text-zinc-600">
                No active contracts to link.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Message to Signatory
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-[#002FA7] focus:ring-1 focus:ring-[#002FA7] outline-none transition-all resize-none"
            />
          </div>
        </form>
      </div>

      <div className="shrink-0 p-6 border-t border-white/5 bg-zinc-950">
        <button
          type="submit"
          form="sig-form"
          disabled={
            isSubmitting ||
            isPreparingDocument ||
            !selectedContactId ||
            !selectedDocumentId
          }
          className="w-full h-10 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-xs uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting || isPreparingDocument ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isPreparingDocument ? 'Preparing Document...' : 'Dispatching...'}
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Next: Place Signatures
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}
