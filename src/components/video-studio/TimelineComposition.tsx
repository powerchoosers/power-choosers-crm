import React from 'react'
import { AbsoluteFill, Sequence, Video, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { TimelineState, TimelineClip, TimelineOverlay } from './timelineTypes'

type TimelineCompositionProps = {
  timeline: TimelineState
  renderOverlays?: boolean
}

function ClipLayer({ clip, nextClip, fps }: { clip: TimelineClip; nextClip?: TimelineClip; fps: number }) {
  const frame = useCurrentFrame()
  const startFrame = Math.round(clip.start * fps)
  const durationFrames = Math.round(clip.duration * fps)

  // Determine if we need to overlap with the next clip for a transition
  const touchesNext = nextClip && Math.abs(clip.start + clip.duration - nextClip.start) < 0.05
  const hasTransition = touchesNext && nextClip.transitionIn && nextClip.transitionIn !== 'none'
  const transitionFrames = hasTransition ? Math.round((nextClip.transitionDuration || 0.5) * fps) : 0

  // Extend this clip's sequence so it overlaps with the next clip during the transition
  const sequenceDuration = durationFrames + transitionFrames

  // Handle fading OUT if next clip has a transition
  const isCrossfadeNext = hasTransition && nextClip.transitionIn === 'crossfade'
  const isDipToBlackNext = hasTransition && nextClip.transitionIn === 'dip-to-black'
  
  // Fade out during the transition frames (which happen AFTER our normal duration)
  const opacityOut = (isCrossfadeNext || isDipToBlackNext)
    ? interpolate(frame, [durationFrames, sequenceDuration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1

  // Handle fading IN if THIS clip has a transition
  const transitionInFrames = (clip.transitionIn && clip.transitionIn !== 'none') ? Math.round((clip.transitionDuration || 0.5) * fps) : 0
  const isCrossfadeThis = clip.transitionIn === 'crossfade'
  const isDipToBlackThis = clip.transitionIn === 'dip-to-black'

  // Fade in during the first frames
  const opacityIn = (isCrossfadeThis || isDipToBlackThis)
    ? interpolate(frame, [0, transitionInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1

  const combinedOpacity = opacityOut * opacityIn

  return (
    <Sequence from={startFrame} durationInFrames={sequenceDuration} layout="none">
      <AbsoluteFill style={{ opacity: combinedOpacity }}>
        {clip.sourceUrl ? (
          <Video src={clip.sourceUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ backgroundColor: clip.color, width: '100%', height: '100%' }} />
        )}
      </AbsoluteFill>
    </Sequence>
  )
}

function OverlayLayer({ overlay, fps, scaleWidth, scaleHeight }: { overlay: TimelineOverlay; fps: number; scaleWidth: number; scaleHeight: number }) {
  const startFrame = Math.round(overlay.start * fps)
  const durationFrames = Math.round(overlay.duration * fps)

  return (
    <Sequence from={startFrame} durationInFrames={durationFrames} layout="none">
      <div
        style={{
          position: 'absolute',
          left: overlay.x * scaleWidth,
          top: overlay.y * scaleHeight,
          width: overlay.width * scaleWidth,
          height: overlay.height * scaleHeight,
          backgroundColor: overlay.backgroundColor,
          color: overlay.color,
          fontFamily: overlay.fontFamily,
          fontSize: (overlay.fontSize || 32) * scaleWidth,
          fontWeight: overlay.fontWeight,
          opacity: overlay.opacity,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: overlay.kind === 'text' ? 'none' : undefined,
        }}
      >
        {overlay.kind === 'image' && overlay.sourceUrl ? (
          <img src={overlay.sourceUrl} alt={overlay.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : overlay.kind === 'text' ? (
          <div style={{ textAlign: 'center', width: '100%' }}>{overlay.text}</div>
        ) : null}
      </div>
    </Sequence>
  )
}

export function TimelineComposition({ timeline, renderOverlays = true }: TimelineCompositionProps) {
  const { fps, width, height } = useVideoConfig()
  const videoTracks = timeline.tracks.filter(t => t.kind === 'video')
  
  // Base stage size used in editor is 960x540
  const scaleWidth = width / 960
  const scaleHeight = height / 540

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Video Tracks */}
      {videoTracks.map(track => {
        const trackClips = timeline.clips.filter(c => c.trackId === track.id).sort((a, b) => a.start - b.start)
        return (
          <AbsoluteFill key={track.id}>
            {trackClips.map((clip, idx) => (
              <ClipLayer 
                key={clip.id} 
                clip={clip} 
                nextClip={trackClips[idx + 1]} 
                fps={fps} 
              />
            ))}
          </AbsoluteFill>
        )
      })}

      {/* Overlays */}
      {renderOverlays && (
        <AbsoluteFill>
          {timeline.overlays.map(overlay => (
            <OverlayLayer 
              key={overlay.id} 
              overlay={overlay} 
              fps={fps} 
              scaleWidth={scaleWidth} 
              scaleHeight={scaleHeight} 
            />
          ))}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
