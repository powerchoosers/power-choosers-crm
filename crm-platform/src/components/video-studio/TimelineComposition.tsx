import React from 'react'
import { AbsoluteFill, Sequence, Video, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { TimelineState, TimelineClip, TimelineOverlay } from './timelineTypes'

type TimelineCompositionProps = {
  timeline: TimelineState
  renderOverlays?: boolean
}

function ClipLayer({ clip, renderStartFrame, transitionInFrames, transitionOutFrames, fps }: { clip: TimelineClip; renderStartFrame: number; transitionInFrames: number; transitionOutFrames: number; fps: number }) {
  const frame = useCurrentFrame()
  const durationFrames = Math.round(clip.duration * fps)

  // Fade out during the last transitionOutFrames
  const isCrossfadeOut = transitionOutFrames > 0
  const opacityOut = isCrossfadeOut
    ? interpolate(frame, [durationFrames - transitionOutFrames, durationFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1

  // Fade in during the first transitionInFrames
  const isCrossfadeIn = transitionInFrames > 0
  const opacityIn = isCrossfadeIn
    ? interpolate(frame, [0, transitionInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1

  const combinedOpacity = opacityOut * opacityIn

  return (
    <Sequence from={renderStartFrame} durationInFrames={durationFrames} layout="none">
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
        
        let currentOffsetFrames = 0;
        const renderedClips = trackClips.map((clip, idx) => {
          const touchesPrev = idx > 0 && Math.abs(clip.start - (trackClips[idx - 1].start + trackClips[idx - 1].duration)) < 0.05;
          const hasTransitionIn = touchesPrev && clip.transitionIn && clip.transitionIn !== 'none';
          const transitionInFrames = hasTransitionIn ? Math.round((clip.transitionDuration || 0.5) * fps) : 0;
          
          currentOffsetFrames += transitionInFrames;
          
          // Look ahead to see if the next clip will overlap with us
          const nextClip = trackClips[idx + 1];
          const touchesNext = nextClip && Math.abs(clip.start + clip.duration - nextClip.start) < 0.05;
          const hasTransitionOut = touchesNext && nextClip.transitionIn && nextClip.transitionIn !== 'none';
          const transitionOutFrames = hasTransitionOut ? Math.round((nextClip.transitionDuration || 0.5) * fps) : 0;

          return {
            clip,
            renderStartFrame: Math.round(clip.start * fps) - currentOffsetFrames,
            transitionInFrames,
            transitionOutFrames
          }
        });

        return (
          <AbsoluteFill key={track.id}>
            {renderedClips.map(({ clip, renderStartFrame, transitionInFrames, transitionOutFrames }) => (
              <ClipLayer 
                key={clip.id} 
                clip={clip} 
                renderStartFrame={renderStartFrame}
                transitionInFrames={transitionInFrames}
                transitionOutFrames={transitionOutFrames}
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
