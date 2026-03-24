'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  PenTool,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { panelTheme, useEscClose } from '@/components/right-panel/panelTheme'
import {
  documentMatchesSignatureRequestKind,
  getSignatureRequestKindConfig,
  inferSignatureRequestKindFromDocument,
  normalizeSignatureRequestKind,
  type SignatureRequestKind,
} from '@/lib/signature-request'

const DocumentPreparationModal = dynamic(
  () =>
    import('../modals/DocumentPreparationModal').then(
      (m) => m.DocumentPreparationModal
    ),
  { ssr: false }
)

interface SignatureDocument {
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
  const [requestKind, setRequestKind] = useState<SignatureRequestKind>(
    normalizeSignatureRequestKind(
      signatureRequestContext?.requestKind ??
        inferSignatureRequestKindFromDocument(
          signatureRequestContext?.documentType,
          null
        )
    )
  )
  const [message, setMessage] = useState(
    'Please review and execute the following document.'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreparingDocument, setIsPreparingDocument] = useState(false)
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [showPrepModal, setShowPrepModal] = useState(false)

  const accountId = signatureRequestContext?.accountId || ''
  const requestKindConfig = useMemo(
    () => getSignatureRequestKindConfig(requestKind),
    [requestKind]
  )

  const { data: contacts, isLoading: loadingContacts } = useAccountContacts(accountId)
  const { data: deals, isLoading: loadingDeals } = useDealsByAccount(accountId)

  const {
    data: signatureDocuments = [],
    isLoading: loadingDocuments,
    refetch: refetchDocuments,
  } = useQuery({
    queryKey: ['signature-documents', accountId, requestKind],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, storage_path, created_at, document_type, metadata')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const docs = (data ?? []) as SignatureDocument[]
      return docs.filter((doc) => documentMatchesSignatureRequestKind(doc, requestKind))
    },
  })

  const selectedDocument = useMemo(
    () => signatureDocuments.find((d) => d.id === selectedDocumentId) ?? null,
    [selectedDocumentId, signatureDocuments]
  )

  useEffect(() => {
    setSelectedDocumentId(signatureRequestContext?.documentId || '')
    setSelectedDealId(signatureRequestContext?.dealId || '')
    setRequestKind(
      normalizeSignatureRequestKind(
        signatureRequestContext?.requestKind ??
          inferSignatureRequestKindFromDocument(
            signatureRequestContext?.documentType,
            null
          )
      )
    )
  }, [
    signatureRequestContext?.accountId,
    signatureRequestContext?.documentId,
    signatureRequestContext?.dealId,
    signatureRequestContext?.documentType,
    signatureRequestContext?.requestKind,
  ])

  useEffect(() => {
    if (signatureDocuments.length === 0) {
      if (selectedDocumentId) {
        setSelectedDocumentId('')
      }
      return
    }

    const selectedStillExists = signatureDocuments.some((doc) => doc.id === selectedDocumentId)
    if (!selectedStillExists) {
      setSelectedDocumentId(signatureDocuments[0].id)
    }
  }, [selectedDocumentId, signatureDocuments])

  const handleRequestKindChange = (kind: SignatureRequestKind) => {
    setRequestKind(kind)
    setSelectedDocumentId('')
    setSignatureRequestContext({
      ...(signatureRequestContext || {}),
      documentId: undefined,
      documentName: undefined,
      documentUrl: undefined,
      storagePath: undefined,
      documentType: null,
      requestKind: kind,
    })
  }

  const handleContactSelection = (value: string) => {
    setSelectedContactId(value === '__none__' ? '' : value)
  }

  const handleDealLinkSelection = (value: string) => {
    setSelectedDealId(value === '__none__' ? '' : value)
  }

  const handleClose = useCallback(() => {
    setSignatureRequestContext(null)
    setRightPanelMode('DEFAULT')
  }, [setRightPanelMode, setSignatureRequestContext])

  useEscClose(handleClose, showPrepModal)

  const buildNextSignatureContext = (
    document: SignatureDocument,
    documentUrl?: string
  ) => ({
    ...(signatureRequestContext || {}),
    accountId,
    documentId: document.id,
    documentName: document.name,
    storagePath: document.storage_path,
    documentUrl,
    documentType:
      document.document_type ??
      document?.metadata?.ai_extraction?.type ??
      signatureRequestContext?.documentType ??
      null,
    requestKind,
  })

  const hydrateDocumentUrl = async (document: SignatureDocument) => {
    const { data, error } = await supabase.storage
      .from('vault')
      .createSignedUrl(document.storage_path, 3600)

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Failed to access secure document')
    }

    setSignatureRequestContext(buildNextSignatureContext(document, data.signedUrl))
  }

  const handleDocumentSelection = (documentId: string) => {
    setSelectedDocumentId(documentId)
    const doc = signatureDocuments.find((d) => d.id === documentId)
    if (doc) {
      setSignatureRequestContext(buildNextSignatureContext(doc))
    }
  }

  const handleUploadDocument = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || [])
    if (!accountId || files.length === 0) return

    setUploadingDocument(true)
    const toastId = toast.loading('Uploading document...')

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
            document_type: requestKindConfig.storedDocumentType,
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
        if (analysisType && !requestKindConfig.sourceAnalysisTypes.includes(analysisType)) {
          toast.warning(
            `Uploaded, but AI labeled this as ${analysisType}. It may not appear in ${requestKindConfig.uiLabel} filters.`,
            { id: toastId }
          )
        } else {
          toast.success(`${requestKindConfig.uiLabel} uploaded and indexed for signature flow.`, {
            id: toastId,
          })
        }

        setSelectedDocumentId(insertedDoc.id)
        setSignatureRequestContext(
          buildNextSignatureContext(insertedDoc as SignatureDocument)
        )
      }

      await refetchDocuments()
      queryClient.invalidateQueries({ queryKey: ['vault-documents'] })
      queryClient.invalidateQueries({ queryKey: ['vault-accounts'] })
    } catch (error: any) {
      toast.error(error?.message || 'Document upload failed', { id: toastId })
    } finally {
      setUploadingDocument(false)
      e.target.value = ''
    }
  }

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedDocument) {
      toast.error('Please select a document first')
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
      toast.error('No document selected')
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
          documentKind: requestKind,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Failed to dispatch request')
      }

      toast.success(`${requestKindConfig.uiLabel} request dispatched successfully`, { id: toastId })

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
      className={`${panelTheme.shell} z-50`}
    >
      <DocumentPreparationModal
        isOpen={showPrepModal}
        onClose={() => setShowPrepModal(false)}
        onComplete={executeDispatch}
        pdfUrl={signatureRequestContext?.documentUrl || ''}
        documentKind={requestKind}
      />

      <div className={panelTheme.header}>
        <div className={panelTheme.headerTitleWrap}>
          <div className="h-8 w-8 rounded-lg bg-[#002FA7]/20 border border-[#002FA7]/30 flex items-center justify-center">
            <PenTool className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
              Request Signature
            </h2>
            <div className="text-zinc-200 font-sans text-sm truncate max-w-[190px]">
              {selectedDocument?.name || 'Select document'}
            </div>
          </div>
        </div>
        <ForensicClose onClick={handleClose} size={16} />
      </div>

      <div className={panelTheme.body}>
        <form id="sig-form" onSubmit={handleInitialSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Request Type
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/30 p-1">
              {(['CONTRACT', 'LOE'] as const).map((kind) => {
                const isActive = requestKind === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => handleRequestKindChange(kind)}
                    className={`rounded-lg px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                      isActive
                        ? 'bg-[#002FA7] text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {kind === 'CONTRACT' ? 'Contract' : 'LOE'}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              {requestKindConfig.uiLabel} Source <span className="text-rose-500">*</span>
            </label>

            {accountId ? (
              <>
                {loadingDocuments ? (
                  <div className="text-xs font-mono text-zinc-600">
                    Loading {requestKindConfig.uiLabel} documents...
                  </div>
                ) : signatureDocuments.length > 0 ? (
                  <Select
                    value={selectedDocumentId}
                    onValueChange={(value) => handleDocumentSelection(value)}
                  >
                    <SelectTrigger className={panelTheme.selectTrigger}>
                      <SelectValue placeholder="Select document" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-white/10 text-white">
                      {signatureDocuments.map((doc) => (
                        <SelectItem
                          key={doc.id}
                          value={doc.id}
                          className="text-[10px] font-mono focus:bg-[#002FA7]/20"
                        >
                          {doc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs font-mono text-zinc-600">
                    No {requestKindConfig.uiLabel} documents found for this account yet.
                  </div>
                )}

                {selectedDocument && (
                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="truncate">{selectedDocument.name}</span>
                    <span className="ml-auto tabular-nums text-zinc-600">
                      {formatDistanceToNow(new Date(selectedDocument.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                )}

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#002FA7]/60 bg-[#002FA7]/40 text-white text-[10px] font-mono uppercase tracking-widest cursor-pointer hover:bg-[#002FA7]/55 transition-colors w-full justify-center">
                  {uploadingDocument ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5 text-white" />
                      Upload {requestKindConfig.uiLabel}
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleUploadDocument}
                    disabled={uploadingDocument}
                  />
                </label>
              </>
            ) : (
              <div className="text-xs font-mono text-rose-400">
                No account context found. Open this panel from an account or document.
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
                <Select
                  value={selectedContactId}
                  onValueChange={(value) => handleContactSelection(value)}
                >
                  <SelectTrigger className={panelTheme.selectTrigger}>
                    <SelectValue placeholder="Select contact" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-white/10 text-white">
                    <SelectItem value="__none__" className="text-[10px] font-mono text-zinc-500">
                      -- Select Contact --
                    </SelectItem>
                    {contacts.map((c: Contact) => {
                      const label =
                        c.name ||
                        [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                        'Unknown'
                      const meta = c.email ? ` (${c.email})` : ''
                      return (
                        <SelectItem
                          key={c.id}
                          value={c.id}
                          className="text-[10px] font-mono focus:bg-[#002FA7]/20"
                        >
                          {label}
                          {meta}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
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
              <Select
                value={selectedDealId}
                onValueChange={(value) => handleDealLinkSelection(value)}
              >
                <SelectTrigger className={panelTheme.selectTrigger}>
                  <SelectValue placeholder="Link contract/deal (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-white/10 text-white">
                  <SelectItem value="__none__" className="text-[10px] font-mono text-zinc-500">
                    -- None --
                  </SelectItem>
                  {deals.map((d) => (
                    <SelectItem
                      key={d.id}
                      value={d.id}
                      className="text-[10px] font-mono focus:bg-[#002FA7]/20"
                    >
                      {d.title} ({d.stage})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              className={panelTheme.textarea}
            />
          </div>
        </form>
      </div>

      <div className="shrink-0 p-6 border-t border-white/5 bg-zinc-950/90">
        <button
          type="submit"
          form="sig-form"
          disabled={
            isSubmitting ||
            isPreparingDocument ||
            !selectedContactId ||
            !selectedDocument
          }
          className={panelTheme.cta}
        >
          {isSubmitting || isPreparingDocument ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              {isPreparingDocument ? 'Preparing Document...' : 'Dispatching...'}
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 text-white" />
              Next: Place Signatures
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}
