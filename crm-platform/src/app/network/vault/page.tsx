'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  FileText,
  FolderOpen,
  UploadCloud,
  ChevronLeft,
  Receipt,
  Activity,
  FileStack,
  Trash2,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { useVaultDocuments, useVaultDocumentsInvalidate, type VaultDocument, type DocumentTypeFilter } from '@/hooks/useVaultDocuments'
import { useSearchAccounts } from '@/hooks/useAccounts'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import DataIngestionCard from '@/components/dossier/DataIngestionCard'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const VAULT_FILTERS: { id: DocumentTypeFilter; label: string; icon: React.ElementType }[] = [
  { id: 'ALL_ASSETS', label: 'All Assets', icon: FileStack },
  { id: 'CONTRACT', label: 'Contracts', icon: FileText },
  { id: 'INVOICE', label: 'Invoices', icon: Receipt },
  { id: 'USAGE_DATA', label: 'Telemetry', icon: Activity },
  { id: 'PROPOSAL', label: 'Proposals', icon: FileText },
]

const DOC_TYPES: { value: DocumentTypeFilter; label: string }[] = [
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'USAGE_DATA', label: 'Usage Data' },
  { value: 'PROPOSAL', label: 'Proposal' },
]

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default function VaultPage() {
  const [filter, setFilter] = useState<DocumentTypeFilter>('ALL_ASSETS')
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [ingestionOpen, setIngestionOpen] = useState(false)
  const [ingestionFiles, setIngestionFiles] = useState<File[]>([])
  const [ingestionAccountId, setIngestionAccountId] = useState<string | null>(null)
  const [ingestionAccountName, setIngestionAccountName] = useState<string>('')
  const [ingestionDocType, setIngestionDocType] = useState<DocumentTypeFilter>('CONTRACT')
  const [ingestionAccountSearch, setIngestionAccountSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  const queryClient = useQueryClient()
  const invalidateVault = useVaultDocumentsInvalidate()
  const { data: documents = [], isLoading: docsLoading } = useVaultDocuments(filter)
  const { data: searchAccounts = [], isFetching: searchAccountsLoading } = useSearchAccounts(ingestionAccountSearch)

  const accountsWithDocs = useMemo(() => {
    const byAccount = new Map<string, { docs: VaultDocument[]; lastAt: string }>()
    for (const d of documents) {
      const aid = d.account_id ?? '_none'
      const cur = byAccount.get(aid)
      const list = cur ? [...cur.docs, d] : [d]
      const lastAt = cur
        ? (new Date(d.created_at) > new Date(cur.lastAt) ? d.created_at : cur.lastAt)
        : d.created_at
      byAccount.set(aid, { docs: list, lastAt })
    }
    return byAccount
  }, [documents])

  const accountIds = useMemo(() => Array.from(accountsWithDocs.keys()).filter((id) => id !== '_none'), [accountsWithDocs])

  const { data: accountsMap } = useQuery({
    queryKey: ['vault-accounts', accountIds],
    queryFn: async () => {
      if (accountIds.length === 0) return {}
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, status, logo_url, domain')
        .in('id', accountIds)
      if (error) throw error
      const map: Record<string, { name: string; status?: string; logoUrl?: string; domain?: string }> = {}
      for (const a of data ?? []) {
        map[a.id] = {
          name: a.name ?? 'Unknown',
          status: a.status,
          logoUrl: a.logo_url ?? undefined,
          domain: a.domain ?? undefined,
        }
      }
      return map
    },
    enabled: accountIds.length > 0,
  })

  const folderList = useMemo(() => {
    return accountIds.map((id) => {
      const { docs, lastAt } = accountsWithDocs.get(id)!
      const acc = accountsMap?.[id]
      const totalBytes = docs.reduce((sum, d) => {
        const m = d.size?.match(/^([\d.]+)\s*(\w+)$/i)
        if (!m) return sum
        const n = parseFloat(m[1])
        const u = (m[2] || '').toUpperCase()
        const k = u === 'KB' ? 1024 : u === 'MB' ? 1024 * 1024 : u === 'GB' ? 1024 ** 3 : 1
        return sum + n * k
      }, 0)
      return {
        accountId: id,
        name: acc?.name ?? id,
        status: acc?.status,
        logoUrl: acc?.logoUrl,
        domain: acc?.domain,
        fileCount: docs.length,
        lastAt,
        totalSize: formatBytes(totalBytes),
      }
    })
  }, [accountIds, accountsWithDocs, accountsMap])

  const currentFolderDocs = selectedAccountId ? (accountsWithDocs.get(selectedAccountId)?.docs ?? []) : []
  const currentAccount = selectedAccountId ? accountsMap?.[selectedAccountId] : null

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      setIngestionFiles(files)
      setIngestionAccountId(null)
      setIngestionDocType('CONTRACT')
      setIngestionOpen(true)
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])

  const runIngestion = useCallback(async () => {
    if (!ingestionAccountId || ingestionFiles.length === 0) {
      toast.error('Select an account and ensure files are attached.')
      return
    }
    setUploading(true)
    const toastId = toast.loading('Ingesting data packets...')
    try {
      for (const file of ingestionFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `accounts/${ingestionAccountId}/${fileName}`

        const { error: uploadError } = await supabase.storage.from('vault').upload(filePath, file)
        if (uploadError) throw uploadError

        const { error: dbError } = await supabase.from('documents').insert({
          account_id: ingestionAccountId,
          name: file.name,
          size: formatBytes(file.size),
          type: file.type,
          storage_path: filePath,
          url: '',
        })
        if (dbError) throw dbError

        // AI classifies and sets document_type (CONTRACT/INVOICE/USAGE_DATA/PROPOSAL) so Vault tabs work
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
        const apiUrl = apiBaseUrl ? `${apiBaseUrl}/api/analyze-document` : '/api/analyze-document'
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: ingestionAccountId,
              filePath,
              fileName: file.name,
            }),
          })
          const result = await res.json()
          if (res.ok && result.analysis?.type) {
            const t = result.analysis.type
            if (t === 'SIGNED_CONTRACT' || t === 'BILL') {
              toast.success('Asset Secured. Account Status Upgraded to Customer.', { id: toastId })
            } else {
              toast.success(`Document labeled: ${t === 'USAGE_DATA' ? 'Telemetry' : t === 'PROPOSAL' ? 'Proposal' : 'Ingested'}.`, { id: toastId })
            }
          } else {
            toast.success('Document ingested.', { id: toastId })
          }
        } catch (_) {
          toast.success('Document ingested.', { id: toastId })
        }

        if (ingestionDocType === 'CONTRACT') {
          const { error: updateErr } = await supabase
            .from('accounts')
            .update({ status: 'CUSTOMER' })
            .eq('id', ingestionAccountId)
          if (updateErr) console.error('Account status update:', updateErr)
        }
      }
      invalidateVault()
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['vault-accounts'] })
      setIngestionOpen(false)
      setIngestionFiles([])
      setIngestionAccountId(null)
      setIngestionAccountName('')
    } catch (err) {
      console.error(err)
      toast.error('Ingestion failed', { id: toastId })
    } finally {
      setUploading(false)
    }
  }, [ingestionAccountId, ingestionFiles, ingestionDocType, invalidateVault, queryClient])

  const handleDeleteDoc = useCallback(
    async (doc: VaultDocument) => {
      try {
        await supabase.storage.from('vault').remove([doc.storage_path])
        await supabase.from('documents').delete().eq('id', doc.id)
        toast.success('Document purged')
        invalidateVault()
        if (selectedDoc?.id === doc.id) setSelectedDoc(null)
      } catch (err) {
        console.error(err)
        toast.error('Purge failed')
      }
    },
    [invalidateVault, selectedDoc]
  )

  const handleDownload = useCallback(async (doc: VaultDocument) => {
    try {
      const { data, error } = await supabase.storage.from('vault').createSignedUrl(doc.storage_path, 60)
      if (error) throw error
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    } catch (err) {
      console.error(err)
      toast.error('Failed to access file')
    }
  }, [])

  const docIcon = (doc: VaultDocument) => {
    const t = doc.document_type ?? doc.type ?? ''
    if (t.includes('CONTRACT') || t === 'application/pdf') return <FileText className="w-4 h-4" />
    if (t.includes('INVOICE')) return <Receipt className="w-4 h-4" />
    if (t.includes('USAGE')) return <Activity className="w-4 h-4" />
    return <FileText className="w-4 h-4" />
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CollapsiblePageHeader
        title="The Vault"
        description="Evidence locker. Documents by account; ingestion triggers account state."
        backHref={selectedAccountId ? undefined : undefined}
        globalFilter={globalFilter}
        onSearchChange={setGlobalFilter}
        placeholder="Filter accounts..."
      />

      {/* Global drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          'nodal-void-card border border-dashed border-white/10 p-4 transition-colors',
          'hover:border-[#002FA7]/40 hover:bg-[#002FA7]/5'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] bg-[#002FA7]/20 flex items-center justify-center">
            <UploadCloud className="w-5 h-5 text-[#002FA7]" />
          </div>
          <div>
            <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Ingestion zone</p>
            <p className="text-[10px] text-zinc-600 font-mono">Drop files to assign account and document type</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Sidebar: sliding pill + white text/icon when selected */}
        <aside className="w-48 flex-shrink-0 nodal-void-card p-2 space-y-0.5 relative">
          {VAULT_FILTERS.map((f) => {
            const Icon = f.icon
            const isSelected = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="relative w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left font-mono text-[10px] uppercase tracking-wider transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              >
                {isSelected && (
                  <motion.div
                    layoutId="vault-sidebar-pill"
                    className="absolute inset-0 rounded-xl bg-[#002FA7]/30 border border-[#002FA7]/50 pointer-events-none"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn('w-4 h-4 flex-shrink-0 relative z-10', isSelected && 'text-white')} />
                <span className={cn('relative z-10', isSelected && 'text-white')}>{f.label}</span>
              </button>
            )
          })}
        </aside>

        {/* Main: grid or folder + list */}
        <main className="flex-1 min-w-0 nodal-void-card overflow-hidden flex flex-col">
          {selectedAccountId ? (
            <>
              <div className="flex items-center gap-2 p-3 border-b border-white/5 nodal-recessed">
                <button
                  onClick={() => { setSelectedAccountId(null); setSelectedDoc(null) }}
                  className="icon-button-forensic w-8 h-8 flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <CompanyIcon
                  logoUrl={currentAccount?.logoUrl}
                  domain={currentAccount?.domain}
                  name={currentAccount?.name ?? selectedAccountId}
                  size={28}
                  roundedClassName="rounded-[10px]"
                  className="flex-shrink-0"
                />
                <Link
                  href={`/network/accounts/${selectedAccountId}`}
                  className="group/company"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="font-mono text-sm text-zinc-200 group-hover/company:text-white group-hover/company:scale-[1.02] transition-all origin-left truncate inline-block">
                    {currentAccount?.name ?? selectedAccountId}
                  </span>
                </Link>
                <span className="text-[10px] font-mono text-zinc-600 tabular-nums">{currentFolderDocs.length} docs</span>
              </div>
              <div className="flex flex-1 min-h-0">
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="p-3 border-b border-white/5">
                    <DataIngestionCard
                      accountId={selectedAccountId}
                      onIngestionComplete={() => { invalidateVault(); queryClient.invalidateQueries({ queryKey: ['vault-accounts'] }) }}
                    />
                  </div>
                  <div className="flex-1 overflow-auto p-2">
                    {currentFolderDocs.length === 0 ? (
                      <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest py-8 text-center">No evidence in this container</p>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5 nodal-recessed">
                            <th className="pb-2 pr-2 w-8">Type</th>
                            <th className="pb-2 pr-2">Filename</th>
                            <th className="pb-2 pr-2">Date</th>
                            <th className="pb-2 pr-2 w-20">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentFolderDocs.map((doc) => (
                            <motion.tr
                              key={doc.id}
                              onClick={() => setSelectedDoc(doc)}
                              className={cn(
                                'border-b border-white/5 cursor-pointer transition-colors font-mono text-xs',
                                selectedDoc?.id === doc.id ? 'bg-[#002FA7]/20 text-zinc-100' : 'hover:bg-[#002FA7]/10 text-zinc-400'
                              )}
                            >
                              <td className="py-2 pr-2">
                                <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-zinc-400">
                                  {docIcon(doc)}
                                </div>
                              </td>
                              <td className="py-2 pr-2 text-zinc-300 truncate max-w-[200px]">{doc.name}</td>
                              <td className="py-2 pr-2 text-zinc-500 tabular-nums">{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</td>
                              <td className="py-2 pr-2">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDownload(doc) }}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:bg-white/10 hover:text-[#002FA7]"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc) }}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:bg-white/10 hover:text-red-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                {/* Right panel inspector */}
                <AnimatePresence>
                  {selectedDoc && (
                    <motion.aside
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 280, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="flex-shrink-0 border-l border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden flex flex-col nodal-monolith-edge"
                    >
                      <div className="p-3 border-b border-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Inspector</span>
                        <button onClick={() => setSelectedDoc(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-3 space-y-3 flex-1 overflow-auto">
                        <div className="rounded-xl bg-black/40 border border-white/5 p-4 flex items-center justify-center">
                          {docIcon(selectedDoc)}
                          <span className="ml-2 font-mono text-xs text-zinc-400 truncate">{selectedDoc.name}</span>
                        </div>
                        <dl className="space-y-2 text-[10px] font-mono">
                          <div>
                            <dt className="text-zinc-600 uppercase tracking-wider">Filename</dt>
                            <dd className="text-zinc-300 truncate">{selectedDoc.name}</dd>
                          </div>
                          <div>
                            <dt className="text-zinc-600 uppercase tracking-wider">Date ingested</dt>
                            <dd className="text-zinc-300 tabular-nums">{formatDistanceToNow(new Date(selectedDoc.created_at), { addSuffix: true })}</dd>
                          </div>
                          {selectedDoc.size && (
                            <div>
                              <dt className="text-zinc-600 uppercase tracking-wider">Size</dt>
                              <dd className="text-zinc-300 tabular-nums">{selectedDoc.size}</dd>
                            </div>
                          )}
                          {selectedDoc.document_type && (
                            <div>
                              <dt className="text-zinc-600 uppercase tracking-wider">Type</dt>
                              <dd className="text-zinc-300 uppercase">{selectedDoc.document_type}</dd>
                            </div>
                          )}
                        </dl>
                        <div className="flex flex-col gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-white/10 bg-white/5 text-zinc-300 font-mono text-[10px]"
                            onClick={() => handleDownload(selectedDoc)}
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-2" /> View raw
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-red-500/30 text-red-400/90 font-mono text-[10px]"
                            onClick={() => handleDeleteDoc(selectedDoc)}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                          </Button>
                        </div>
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 border-b border-white/5 nodal-recessed">
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Account containers</p>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {docsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
                  </div>
                ) : folderList.length === 0 ? (
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest py-16 text-center">No account folders. Drop files above to create.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {folderList
                      .filter((f) => !globalFilter || f.name.toLowerCase().includes(globalFilter.toLowerCase()))
                      .map((folder) => (
                        <motion.button
                          key={folder.accountId}
                          type="button"
                          onClick={() => setSelectedAccountId(folder.accountId)}
                          className="nodal-void-card p-4 text-left transition-all hover:border-[#002FA7]/30 hover:bg-[#002FA7]/10 group"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <CompanyIcon
                              logoUrl={folder.logoUrl}
                              domain={folder.domain}
                              name={folder.name}
                              size={36}
                              roundedClassName="rounded-[14px]"
                            />
                            <span
                              className={cn(
                                'w-2 h-2 rounded-full flex-shrink-0',
                                folder.status === 'CUSTOMER' ? 'bg-[#002FA7]' : folder.status === 'PROSPECT' ? 'bg-amber-500' : 'bg-zinc-600'
                              )}
                            />
                          </div>
                          <p className="font-mono text-sm text-zinc-200 truncate mb-1">{folder.name}</p>
                          <p className="text-[10px] font-mono text-zinc-500 tabular-nums">
                            DOCS: {String(folder.fileCount).padStart(2, '0')} · {folder.totalSize}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-600">{formatDistanceToNow(new Date(folder.lastAt), { addSuffix: true })}</p>
                        </motion.button>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Ingestion modal */}
      <AnimatePresence>
        {ingestionOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !uploading && setIngestionOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md nodal-void-card shadow-xl overflow-hidden"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-mono text-zinc-200 uppercase tracking-widest">Ingest evidence</h3>
                {!uploading && (
                  <button onClick={() => setIngestionOpen(false)} className="p-2 rounded-lg hover:bg-white/10 text-zinc-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Account</label>
                  <Input
                    placeholder="Search accounts..."
                    value={ingestionAccountSearch}
                    onChange={(e) => setIngestionAccountSearch(e.target.value)}
                    className="font-mono text-sm bg-black/40 border-white/10"
                  />
                  <div className="mt-1 max-h-40 overflow-auto rounded-xl border border-white/5 nodal-module-glass">
                    {searchAccountsLoading && ingestionAccountSearch.length >= 2 ? (
                      <div className="p-3 flex items-center gap-2 text-zinc-500 font-mono text-xs">
                        <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                      </div>
                    ) : ingestionAccountSearch.length >= 2 && searchAccounts.length > 0 ? (
                      searchAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => { setIngestionAccountId(acc.id); setIngestionAccountName(acc.name); setIngestionAccountSearch(acc.name) }}
                          className={cn(
                            'w-full flex items-center gap-2 p-2 text-left font-mono text-xs transition-colors',
                            ingestionAccountId === acc.id ? 'bg-[#002FA7]/20 text-[#002FA7]' : 'text-zinc-300 hover:bg-white/5'
                          )}
                        >
                          {acc.name}
                        </button>
                      ))
                    ) : ingestionAccountId ? (
                      <div className="p-2 font-mono text-xs text-zinc-400">Selected: {(ingestionAccountName || accountsMap?.[ingestionAccountId]?.name) ?? ingestionAccountId}</div>
                    ) : null}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Document type</label>
                  <select
                    value={ingestionDocType}
                    onChange={(e) => setIngestionDocType(e.target.value as DocumentTypeFilter)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 text-zinc-200 font-mono text-sm px-3 py-2"
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] font-mono text-zinc-600">
                  {ingestionFiles.length} file(s). {ingestionDocType === 'CONTRACT' && 'Account will be set to CUSTOMER on upload.'}
                </p>
              </div>
              <div className="p-4 border-t border-white/5 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIngestionOpen(false)} disabled={uploading} className="font-mono text-[10px]">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={runIngestion}
                  disabled={!ingestionAccountId || uploading}
                  className="bg-[#002FA7] hover:bg-[#002FA7]/90 font-mono text-[10px]"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                  Ingest
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
