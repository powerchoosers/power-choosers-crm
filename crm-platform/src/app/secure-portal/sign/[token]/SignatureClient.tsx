'use client'

import { useState, useEffect, useRef } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, ShieldCheck, PenTool, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`

interface SignatureClientProps {
    token: string
    request: any
    documentUrl: string | null
}

export default function SignatureClient({ token, request, documentUrl }: SignatureClientProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [activeSignature, setActiveSignature] = useState<string | null>(null)
    const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw')
    const [typedSignature, setTypedSignature] = useState('')
    const [textValues, setTextValues] = useState<Record<string, string>>({})
    const [numPages, setNumPages] = useState<number>(0)
    const [pageNumber, setPageNumber] = useState(1)
    const sigCanvas = useRef<SignatureCanvas>(null)
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null)

    // Generate base64 from typed signature
    useEffect(() => {
        if (signatureMode === 'type' && typedSignature && hiddenCanvasRef.current) {
            const canvas = hiddenCanvasRef.current
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.font = '36px "Brush Script MT", cursive, sans-serif'
                ctx.fillStyle = '#002FA7' // Nodal Blue
                ctx.textBaseline = 'middle'
                ctx.fillText(typedSignature, 20, canvas.height / 2)
                setActiveSignature(canvas.toDataURL('image/png'))
            }
        } else if (signatureMode === 'type' && !typedSignature) {
            setActiveSignature(null)
        }
    }, [typedSignature, signatureMode])

    useEffect(() => {
        // Log telemetry on mount
        const logView = async () => {
            try {
                await fetch('/api/signatures/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, action: 'viewed' })
                })
            } catch (err) {
                // Silent
            }
        }
        logView()
    }, [token])

    const handleSignatureEnd = () => {
        if (!sigCanvas.current?.isEmpty()) {
            setActiveSignature(sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png') || null)
        }
    }

    const handleClear = () => {
        if (signatureMode === 'draw') {
            sigCanvas.current?.clear()
        } else {
            setTypedSignature('')
        }
        setActiveSignature(null)
    }

    const handleExecute = async () => {
        if (!activeSignature) {
            toast.error('Please provide a signature before executing.')
            return
        }

        setIsSubmitting(true)

        try {
            const res = await fetch('/api/signatures/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    signatureBase64: activeSignature,
                    textValues
                })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Failed to execute document. Please try again or contact support.')
            }

            setIsSuccess(true)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const skipToNextField = () => {
        if (!request.signature_fields) return

        // Find the first text field that is empty or the first signature field if activeSignature is empty
        const nextField = request.signature_fields.find((f: any, idx: number) => {
            const key = f.fieldId ?? String(idx)
            if (f.type === 'text') {
                return !textValues[key] || textValues[key].trim() === ''
            }
            return !activeSignature
        })

        if (nextField) {
            setPageNumber(nextField.pageIndex + 1)
            toast('Skipped to next required field', { icon: '🔍' })
        } else {
            toast.success('All fields are ready for execution.')
        }
    }

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center font-mono">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring' }}
                    className="h-16 w-16 mb-6 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 flex items-center justify-center"
                >
                    <CheckCircle className="w-8 h-8" />
                </motion.div>

                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-2xl text-zinc-100 uppercase tracking-[0.2em] mb-3"
                >
                    Contract Executed
                </motion.h1>

                <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed border border-white/5 bg-white/[0.02] p-4 rounded-lg"
                >
                    The document has been securely cryptographically sealed with a forensic audit trail. A final copy has been dispatched to {request.contact?.email} and Nodal Point Compliance.
                </motion.p>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen items-center py-12 px-4 max-w-5xl mx-auto">
            {/* Header */}
            <div className="w-full flex items-center justify-between mb-8 pb-6 border-b border-white/5">
                <div>
                    <h1 className="text-xl font-mono uppercase tracking-[0.1em] text-zinc-200">
                        Secure Document Review
                    </h1>
                    <p className="text-sm font-sans text-zinc-500 mt-1">
                        {request.document?.name}
                    </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 font-mono text-[10px] uppercase tracking-widest">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Encrypted Session</span>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="w-full flex flex-col lg:flex-row gap-8">

                {/* PDF Viewer */}
                <div className="w-full lg:w-2/3 h-[600px] lg:h-[800px] border border-white/10 rounded-xl overflow-hidden bg-zinc-900 flex flex-col relative">
                    <div className="h-12 border-b border-white/5 flex items-center justify-center gap-4 bg-zinc-950 text-zinc-300 font-mono text-xs z-30">
                        <button
                            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                            disabled={pageNumber <= 1}
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50 transition-colors"
                        >Prev</button>
                        <span>Page {pageNumber} of {numPages || '-'}</span>
                        <button
                            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                            disabled={pageNumber >= numPages}
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50 transition-colors"
                        >Next</button>
                    </div>

                    <div className="flex-1 overflow-auto bg-zinc-950 p-4 w-full h-full relative" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {documentUrl ? (
                            <div className="min-w-max mx-auto flex flex-col items-center">
                                <Document
                                    file={documentUrl}
                                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                    className="shadow-2xl border border-white/10 bg-white"
                                    loading={<div className="text-xs font-mono text-zinc-500 animate-pulse mt-10 w-full text-center">Decrypting Document...</div>}
                                >
                                    <div className="relative inline-block w-fit h-fit">
                                        <Page
                                            pageNumber={pageNumber}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            width={800}
                                        />
                                        {/* Render Signature Overlays */}
                                        {request.signature_fields?.map((field: any, idx: number) => {
                                            if (field.pageIndex !== pageNumber - 1) return null;
                                            const textKey = field.fieldId ?? String(idx)

                                            if (field.type === 'text') {
                                                return (
                                                    <div
                                                        key={textKey}
                                                        className="absolute z-20 flex items-center justify-center overflow-hidden"
                                                        style={{
                                                            left: field.x,
                                                            top: field.y,
                                                            width: field.width,
                                                            height: field.height
                                                        }}
                                                    >
                                                        <input
                                                            type="text"
                                                            value={textValues[textKey] || ''}
                                                            onChange={(e) => setTextValues(prev => ({ ...prev, [textKey]: e.target.value }))}
                                                            placeholder="Type here..."
                                                            className="w-full h-full bg-emerald-500/10 border-2 border-emerald-500/40 text-emerald-100 placeholder:text-emerald-500/50 px-2 font-mono text-xs focus:outline-none focus:border-emerald-400 focus:bg-emerald-500/20 transition-all"
                                                        />
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div
                                                    key={textKey}
                                                    className={`absolute z-20 border-2 ${activeSignature ? 'border-transparent' : 'border-[#002FA7] bg-[#002FA7]/20'} flex items-center justify-center overflow-hidden`}
                                                    style={{
                                                        left: field.x,
                                                        top: field.y,
                                                        width: field.width,
                                                        height: field.height
                                                    }}
                                                >
                                                    {activeSignature ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={activeSignature} alt="Signature Preview" className="w-full h-full object-contain" />
                                                    ) : (
                                                        <span className="text-[10px] font-mono text-white tracking-widest uppercase animate-pulse">Sign Here</span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </Document>
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-mono text-sm bg-zinc-900 border border-white/5">
                                Secure document preview unavailable
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Panel */}
                <div className="w-full lg:w-1/3 space-y-6">
                    <div className="nodal-module-glass p-6 rounded-xl space-y-6 sticky top-12">

                        <div>
                            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-2">Signatory</h2>
                            <div className="text-sm font-sans text-zinc-200 font-medium">
                                {request.contact?.firstName} {request.contact?.lastName}
                            </div>
                            <div className="text-xs font-sans text-zinc-500">
                                {request.contact?.email}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400">
                                    Signature
                                </h2>
                                <button
                                    onClick={handleClear}
                                    className="text-[10px] font-mono uppercase text-rose-400 hover:text-rose-300 transition-colors"
                                >
                                    Clear
                                </button>
                            </div>

                            <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-md mb-2">
                                <button
                                    onClick={() => setSignatureMode('draw')}
                                    className={`flex-1 text-[10px] uppercase font-mono py-1.5 rounded transition-colors ${signatureMode === 'draw' ? 'bg-[#002FA7] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Draw
                                </button>
                                <button
                                    onClick={() => setSignatureMode('type')}
                                    className={`flex-1 text-[10px] uppercase font-mono py-1.5 rounded transition-colors ${signatureMode === 'type' ? 'bg-[#002FA7] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Type
                                </button>
                            </div>

                            <div className="w-full h-40 bg-white border-2 border-dashed border-[#002FA7]/40 rounded-lg overflow-hidden relative cursor-crosshair">
                                {signatureMode === 'draw' ? (
                                    <>
                                        <SignatureCanvas
                                            ref={sigCanvas}
                                            penColor="#002FA7"
                                            onEnd={handleSignatureEnd}
                                            canvasProps={{
                                                className: 'w-full h-full relative z-10'
                                            }}
                                        />
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-5 z-0">
                                            <PenTool className="w-12 h-12 text-[#002FA7]" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center p-4">
                                        <input
                                            type="text"
                                            value={typedSignature}
                                            onChange={(e) => setTypedSignature(e.target.value)}
                                            placeholder="Type your name..."
                                            className="w-full text-center text-4xl text-[#002FA7] bg-transparent border-b border-zinc-200 focus:outline-none focus:border-[#002FA7] pb-2 font-serif italic"
                                        />
                                        {/* Hidden canvas to render text into base64 */}
                                        <canvas ref={hiddenCanvasRef} width={600} height={200} className="hidden" />
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-zinc-600 font-sans leading-relaxed">
                                By {signatureMode === 'draw' ? 'drawing' : 'typing'} your signature above and clicking Execute Contract, you agree to be legally bound by the terms presented in this document.
                            </p>
                        </div>

                        {request.signature_fields && request.signature_fields.length > 0 && (
                            <button
                                onClick={skipToNextField}
                                className="w-full h-10 mt-2 bg-zinc-900 border border-white/5 hover:border-white/20 text-emerald-500 font-mono text-[10px] uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all"
                            >
                                Skip to Next Missing Field
                            </button>
                        )}

                        <button
                            onClick={handleExecute}
                            disabled={isSubmitting}
                            className="w-full h-12 mt-6 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-xs uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Generating Forensic Seal...
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-4 h-4" />
                                    Execute Contract
                                </>
                            )}
                        </button>

                    </div>
                </div>
            </div>
        </div>
    )
}
