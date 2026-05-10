'use client'

import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'

type VideoPreviewMonitorProps = {
  sourceUrl?: string | null
  posterUrl?: string | null
  isPlaying?: boolean
  currentTime?: number
  onPlayStateChange?: (playing: boolean) => void
  onTimeUpdate?: (seconds: number) => void
  onDuration?: (seconds: number) => void
}

export function VideoPreviewMonitor({
  sourceUrl,
  posterUrl,
  isPlaying,
  currentTime,
  onPlayStateChange,
  onTimeUpdate,
  onDuration,
}: VideoPreviewMonitorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<Player | null>(null)
  const callbacksRef = useRef({ onTimeUpdate, onDuration, onPlayStateChange })

  useEffect(() => {
    callbacksRef.current = { onTimeUpdate, onDuration, onPlayStateChange }
  }, [onTimeUpdate, onDuration, onPlayStateChange])

  useEffect(() => {
    if (!videoRef.current || playerRef.current) return

    const player = videojs(videoRef.current, {
      controls: true,
      fluid: true,
      responsive: true,
      preload: 'metadata',
      playbackRates: [0.5, 1, 1.25, 1.5, 2],
      controlBar: {
        pictureInPictureToggle: false,
      },
    })

    player.on('play', () => callbacksRef.current.onPlayStateChange?.(true))
    player.on('pause', () => callbacksRef.current.onPlayStateChange?.(false))

    player.on('timeupdate', () => {
      // Regular timeupdate as fallback
      if (!isPlaying) {
        callbacksRef.current.onTimeUpdate?.(Number(player.currentTime() || 0))
      }
    })

    player.on('loadedmetadata', () => {
      callbacksRef.current.onDuration?.(Number(player.duration() || 0))
    })

    playerRef.current = player

    return () => {
      player.dispose()
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !isPlaying || !sourceUrl) return

    let frameId: number
    const update = () => {
      callbacksRef.current.onTimeUpdate?.(Number(player.currentTime() || 0))
      frameId = requestAnimationFrame(update)
    }
    frameId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frameId)
  }, [isPlaying, sourceUrl])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    if (sourceUrl) {
      const type = sourceUrl.startsWith('blob:') ? 'video/mp4' : undefined
      player.src(type ? { src: sourceUrl, type } : { src: sourceUrl })
      if (posterUrl) player.poster(posterUrl)
    } else {
      player.pause()
      player.reset()
    }
  }, [posterUrl, sourceUrl])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !sourceUrl) return

    if (isPlaying) {
      player.play()?.catch(() => {
        // Autoplay/play policy might block this initially
      })
    } else {
      player.pause()
    }
  }, [isPlaying, sourceUrl])

  useEffect(() => {
    const player = playerRef.current
    if (!player || currentTime === undefined || !sourceUrl) return

    const playerTime = player.currentTime() || 0
    if (Math.abs(playerTime - currentTime) > 0.15) {
      player.currentTime(currentTime)
    }
  }, [currentTime, sourceUrl])

  return (
    <div data-vjs-player className="h-full w-full nodal-video-monitor">
      <video ref={videoRef} className="video-js vjs-big-play-centered h-full w-full bg-black" playsInline />
    </div>
  )
}
