import React from 'react'
import { AbsoluteFill, Audio, Sequence, Video, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { TimelineState, TimelineClip, TimelineOverlay } from './timelineTypes'

type TimelineCompositionProps = {
  timeline: TimelineState
  renderOverlays?: boolean
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
          padding: '0 12px',
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
  const scaleWidth = width / 960
  const scaleHeight = height / 540

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* All Tracks — one AbsoluteFill per track so clips stack naturally */}
      {timeline.tracks.map((track) => {
        const trackClips = timeline.clips
          .filter((c) => c.trackId === track.id)
          .sort((a, b) => a.start - b.start)

        const layers = trackClips.map((clip, idx) => {
          const startFrame = Math.round(clip.start * fps)
          const baseDuration = Math.round(clip.duration * fps)

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

          const adjustedFrom = startFrame - transitionInFrames
          const adjustedDuration =
            baseDuration + transitionInFrames + transitionOutFrames

          return (
            <Sequence
              key={clip.id}
              from={Math.max(0, adjustedFrom)}
              durationInFrames={adjustedDuration}
              layout="none"
            >
              <AbsoluteFill
                style={{
                  opacity:
                    transitionInFrames > 0 || transitionOutFrames > 0
                      ? interpolate(
                          useCurrentFrame(),
                          [
                            0,
                            transitionInFrames,
                            adjustedDuration - transitionOutFrames,
                            adjustedDuration,
                          ],
                          [0, 1, 1, 0],
                          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                        )
                      : clip.opacity ?? 1,
                }}
              >
                {clip.kind === 'audio' && clip.sourceUrl ? (
                  <Audio src={clip.sourceUrl} volume={clip.volume ?? 1} />
                ) : clip.sourceUrl ? (
                  <Video
                    src={clip.sourceUrl}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
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
