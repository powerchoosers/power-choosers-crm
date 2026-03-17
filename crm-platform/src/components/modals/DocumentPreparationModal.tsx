'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, LayoutTemplate, ArrowRight } from 'lucide-react'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { Document, Page, pdfjs } from 'react-pdf'
import { Rnd } from 'react-rnd'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Required for react-pdf to work in Next.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`

export type FieldType = 'signature' | 'text'

export interface SignatureField {
    fieldId: string
    pageIndex: number
    x: number
    y: number
    width: number
    height: number
    type: FieldType
}

interface DocumentPreparationModalProps {
    isOpen: boolean
    onClose: () => void
    onComplete: (fields: SignatureField[]) => void
    pdfUrl: string
}

export function DocumentPreparationModal({ isOpen, onClose, onComplete, pdfUrl }: DocumentPreparationModalProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [pageNumber, setPageNumber] = useState(1)
    const [fields, setFields] = useState<SignatureField[]>([])
    const [currentTool, setCurrentTool] = useState<FieldType>('signature')
    const containerRef = useRef<HTMLDivElement>(null)
    // mounted: ensures createPortal only runs client-side (document is available)
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages)
    }

    const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        setFields([
            ...fields,
            {
                fieldId: crypto.randomUUID(),
                pageIndex: pageNumber - 1,
                x,
                y,
                width: 200,
                height: 40,
                type: currentTool
            }
        ])
    }

    const updateField = (index: number, updates: Partial<SignatureField>) => {
        setFields(fields.map((f, i) => i === index ? { ...f, ...updates } : f))
    }

    const removeField = (index: number) => {
        setFields(fields.filter((_, i) => i !== index))
    }

    // Portal renders directly into document.body — this breaks out of any parent
    // stacking contexts (framer-motion transforms on the right panel, z-50 containers,
    // etc.) that were causing the TopBar (z-40) to bleed over the modal (z-[9999]).
    if (!isOpen || !mounted) return null

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md"
            >
                <div className="w-full h-full max-w-6xl max-h-[90vh] bg-zinc-950 border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-zinc-950/80 sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded bg-[#002FA7]/20 text-[#002FA7]">
                                <LayoutTemplate className="w-4 h-4" />
                            </div>
                            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-300">
                                Place Signature Blocks
                            </h2>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                                CLICK ANYWHERE ON PAGE TO ADD BLOCK
                            </span>
                            <ForensicClose onClick={onClose} size={16} />
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* PDF Viewer */}
                        <div className="flex-1 overflow-y-auto np-scroll bg-zinc-900 p-8 flex justify-center" ref={containerRef}>
                            {pdfUrl ? (
                                <Document
                                    file={pdfUrl}
                                    onLoadSuccess={handleDocumentLoadSuccess}
                                    className="border border-white/10 shadow-2xl"
                                    loading={
                                        <div className="w-[800px] h-[1040px] flex flex-col items-center justify-center gap-8 bg-zinc-900 relative overflow-hidden border border-white/5">
                                            {/* Grid */}
                                            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(0,47,167,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,47,167,0.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
                                            {/* Scan line */}
                                            <motion.div
                                                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#002FA7]/70 to-transparent pointer-events-none"
                                                animate={{ y: [0, 1040] }}
                                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                                            />
                                            <div className="relative flex flex-col items-center gap-5 z-10">
                                                {/* Spinner */}
                                                <div className="relative w-14 h-14">
                                                    <div className="absolute inset-0 rounded-full border border-[#002FA7]/20" />
                                                    <div className="absolute inset-0 rounded-full border-2 border-[#002FA7]/20 border-t-[#002FA7] animate-spin" />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <LayoutTemplate className="w-5 h-5 text-[#002FA7]/50" />
                                                    </div>
                                                </div>
                                                {/* Labels */}
                                                <div className="text-center space-y-1.5">
                                                    <div className="text-[9px] font-mono uppercase tracking-[0.5em] text-[#002FA7]">NODAL POINT</div>
                                                    <div className="text-xs font-mono text-zinc-400 animate-pulse">Loading Secure Document</div>
                                                    <div className="text-[9px] font-mono text-zinc-600 tracking-[0.3em] uppercase">Establishing Encrypted Channel</div>
                                                </div>
                                                {/* Waveform */}
                                                <div className="flex gap-1.5 items-end h-6">
                                                    {[3, 6, 4, 8, 5, 7, 3, 5, 4].map((h, i) => (
                                                        <motion.div
                                                            key={i}
                                                            className="w-[3px] bg-[#002FA7]/40 rounded-full"
                                                            animate={{ height: [`${h * 2}px`, `${h * 4}px`, `${h * 2}px`] }}
                                                            transition={{ duration: 0.7 + i * 0.08, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    }
                                >
                                    <div className="relative inline-block cursor-crosshair">
                                        <Page
                                            pageNumber={pageNumber}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            width={800} // fixed width for consistent coordinate mapping
                                        />
                                        {/* Click overlay */}
                                        <div
                                            className="absolute inset-0 z-10"
                                            onClick={handlePageClick}
                                        />

                                        {/* Render fields for the current page */}
                                        {fields
                                            .map((field, i) => ({ field, originalIndex: i }))
                                            .filter(f => f.field.pageIndex === pageNumber - 1)
                                            .map(({ field, originalIndex }) => (
                                                <Rnd
                                                    key={originalIndex}
                                                    bounds="parent"
                                                    size={{ width: field.width, height: field.height }}
                                                    position={{ x: field.x, y: field.y }}
                                                    onDragStop={(e, d) => {
                                                        updateField(originalIndex, { x: d.x, y: d.y })
                                                    }}
                                                    onResizeStop={(e, direction, ref, delta, position) => {
                                                        updateField(originalIndex, {
                                                            width: parseInt(ref.style.width, 10),
                                                            height: parseInt(ref.style.height, 10),
                                                            ...position
                                                        })
                                                    }}
                                                    className={`absolute z-20 border-2 shadow-sm ${field.type === 'signature' ? 'border-[#002FA7] bg-[#002FA7]/20' : 'border-emerald-500 bg-emerald-500/20'} cursor-move flex items-center justify-center group`}
                                                >
                                                    <span className="text-[10px] font-mono text-white tracking-widest uppercase truncate px-2">
                                                        {field.type === 'signature' ? 'Sign Here' : 'Text Input'}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeField(originalIndex) }}
                                                        onPointerDown={(e) => e.stopPropagation()} // Prevent dragging when clicking the X
                                                        className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-50 hover:bg-red-400"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </Rnd>
                                            ))}
                                    </div>
                                </Document>
                            ) : (
                                <div className="text-xs font-mono text-rose-500 mt-20">Secure document link expired or missing.</div>
                            )}
                        </div>

                        {/* Right Sidebar */}
                        <div className="w-64 border-l border-white/5 bg-zinc-950 flex flex-col">
                            <div className="p-4 border-b border-white/5">
                                <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Controls</h3>
                                <div className="flex items-center justify-between text-zinc-300 font-mono text-xs mb-4">
                                    <button
                                        onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                                        disabled={pageNumber <= 1}
                                        className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50"
                                    >
                                        Prev
                                    </button>
                                    <span>{pageNumber} / {numPages || '-'}</span>
                                    <button
                                        onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                                        disabled={pageNumber >= numPages}
                                        className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50"
                                    >
                                        Next
                                    </button>
                                </div>

                                <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 mt-6">Select Tool</h3>
                                <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-md">
                                    <button
                                        onClick={() => setCurrentTool('signature')}
                                        className={`flex-1 text-xs font-mono py-1 rounded transition-colors ${currentTool === 'signature' ? 'bg-[#002FA7] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        Signature
                                    </button>
                                    <button
                                        onClick={() => setCurrentTool('text')}
                                        className={`flex-1 text-xs font-mono py-1 rounded transition-colors ${currentTool === 'text' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    >
                                        Text Input
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 p-4 overflow-y-auto">
                                <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4">Placed Blocks</h3>
                                {fields.length === 0 ? (
                                    <div className="text-xs text-zinc-600 font-mono">No blocks placed onto document.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {fields.map((f, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded text-[10px] font-mono text-zinc-300">
                                                <span>Page {f.pageIndex + 1}</span>
                                                <button onClick={() => removeField(i)} className="text-rose-500 hover:text-rose-400">
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-white/5 bg-zinc-950">
                                <button
                                    onClick={() => onComplete(fields)}
                                    disabled={fields.length === 0}
                                    className="group w-full h-10 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-[10px] uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    [ DEPLOY_CONTRACT ]
                                    <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                                </button>
                                {fields.length === 0 && (
                                    <p className="text-[10px] font-mono text-rose-500 text-center mt-2">
                                        Place at least one field to continue
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    )
}
