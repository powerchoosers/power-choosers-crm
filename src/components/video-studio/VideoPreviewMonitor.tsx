'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { TimelineComposition } from './TimelineComposition'
import type { TimelineState } from './timelineTypes'

type VideoPreviewMonitorProps = {
  timeline: TimelineState
  isPlaying?: boolean
  onPlayStateChange?: (playing: boolean) => void
  onTimeUpdate?: (seconds: number) => void
}

export function VideoPreviewMonitor({
  timeline,
  isPlaying,
  onPlayStateChange,
  onTimeUpdate,
}: VideoPreviewMonitorProps) {
  const playerRef = useRef<PlayerRef>(null)
  const fps = timeline.fps || 24
  const durationInFrames = Math.max(1, Math.round(timeline.duration * fps))

  // Keep a ref so the rAF callback always reads the latest value
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate

  // Sync isPlaying state → Player
  useEffect(() => {
    if (!playerRef.current || isPlaying === undefined) return
    console.log('[VideoPreviewMonitor] isPlaying sync:', isPlaying)
    if (isPlaying && !playerRef.current.isPlaying()) {
      playerRef.current.play()
    } else if (!isPlaying && playerRef.current.isPlaying()) {
      playerRef.current.pause()
    }
  }, [isPlaying])

  // Sync timeline playhead → Player when NOT playing (scrubbing)
  useEffect(() => {
    if (!playerRef.current || isPlaying) return
    const targetFrame = Math.round(timeline.playhead * fps)
    playerRef.current.seekTo(targetFrame)
  }, [timeline.playhead, fps, isPlaying])

  // While playing, push current frame back to the timeline playhead
  useEffect(() => {
    const player = playerRef.current
    if (!player || !isPlaying) return

    console.log('[VideoPreviewMonitor] Starting frame tick loop')
    let raf: number
    const tick = () => {
      const currentSeconds = player.getCurrentFrame() / fps
      // console.log('[VideoPreviewMonitor] tick:', currentSeconds.toFixed(3))
      onTimeUpdateRef.current?.(currentSeconds)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      console.log('[VideoPreviewMonitor] Stopping frame tick loop')
      cancelAnimationFrame(raf)
    }
  }, [isPlaying, fps])

  // Native play/pause events → sync state back
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const onPlay = () => onPlayStateChange?.(true)
    const onPause = () => onPlayStateChange?.(false)

    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)

    return () => {
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
    }
  }, [onPlayStateChange])

  return (
    <div className="h-full w-full nodal-video-monitor overflow-hidden bg-black flex items-center justify-center">
      <Player
        ref={playerRef}
        component={TimelineComposition}
        inputProps={{ timeline, renderOverlays: false }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{ width: '100%', height: '100%' }}
        controls={false}
        spaceKeyToPlayOrPause={false}
        clickToPlay={false}
      />
    </div>
  )
}
