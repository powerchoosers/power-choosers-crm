import React from 'react'
import { AbsoluteFill, Sequence, Video, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { TimelineState, TimelineClip, TimelineOverlay } from './timelineTypes'

type TimelineCompositionProps = {
  timeline: TimelineState
  renderOverlays?: boolean
}

/**
 * Renders a single clip. Handles fade-in / fade-out opacity when
 * transitionInFrames / transitionOutFrames are provided.
 *
 * `from` is the absolute Remotion frame the Sequence starts at.
 * `durationInFrames` is the Sequence length.
 */
function ClipLayer({
  clip,
  from,
  durationInFrames,
  transitionInFrames,
  transitionOutFrames,
}: {
  clip: TimelineClip
  from: number
  durationInFrames: number
  transitionInFrames: number
  transitionOutFrames: number
}) {
  const frame = useCurrentFrame()

  // Fade in
  const opacityIn =
    transitionInFrames > 0
      ? interpolate(frame, [0, transitionInFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1

  // Fade out
  const opacityOut =
    transitionOutFrames > 0
      ? interpolate(
          frame,
          [durationInFrames - transitionOutFrames, durationInFrames],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        )
      : 1

  const opacity = opacityIn * opacityOut

  return (
    <Sequence from={from} durationInFrames={durationInFrames} layout="none">
      <AbsoluteFill style={{ opacity }}>
        {clip.sourceUrl ? (
          <Video
            src={clip.sourceUrl}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div
            style={{
              backgroundColor: clip.color || '#002FA7',
              width: '100%',
              height: '100%',
            }}
          />
        )}
      </AbsoluteFill>
    </Sequence>
  )
}

function OverlayLayer({
  overlay,
  fps,
  scaleWidth,
  scaleHeight,
}: {
  overlay: TimelineOverlay
  fps: number
  scaleWidth: number
  scaleHeight: number
}) {
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
        }}
      >
        {overlay.kind === 'image' && overlay.sourceUrl ? (
          <img
            src={overlay.sourceUrl}
            alt={overlay.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : overlay.kind === 'text' ? (
          <div style={{ textAlign: 'center', width: '100%' }}>
            {overlay.text}
          </div>
        ) : null}
      </div>
    </Sequence>
  )
}

export function TimelineComposition({
  timeline,
  renderOverlays = true,
}: TimelineCompositionProps) {
  const { fps, width, height } = useVideoConfig()
  const videoTracks = timeline.tracks.filter((t) => t.kind === 'video')

  const scaleWidth = width / 960
  const scaleHeight = height / 540

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Video Tracks — one AbsoluteFill per track so clips stack naturally */}
      {videoTracks.map((track) => {
        const trackClips = timeline.clips
          .filter((c) => c.trackId === track.id)
          .sort((a, b) => a.start - b.start)

        /*
         * Simple approach: each clip gets a Sequence whose `from` equals
         * its timeline start frame. Clips play back-to-back. When two
         * clips touch AND the second clip has a transitionIn, the first
         * clip's Sequence is extended by the transition duration and the
         * second clip's Sequence starts earlier (overlapping), so both
         * are visible during the crossfade window.
         */
        const layers = trackClips.map((clip, idx) => {
          const startFrame = Math.round(clip.start * fps)
          const baseDuration = Math.round(clip.duration * fps)

          // Does the NEXT clip touch us and have a transition?
          const next = trackClips[idx + 1]
          const touchesNext =
            next &&
            Math.abs(clip.start + clip.duration - next.start) < 0.05
          const nextHasTransition =
            touchesNext &&
            next.transitionIn &&
            next.transitionIn !== 'none'
          const transitionOutFrames = nextHasTransition
            ? Math.round((next.transitionDuration || 0.5) * fps)
            : 0

          // Does THIS clip have a transition from the PREVIOUS clip?
          const prev = trackClips[idx - 1]
          const touchesPrev =
            prev &&
            Math.abs(clip.start - (prev.start + prev.duration)) < 0.05
          const hasTransitionIn =
            touchesPrev &&
            clip.transitionIn &&
            clip.transitionIn !== 'none'
          const transitionInFrames = hasTransitionIn
            ? Math.round((clip.transitionDuration || 0.5) * fps)
            : 0

          // Shift this clip earlier by its transitionIn so it overlaps
          const adjustedFrom = startFrame - transitionInFrames
          // Extend duration to cover the overlap with the next clip
          const adjustedDuration =
            baseDuration + transitionInFrames + transitionOutFrames

          return (
            <ClipLayer
              key={clip.id}
              clip={clip}
              from={Math.max(0, adjustedFrom)}
              durationInFrames={adjustedDuration}
              transitionInFrames={transitionInFrames}
              transitionOutFrames={transitionOutFrames}
            />
          )
        })

        return (
          <AbsoluteFill key={track.id}>
            {layers}
          </AbsoluteFill>
        )
      })}

      {/* Overlays */}
      {renderOverlays && (
        <AbsoluteFill>
          {timeline.overlays.map((overlay) => (
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
