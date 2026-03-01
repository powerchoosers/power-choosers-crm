'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, LayoutTemplate, ArrowRight } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Rnd } from 'react-rnd'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Required for react-pdf to work in Next.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`

export type FieldType = 'signature' | 'text'

export interface SignatureField {
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
                pageIndex: pageNumber - 1,
                x,
                y,
                width: currentTool === 'signature' ? 200 : 150,
                height: currentTool === 'signature' ? 60 : 30,
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

    if (!isOpen) return null

    return (
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
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-500 hover:text-white transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
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
                                        <div className="text-xs font-mono text-zinc-500 animate-pulse">Loading Document...</div>
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
                                    className="w-full h-10 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-[10px] uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all"
                                >
                                    [ EXECUTE_CONTRACT_DEPLOYMENT ]
                                    <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
