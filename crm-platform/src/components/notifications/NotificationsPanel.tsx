'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  CalendarCheck,
  CheckCheck,
  Eye,
  FileSignature,
  Loader2,
  Mail,
  MousePointer2,
  PhoneMissed,
  RefreshCw,
  Voicemail,
  Play,
  Pause,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotificationCenter, type NotificationFeedItem } from '@/hooks/useNotificationCenter'

type FilterKey = 'all' | 'unread' | NotificationFeedItem['type']

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'email_open', label: 'Opens' },
  { key: 'email_click', label: 'Clicks' },
  { key: 'contract_viewed', label: 'Viewed' },
  { key: 'contract_opened', label: 'Opened' },
  { key: 'contract_signed', label: 'Signed' },
  { key: 'missed_call', label: 'Missed Calls' },
]

function formatRelativeTime(value: string) {
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return 'Now'
  const diffMs = Date.now() - time
  if (diffMs < 60_000) return 'Now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function getIcon(type: NotificationFeedItem['type'], metadata?: any) {
  if (type === 'email_open') return Eye
  if (type === 'email_click') return MousePointer2
  if (type === 'contract_viewed') return Eye
  if (type === 'contract_opened') return Mail
  if (type === 'contract_signed') return FileSignature
  if (type === 'rsvp') return CalendarCheck
  if (type === 'missed_call') {
    return metadata?.hasVoicemail ? Voicemail : PhoneMissed
  }
  return Bell
}

function getIconClass(type: NotificationFeedItem['type'], metadata?: any) {
  if (type === 'email_open') return 'text-emerald-400'
  if (type === 'email_click') return 'text-[#002FA7]'
  if (type === 'contract_signed') return 'text-emerald-400'
  if (type === 'contract_opened' || type === 'contract_viewed') return 'text-[#002FA7]'
  if (type === 'missed_call') {
    return metadata?.hasVoicemail ? 'text-amber-400' : 'text-rose-400'
  }
  if (type === 'reminder') return 'text-amber-400'
  return 'text-zinc-300'
}

export function NotificationsPanel() {
  const router = useRouter()
  const { items, unreadCount, isLoading, isFetching, markItemRead, markAllRead, refetch } = useNotificationCenter()
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [playingVoicemail, setPlayingVoicemail] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items
    if (activeFilter === 'unread') return items.filter((item) => !item.read)
    return items.filter((item) => item.type === activeFilter)
  }, [items, activeFilter])

  const handleOpen = async (item: NotificationFeedItem) => {
    await markItemRead(item)
    if (item.link) {
      router.push(item.link)
    }
  }

  const toggleVoicemailPlay = (itemId: string, recordingUrl: string) => {
    if (playingVoicemail === itemId) {
      // Toggle play/pause
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause()
        } else {
          audioRef.current.play()
        }
      }
    } else {
      // Start new voicemail
      setPlayingVoicemail(itemId)
      if (audioRef.current) {
        audioRef.current.src = `/api/recording?url=${encodeURIComponent(recordingUrl)}`
        audioRef.current.play()
      }
    }
  }

  const stopVoicemail = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingVoicemail(null)
    setIsPlaying(false)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      setPlayingVoicemail(null)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [])

  return (
    <motion.div
      key="notifications-panel"
      initial={{ opacity: 0, y: 4, scaleY: 0.98 }}
      animate={{ opacity: 1, y: 0, scaleY: 1 }}
      exit={{ opacity: 0, y: 4, scaleY: 0.98, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, delay: 0.05 }}
      style={{ transformOrigin: 'top' }}
      className="absolute top-16 left-2 right-2 h-[600px] max-h-[calc(100vh-8rem)] rounded-2xl glass-panel nodal-monolith-edge !bg-zinc-950/90 backdrop-blur-xl overflow-hidden z-[60] pointer-events-auto"
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-[#002FA7]/5 via-transparent to-white/5 pointer-events-none" />

      <div className="relative z-10 h-full flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 nodal-recessed">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-zinc-300" />
              <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-widest">
                Signal Inbox
              </span>
              <span className="text-[10px] font-mono text-[#002FA7] bg-[#002FA7]/10 border border-[#002FA7]/20 px-2 py-0.5 rounded-full">
                {unreadCount} UNREAD
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void refetch()}
                className="icon-button-forensic w-8 h-8"
                aria-label="Refresh notifications"
              >
                <RefreshCw size={15} className={cn(isFetching && 'animate-spin')} />
              </button>
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="h-8 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-mono text-zinc-300 uppercase tracking-widest transition-colors"
              >
                <CheckCheck size={12} className="inline-block mr-1.5 text-zinc-300" />
                Mark All Read
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[9px] font-mono uppercase tracking-widest border transition-colors',
                  activeFilter === filter.key
                    ? 'bg-[#002FA7]/15 border-[#002FA7]/40 text-[#002FA7]'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto np-scroll">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-zinc-400">
              <Loader2 size={18} className="animate-spin mr-2" />
              <span className="text-xs font-mono uppercase tracking-widest">Loading Signals</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex items-center justify-center px-8 text-center">
              <div className="space-y-2">
                <p className="text-sm text-zinc-200 font-medium">No signals in this filter.</p>
                <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
                  Waiting for live activity.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              <AnimatePresence initial={false}>
                {filteredItems.map((item) => {
                  const Icon = getIcon(item.type, item.metadata)
                  const hasVoicemail = item.type === 'missed_call' && item.metadata?.hasVoicemail && item.metadata?.recordingUrl
                  const isPlayingThis = playingVoicemail === item.id
                  
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="w-full"
                    >
                      <button
                        type="button"
                        onClick={() => !hasVoicemail && void handleOpen(item)}
                        className={cn(
                          'w-full text-left p-3 rounded-xl border transition-colors',
                          item.read
                            ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                            : 'bg-[#002FA7]/6 border-[#002FA7]/25 hover:bg-[#002FA7]/10'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 w-8 h-8 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center shrink-0">
                            <Icon size={15} className={getIconClass(item.type, item.metadata)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn('text-sm truncate', item.read ? 'text-zinc-300' : 'text-white')}>
                                {item.title}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0 uppercase tracking-widest">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                            </div>
                            <p className={cn('text-xs mt-1 line-clamp-2', item.read ? 'text-zinc-500' : 'text-zinc-300')}>
                              {item.message}
                            </p>
                            
                            {hasVoicemail && (
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleVoicemailPlay(item.id, item.metadata.recordingUrl)
                                  }}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors text-[10px] font-mono uppercase tracking-widest"
                                >
                                  {isPlayingThis && isPlaying ? (
                                    <>
                                      <Pause className="w-3 h-3" />
                                      Pause
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-3 h-3" />
                                      {isPlayingThis ? 'Resume' : 'Play Voicemail'}
                                    </>
                                  )}
                                </button>
                                {isPlayingThis && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      stopVoicemail()
                                    }}
                                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void handleOpen(item)
                                  }}
                                  className="ml-auto text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                  View Details →
                                </button>
                              </div>
                            )}
                          </div>
                          {!item.read && (
                            <div className="mt-1 w-2 h-2 rounded-full bg-[#002FA7] shadow-[0_0_10px_rgba(0,47,167,0.6)] shrink-0" />
                          )}
                        </div>
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              <audio ref={audioRef} className="hidden" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

