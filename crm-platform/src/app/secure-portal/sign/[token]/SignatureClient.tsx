'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { motion } from 'framer-motion'
import { CheckCircle, ShieldCheck, PenTool, Loader2, ChevronRight } from 'lucide-react'
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
    const pdfScrollContainerRef = useRef<HTMLDivElement>(null)
    // ── Canvas sizing refs ────────────────────────────────────────────────────
    const sigContainerRef = useRef<HTMLDivElement>(null)
    const typedInputRef = useRef<HTMLInputElement>(null)
    // ── Draw signature state tracking ─────────────────────────────────────────
    // sigPadScrollRef: target for "Sign Here" click-to-focus scroll
    const sigPadScrollRef = useRef<HTMLDivElement>(null)
    // hasDrawnRef: true once user has drawn a stroke since last clear/resize
    // Used instead of sigCanvas.isEmpty() to avoid race with ResizeObserver
    const hasDrawnRef = useRef(false)
    // captureTimerRef: debounce handle for the 2-second auto-capture after onEnd
    const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // drawPending: true when user has finished drawing but capture hasn't fired yet
    const [drawPending, setDrawPending] = useState(false)

    // ── Field completion tracking ─────────────────────────────────────────────
    const fields: any[] = request.signature_fields ?? []
    const totalFields = fields.length

    const completedFields = fields.filter((f: any, idx: number) => {
        const key = f.fieldId ?? String(idx)
        if (f.type === 'text') return !!textValues[key]?.trim()
        return !!activeSignature
    }).length

    // All complete: zero-field requests are always executable (legacy fallback)
    const allComplete = totalFields === 0 || completedFields >= totalFields

    // ── Typed signature — auto-scale font to fill canvas ─────────────────────
    useEffect(() => {
        if (signatureMode === 'type' && typedSignature && hiddenCanvasRef.current) {
            const canvas = hiddenCanvasRef.current
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height)

                // Scale font down until text fits within canvas (40px padding each side)
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

    // ── Sync canvas buffer to container display size (fixes mobile offset) ───
    // The canvas buffer must match the CSS display size exactly so that
    // signature_pad draws strokes directly under the user's finger/stylus.
    useEffect(() => {
        const container = sigContainerRef.current
        if (!container) return

        const syncSize = () => {
            const canvas = sigCanvas.current?.getCanvas()
            if (!canvas) return
            const rect = container.getBoundingClientRect()
            const w = Math.floor(rect.width)
            const h = Math.floor(rect.height)
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w
                canvas.height = h
                // Setting canvas.width/height wipes the buffer — also call .clear()
                // so signature_pad resets its internal state.
                sigCanvas.current?.clear()
                // Reset draw tracking: canvas is now blank so any pending capture
                // would produce a white image. Cancel the timer and clear flags.
                hasDrawnRef.current = false
                if (captureTimerRef.current) {
                    clearTimeout(captureTimerRef.current)
                    captureTimerRef.current = null
                }
                setDrawPending(false)
                // DO NOT call setActiveSignature(null) — once the user has captured
                // and the overlay is showing, resizing should never wipe it.
            }
        }

        const ro = new ResizeObserver(syncSize)
        ro.observe(container)
        syncSize() // sync on mount

        return () => ro.disconnect()
    }, [signatureMode]) // re-run when mode toggles (canvas unmounts/remounts)

    // ── Auto-scale typed signature font to fit the input width ───────────────
    useEffect(() => {
        const input = typedInputRef.current
        if (!input) return
        if (!typedSignature) {
            input.style.fontSize = ''
            return
        }
        // Start at max readable size and shrink until text fits without overflow
        let size = 36
        input.style.fontSize = `${size}px`
        while (input.scrollWidth > input.clientWidth && size > 10) {
            size -= 1
            input.style.fontSize = `${size}px`
        }
    }, [typedSignature])

    // ── Log view telemetry on mount ───────────────────────────────────────────
    useEffect(() => {
        const logView = async () => {
            try {
                await fetch('/api/signatures/telemetry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, action: 'viewed' })
                })
            } catch {
                // Silent — telemetry failure must not break signing
            }
        }
        logView()
    }, [token])

    // ── Draw signature capture ────────────────────────────────────────────────
    // captureDrawnSignature: the actual capture — composites strokes onto a white
    // background and stores the result in activeSignature so the PDF overlay fills.
    // Uses hasDrawnRef (not isEmpty()) to avoid race conditions with ResizeObserver.
    const captureDrawnSignature = useCallback(() => {
        // Cancel any pending debounce timer
        if (captureTimerRef.current) {
            clearTimeout(captureTimerRef.current)
            captureTimerRef.current = null
        }
        setDrawPending(false)
        if (!sigCanvas.current || !hasDrawnRef.current) return
        const srcCanvas = sigCanvas.current.getCanvas()
        if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return
        // Composite onto white — avoids transparent-canvas issues where getImageData
        // returns near-empty bitmaps on some mobile WebKit versions.
        const out = document.createElement('canvas')
        out.width = srcCanvas.width
        out.height = srcCanvas.height
        const ctx = out.getContext('2d')
        if (!ctx) return
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(srcCanvas, 0, 0)
        setActiveSignature(out.toDataURL('image/png'))
    }, [])

    // handleSignatureEnd: called by SignatureCanvas onEnd.
    // Starts a 2-second debounce — auto-applies if no new stroke arrives.
    // The user can also tap "Apply Signature" immediately via the drawPending button.
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

    // ── Execute ───────────────────────────────────────────────────────────────
    const handleExecute = async () => {
        if (!activeSignature) {
            toast.error('Please provide your signature before executing.')
            return
        }
        // Guard: every text field must have a value
        const firstUnfilled = fields.findIndex((f: any, idx: number) => {
            if (f.type !== 'text') return false
            const key = f.fieldId ?? String(idx)
            return !textValues[key]?.trim()
        })
        if (firstUnfilled !== -1) {
            toast.error('Please complete all text fields before executing.')
            // Jump to the unfilled field
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

    // ── Skip to next missing field ────────────────────────────────────────────
    const skipToNextField = () => {
        if (!fields.length) return

        const nextIdx = fields.findIndex((f: any, idx: number) => {
            const key = f.fieldId ?? String(idx)
            if (f.type === 'text') return !textValues[key]?.trim()
            return !activeSignature
        })

        if (nextIdx === -1) {
            toast.success('All fields complete — ready to execute.')
            return
        }

        const nextField = fields[nextIdx]
        const key = nextField.fieldId ?? String(nextIdx)
        const targetPage = nextField.pageIndex + 1

        setPageNumber(targetPage)

        // After React re-renders the page, scroll the element into view and flash it
        setTimeout(() => {
            const el = document.getElementById(`sig-field-${key}`)
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
                el.classList.add('!ring-2', '!ring-[#002FA7]', '!ring-offset-2')
                setTimeout(() => el.classList.remove('!ring-2', '!ring-[#002FA7]', '!ring-offset-2'), 1500)
            }
        }, 200)

        toast(`Jumped to field ${nextIdx + 1} of ${totalFields}`, { icon: '🔍' })
    }

    // ── Success screen ────────────────────────────────────────────────────────
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

    // ── Main render ───────────────────────────────────────────────────────────
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

                    <div
                        ref={pdfScrollContainerRef}
                        className="flex-1 overflow-auto bg-zinc-950 p-4 w-full h-full relative"
                        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                    >
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
                                        {/* Field overlays */}
                                        {fields.map((field: any, idx: number) => {
                                            if (field.pageIndex !== pageNumber - 1) return null
                                            const textKey = field.fieldId ?? String(idx)

                                            if (field.type === 'text') {
                                                return (
                                                    <div
                                                        id={`sig-field-${textKey}`}
                                                        key={textKey}
                                                        className="absolute z-20 flex items-center justify-center overflow-hidden transition-all duration-300"
                                                        style={{ left: field.x, top: field.y, width: field.width, height: field.height }}
                                                    >
                                                        <input
                                                            type="text"
                                                            value={textValues[textKey] || ''}
                                                            onChange={(e) => setTextValues(prev => ({ ...prev, [textKey]: e.target.value }))}
                                                            placeholder="Type here..."
                                                            className="w-full h-full bg-emerald-500/10 border-2 border-emerald-500/40 text-zinc-900 placeholder:text-emerald-700/50 px-2 font-mono text-xs focus:outline-none focus:border-emerald-500 focus:bg-emerald-50 transition-all"
                                                        />
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div
                                                    id={`sig-field-${textKey}`}
                                                    key={textKey}
                                                    className={`absolute z-20 border-2 transition-all duration-300 ${activeSignature ? 'border-transparent' : 'border-[#002FA7] bg-[#002FA7]/20 cursor-pointer'} flex items-center justify-center overflow-hidden`}
                                                    style={{ left: field.x, top: field.y, width: field.width, height: field.height }}
                                                    onClick={!activeSignature ? () => {
                                                        // Scroll the signature pad into view and flash a ring so the user
                                                        // knows exactly where to sign
                                                        sigPadScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                                        if (sigPadScrollRef.current) {
                                                            sigPadScrollRef.current.style.boxShadow = '0 0 0 2px #002FA7'
                                                            setTimeout(() => {
                                                                if (sigPadScrollRef.current) sigPadScrollRef.current.style.boxShadow = ''
                                                            }, 1500)
                                                        }
                                                    } : undefined}
                                                >
                                                    {activeSignature ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={activeSignature} alt="Signature" className="w-full h-full object-contain" />
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

                        {/* Signatory */}
                        <div>
                            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-2">Signatory</h2>
                            <div className="text-sm font-sans text-zinc-200 font-medium">
                                {request.contact?.firstName} {request.contact?.lastName}
                            </div>
                            <div className="text-xs font-sans text-zinc-500">
                                {request.contact?.email}
                            </div>
                        </div>

                        {/* Field progress bar */}
                        {totalFields > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Fields Completed</span>
                                    <span className={`text-[10px] font-mono font-bold tabular-nums ${completedFields === totalFields ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {completedFields} / {totalFields}
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${completedFields === totalFields ? 'bg-emerald-500' : 'bg-[#002FA7]'}`}
                                        style={{ width: `${totalFields ? (completedFields / totalFields) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Signature pad */}
                        <div ref={sigPadScrollRef} className="space-y-3 rounded-lg transition-shadow">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400">Signature</h2>
                                <button onClick={handleClear} className="text-[10px] font-mono uppercase text-rose-400 hover:text-rose-300 transition-colors">
                                    Clear
                                </button>
                            </div>

                            {/* Draw / Type toggle */}
                            <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-md mb-2">
                                <button
                                    onClick={() => setSignatureMode('draw')}
                                    className={`flex-1 text-[10px] uppercase font-mono py-1.5 rounded transition-colors ${signatureMode === 'draw' ? 'bg-[#002FA7] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >Draw</button>
                                <button
                                    onClick={() => setSignatureMode('type')}
                                    className={`flex-1 text-[10px] uppercase font-mono py-1.5 rounded transition-colors ${signatureMode === 'type' ? 'bg-[#002FA7] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >Type</button>
                            </div>

                            {/* Signature input area */}
                            <div
                                ref={sigContainerRef}
                                className="w-full h-40 bg-white border-2 border-dashed border-[#002FA7]/40 rounded-lg overflow-hidden relative cursor-crosshair"
                            >
                                {signatureMode === 'draw' ? (
                                    <>
                                        <SignatureCanvas
                                            key="draw-canvas"
                                            ref={sigCanvas}
                                            penColor="#002FA7"
                                            onBegin={() => {
                                                // Mark that the user has drawn at least one stroke.
                                                // Cancel any pending capture timer (new stroke = not done yet).
                                                hasDrawnRef.current = true
                                                if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
                                                setDrawPending(false)
                                            }}
                                            onEnd={handleSignatureEnd}
                                            canvasProps={{
                                                // NO explicit width/height — canvas buffer is sized by
                                                // the ResizeObserver above to exactly match the display
                                                // size, so touch coordinates map 1:1 with drawn strokes.
                                                className: 'w-full h-full block relative z-10',
                                                style: { touchAction: 'none' } as React.CSSProperties
                                            }}
                                        />
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-5 z-0">
                                            <PenTool className="w-12 h-12 text-[#002FA7]" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center px-4 relative">
                                        <input
                                            ref={typedInputRef}
                                            type="text"
                                            value={typedSignature}
                                            onChange={(e) => setTypedSignature(e.target.value)}
                                            placeholder="Type your name..."
                                            className="w-full text-center text-[#002FA7] bg-transparent border-b border-zinc-200 focus:outline-none focus:border-[#002FA7] pb-2 font-serif italic whitespace-nowrap overflow-hidden"
                                            style={{ fontSize: '36px' }}
                                        />
                                        {/* Hidden canvas for rendering typed signature as image */}
                                        <canvas ref={hiddenCanvasRef} width={600} height={160} className="hidden absolute" />
                                    </div>
                                )}
                            </div>

                            {/* Apply button — shown after drawing ends, before auto-capture fires */}
                            {signatureMode === 'draw' && drawPending && (
                                <button
                                    onClick={captureDrawnSignature}
                                    className="w-full h-9 border border-[#002FA7] text-[#002FA7] hover:bg-[#002FA7] hover:text-white font-mono text-[10px] uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all"
                                >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Apply Signature to Contract
                                </button>
                            )}

                            <p className="text-[10px] text-zinc-600 font-sans leading-relaxed">
                                By {signatureMode === 'draw' ? 'drawing' : 'typing'} your signature above and clicking Execute Contract, you agree to be legally bound by the terms presented in this document.
                            </p>
                        </div>

                        {/* Field Navigator — jump to any field, see completion status */}
                        {totalFields > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400">Field Map</h2>
                                    <button
                                        onClick={skipToNextField}
                                        className="text-[10px] font-mono text-[#002FA7] hover:text-blue-400 flex items-center gap-1 transition-colors"
                                    >
                                        <ChevronRight className="w-3 h-3" />
                                        Next missing
                                    </button>
                                </div>
                                <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-0.5">
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
                                                className="flex items-center gap-2 px-2 py-1.5 rounded border border-white/5 hover:border-white/20 hover:bg-white/[0.03] transition-all text-left w-full"
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${isComplete ? 'bg-emerald-500' : 'bg-rose-400 animate-pulse'}`} />
                                                <span className="text-[10px] font-mono text-zinc-400 flex-1 truncate">
                                                    {f.type === 'text' ? 'Text Field' : 'Signature'} · pg {(f.pageIndex ?? 0) + 1}
                                                </span>
                                                <span className={`text-[10px] font-mono font-bold ${isComplete ? 'text-emerald-500' : 'text-zinc-600'}`}>
                                                    {isComplete ? '✓' : '○'}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Execute button */}
                        <div className="space-y-2">
                            <button
                                onClick={handleExecute}
                                disabled={isSubmitting || !allComplete}
                                title={!allComplete ? `${totalFields - completedFields} field(s) still required` : undefined}
                                className="w-full h-12 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white font-mono text-xs uppercase tracking-widest rounded-md flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
                            {!allComplete && totalFields > 0 && (
                                <p className="text-[10px] font-mono text-rose-400 text-center">
                                    {totalFields - completedFields} field{totalFields - completedFields !== 1 ? 's' : ''} still required
                                </p>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}
