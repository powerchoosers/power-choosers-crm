'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Phone, 
  Play, 
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
}

export function CallListItem({ call, contactId }: CallListItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
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

  return (
    <div className={cn(
      "group p-4 rounded-xl border transition-all duration-300",
      isExpanded ? "bg-white/[0.05] border-white/10 shadow-2xl" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className={cn(
            "p-3 rounded-xl transition-colors duration-300",
            call.type === 'Inbound' 
              ? "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20" 
              : "bg-[#002FA7]/10 text-[#002FA7] group-hover:bg-[#002FA7]/20"
          )}>
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
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
                ? format(new Date(call.date), 'MMM dd, yyyy • HH:mm') 
                : 'Unknown Date'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {call.recordingUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 rounded-lg hover:bg-[#002FA7]/20 hover:text-[#002FA7] text-zinc-500 transition-all"
              onClick={() => window.open(call.recordingUrl, '_blank')}
              title="Play Recording"
            >
              <Play className="w-4 h-4 fill-current" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-8 h-8 rounded-lg transition-all duration-300 relative overflow-hidden",
              currentStatus === 'processing' ? "bg-amber-500/10 text-amber-500 border border-amber-500/30" :
              currentStatus === 'ready' ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" :
              "text-zinc-500 hover:bg-white/5 hover:text-white"
            )}
            onClick={(e) => {
              e.stopPropagation()
              if (currentStatus !== 'processing') processCall()
            }}
            disabled={currentStatus === 'processing'}
            title={currentStatus === 'processing' ? 'AI Analysis in Progress...' : 'Start Forensic Analysis'}
          >
            {currentStatus === 'processing' && (
              <motion.div 
                className="absolute inset-0 bg-amber-500/5"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            {currentStatus === 'processing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : currentStatus === 'ready' ? (
              <Sparkles className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-lg hover:bg-white/5 text-zinc-500 transition-all"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

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
