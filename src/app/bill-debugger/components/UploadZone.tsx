import React, { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FileUp, Loader2 } from 'lucide-react'
import { buttonPrimary, focusOnLight } from '@/components/landing/ui'
import { EASE } from './StepBand'

interface UploadZoneProps {
    onUpload: (files: FileList | null) => void
    isAnalyzing: boolean
    onShowTrust?: () => void
}

export function UploadZone({ onUpload, isAnalyzing, onShowTrust }: UploadZoneProps) {
    const reduceMotion = useReducedMotion()
    const [isDragging, setIsDragging] = useState(false)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        if (!isAnalyzing) setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (!isAnalyzing) onUpload(e.dataTransfer.files)
    }

    return (
        <div className="rounded-2xl bg-white p-4 text-zinc-600 sm:p-5">
            {/* The label opens the file picker on click. The input inside it stays focusable,
                so the drop zone also works from the keyboard. */}
            <motion.label
                animate={{ scale: isDragging && !reduceMotion ? 1.01 : 1 }}
                transition={{ duration: 0.2, ease: EASE }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative flex min-h-[15rem] flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-9 text-center transition-[border-color,background-color] duration-200 ease-out has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#002FA7] ${
                    isAnalyzing
                        ? 'pointer-events-none border-zinc-200 bg-zinc-50'
                        : isDragging
                            ? 'cursor-copy border-[#002FA7] bg-[#002FA7]/5'
                            : 'cursor-pointer border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100'
                }`}
            >
                <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,image/*,.png,.jpg,.jpeg,.heic"
                    onChange={(e) => onUpload(e.target.files)}
                    disabled={isAnalyzing}
                    aria-describedby="bill-upload-hint"
                />

                {isAnalyzing ? (
                    <span className="flex flex-col items-center">
                        <Loader2 aria-hidden className="h-7 w-7 text-[#002FA7] motion-safe:animate-spin" />
                        <span className="mt-4 text-lg font-semibold tracking-[-0.01em] text-zinc-950">Reading your bill</span>
                        <span id="bill-upload-hint" className="mt-1 text-sm text-zinc-500">
                            Picking out usage and each line of charges.
                        </span>
                    </span>
                ) : (
                    <span className="pointer-events-none flex flex-col items-center">
                        <FileUp
                            aria-hidden
                            className={`h-7 w-7 transition-colors duration-200 ${isDragging ? 'text-[#002FA7]' : 'text-zinc-400'}`}
                        />
                        <span className="mt-4 text-lg font-semibold tracking-[-0.01em] text-zinc-950">
                            {isDragging ? 'Drop the file to start' : 'Drag your bill here'}
                        </span>
                        <span id="bill-upload-hint" className="mt-1 text-sm text-zinc-500">
                            PDF, PNG, JPG or HEIC, up to 10 MB.
                        </span>
                        <span className={`${buttonPrimary} mt-6`}>Upload bill</span>
                    </span>
                )}
            </motion.label>

            {!isAnalyzing && onShowTrust && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1">
                    <p className="text-sm text-zinc-500">Usually under 60 seconds. No commitment required.</p>
                    <button
                        type="button"
                        onClick={onShowTrust}
                        className={`rounded-sm text-sm font-medium text-[#002FA7] ${focusOnLight}`}
                    >
                        <span className="np-link">How we handle your bill</span>
                    </button>
                </div>
            )}
        </div>
    )
}
