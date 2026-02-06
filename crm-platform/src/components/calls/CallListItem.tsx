'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Phone, 
  Play, 
  Pause,
  X,
  Eye, 
  Loader2, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  MessageSquare, 
  Sparkles,
  User,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, isValid } from 'date-fns'
import { Call } from '@/hooks/useCalls'
import { useCallProcessor } from '@/hooks/useCallProcessor'
import { Button } from '@/components/ui/button'

interface CallListItemProps {
  call: Call
  contactId: string
  variant?: 'default' | 'minimal'
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function CallListItem({ call, contactId, variant = 'default' }: CallListItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { status, error, processCall } = useCallProcessor({
    callSid: call.id,
    recordingUrl: call.recordingUrl,
    recordingSid: call.recordingSid,
    contactId
  })

  const isProcessed = !!(call.transcript || call.aiInsights)
  const currentStatus = isProcessed ? 'ready' : status

  // Parse AI Insights if they exist
  const insights = typeof call.aiInsights === 'string' 
    ? JSON.parse(call.aiInsights) 
    : call.aiInsights

  // Compact duration for minimal (e.g. "00:00:16" -> "0:16")
  const compactDuration = variant === 'minimal' && call.duration
    ? call.duration.replace(/^00:00:/, '0:').replace(/^00:/, '')
    : call.duration

  const isMinimal = variant === 'minimal'

  // Inline audio player: bind to audio element
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTimeUpdate = () => setCurrentTime(el.currentTime)
    const onLoadedMetadata = () => setDuration(el.duration)
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('ended', onEnded)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [isPlayerOpen])

  const openPlayerAndPlay = () => {
    if (!call.recordingUrl) return
    setIsPlayerOpen(true)
    const el = audioRef.current
    if (el) {
      // Use our backend proxy so Twilio auth is applied (direct Twilio URL requires Basic Auth from browser)
      const proxyUrl = `/api/recording?url=${encodeURIComponent(call.recordingUrl)}`
      el.src = proxyUrl
      el.play().catch(() => setIsPlaying(false))
    }
  }

  const togglePlayPause = () => {
    const el = audioRef.current
    if (!el) return
    if (isPlaying) el.pause()
    else el.play().catch(() => setIsPlaying(false))
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value)
    setCurrentTime(t)
    const el = audioRef.current
    if (el) el.currentTime = t
  }

  const closePlayer = () => {
    const el = audioRef.current
    if (el) {
      el.pause()
      el.removeAttribute('src')
    }
    setIsPlayerOpen(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }

  return (
    <div className={cn(
      "group rounded-xl border transition-all duration-300 overflow-hidden",
      isMinimal ? "p-3" : "p-4",
      isExpanded ? "bg-white/[0.05] border-white/10 shadow-2xl" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10"
    )}>
      {call.recordingUrl && (
        <audio ref={audioRef} preload="metadata" className="hidden" />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className={cn(
          "flex-1 min-w-0",
          !isMinimal && "flex items-center gap-4"
        )}>
          {!isMinimal && (
            <div className={cn(
              "p-3 rounded-xl transition-colors duration-300 shrink-0",
              call.type === 'Inbound' 
                ? "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20" 
                : "bg-[#002FA7]/10 text-[#002FA7] group-hover:bg-[#002FA7]/20"
            )}>
              <Phone className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {isMinimal ? (
              <>
                <div className="text-[11px] font-semibold text-white flex items-center gap-2 flex-wrap">
                  <span>{call.type}</span>
                  <span className="text-zinc-500 font-normal">•</span>
                  <span className="font-mono tabular-nums text-zinc-400">{compactDuration}</span>
                  {isProcessed && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shrink-0" title="Decrypted" />
                  )}
                </div>
                <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">
                  {call.date && isValid(new Date(call.date)) 
                    ? (() => {
                        const d = new Date(call.date!)
                        const dateStr = format(d, 'MMM d, yyyy')
                        const timeStr = d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true })
                        return `${dateStr} ${timeStr}`
                      })()
                    : 'Unknown Date'}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-white flex items-center justify-between gap-4 w-full">
                  <div className="flex items-center gap-3">
                    {call.type} Call
                    {isProcessed && (
                      <span className="px-2 py-0.5 rounded border border-white/10 text-[9px] font-mono text-zinc-500 uppercase tracking-widest bg-transparent">
                        [ STATUS: DECRYPTED ]
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest tabular-nums ml-auto">
                    {call.duration}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase mt-1">
                  {call.date && isValid(new Date(call.date)) 
                    ? (() => {
                        const d = new Date(call.date!)
                        const dateStr = format(d, 'MMM dd, yyyy')
                        const timeStr = d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true })
                        return `${dateStr} • ${timeStr}`
                      })()
                    : 'Unknown Date'}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {call.recordingUrl && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "text-zinc-500 hover:text-zinc-300 hover:scale-105 transition-all duration-200",
                isMinimal ? "w-7 h-7" : "w-8 h-8"
              )}
              onClick={(e) => {
                e.stopPropagation()
                if (isPlayerOpen) togglePlayPause()
                else openPlayerAndPlay()
              }}
              title={isPlayerOpen ? (isPlaying ? 'Pause' : 'Play') : 'Play Recording'}
            >
              {isPlayerOpen && isPlaying ? (
                <Pause className={cn("fill-current", isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} />
              ) : (
                <Play className={cn("fill-current", isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} />
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "transition-all duration-200 relative overflow-hidden hover:scale-105 text-zinc-500 hover:text-zinc-300",
              isMinimal ? "w-7 h-7" : "w-8 h-8",
              currentStatus === 'processing' && "text-amber-500 hover:text-amber-400"
            )}
            onClick={(e) => {
              e.stopPropagation()
              if (currentStatus !== 'processing') processCall()
            }}
            disabled={currentStatus === 'processing'}
            title={currentStatus === 'processing' ? 'AI Analysis in Progress...' : 'Start Forensic Analysis'}
          >
            <AnimatePresence>
              {currentStatus === 'processing' && (
                <motion.div 
                  key="processing-indicator"
                  className="absolute inset-0 bg-amber-500/5"
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </AnimatePresence>
            {currentStatus === 'processing' ? (
              <Loader2 className={cn("animate-spin", isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} />
            ) : currentStatus === 'ready' ? (
              <Sparkles className={cn(isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} />
            ) : (
              <Eye className={cn(isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "text-zinc-500 hover:text-zinc-300 hover:scale-105 transition-all duration-200",
              isMinimal ? "w-7 h-7" : "w-8 h-8"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className={cn(isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} /> : <ChevronDown className={cn(isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isPlayerOpen && call.recordingUrl && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-2 min-w-0 pl-0 pr-4">
              <div className="flex items-center min-w-0 px-0 py-1 gap-0">
                {!isMinimal && <div className="w-[2.5rem] shrink-0" aria-hidden />}
                <span className="text-[10px] font-mono tabular-nums text-zinc-500 uppercase tracking-wider w-10 shrink-0 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleScrub}
                  className="flex-1 min-w-[120px] mx-2 min-h-[8px] h-2 rounded-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.3)] [&::-webkit-slider-thumb]:-mt-0.5 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-700 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:-mt-0.5"
                  style={{ accentColor: 'white' }}
                />
                <span className="text-[10px] font-mono tabular-nums text-zinc-500 uppercase tracking-wider w-10 shrink-0 text-left">
                  {formatTime(duration)}
                </span>
                <button
                  type="button"
                  onClick={closePlayer}
                  className="w-7 h-7 shrink-0 ml-2 rounded-full bg-zinc-700/80 hover:bg-zinc-600 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors duration-200 flex-shrink-0 min-w-[28px] min-h-[28px]"
                  title="Close player"
                  aria-label="Close player"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isExpanded && (
        <div className="mt-6 pt-6 border-t border-white/5 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* AI Insights Section */}
          {insights && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                <Sparkles className="w-3 h-3 text-[#002FA7]" /> AI Forensic Analysis
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[9px] font-mono text-zinc-500 uppercase mb-2">Executive Summary</div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {insights.summary || 'No summary available.'}
                  </p>
                </div>
                
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[9px] font-mono text-zinc-500 uppercase mb-2">Sentiment & Signal</div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-1 rounded text-[10px] font-mono uppercase",
                      insights.sentiment === 'Positive' ? "bg-emerald-500/10 text-emerald-500" :
                      insights.sentiment === 'Negative' ? "bg-rose-500/10 text-rose-500" :
                      "bg-zinc-500/10 text-zinc-400"
                    )}>
                      {insights.sentiment || 'Neutral'}
                    </span>
                    {insights.keyTopics && insights.keyTopics.map((topic: string) => (
                      <span key={topic} className="px-2 py-1 rounded bg-white/5 text-[10px] font-mono text-zinc-500 uppercase">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {insights.nextSteps && insights.nextSteps.length > 0 && (
                <div className="p-4 rounded-xl bg-[#002FA7]/5 border border-[#002FA7]/10">
                  <div className="text-[9px] font-mono text-[#002FA7] uppercase mb-2 flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> Recommended Next Steps
                  </div>
                  <ul className="space-y-2">
                    {insights.nextSteps.map((step: string, i: number) => (
                      <li key={i} className="text-xs text-zinc-300 flex items-start gap-2">
                        <span className="text-[#002FA7]">•</span> {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Transcript Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              <MessageSquare className="w-3 h-3 text-[#002FA7]" /> Two-Channel Transcript
            </div>
            
            <div className="max-h-80 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {call.transcript ? (
                call.transcript.split('\n').map((line, i) => {
                  if (!line.trim()) return null;
                  
                  // Handle various speaker labels
                  // Twilio: "Speaker 0: ...", "Speaker 1: ..."
                  // Legacy: "Agent: ...", "Contact: ..."
                  // Perplexity: "Me: ...", "Client: ..."
                  const speakerMatch = line.match(/^([^:]+):/);
                  const speaker = speakerMatch ? speakerMatch[1].trim() : '';
                  const text = line.replace(/^[^:]+:/, '').trim();
                  
                  // Determine if the speaker is internal (Agent/Me/Speaker 0)
                  const isAgent = /^(Agent|Me|Speaker 0|Internal|User)$/i.test(speaker) || (i % 2 === 0 && !speaker);
                  
                  return (
                    <div key={i} className={cn(
                      "flex gap-3",
                      isAgent ? "flex-row-reverse" : "flex-row"
                    )}>
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1 text-[10px] font-mono",
                        isAgent ? "bg-[#002FA7]/20 text-[#002FA7] border border-[#002FA7]/30" : "bg-zinc-800 text-zinc-500 border border-white/5"
                      )}>
                        {isAgent ? <Zap className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      </div>
                      <div className={cn(
                        "p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] relative group/bubble",
                        isAgent 
                          ? "bg-[#002FA7]/10 text-zinc-200 border border-[#002FA7]/20 rounded-tr-none" 
                          : "bg-white/[0.03] text-zinc-400 border border-white/5 rounded-tl-none"
                      )}>
                        <div className={cn(
                          "text-[9px] font-mono uppercase opacity-40 mb-1",
                          isAgent ? "text-right" : "text-left"
                        )}>
                          {speaker || (isAgent ? 'AGENT' : 'EXTERNAL')}
                        </div>
                        {text}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-[10px] font-mono uppercase tracking-widest">Transcript_Not_Found</p>
                  <Button 
                    variant="link" 
                    className="text-[#002FA7] text-[10px] font-mono uppercase p-0 h-auto mt-2"
                    onClick={processCall}
                  >
                    Generate Now
                  </Button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-500">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
