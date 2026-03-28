'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type NodalAudioScrubberProps = {
  src: string | null | undefined
  durationHint?: number
  onClear?: () => void
  clearLabel?: string
  className?: string
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function NodalAudioScrubber({
  src,
  durationHint = 0,
  onClear,
  clearLabel = 'Clear audio',
  className,
}: NodalAudioScrubberProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const audioSrcRef = useRef<string | null>(null)
  const seekGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSeekingRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationHint > 0 ? durationHint : 0)

  const clearSeekGuard = () => {
    if (seekGuardTimeoutRef.current) {
      clearTimeout(seekGuardTimeoutRef.current)
      seekGuardTimeoutRef.current = null
    }
  }

  const getSeekableMax = (el: HTMLAudioElement): number => {
    const durationCandidate = Number(el.duration)
    if (Number.isFinite(durationCandidate) && durationCandidate > 0) return durationCandidate
    const seekable = el.seekable
    if (seekable && seekable.length > 0) {
      const lastEnd = seekable.end(seekable.length - 1)
      if (Number.isFinite(lastEnd) && lastEnd > 0) return lastEnd
    }
    if (durationHint > 0) return durationHint
    return 0
  }

  useEffect(() => {
    const el = audioRef.current
    clearSeekGuard()

    if (!el) {
      setDuration(durationHint > 0 ? durationHint : 0)
      setCurrentTime(0)
      setIsPlaying(false)
      isSeekingRef.current = false
      pendingSeekRef.current = null
      audioSrcRef.current = null
      return
    }

    if (!src) {
      el.pause()
      el.removeAttribute('src')
      el.load()
      setDuration(durationHint > 0 ? durationHint : 0)
      setCurrentTime(0)
      setIsPlaying(false)
      isSeekingRef.current = false
      pendingSeekRef.current = null
      audioSrcRef.current = null
      return
    }

    if (audioSrcRef.current !== src) {
      audioSrcRef.current = src
      el.src = src
      el.load()
      setDuration(durationHint > 0 ? durationHint : 0)
      setCurrentTime(0)
      setIsPlaying(false)
      isSeekingRef.current = false
      pendingSeekRef.current = null
    }

    const syncDuration = () => {
      const d = Number(el.duration)
      if (Number.isFinite(d) && d > 0) {
        setDuration(d)
        if (pendingSeekRef.current != null) {
          const target = Math.max(0, Math.min(pendingSeekRef.current, d))
          el.currentTime = target
          setCurrentTime(target)
          pendingSeekRef.current = null
        }
      } else if (durationHint > 0) {
        setDuration(durationHint)
      }
    }

    const onTimeUpdate = () => {
      if (isSeekingRef.current) return
      setCurrentTime(el.currentTime)
    }

    const onLoadedMetadata = () => syncDuration()
    const onDurationChange = () => syncDuration()
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onSeeked = () => {
      clearSeekGuard()
      setCurrentTime(el.currentTime)
    }

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('ended', onEnded)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('seeked', onSeeked)

    syncDuration()

    return () => {
      clearSeekGuard()
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('durationchange', onDurationChange)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('seeked', onSeeked)
    }
  }, [src, durationHint])

  const togglePlayPause = () => {
    const el = audioRef.current
    if (!el || !src) return
    if (isPlaying) {
      el.pause()
    } else {
      el.play().catch(() => setIsPlaying(false))
    }
  }

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value)
    setCurrentTime(t)

    const el = audioRef.current
    if (!el) return

    const seekMax = getSeekableMax(el)
    if (seekMax > 0) {
      const target = Math.max(0, Math.min(t, seekMax))
      isSeekingRef.current = true
      clearSeekGuard()
      seekGuardTimeoutRef.current = setTimeout(() => {
        isSeekingRef.current = false
        seekGuardTimeoutRef.current = null
      }, 700)
      try {
        el.currentTime = target
        pendingSeekRef.current = null
        return
      } catch {
        pendingSeekRef.current = target
      }
    }

    isSeekingRef.current = false
    pendingSeekRef.current = t
  }

  const handleClear = () => {
    const el = audioRef.current
    if (el) {
      el.pause()
      el.currentTime = 0
    }

    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(durationHint > 0 ? durationHint : 0)
    isSeekingRef.current = false
    pendingSeekRef.current = null
    clearSeekGuard()
    onClear?.()
  }

  const scrubMax = duration > 0 ? duration : durationHint
  const canScrub = scrubMax > 0

  if (!src) return null

  return (
    <div className={cn('space-y-2 min-w-0', className)}>
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <div className="flex items-center min-w-0 gap-0">
        <button
          type="button"
          onClick={togglePlayPause}
          className={cn(
            'w-5 h-5 shrink-0 mr-1 rounded-full bg-zinc-700/80 hover:bg-[#002FA7]/60 flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors duration-200 min-w-[20px] min-h-[20px] p-0',
            isPlaying && 'bg-[#002FA7]/70 text-white hover:bg-[#002FA7]'
          )}
          aria-label={isPlaying ? 'Pause voicemail' : 'Play voicemail'}
        >
          {isPlaying ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
        </button>
        <span className="text-[10px] font-mono tabular-nums text-zinc-500 uppercase tracking-wider w-7 shrink-0 text-left flex-shrink-0 pr-0">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={scrubMax || 1}
          step={0.1}
          value={currentTime}
          onInput={handleScrub}
          onChange={handleScrub}
          disabled={!canScrub}
          aria-label="Voicemail playback scrubber"
          className="flex-1 min-w-0 min-w-[72px] mx-1.5 min-h-[8px] h-2 rounded-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.3)] [&::-webkit-slider-thumb]:-mt-0.5 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-700 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:-mt-0.5"
          style={{ accentColor: 'white' }}
        />
        <span className="text-[10px] font-mono tabular-nums text-zinc-500 uppercase tracking-wider w-7 shrink-0 text-left flex-shrink-0 pl-0">
          {formatTime(scrubMax)}
        </span>
        {onClear && (
          <button
            type="button"
            onClick={handleClear}
            className="w-5 h-5 shrink-0 flex-shrink-0 ml-0.5 rounded-full bg-zinc-700/80 hover:bg-zinc-600 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors duration-200 min-w-[20px] min-h-[20px] p-0"
            aria-label={clearLabel}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
