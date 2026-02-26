'use client'

import { useState } from 'react'
import { Sparkles, Clock, Copy, Check } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ForensicDataPoint } from '@/components/ui/ForensicDataPoint'

interface AnalystTerminalProps {
    id: string
    isEditing: boolean
    editNotes: string
    setEditNotes: (v: string) => void
    onNoteSubmit: (note: string) => Promise<void>
    onWipe?: () => Promise<void>
    maturityInfo?: string
}

export function AnalystTerminal({
    id,
    isEditing,
    editNotes,
    setEditNotes,
    onNoteSubmit,
    onWipe,
    maturityInfo
}: AnalystTerminalProps) {
    const [isTyping, setIsTyping] = useState(false)
    const [terminalInput, setTerminalInput] = useState('')
    const [descriptionCopied, setDescriptionCopied] = useState(false)

    const handleTerminalSubmit = async () => {
        if (!terminalInput.trim()) {
            setIsTyping(false)
            return
        }

        const input = terminalInput.trim()

        if (input.startsWith('/')) {
            const cmd = input.slice(1).toLowerCase()
            if (cmd === 'clear' && onWipe) {
                await onWipe()
                setTerminalInput('')
                setIsTyping(false)
                return
            }
            if (cmd === 'help') {
                toast.info('Available: /clear, /status, /help')
                setTerminalInput('')
                return
            }
            if (cmd === 'status' && maturityInfo) {
                toast.info(maturityInfo)
                setTerminalInput('')
                return
            }
        }

        await onNoteSubmit(input)
        setTerminalInput('')
        setIsTyping(false)
    }

    return (
        <div
            className={`nodal-void-card transition-all duration-500 p-6 min-h-[500px] relative overflow-hidden shadow-2xl group flex flex-col font-mono ${isEditing ? 'border-[#002FA7]/50 ring-1 ring-[#002FA7]/20 cursor-text' : ''}`}
            onClick={() => {
                if (!isEditing && !isTyping) setIsTyping(true)
            }}
        >
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-50" />

            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4 relative z-10">
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full animate-pulse ${isEditing ? 'bg-[#002FA7] shadow-[0_0_12px_rgba(0,47,167,0.8)]' : 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)]'}`} />
                    <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-zinc-400">
                        {isEditing ? 'SYS_CONFIG_OVERRIDE' : 'FORENSIC_LOG_STREAM'}
                    </h3>
                </div>
                <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest flex items-center gap-4">
                    <span>SECURE_NODE: {id.slice(0, 8).toUpperCase()}</span>
                    <span>NP-OS_V.1.0.4</span>
                </div>
            </div>

            <div className="flex-1 text-sm leading-relaxed relative z-10">
                {isEditing ? (
                    <div className="flex flex-col h-full">
                        <div className="flex gap-3 items-start mb-4">
                            <span className="text-[#002FA7] shrink-0">root@nodal:~$</span>
                            <span className="text-[#002FA7]/50 uppercase tracking-widest text-[10px] mt-1">Direct Dossier Access Granted</span>
                        </div>
                        <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-zinc-300 p-0 m-0 resize-none focus:ring-0 placeholder:text-zinc-800 min-h-[400px] font-mono"
                            placeholder="// Enter intelligence data..."
                        />
                    </div>
                ) : (
                    <div className="group/copyblock relative">
                        {editNotes?.trim() && (
                            <span
                                onClick={(e) => {
                                    e.stopPropagation()
                                    navigator.clipboard.writeText(editNotes)
                                    setDescriptionCopied(true)
                                    setTimeout(() => setDescriptionCopied(false), 2000)
                                }}
                                className="absolute top-0 right-0 z-10 p-1 rounded text-zinc-500 hover:text-white cursor-pointer opacity-0 group-hover/copyblock:opacity-100 transition-opacity"
                            >
                                {descriptionCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </span>
                        )}
                        <div className="space-y-4">
                            {editNotes.split('\n\n').map((entry, idx) => {
                                const timestampMatch = entry.match(/^\[(.*?)\]/)
                                const timestamp = timestampMatch ? timestampMatch[1] : null
                                const content = timestamp ? entry.replace(/^\[.*?\]/, '').trim() : entry
                                return (
                                    <div key={idx} className="group/entry flex gap-4 animate-in fade-in slide-in-from-left-2 duration-300 pb-4 border-b border-white/[0.03] last:border-none">
                                        <div className="flex flex-col items-center self-stretch flex-none">
                                            <div className="w-1 h-1 rounded-full bg-[#002FA7]/40 mt-2.5 flex-none" />
                                            <div className="w-px bg-[#002FA7]/20 flex-1" />
                                        </div>
                                        <div className="flex-1 min-w-0 pb-2">
                                            {timestamp && (
                                                <div className="text-[10px] text-zinc-600 mb-1.5 flex items-center gap-2">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{timestamp}</span>
                                                </div>
                                            )}
                                            <div className="text-zinc-300 group-hover/entry:text-white transition-colors whitespace-pre-wrap break-words">
                                                {content}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-white/5">
                            <span className="text-white shrink-0 mt-1">
                                <Sparkles className="w-4 h-4 animate-pulse" />
                            </span>
                            <div className="flex-1 flex flex-col">
                                {isTyping ? (
                                    <div className="flex items-start">
                                        <textarea
                                            autoFocus
                                            rows={1}
                                            value={terminalInput}
                                            onChange={(e) => {
                                                setTerminalInput(e.target.value)
                                                e.target.style.height = 'auto'
                                                e.target.style.height = e.target.scrollHeight + 'px'
                                            }}
                                            onBlur={() => { if (!terminalInput.trim()) setIsTyping(false) }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault()
                                                    handleTerminalSubmit()
                                                }
                                                if (e.key === 'Escape') {
                                                    setIsTyping(false)
                                                    setTerminalInput('')
                                                }
                                            }}
                                            className="w-full bg-transparent border-none outline-none text-[#22c55e] p-0 m-0 resize-none focus:ring-0 placeholder:text-zinc-800 font-mono"
                                            placeholder="Awaiting analyst input..."
                                        />
                                        <span className="w-2 h-4 bg-[#22c55e] animate-[blink_1s_step-end_infinite] inline-block mt-0.5 ml-1" />
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setIsTyping(true)}
                                        className="text-left text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-2 group/btn"
                                    >
                                        <span className="text-[#22c55e]">root@nodal:~$</span>
                                        <span className="animate-pulse">_ INITIALIZE_INPUT_STREAM</span>
                                    </button>
                                )}

                                {terminalInput.startsWith('/') && (
                                    <div className="mt-4 p-4 bg-zinc-950/80 rounded-xl border border-[#002FA7]/30 nodal-monolith-edge">
                                        <div className="text-[10px] font-mono text-[#002FA7] uppercase tracking-[0.3em] mb-3 border-b border-[#002FA7]/20 pb-2">Available Protocols</div>
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                            <div className="text-[10px] font-mono flex justify-between"><span className="text-zinc-300">/clear</span> <span className="text-zinc-600">WIPE_DOSSIER</span></div>
                                            <div className="text-[10px] font-mono flex justify-between"><span className="text-zinc-300">/status</span> <span className="text-zinc-600">POS_MATURITY</span></div>
                                            <div className="text-[10px] font-mono flex justify-between"><span className="text-zinc-300">/help</span> <span className="text-zinc-600">LIST_PROTOCOLS</span></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
