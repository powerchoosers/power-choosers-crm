'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { motion } from 'framer-motion'
import { CheckCircle, ShieldCheck, PenTool, Loader2, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'
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
    const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('type')
    const [typedSignature, setTypedSignature] = useState('')
    const [textValues, setTextValues] = useState<Record<string, string>>({})
    const [numPages, setNumPages] = useState<number>(0)
    const [pageNumber, setPageNumber] = useState(1)
    const [containerWidth, setContainerWidth] = useState(0)

    const sigCanvas = useRef<SignatureCanvas>(null)
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null)
    const pdfScrollContainerRef = useRef<HTMLDivElement>(null)
    const sigContainerRef = useRef<HTMLDivElement>(null)
    const typedInputRef = useRef<HTMLInputElement>(null)
    const sigPadScrollRef = useRef<HTMLDivElement>(null)
    const hasDrawnRef = useRef(false)
    const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [drawPending, setDrawPending] = useState(false)

    // ── Responsive Scaling ────────────────────────────────────────────────────
    useEffect(() => {
        const measure = () => {
            if (pdfScrollContainerRef.current) {
                // Subtract padding for the document
                setContainerWidth(pdfScrollContainerRef.current.clientWidth - 48)
            }
        }
        measure()
        const observer = new ResizeObserver(measure)
        if (pdfScrollContainerRef.current) observer.observe(pdfScrollContainerRef.current)
        return () => observer.disconnect()
    }, [])

    const pdfWidth = Math.max(containerWidth, 400)
    const scale = pdfWidth / 800

    // ── Field completion tracking ─────────────────────────────────────────────
    const fields: any[] = request.signature_fields ?? []
    const totalFields = fields.length

    const completedFields = fields.filter((f: any, idx: number) => {
        const key = f.fieldId ?? String(idx)
        if (f.type === 'text') return !!textValues[key]?.trim()
        return !!activeSignature
    }).length

    const allComplete = totalFields === 0 || completedFields >= totalFields

    // ── Typed signature logic ────────────────────────────────────────────────
    useEffect(() => {
        if (signatureMode === 'type' && typedSignature && hiddenCanvasRef.current) {
            const canvas = hiddenCanvasRef.current
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                let fontSize = 80
                const maxWidth = canvas.width - 80
                ctx.font = `${fontSize}px "Brush Script MT", cursive, sans-serif`
                while (ctx.measureText(typedSignature).width > maxWidth && fontSize > 24) {
                    fontSize -= 2
                    ctx.font = `${fontSize}px "Brush Script MT", cursive, sans-serif`
                }
                ctx.fillStyle = '#002FA7'
                ctx.textBaseline = 'middle'
                ctx.textAlign = 'center'
                ctx.fillText(typedSignature, canvas.width / 2, canvas.height / 2)
                setActiveSignature(canvas.toDataURL('image/png'))
            }
        } else if (signatureMode === 'type' && !typedSignature) {
            setActiveSignature(null)
        }
    }, [typedSignature, signatureMode])

    // Scale font in input box
    useEffect(() => {
        const input = typedInputRef.current
        if (!input) return
        if (!typedSignature) {
            input.style.fontSize = ''
            return
        }
        let size = 36
        input.style.fontSize = `${size}px`
        while (input.scrollWidth > input.clientWidth && size > 10) {
            size -= 1
            input.style.fontSize = `${size}px`
        }
    }, [typedSignature])

    // ── Telemetry ────────────────────────────────────────────────────────────
    useEffect(() => {
        const logView = async () => {
            try {
                await fetch('/api/signatures/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, action: 'viewed' })
                })
            } catch { }
        }
        logView()
    }, [token])

    // ── Drawing logic ────────────────────────────────────────────────────────
    const captureDrawnSignature = useCallback(() => {
        if (captureTimerRef.current) {
            clearTimeout(captureTimerRef.current)
            captureTimerRef.current = null
        }
        setDrawPending(false)
        if (!sigCanvas.current || !hasDrawnRef.current) return
        const srcCanvas = sigCanvas.current.getCanvas()
        if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return
        const out = document.createElement('canvas')
        out.width = srcCanvas.width
        out.height = srcCanvas.height
        const ctx = out.getContext('2d')
        if (!ctx) return
        ctx.drawImage(srcCanvas, 0, 0)
        setActiveSignature(out.toDataURL('image/png'))
    }, [])

    const handleSignatureEnd = useCallback(() => {
        if (!hasDrawnRef.current) return
        if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
        setDrawPending(true)
        captureTimerRef.current = setTimeout(captureDrawnSignature, 2000)
    }, [captureDrawnSignature])

    const handleClear = () => {
        if (signatureMode === 'draw') {
            sigCanvas.current?.clear()
            hasDrawnRef.current = false
            if (captureTimerRef.current) {
                clearTimeout(captureTimerRef.current)
                captureTimerRef.current = null
            }
            setDrawPending(false)
        } else {
            setTypedSignature('')
        }
        setActiveSignature(null)
    }

    const handleExecute = async () => {
        if (!activeSignature) {
            toast.error('Please provide your signature before executing.')
            return
        }
        const firstUnfilled = fields.findIndex((f: any, idx: number) => {
            if (f.type !== 'text') return false
            const key = f.fieldId ?? String(idx)
            return !textValues[key]?.trim()
        })
        if (firstUnfilled !== -1) {
            toast.error('Please complete all text fields before executing.')
            const target = fields[firstUnfilled]
            setPageNumber(target.pageIndex + 1)
            setTimeout(() => {
                const key = target.fieldId ?? String(firstUnfilled)
                document.getElementById(`sig-field-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 200)
            return
        }

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/signatures/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, signatureBase64: activeSignature, textValues })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to execute document.')
            setIsSuccess(true)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDownload = () => {
        window.open(`/api/signatures/download?token=${token}`, '_blank')
        toast.success('Generating review copy with forensic watermark...')
    }

    const skipToNextField = () => {
        if (!fields.length) return
        const nextIdx = fields.findIndex((f: any, idx: number) => {
            const key = f.fieldId ?? String(idx)
            if (f.type === 'text') return !textValues[key]?.trim()
            return !activeSignature
        })
        if (nextIdx === -1) {
            toast.success('All fields complete')
            return
        }
        const nextField = fields[nextIdx]
        const key = nextField.fieldId ?? String(nextIdx)
        setPageNumber(nextField.pageIndex + 1)
        setTimeout(() => {
            const el = document.getElementById(`sig-field-${key}`)
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                el.classList.add('!ring-2', '!ring-[#002FA7]', '!ring-offset-2')
                setTimeout(() => el.classList.remove('!ring-2', '!ring-[#002FA7]', '!ring-offset-2'), 1500)
            }
        }, 200)
    }

    // ── Success Screen ────────────────────────────────────────────────────────
    if (isSuccess) {
        return (
            <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center font-mono">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="h-20 w-20 mb-8 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 flex items-center justify-center"
                >
                    <CheckCircle className="w-10 h-10" />
                </motion.div>
                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-3xl text-zinc-50 uppercase tracking-[0.3em] font-light mb-4"
                >
                    Document Secured
                </motion.h1>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="max-w-md p-6 border border-white/5 bg-white/[0.02] rounded-lg space-y-4"
                >
                    <p className="text-sm text-zinc-400 font-sans leading-relaxed">
                        The energy services agreement has been cryptographically sealed with a forensic audit trail. A final copy is being dispatched to you and our compliance team.
                    </p>
                    <div className="pt-4 border-t border-white/5 flex flex-col items-center gap-2">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Nodal Point forensic systems</span>
                        <div className="h-1px w-12 bg-[#002FA7]/30" />
                    </div>
                </motion.div>
            </div>
        )
    }

    // ── Main Interface ────────────────────────────────────────────────────────
    return (
        <div className="h-screen w-full flex flex-col bg-zinc-950 overflow-hidden font-sans">

            {/* Header: Forensic Navigation */}
            <header className="h-16 border-b border-white/5 bg-zinc-950 px-6 flex items-center justify-between z-50 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <h1 className="text-xs font-mono uppercase tracking-[0.2em] text-[#002FA7] font-bold">
                            Forensic Document Review
                        </h1>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">
                            ID: {request.id.substring(0, 12)} · {request.document?.name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 px-3 py-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-500/70 font-mono text-[9px] uppercase tracking-widest">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>256-Bit Encrypted Session</span>
                    </div>
                </div>
            </header>

            {/* Main Body: Two Column Forensic Layout */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left: Document Viewport */}
                <main className="flex-1 flex flex-col bg-zinc-900/30 overflow-hidden relative">

                    {/* View Controls */}
                    <div className="h-10 shrink-0 border-b border-white/5 bg-zinc-950/50 flex items-center justify-between px-4">
                        <div className="flex items-center gap-1 px-1 py-1 bg-zinc-950/80 backdrop-blur rounded-full border border-white/5">
                            <button
                                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                                disabled={pageNumber <= 1}
                                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all text-zinc-400 hover:text-white"
                            ><ChevronLeft className="w-3.5 h-3.5" /></button>
                            <div className="px-3 text-[10px] font-mono text-zinc-500 border-x border-white/5">
                                Page <span className="text-zinc-200">{pageNumber}</span> / {numPages || '-'}
                            </div>
                            <button
                                onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                                disabled={pageNumber >= numPages}
                                className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full disabled:opacity-20 transition-all text-zinc-400 hover:text-white"
                            ><ChevronRight className="w-3.5 h-3.5" /></button>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleDownload}
                                className="flex items-center gap-2 px-3 py-1 text-[10px] font-mono uppercase bg-[#002FA7] hover:bg-[#002FA7]/80 text-white rounded transition-all border border-[#002FA7]"
                            >
                                <Download className="w-3 h-3 text-white" />
                                Download for review
                            </button>
                        </div>
                    </div>

                    {/* PDF Scroller */}
                    <div
                        ref={pdfScrollContainerRef}
                        className="flex-1 overflow-auto np-scroll p-6 flex flex-col items-center bg-[url('/grid.svg')] bg-[size:40px_40px] bg-fixed"
                    >
                        {documentUrl ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="relative rounded-sm shadow-2xl overflow-visible border border-white/10"
                            >
                                <Document
                                    file={documentUrl}
                                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                    className="bg-zinc-800"
                                    loading={
                                        <div className="flex flex-col items-center justify-center p-20 gap-4">
                                            <Loader2 className="w-8 h-8 animate-spin text-[#002FA7]" />
                                            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Decrypting Document Payload</div>
                                        </div>
                                    }
                                >
                                    <Page
                                        pageNumber={pageNumber}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        width={pdfWidth}
                                        className="bg-white"
                                    />

                                    {/* Responsive Field Overlays */}
                                    {fields.map((field: any, idx: number) => {
                                        if (field.pageIndex !== pageNumber - 1) return null
                                        const textKey = field.fieldId ?? String(idx)

                                        if (field.type === 'text') {
                                            return (
                                                <div
                                                    id={`sig-field-${textKey}`}
                                                    key={textKey}
                                                    className="absolute z-20 flex items-center justify-center overflow-hidden transition-all duration-300"
                                                    style={{
                                                        left: field.x * scale,
                                                        top: field.y * scale,
                                                        width: field.width * scale,
                                                        height: field.height * scale
                                                    }}
                                                >
                                                    <input
                                                        type="text"
                                                        value={textValues[textKey] || ''}
                                                        onChange={(e) => setTextValues(prev => ({ ...prev, [textKey]: e.target.value }))}
                                                        placeholder="Type here"
                                                        className="w-full h-full bg-[#002FA7]/5 border-2 border-[#002FA7]/20 text-zinc-900 placeholder:text-zinc-400 px-2 font-mono focus:outline-none focus:border-[#002FA7] focus:bg-[#002FA7]/10 transition-all"
                                                        style={{ fontSize: `${Math.max(11, Math.round(13 * scale))}px` }}
                                                    />
                                                </div>
                                            )
                                        }

                                        return (
                                            <div
                                                id={`sig-field-${textKey}`}
                                                key={textKey}
                                                className={`absolute z-20 border-2 transition-all duration-300 ${activeSignature ? 'border-transparent' : 'border-[#002FA7]/40 bg-[#002FA7]/10 cursor-pointer'} flex items-center justify-center overflow-hidden`}
                                                style={{
                                                    left: field.x * scale,
                                                    top: field.y * scale,
                                                    width: field.width * scale,
                                                    height: field.height * scale
                                                }}
                                                onClick={!activeSignature ? () => {
                                                    if (sigPadScrollRef.current) {
                                                        sigPadScrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                                        sigPadScrollRef.current.classList.add('ring-1', 'ring-[#002FA7]')
                                                        setTimeout(() => sigPadScrollRef.current?.classList.remove('ring-1', 'ring-[#002FA7]'), 1000)
                                                    }
                                                } : undefined}
                                            >
                                                {activeSignature ? (
                                                    <img src={activeSignature} alt="Signature" className="w-full h-full object-contain object-left" />
                                                ) : (
                                                    <span className="text-[8px] font-mono text-[#002FA7] tracking-widest uppercase animate-pulse">Signature Required</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </Document>
                            </motion.div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 font-mono gap-4 uppercase tracking-widest text-xs">
                                <FileText className="w-12 h-12 opacity-20" />
                                <span>Payload Unavailable</span>
                            </div>
                        )}
                        {/* Buffer at the bottom */}
                        <div className="h-20 shrink-0" />
                    </div>
                </main>

                {/* Right: Forensic Console (The Action Panel) */}
                <aside className="w-[384px] shrink-0 border-l border-white/5 bg-zinc-950 flex flex-col z-40 shadow-2xl">
                    <div className="p-6 flex-1 overflow-y-auto np-scroll space-y-8">

                        {/* Signatory Profile */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-zinc-600" />
                                <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Document Stakeholder</h2>
                            </div>
                            <div className="p-4 border border-white/5 bg-white/[0.02] rounded-lg">
                                <div className="text-sm font-sans text-zinc-100 font-medium tracking-tight">
                                    {request.contact?.firstName} {request.contact?.lastName}
                                </div>
                                <div className="text-xs font-mono text-zinc-500 mt-1 uppercase tracking-wider">
                                    {request.contact?.email}
                                </div>
                            </div>
                        </div>

                        {/* Progress */}
                        {totalFields > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                                        <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Field Map</h2>
                                    </div>
                                    <button
                                        onClick={skipToNextField}
                                        className="text-[9px] font-mono text-[#002FA7] uppercase tracking-widest hover:text-blue-400 transition-colors"
                                    >Next Field</button>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                                        <motion.div
                                            className={`h-full rounded-full ${completedFields === totalFields ? 'bg-emerald-500' : 'bg-[#002FA7]'}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(completedFields / totalFields) * 100}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                                        <span>Completion</span>
                                        <span className={completedFields === totalFields ? 'text-emerald-500' : 'text-zinc-400'}>
                                            {completedFields} OF {totalFields}
                                        </span>
                                    </div>
                                </div>

                                {/* Clickable field list — jump to any field */}
                                <div className="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto np-scroll pr-0.5">
                                    {fields.map((f: any, idx: number) => {
                                        const key = f.fieldId ?? String(idx)
                                        const isComplete = f.type === 'text'
                                            ? !!textValues[key]?.trim()
                                            : !!activeSignature

                                        return (
                                            <button
                                                key={key}
                                                onClick={() => {
                                                    setPageNumber(f.pageIndex + 1)
                                                    setTimeout(() => {
                                                        const el = document.getElementById(`sig-field-${key}`)
                                                        if (el) {
                                                            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
                                                            el.classList.add('!ring-2', '!ring-[#002FA7]', '!ring-offset-2')
                                                            setTimeout(() => el.classList.remove('!ring-2', '!ring-[#002FA7]', '!ring-offset-2'), 1500)
                                                        }
                                                    }, 200)
                                                }}
                                                className="flex items-center gap-2.5 px-3 py-2 rounded border border-white/5 hover:border-white/15 hover:bg-white/[0.03] transition-all text-left w-full group"
                                            >
                                                {/* Status dot */}
                                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${isComplete ? 'bg-emerald-500' : 'bg-rose-400 animate-pulse'}`} />

                                                {/* Label */}
                                                <span className="text-[10px] font-mono text-zinc-400 flex-1 truncate group-hover:text-zinc-200 transition-colors">
                                                    {f.type === 'text' ? 'Text Input' : 'Signature'} · pg {(f.pageIndex ?? 0) + 1}
                                                </span>

                                                {/* Complete / pending badge */}
                                                <span className={`text-[9px] font-mono font-bold uppercase tracking-widest ${isComplete ? 'text-emerald-500' : 'text-zinc-600'}`}>
                                                    {isComplete ? 'Done' : 'Open'}
                                                </span>

                                                {/* Jump arrow */}
                                                <ChevronRight className="w-3 h-3 text-zinc-700 group-hover:text-[#002FA7] transition-colors flex-shrink-0" />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Signature Instrument */}
                        <div ref={sigPadScrollRef} className="space-y-4 pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <PenTool className="w-4 h-4 text-zinc-600" />
                                    <h2 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Sign Instrument</h2>
                                </div>
                                <button onClick={handleClear} className="text-[9px] font-mono uppercase text-rose-500/70 hover:text-rose-400 transition-colors">
                                    Reset
                                </button>
                            </div>

                            <div className="flex bg-zinc-900/50 border border-white/5 p-0.5 rounded-md">
                                <button
                                    onClick={() => setSignatureMode('type')}
                                    className={`flex-1 text-[9px] uppercase font-mono py-1.5 rounded transition-all ${signatureMode === 'type' ? 'text-white nodal-toggle-pill-highlight shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                                >Type Font</button>
                                <button
                                    onClick={() => setSignatureMode('draw')}
                                    className={`flex-1 text-[9px] uppercase font-mono py-1.5 rounded transition-all ${signatureMode === 'draw' ? 'text-white nodal-toggle-pill-highlight shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                                >Draw Ink</button>
                            </div>

                            <div
                                className="w-full h-44 bg-white rounded-lg overflow-hidden relative group border border-white/5 transition-all"
                                onPointerDown={() => {
                                    if (signatureMode !== 'draw') return
                                    hasDrawnRef.current = true
                                    if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
                                    setDrawPending(false)
                                }}
                            >
                                {signatureMode === 'draw' ? (
                                    <SignatureCanvas
                                        key="draw-canvas"
                                        ref={sigCanvas}
                                        penColor="#002FA7"
                                        clearOnResize={false}
                                        onEnd={handleSignatureEnd}
                                        canvasProps={{
                                            className: 'w-full h-full block relative z-10 cursor-crosshair',
                                            style: { touchAction: 'none' } as React.CSSProperties
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center px-6 relative bg-zinc-50">
                                        <input
                                            ref={typedInputRef}
                                            type="text"
                                            value={typedSignature}
                                            onChange={(e) => setTypedSignature(e.target.value)}
                                            placeholder="SIGNATURE REPLICA"
                                            className="w-full text-center text-[#002FA7] bg-transparent border-b border-zinc-200 focus:outline-none focus:border-[#002FA7] pb-2 font-serif italic whitespace-nowrap overflow-hidden uppercase placeholder:text-zinc-300 placeholder:italic"
                                        />
                                        <canvas ref={hiddenCanvasRef} width={600} height={160} className="hidden" />
                                    </div>
                                )}
                            </div>

                            <p className="text-[9px] text-zinc-600 font-mono leading-relaxed uppercase tracking-tighter opacity-60">
                                Executing this instrument binds you to the terms under universal forensic e-signature standards.
                            </p>
                        </div>
                    </div>

                    {/* Footer: Primary Action */}
                    <div className="p-6 border-t border-white/5 bg-zinc-950/80 backdrop-blur-md">
                        <button
                            onClick={handleExecute}
                            disabled={isSubmitting || !allComplete}
                            className="w-full h-12 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-[11px] uppercase tracking-[0.2em] rounded-md flex items-center justify-center gap-3 transition-all disabled:opacity-20 disabled:grayscale group"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Sealing forensic record...</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                    <span>Execute Agreement</span>
                                </>
                            )}
                        </button>
                        {!allComplete && totalFields > 0 && (
                            <div className="mt-3 flex items-center justify-center gap-2 animate-pulse">
                                <div className="w-1 h-1 rounded-full bg-rose-500" />
                                <p className="text-[9px] font-mono text-rose-500 uppercase tracking-widest">
                                    {totalFields - completedFields} field{totalFields - completedFields !== 1 ? 's' : ''} outstanding
                                </p>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    )
}
