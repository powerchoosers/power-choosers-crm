'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Phone, 
  Play, 
  Pause,
  X,
  Loader2, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  MessageSquare, 
  Sparkles,
  Building2,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, isValid } from 'date-fns'
import { Call } from '@/hooks/useCalls'
import { useCallProcessor } from '@/hooks/useCallProcessor'
import { useAuth } from '@/context/AuthContext'
import { CompanyIcon } from '@/components/ui/CompanyIcon'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { Button } from '@/components/ui/button'

interface CallListItemProps {
  call: Call
  contactId: string
  accountId?: string
  /** Account logo/domain/name for customer avatar (logoUrl or favicon fallback) */
  accountLogoUrl?: string
  accountDomain?: string
  accountName?: string
  /** Contact name for customer avatar when customerAvatar === 'contact' (e.g. contact dossier) */
  contactName?: string
  /** Use contact letter glyph for customer in transcript instead of company icon */
  customerAvatar?: 'company' | 'contact'
  variant?: 'default' | 'minimal'
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const squircleAvatar = "rounded-[14px] shrink-0 overflow-hidden bg-zinc-900/80 border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)]"

export function CallListItem({ call, contactId, accountId, accountLogoUrl, accountDomain, accountName, contactName, customerAvatar = 'company', variant = 'default' }: CallListItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hostedAvatarUrl, setHostedAvatarUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { user } = useAuth()

  const { status, error, processCall } = useCallProcessor({
    callSid: call.callSid ?? call.id,
    recordingUrl: call.recordingUrl,
    recordingSid: call.recordingSid,
    contactId,
    accountId,
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

  // Host Google avatar when expanded so transcript can show agent photo (avoids CORS)
  useEffect(() => {
    const photoURL = user?.photoURL
    if (!isExpanded || !photoURL) return
    if (photoURL.includes('imgur.com') || (!photoURL.includes('googleusercontent.com') && !photoURL.includes('ggpht.com'))) {
      setHostedAvatarUrl(photoURL)
      return
    }
    let cancelled = false
    fetch('/api/upload/host-google-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googlePhotoURL: photoURL }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.url) setHostedAvatarUrl(data.url)
      })
      .catch(() => {
        if (!cancelled) setHostedAvatarUrl(photoURL)
      })
    return () => { cancelled = true }
  }, [isExpanded, user?.photoURL])

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
      isMinimal ? "py-3 px-2" : "p-4",
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

          <AnimatePresence mode="wait">
            {!isProcessed && (
              <motion.div
                key="process-call"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="shrink-0"
              >
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
                  ) : (
                    <Sparkles className={cn(isMinimal ? "w-3.5 h-3.5" : "w-4 h-4")} />
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

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
            <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-2 min-w-0">
              <div className="flex items-center min-w-0 gap-0">
                {!isMinimal && <div className="w-[2.5rem] shrink-0" aria-hidden />}
                <span className="text-[10px] font-mono tabular-nums text-zinc-500 uppercase tracking-wider w-6 shrink-0 text-left flex-shrink-0 pr-0">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleScrub}
                  className="flex-1 min-w-0 min-w-[72px] mx-1.5 min-h-[8px] h-2 rounded-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.3)] [&::-webkit-slider-thumb]:-mt-0.5 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-700 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:-mt-0.5"
                  style={{ accentColor: 'white' }}
                />
                <span className="text-[10px] font-mono tabular-nums text-zinc-500 uppercase tracking-wider w-7 shrink-0 text-left flex-shrink-0 pl-0">
                  {formatTime(duration)}
                </span>
                <button
                  type="button"
                  onClick={closePlayer}
                  className="w-5 h-5 shrink-0 flex-shrink-0 ml-0.5 rounded-full bg-zinc-700/80 hover:bg-zinc-600 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors duration-200 min-w-[20px] min-h-[20px] p-0"
                  title="Close player"
                  aria-label="Close player"
                >
                  <X className="w-3 h-3" />
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
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-current" /> AI Forensic Analysis
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono uppercase shrink-0",
                  insights.sentiment === 'Positive' ? "bg-emerald-500/10 text-emerald-500" :
                  insights.sentiment === 'Negative' ? "bg-rose-500/10 text-rose-500" :
                  "bg-zinc-500/10 text-zinc-400"
                )}>
                  {insights.sentiment || 'Neutral'}
                </span>
              </div>
              
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[9px] font-mono text-zinc-500 uppercase mb-2">Executive Summary</div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {insights.summary || 'No summary available.'}
                </p>
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

          {/* Transcript Section — use CI sentences/speakerTurns (backend channel mapping) like legacy account-detail */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              <MessageSquare className="w-3 h-3 text-current" /> Two-Channel Transcript
            </div>
            
            <div className="max-h-80 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {(() => {
                // 1. Prefer conversationalIntelligence.sentences (backend maps Agent/Customer by channel)
                const ci = insights?.conversationalIntelligence
                const sentences = Array.isArray(ci?.sentences) ? ci.sentences : []
                const speakerTurns = Array.isArray(insights?.speakerTurns) ? insights.speakerTurns : []
                type Turn = { role: 'agent' | 'customer'; text: string }
                let turns: Turn[] = []
                if (sentences.length > 0) {
                  turns = sentences
                    .filter((s: { text?: string }) => (s.text || '').trim())
                    .map((s: { speaker?: string; text?: string }) => ({
                      role: (s.speaker || '').toLowerCase() === 'customer' ? 'customer' : 'agent',
                      text: (s.text || '').trim(),
                    }))
                } else if (speakerTurns.length > 0) {
                  turns = speakerTurns
                    .filter((t: { text?: string }) => (t.text || '').trim())
                    .map((t: { role?: string; text?: string }) => ({
                      role: (t.role || 'agent').toLowerCase() === 'customer' ? 'customer' : 'agent',
                      text: (t.text || '').trim(),
                    }))
                } else if (call.transcript) {
                  // 2. Fallback: parse transcript lines; only trust explicit "Agent:" / "Customer:" (from backend)
                  turns = call.transcript
                    .split('\n')
                    .map((line) => {
                      const trimmed = line.trim()
                      if (!trimmed) return null
                      const match = trimmed.match(/^(Agent|Customer):\s*(.*)$/i)
                      if (match) {
                        return {
                          role: match[1].toLowerCase() as 'agent' | 'customer',
                          text: match[2].trim(),
                        }
                      }
                      const generic = trimmed.match(/^([^:]+):\s*(.*)$/)
                      if (generic) return { role: 'customer' as const, text: generic[2].trim() }
                      return { role: 'customer' as const, text: trimmed }
                    })
                    .filter((t): t is Turn => t != null && t.text !== '')
                }
                if (turns.length === 0) return null
                return turns.map((turn, i) => {
                  const isAgent = turn.role === 'agent'
                  const agentPhotoUrl = hostedAvatarUrl || (user?.photoURL?.includes('imgur.com') ? user.photoURL : null)
                  return (
                    <div key={i} className={cn(
                      "flex gap-3",
                      isAgent ? "flex-row-reverse" : "flex-row"
                    )}>
                      {isAgent ? (
                        <div className={cn(
                          "w-6 h-6 flex items-center justify-center mt-1 text-[10px] font-mono",
                          squircleAvatar,
                          "bg-[#002FA7]/20 border-[#002FA7]/30"
                        )}>
                          {agentPhotoUrl ? (
                            <img src={agentPhotoUrl} alt="Agent" className="w-full h-full object-cover !rounded-[14px]" />
                          ) : (
                            <Zap className="w-3 h-3 text-[#002FA7]" />
                          )}
                        </div>
                      ) : customerAvatar === 'contact' && contactName ? (
                        <div className="mt-1 shrink-0">
                          <ContactAvatar name={contactName} size={24} className="rounded-[8px]" />
                        </div>
                      ) : (accountLogoUrl || accountDomain) ? (
                        <div className="mt-1 shrink-0">
                          <CompanyIcon
                            logoUrl={accountLogoUrl}
                            domain={accountDomain}
                            name={accountName || 'Customer'}
                            size={24}
                            roundedClassName="rounded-[8px]"
                          />
                        </div>
                      ) : (
                        <div className={cn(
                          "w-6 h-6 flex items-center justify-center mt-1 text-[10px] font-mono",
                          squircleAvatar,
                          "bg-zinc-900/80 text-zinc-400 border-white/20"
                        )}>
                          <Building2 className="w-3 h-3" />
                        </div>
                      )}
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
                          {isAgent ? 'AGENT' : 'CUSTOMER'}
                        </div>
                        {turn.text}
                      </div>
                    </div>
                  )
                })
              })() ?? (
                !call.transcript && !insights?.conversationalIntelligence?.sentences?.length && !insights?.speakerTurns?.length ? (
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
                ) : null
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
