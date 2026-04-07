'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building2,
  Check,
  FileText,
  Loader2,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { useAccount, useSearchAccounts } from '@/hooks/useAccounts'
import { formatBytes, ingestAccountFile, isCsvFile } from '@/lib/file-ingestion'
import { cn } from '@/lib/utils'

interface DesktopFileIngestModalProps {
  isOpen: boolean
  onClose: () => void
  initialFiles?: File[] | null
  initialAccountId?: string | null
  initialAccountName?: string | null
}

export function DesktopFileIngestModal({
  isOpen,
  onClose,
  initialFiles = null,
  initialAccountId = null,
  initialAccountName = null,
}: DesktopFileIngestModalProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedAccountName, setSelectedAccountName] = useState<string>('')
  const [accountQuery, setAccountQuery] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const hasInitializedRef = useRef(false)

  const { data: selectedAccount } = useAccount(selectedAccountId || '')
  const { data: searchResults = [], isFetching: isSearching } = useSearchAccounts(accountQuery)

  const selectedAccountLabel = selectedAccount?.name || selectedAccountName || 'No account selected'
  const stagedSize = useMemo(() => selectedFiles.reduce((sum, file) => sum + file.size, 0), [selectedFiles])

  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false
      setSelectedFiles([])
      setSelectedAccountId(null)
      setSelectedAccountName('')
      setAccountQuery('')
      setIsUploading(false)
      return
    }

    if (hasInitializedRef.current) {
      return
    }

    setSelectedFiles((initialFiles || []).filter((file) => !isCsvFile(file)))
    if (initialAccountId) {
      setSelectedAccountId(initialAccountId)
    }
    if (initialAccountName) {
      setSelectedAccountName(initialAccountName)
      setAccountQuery(initialAccountName)
    }
    hasInitializedRef.current = true
  }, [isOpen, initialFiles, initialAccountId, initialAccountName])

  useEffect(() => {
    if (!selectedAccount) return
    setSelectedAccountName(selectedAccount.name)
  }, [selectedAccount])

  const handleFilesAdded = (files: FileList | File[]) => {
    const nextFiles = Array.from(files)
    if (nextFiles.length === 0) return

    const csvFiles = nextFiles.filter(isCsvFile)
    const documentFiles = nextFiles.filter((file) => !isCsvFile(file))

    if (csvFiles.length > 0) {
      toast.error('CSV files should use Bulk Import.')
    }

    if (documentFiles.length === 0) {
      return
    }

    setSelectedFiles((current) => {
      const merged = [...current]
      documentFiles.forEach((file) => {
        const alreadyIncluded = merged.some((existing) => existing.name === file.name && existing.size === file.size)
        if (!alreadyIncluded) {
          merged.push(file)
        }
      })
      return merged
    })
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      handleFilesAdded(files)
      event.target.value = ''
    }
  }

  const handleAttach = async () => {
    if (!selectedAccountId) {
      toast.error('Search and select an account first.')
      return
    }

    if (selectedFiles.length === 0) {
      toast.error('Add one or more files first.')
      return
    }

    const documents = selectedFiles.filter((file) => !isCsvFile(file))
    if (documents.length === 0) {
      toast.error('CSV files should use Bulk Import.')
      return
    }

    setIsUploading(true)
    const toastId = toast.loading('Routing files to the selected account...')

    let successCount = 0
    let errorCount = 0
    const analysisTypes = new Set<string>()

    try {
      for (const file of documents) {
        try {
          const result = await ingestAccountFile({ accountId: selectedAccountId, file })
          successCount += 1
          if (result.analysisType) {
            analysisTypes.add(result.analysisType)
          }
        } catch (error) {
          errorCount += 1
          console.error('[DesktopFileIngestModal] upload failed:', error)
        }
      }

      const accountKeyMatches = (query: any) => {
        const key = Array.isArray(query.queryKey) ? query.queryKey : []
        const [scope, accountKey] = key
        return scope === 'account' && accountKey === selectedAccountId
      }

      const accountBillKeyMatches = (query: any) => {
        const key = Array.isArray(query.queryKey) ? query.queryKey : []
        const [scope, accountKey] = key
        return scope === 'account-bill-intel' && accountKey === selectedAccountId
      }

      await queryClient.invalidateQueries({ predicate: accountKeyMatches })
      await queryClient.refetchQueries({ predicate: accountKeyMatches })
      await queryClient.invalidateQueries({ predicate: accountBillKeyMatches })
      await queryClient.refetchQueries({ predicate: accountBillKeyMatches })
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      await queryClient.invalidateQueries({ queryKey: ['targets'] })
      await queryClient.invalidateQueries({ queryKey: ['deals'] })
      await queryClient.invalidateQueries({ queryKey: ['vault-documents'] })

      if (successCount > 0) {
        const analysisLabel = analysisTypes.has('SIGNED_CONTRACT') || analysisTypes.has('CONTRACT')
          ? 'contract'
          : analysisTypes.has('BILL')
            ? 'bill'
            : analysisTypes.has('USAGE_DATA')
              ? 'usage data'
              : null

        toast.success(
          `${successCount} file${successCount === 1 ? '' : 's'} attached to ${selectedAccountLabel}${analysisLabel ? ` (${analysisLabel} analyzed)` : ''}.`,
          { id: toastId }
        )
      } else {
        toast.error('No files were attached.', { id: toastId })
      }

      if (errorCount > 0) {
        toast.error(`${errorCount} file${errorCount === 1 ? '' : 's'} failed to attach.`, { id: toastId })
      }

      if (successCount > 0) {
        onClose()
      }
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="!flex !h-[min(92vh,58rem)] !w-[min(96vw,80rem)] !max-w-none !flex-col !overflow-hidden !rounded-[28px] !border-white/10 !bg-zinc-950/98 !p-0 text-white !shadow-[0_28px_120px_rgba(0,0,0,0.78)]"
      >
        <DialogTitle className="sr-only">Attach Files to Account</DialogTitle>
        <DialogDescription className="sr-only">
          Search for the correct account, then attach the files for ingestion.
        </DialogDescription>

        <div className="flex items-start justify-between gap-4 border-b border-white/5 bg-gradient-to-b from-[#002FA7]/10 to-transparent px-6 py-5 nodal-recessed">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-[#002FA7]/30 bg-[#002FA7]/15">
              <UploadCloud className="size-5 text-[#8ba6ff]" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#8ba6ff]">File routing</div>
              <div className="mt-1 text-base font-medium text-zinc-100 sm:text-lg">
                Drop files onto the right account
              </div>
              <div className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
                CSV files go to bulk import. PDFs, bills, contracts, and images are staged here for account attachment.
              </div>
            </div>
          </div>

          <ForensicClose onClick={onClose} size={18} />
        </div>

        <div className="grid flex-1 min-h-0 gap-5 overflow-y-auto px-6 py-5 np-scroll xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="min-w-0 space-y-4">
            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Selected Files</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    {selectedFiles.length > 0
                      ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} staged`
                      : 'Add files to attach'}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 rounded-xl border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.18em] text-zinc-300"
                >
                  Add Files
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,.xls,.xlsx,.csv"
                className="hidden"
                onChange={handleFileInputChange}
              />

              <div className="mt-4 max-h-[22rem] space-y-2 overflow-y-auto pr-1 np-scroll">
                <AnimatePresence initial={false}>
                  {selectedFiles.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center"
                    >
                      <FileText className="mx-auto size-6 text-zinc-500" />
                      <p className="mt-3 text-sm text-zinc-200">Drop a PDF, bill, or contract here.</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        Or click Add Files to browse your computer
                      </p>
                    </motion.div>
                  ) : (
                    selectedFiles.map((file) => (
                      <motion.div
                        key={`${file.name}-${file.size}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="flex items-center gap-3 rounded-2xl border border-white/5 bg-black/30 px-3 py-2.5"
                      >
                        <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] border border-white/5">
                          <FileText className="size-4 text-zinc-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-zinc-200">{file.name}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {formatBytes(file.size)} • {file.type || 'unknown type'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFiles((current) => current.filter((entry) => !(entry.name === file.name && entry.size === file.size)))
                          }}
                          className="flex size-8 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03] text-zinc-500 transition-colors hover:border-white/15 hover:text-zinc-200"
                          aria-label={`Remove ${file.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
              <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Routing Summary</div>
              <div className="mt-2 text-sm text-zinc-200">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} ready for ${selectedAccountLabel}.`
                  : 'Add files first, then choose the account that should own them.'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                  Size {formatBytes(stagedSize || 0)}
                </div>
                <div className="rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                  CSVs route to bulk import
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Account Search</div>
                  <div className="mt-1 text-sm text-zinc-300">Search the account that should own these files</div>
                </div>
                {isSearching && <Loader2 className="size-4 animate-spin text-zinc-500" />}
              </div>

              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                <Input
                  value={accountQuery}
                  onChange={(event) => setAccountQuery(event.target.value)}
                  placeholder="Search accounts..."
                  className="h-12 rounded-2xl border-white/10 bg-black/30 pl-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#002FA7]/50"
                />
              </div>

              <div className="mt-4 rounded-2xl border border-[#002FA7]/20 bg-[#002FA7]/8 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[#8ba6ff]">Selected Account</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-zinc-100">
                  <Building2 className="size-4 text-zinc-400" />
                  <span className="truncate">{selectedAccountLabel}</span>
                </div>
              </div>

              <div className="mt-4 max-h-[18rem] space-y-2 overflow-y-auto pr-1 np-scroll">
                {searchResults.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
                    {accountQuery.length < 2
                      ? 'Type at least two letters to search accounts.'
                      : 'No matching accounts found.'}
                  </div>
                ) : (
                  searchResults.map((account) => {
                    const active = account.id === selectedAccountId
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => {
                          setSelectedAccountId(account.id)
                          setSelectedAccountName(account.name)
                          setAccountQuery(account.name)
                        }}
                        className={cn(
                          'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                          active
                            ? 'border-[#002FA7]/35 bg-[#002FA7]/12'
                            : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.03]'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <CompanyIcon
                            logoUrl={account.logoUrl}
                            domain={account.domain}
                            name={account.name}
                            size={36}
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-zinc-100">{account.name}</div>
                            <div className="truncate text-[11px] text-zinc-500">
                              {account.domain || account.industry || 'Account'}
                            </div>
                          </div>
                          {active && (
                            <div className="flex size-7 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                              <Check className="size-3.5" />
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-3 border-t border-white/5 bg-black/35 px-6 py-4 nodal-recessed sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            {selectedAccountId ? 'Ready to route selected files.' : 'Select an account before attaching files.'}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-10 flex-1 rounded-xl border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.18em] text-zinc-300 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleAttach()}
              disabled={isUploading || selectedFiles.length === 0 || !selectedAccountId}
              className="h-10 flex-1 rounded-xl bg-[#002FA7] px-4 text-[10px] uppercase tracking-[0.18em] text-white hover:bg-[#0036c0] sm:flex-none"
            >
              {isUploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Attach Files
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
