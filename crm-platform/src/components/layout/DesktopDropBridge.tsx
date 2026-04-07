'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { FileSpreadsheet, FileText, UploadCloud } from 'lucide-react'
import { BulkImportModal } from '@/components/modals/BulkImportModal'
import { DesktopFileIngestModal } from '@/components/modals/DesktopFileIngestModal'
import { useAccount } from '@/hooks/useAccounts'
import { isCsvFile } from '@/lib/file-ingestion'
import { toast } from 'sonner'

function isFileDragEvent(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

export function DesktopDropBridge() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [csvImportFile, setCsvImportFile] = useState<File | null>(null)
  const [fileAttachOpen, setFileAttachOpen] = useState(false)
  const [fileAttachFiles, setFileAttachFiles] = useState<File[] | null>(null)
  const dragDepthRef = useRef(0)
  const pathname = usePathname()
  const currentPathname = pathname || ''
  const isAccountRoute = currentPathname.includes('/network/accounts/')
  const accountId = useMemo(() => {
    if (!isAccountRoute) return ''
    const segments = currentPathname.split('/').filter(Boolean)
    return segments[2] || ''
  }, [currentPathname, isAccountRoute])
  const { data: routeAccount } = useAccount(accountId)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.nodalDesktop?.isDesktop) {
      return
    }

    setIsDesktop(true)

    const handleDesktopUiEvent = (event: { type?: string }) => {
      if (event.type === 'open-csv-import') {
        setCsvImportFile(null)
        setCsvImportOpen(true)
      }

      if (event.type === 'open-file-attach') {
        setFileAttachFiles(null)
        setFileAttachOpen(true)
      }
    }

    const unsubscribe = window.nodalDesktop.onUiEvent(handleDesktopUiEvent)

    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return
      dragDepthRef.current += 1
      setIsDragging(true)
    }

    const handleDragOver = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return
      const dataTransfer = event.dataTransfer
      if (!dataTransfer) return
      event.preventDefault()
      dataTransfer.dropEffect = 'copy'
      setIsDragging(true)
    }

    const handleDragLeave = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDragging(false)
      }
    }

    const handleDrop = (event: DragEvent) => {
      if (!isFileDragEvent(event)) return
      event.preventDefault()
      dragDepthRef.current = 0
      setIsDragging(false)

      const dataTransfer = event.dataTransfer
      const droppedFiles = Array.from(dataTransfer?.files || [])
      if (droppedFiles.length === 0) return

      const csvFiles = droppedFiles.filter(isCsvFile)
      const otherFiles = droppedFiles.filter((file) => !isCsvFile(file))

      if (csvFiles.length > 0 && otherFiles.length === 0) {
        setCsvImportFile(csvFiles[0] || null)
        setCsvImportOpen(true)
        return
      }

      if (csvFiles.length > 0 && otherFiles.length > 0) {
        setFileAttachFiles(otherFiles)
        setFileAttachOpen(true)
        setCsvImportFile(null)
        toast.info('CSV files should be routed through Bulk Import.')
        return
      }

      setCsvImportFile(null)
      setFileAttachFiles(otherFiles)
      setFileAttachOpen(true)
    }

    const handleDragEnd = () => {
      dragDepthRef.current = 0
      setIsDragging(false)
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragend', handleDragEnd)

    return () => {
      unsubscribe()
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragend', handleDragEnd)
    }
  }, [])

  const routeAccountName = routeAccount?.name || ''

  if (!isDesktop) {
    return null
  }

  return (
    <>
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 backdrop-blur-sm"
          >
            <div className="w-[min(92vw,34rem)] rounded-3xl border border-white/10 bg-zinc-950/96 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.7)]">
              <div className="flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-2xl border border-[#002FA7]/25 bg-[#002FA7]/10">
                  <UploadCloud className="size-6 text-[#8ba6ff]" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Desktop Drop Target</div>
                  <div className="mt-1 text-lg text-zinc-100">Release files to route them into the CRM</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    CSVs open the bulk importer. PDFs, bills, and contracts open account routing.
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-200">
                    <FileSpreadsheet className="size-4 text-[#8ba6ff]" />
                    CSV Bulk Import
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Route contacts or accounts into the bulk ingestion modal
                  </div>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-zinc-200">
                    <FileText className="size-4 text-zinc-400" />
                    Account Attachment
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    Drop files to attach them to {routeAccountName || 'an account'}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BulkImportModal
        isOpen={csvImportOpen}
        onClose={() => {
          setCsvImportOpen(false)
          setCsvImportFile(null)
        }}
        initialFile={csvImportFile}
      />

      <DesktopFileIngestModal
        isOpen={fileAttachOpen}
        onClose={() => {
          setFileAttachOpen(false)
          setFileAttachFiles(null)
        }}
        initialFiles={fileAttachFiles}
        initialAccountId={routeAccount?.id || null}
        initialAccountName={routeAccountName || null}
      />
    </>
  )
}
