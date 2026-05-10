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

  // Native play/pause/frame events → sync state back
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const onPlay = () => onPlayStateChange?.(true)
    const onPause = () => onPlayStateChange?.(false)
    const onFrameUpdate = (e: any) => {
      // Remotion's frameupdate event payload has the frame in e.detail.frame
      const frame = e.detail.frame
      const currentSeconds = frame / fps
      onTimeUpdateRef.current?.(currentSeconds)
    }

    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('frameupdate', onFrameUpdate)

    return () => {
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('frameupdate', onFrameUpdate)
    }
  }, [onPlayStateChange, fps])

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
