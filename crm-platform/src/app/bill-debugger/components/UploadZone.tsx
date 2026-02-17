import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { UploadCloud, FileText, Loader2 } from 'lucide-react'

interface UploadZoneProps {
    onUpload: (files: FileList | null) => void
    isAnalyzing: boolean
}

export function UploadZone({ onUpload, isAnalyzing }: UploadZoneProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
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
        <div className="w-full max-w-2xl mx-auto text-center px-6">

            {/* Header */}
            {!isAnalyzing && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-10"
                >
                    <h2 className="text-3xl md:text-5xl font-light text-zinc-900 mb-4">
                        Drop Your Invoice
                    </h2>
                    <p className="text-lg text-zinc-500 font-light">
                        Upload a recent bill (PDF, image, or photo). <br className="hidden md:block" />
                        We'll analyze it in under 60 seconds.
                    </p>
                </motion.div>
            )}

            {/* Drop Zone Area */}
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className={`relative w-full aspect-[2/1] md:aspect-[3/1] rounded-3xl border-2 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer overflow-hidden backdrop-blur-sm bg-white/60
          ${isDragging
                        ? 'border-[#002FA7] bg-[#002FA7]/5 scale-[1.02] shadow-xl shadow-[#002FA7]/10'
                        : 'border-dashed border-zinc-300 hover:border-zinc-400 hover:bg-white/80'
                    }
          ${isAnalyzing ? 'pointer-events-none border-zinc-200 bg-zinc-50/50' : ''}
        `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isAnalyzing && fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf,image/*,.png,.jpg,.jpeg,.heic"
                    onChange={(e) => onUpload(e.target.files)}
                    disabled={isAnalyzing}
                />

                {/* Normal State */}
                {!isAnalyzing && (
                    <div className="pointer-events-none z-10 flex flex-col items-center">
                        <div className={`w-12 h-12 mb-4 transition-colors duration-300 rounded-full flex items-center justify-center ${isDragging ? 'bg-[#002FA7]/10 text-[#002FA7]' : 'bg-zinc-100 text-zinc-400 group-hover:text-zinc-600'}`}>
                            <UploadCloud className="w-6 h-6" />
                        </div>
                        <p className={`text-lg font-medium transition-colors ${isDragging ? 'text-[#002FA7]' : 'text-zinc-700'}`}>
                            {isDragging ? 'Ready to analyze...' : 'Drop here or click to browse'}
                        </p>
                        <p className="text-xs text-zinc-400 mt-2 uppercase tracking-wide">
                            PDF, PNG, JPG, HEIC • MAX 10MB
                        </p>
                    </div>
                )}

                {/* Analyzing State */}
                {isAnalyzing && (
                    <div className="flex flex-col items-center z-10">
                        <div className="relative">
                            <div className="absolute inset-0 bg-[#002FA7]/20 blur-lg rounded-full animate-pulse"></div>
                            <Loader2 className="w-10 h-10 text-[#002FA7] animate-spin relative z-10" />
                        </div>
                        <p className="mt-6 text-lg font-medium text-zinc-800 animate-pulse">
                            Analyzing Your Bill...
                        </p>
                        <p className="text-sm text-zinc-400 mt-2">
                            Extracting usage data and line items
                        </p>
                    </div>
                )}

            </motion.div>

        </div>
    )
}
