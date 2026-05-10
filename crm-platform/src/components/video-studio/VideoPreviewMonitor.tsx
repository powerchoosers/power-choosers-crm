'use client'

import { useEffect, useRef } from 'react'
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

  // Sync isPlaying state to Player
  useEffect(() => {
    if (!playerRef.current || isPlaying === undefined) return
    if (isPlaying && !playerRef.current.isPlaying()) {
      playerRef.current.play()
    } else if (!isPlaying && playerRef.current.isPlaying()) {
      playerRef.current.pause()
    }
  }, [isPlaying])

  // Sync timeline playhead to Player when NOT playing
  useEffect(() => {
    if (!playerRef.current || isPlaying) return
    const targetFrame = Math.round(timeline.playhead * fps)
    if (Math.abs(playerRef.current.getCurrentFrame() - targetFrame) > 1) {
      playerRef.current.seekTo(targetFrame)
    }
  }, [timeline.playhead, fps, isPlaying])

  // Monitor frame updates to sync back to timeline
  useEffect(() => {
    const player = playerRef.current
    if (!player || !isPlaying) return

    let frameId: number
    const update = () => {
      onTimeUpdate?.(player.getCurrentFrame() / fps)
      frameId = requestAnimationFrame(update)
    }
    frameId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frameId)
  }, [isPlaying, fps, onTimeUpdate])

  // Listen to native play/pause to sync state (if user interacts somehow, though controls are off)
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
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        controls={false}
        spaceKeyToPlayOrPause={false}
        clickToPlay={false}
      />
    </div>
  )
}
