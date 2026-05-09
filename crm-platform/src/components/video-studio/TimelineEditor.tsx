'use client'

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Rnd } from 'react-rnd'
import {
  ArrowRight,
  Copy,
  Layers3,
  Loader2,
  Pause,
  Play,
  Plus,
  Scissors,
  Trash2 as DeleteIcon,
  Save,
  Video,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  addClipToTimeline,
  clamp,
  createClipFromJob,
  formatTimelineTime,
  normalizeTimeline,
  snap,
  type TimelineClip,
  type TimelineJob,
  type TimelineState,
  type TimelineTrack,
} from './timelineTypes'

type TimelineEditorProps = {
  projectName: string
  jobs: TimelineJob[]
  timeline: TimelineState
  onTimelineChange: Dispatch<SetStateAction<TimelineState>>
  onOpenJob: (job: TimelineJob) => void
  onSaveDraft: () => void
  onGenerate: () => void
  isSaving: boolean
  isGenerating: boolean
  activeProjectId: string | null
}

const TRACK_LABEL_WIDTH = 172
const RULER_HEIGHT = 38
const TRACK_HEIGHT = 78
const BASE_PIXELS_PER_SECOND = 84

function makeLocalId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function getTrackColor(track: TimelineTrack) {
  if (track.color) return track.color
  if (track.kind === 'audio') return '#a855f7'
  if (track.kind === 'title') return '#f59e0b'
  return '#002FA7'
}

export function TimelineEditor({
  projectName,
  jobs,
  timeline,
  onTimelineChange,
  onOpenJob,
  onSaveDraft,
  onGenerate,
  isSaving,
  isGenerating,
  activeProjectId,
}: TimelineEditorProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const pxPerSecond = BASE_PIXELS_PER_SECOND * timeline.zoom
  const selectedClip = useMemo(
    () => timeline.clips.find((clip) => clip.id === selectedClipId) || null,
    [selectedClipId, timeline.clips]
  )

  const activeClip = useMemo(() => {
    if (selectedClip) return selectedClip
    return timeline.clips.find((clip) => timeline.playhead >= clip.start && timeline.playhead <= clip.start + clip.duration) || null
  }, [selectedClip, timeline.clips, timeline.playhead])

  const orderedTracks = useMemo(() => {
    return [...timeline.tracks].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  }, [timeline.tracks])

  const visibleJobs = useMemo(() => jobs.slice(0, 8), [jobs])

  useEffect(() => {
    if (selectedClipId && !timeline.clips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(null)
    }
  }, [selectedClipId, timeline.clips])

  useEffect(() => {
    if (!isPlaying) return
    const frameSeconds = 1 / Math.max(12, timeline.fps || 24)
    const intervalMs = 1000 / Math.max(12, timeline.fps || 24)
    const timer = window.setInterval(() => {
      onTimelineChange((current) => {
        const nextPlayhead = current.playhead + frameSeconds
        if (nextPlayhead >= current.duration) {
          window.clearInterval(timer)
          setIsPlaying(false)
          return { ...current, playhead: current.duration }
        }
        return { ...current, playhead: snap(nextPlayhead) }
      })
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [isPlaying, onTimelineChange, timeline.fps])

  const updateClip = (clipId: string, updates: Partial<TimelineClip>) => {
    onTimelineChange((current) => {
      const next = {
        ...current,
        clips: current.clips.map((clip) => (clip.id === clipId ? { ...clip, ...updates } : clip)),
      }
      return normalizeTimeline(next)
    })
  }

  const addBlankClip = (kind: TimelineClip['kind'] = 'generated') => {
    const fallbackTrack = timeline.tracks.find((track) => track.kind === 'video') || timeline.tracks[0]
    if (!fallbackTrack) return

    const clip: TimelineClip = {
      id: makeLocalId('clip'),
      kind,
      label: kind === 'title' ? 'Title card' : 'New clip',
      start: snap(timeline.playhead, 0.25),
      duration: kind === 'title' ? 4 : 8,
      trackId: fallbackTrack.id,
      color: kind === 'title' ? '#f59e0b' : fallbackTrack.color || '#002FA7',
      volume: 1,
      opacity: 1,
    }

    onTimelineChange((current) => normalizeTimeline(addClipToTimeline(current, clip)))
    setSelectedClipId(clip.id)
  }

  const insertJobClip = (job: TimelineJob) => {
    const existingClip = createClipFromJob(job)
    const nextClip = {
      ...existingClip,
      start: snap(timeline.playhead, 0.25),
      label: job.projectName || existingClip.label,
    }
    onTimelineChange((current) => normalizeTimeline(addClipToTimeline(current, nextClip)))
    setSelectedClipId(nextClip.id)
    toast.success('Clip added to timeline')
  }

  const splitSelectedClip = () => {
    if (!selectedClip) return
    const splitPoint = clamp(snap(timeline.playhead - selectedClip.start, 0.25), 0.5, selectedClip.duration - 0.5)
    if (splitPoint <= 0 || splitPoint >= selectedClip.duration) return

    const left: TimelineClip = {
      ...selectedClip,
      id: makeLocalId('clip'),
      duration: splitPoint,
    }
    const right: TimelineClip = {
      ...selectedClip,
      id: makeLocalId('clip'),
      start: selectedClip.start + splitPoint,
      duration: selectedClip.duration - splitPoint,
      label: `${selectedClip.label} B`,
    }

    onTimelineChange((current) =>
      normalizeTimeline({
        ...current,
        clips: [
          ...current.clips.filter((clip) => clip.id !== selectedClip.id),
          left,
          right,
        ],
      })
    )
    setSelectedClipId(right.id)
  }

  const duplicateSelectedClip = () => {
    if (!selectedClip) return
    const duplicate: TimelineClip = {
      ...selectedClip,
      id: makeLocalId('clip'),
      start: selectedClip.start + selectedClip.duration + 0.25,
      label: `${selectedClip.label} Copy`,
    }
    onTimelineChange((current) => normalizeTimeline(addClipToTimeline(current, duplicate)))
    setSelectedClipId(duplicate.id)
  }

  const deleteSelectedClip = () => {
    if (!selectedClip) return
    onTimelineChange((current) =>
      normalizeTimeline({
        ...current,
        clips: current.clips.filter((clip) => clip.id !== selectedClip.id),
      })
    )
    setSelectedClipId(null)
  }

  const scrubFromClientX = (clientX: number) => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return
    const bounds = scrollElement.getBoundingClientRect()
    const scrollLeft = scrollElement.scrollLeft
    const x = clientX - bounds.left + scrollLeft - TRACK_LABEL_WIDTH
    if (x < 0) return

    const nextPlayhead = clamp(snap(x / pxPerSecond, 0.25), 0, timeline.duration)
    onTimelineChange((current) => ({ ...current, playhead: nextPlayhead }))
  }

  const adjustZoom = (delta: number) => {
    onTimelineChange((current) => ({
      ...current,
      zoom: clamp(Number((current.zoom + delta).toFixed(2)), 0.5, 3),
    }))
  }

  return (
    <Card className="nodal-glass border border-white/5">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Timeline Editor</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Arrange clips, trim edges, and build the edit</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Project: <span className="text-zinc-200">{projectName || 'Untitled project'}</span>
              {activeProjectId ? <span className="text-zinc-600"> · Saved job {activeProjectId.slice(0, 8)}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={isSaving || isGenerating}
              className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <SaveIcon />}
              Save Draft
            </Button>
            <Button
              onClick={onGenerate}
              disabled={isGenerating}
              className="bg-[#002FA7] text-white hover:bg-[#002FA7]/90 border border-[#002FA7]/30"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
              Render
            </Button>
          </div>
        </div>

        <div className="grid xl:grid-cols-[1.2fr_0.8fr]">
          <div className="border-r border-white/5 p-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-3xl border border-white/10 bg-black/50 overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Preview</div>
                    <div className="mt-1 text-sm text-zinc-200">
                      {activeClip ? activeClip.label : 'No clip selected'}
                    </div>
                  </div>
                  <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                    {formatTimelineTime(timeline.playhead)} / {formatTimelineTime(timeline.duration)}
                  </Badge>
                </div>

                <div className="relative aspect-video bg-zinc-950">
                  {activeClip?.sourceUrl ? (
                    <video
                      key={activeClip.sourceUrl}
                      src={activeClip.sourceUrl}
                      controls
                      className="h-full w-full object-cover bg-black"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-8 text-center">
                      <div>
                        <Video className="mx-auto h-10 w-10 text-zinc-600" />
                        <div className="mt-3 text-sm text-zinc-300">
                          Pick a clip to preview it here.
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Generated clips with a saved source URL can be reviewed directly in the monitor.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Card className="nodal-glass border border-white/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Transport</div>
                        <div className="mt-1 text-sm text-zinc-200">Scrub and playback</div>
                      </div>
                      <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                        {timeline.fps} fps
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsPlaying((current) => !current)}
                        className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {isPlaying ? 'Pause' : 'Play'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => onTimelineChange((current) => ({ ...current, playhead: 0 }))}
                        className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                      >
                        Start
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="outline" onClick={splitSelectedClip} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass">
                        <Scissors className="w-4 h-4" />
                        Split
                      </Button>
                      <Button variant="outline" onClick={duplicateSelectedClip} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass">
                        <Copy className="w-4 h-4" />
                        Copy
                      </Button>
                      <Button variant="outline" onClick={deleteSelectedClip} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass">
                        <DeleteIcon className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="outline" onClick={() => addBlankClip('generated')} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass">
                        <Plus className="w-4 h-4" />
                        Clip
                      </Button>
                      <Button variant="outline" onClick={() => addBlankClip('title')} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass">
                        <Layers3 className="w-4 h-4" />
                        Title
                      </Button>
                      <Button variant="outline" onClick={() => adjustZoom(0.25)} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass">
                        <ZoomIn className="w-4 h-4" />
                        Zoom
                      </Button>
                    </div>

                    <Button variant="outline" onClick={() => adjustZoom(-0.25)} className="w-full border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass">
                      <ZoomOut className="w-4 h-4" />
                      Zoom out
                    </Button>
                  </CardContent>
                </Card>

                <Card className="nodal-glass border border-white/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Timeline Stats</div>
                        <div className="mt-1 text-sm text-zinc-200">{timeline.clips.length} clips across {timeline.tracks.length} tracks</div>
                      </div>
                      <Badge className="border border-[#002FA7]/20 bg-[#002FA7]/10 text-[#9db7ff] uppercase tracking-[0.2em] text-[10px] font-mono">
                        Zoom {timeline.zoom.toFixed(2)}x
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-zinc-400">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Playhead</div>
                        <div className="mt-1 font-mono text-zinc-100">{formatTimelineTime(timeline.playhead)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Length</div>
                        <div className="mt-1 font-mono text-zinc-100">{formatTimelineTime(timeline.duration)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="nodal-glass border border-white/5">
              <CardContent className="p-0">
                <div
                  ref={scrollRef}
                  className="overflow-x-auto overflow-y-hidden rounded-3xl"
                  style={{ maxHeight: orderedTracks.length * TRACK_HEIGHT + RULER_HEIGHT + 12 }}
                >
                  <div
                    className="relative"
                    style={{ width: TRACK_LABEL_WIDTH + timeline.duration * pxPerSecond, minHeight: orderedTracks.length * TRACK_HEIGHT + RULER_HEIGHT }}
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement | null
                      if (target?.closest('[data-timeline-clip]')) return
                      scrubFromClientX(event.clientX)
                    }}
                  >
                    <div
                      className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/95 backdrop-blur-xl"
                      style={{ height: RULER_HEIGHT }}
                    >
                      <div className="absolute left-0 top-0 h-full w-[172px] border-r border-white/10 bg-black/50" />
                      {Array.from({ length: Math.ceil(timeline.duration / 5) + 1 }, (_, index) => {
                        const seconds = index * 5
                        const x = TRACK_LABEL_WIDTH + seconds * pxPerSecond
                        if (x > TRACK_LABEL_WIDTH + timeline.duration * pxPerSecond) return null
                        return (
                          <div key={`tick-${seconds}`} className="absolute top-0 h-full" style={{ left: x }}>
                            <div className="h-full w-px bg-white/10" />
                            <div className="absolute left-2 top-2 text-[9px] font-mono uppercase tracking-[0.25em] text-zinc-500">
                              {formatTimelineTime(seconds)}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {orderedTracks.map((track, trackIndex) => {
                      const trackClips = timeline.clips.filter((clip) => clip.trackId === track.id)
                      return (
                        <div
                          key={track.id}
                          className={cn(
                            'relative border-b border-white/5',
                            trackIndex % 2 === 0 ? 'bg-white/[0.01]' : 'bg-white/[0.02]'
                          )}
                          style={{ height: TRACK_HEIGHT }}
                        >
                          <div className="absolute left-0 top-0 flex h-full w-[172px] items-center border-r border-white/10 bg-black/40 px-4">
                            <div>
                              <div className="text-sm font-medium text-zinc-100">{track.name}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">
                                {track.kind} track
                              </div>
                            </div>
                          </div>

                          <div className="absolute inset-y-0 left-[172px] right-0">
                            {Array.from({ length: Math.floor(timeline.duration) + 1 }, (_, tickIndex) => (
                              <div
                                key={`${track.id}-grid-${tickIndex}`}
                                className="absolute inset-y-0 w-px bg-white/[0.03]"
                                style={{ left: tickIndex * pxPerSecond }}
                              />
                            ))}
                          </div>

                          {trackClips.map((clip) => {
                            const clipX = TRACK_LABEL_WIDTH + clip.start * pxPerSecond
                            const clipWidth = Math.max(clip.duration * pxPerSecond, 42)
                            const selected = clip.id === selectedClipId
                            const trackColor = getTrackColor(track)

                            return (
                              <Rnd
                                key={clip.id}
                                bounds="parent"
                                size={{ width: clipWidth, height: TRACK_HEIGHT - 16 }}
                                position={{ x: clipX, y: 8 }}
                                dragAxis="x"
                                enableResizing={{
                                  left: true,
                                  right: true,
                                  top: false,
                                  bottom: false,
                                  topLeft: false,
                                  topRight: false,
                                  bottomLeft: false,
                                  bottomRight: false,
                                }}
                                minWidth={Math.max(42, pxPerSecond * 0.5)}
                                disableDragging={clip.locked}
                                onDragStop={(_, data) => {
                                  const nextStart = clamp(snap((data.x - TRACK_LABEL_WIDTH) / pxPerSecond, 0.25), 0, Math.max(0, timeline.duration - clip.duration))
                                  updateClip(clip.id, { start: nextStart })
                                }}
                                onResizeStop={(_, direction, ref, delta, position) => {
                                  const nextStart = clamp(snap((position.x - TRACK_LABEL_WIDTH) / pxPerSecond, 0.25), 0, timeline.duration)
                                  const nextDuration = clamp(snap(parseInt(ref.style.width, 10) / pxPerSecond, 0.25), 0.5, timeline.duration - nextStart)
                                  updateClip(clip.id, {
                                    start: nextStart,
                                    duration: nextDuration,
                                  })
                                }}
                                onMouseDown={() => setSelectedClipId(clip.id)}
                                data-timeline-clip="true"
                                className="group"
                              >
                                <div
                                  className={cn(
                                    'relative h-full w-full overflow-hidden rounded-2xl border px-3 py-2 text-left shadow-[0_18px_30px_rgba(0,0,0,0.25)] transition-all',
                                    selected ? 'border-[#002FA7]/60' : 'border-white/10'
                                  )}
                                  style={{
                                    backgroundImage: `linear-gradient(180deg, ${trackColor}22, ${trackColor}0f)`,
                                    boxShadow: selected ? `0 0 0 1px ${trackColor}55, 0 18px 30px rgba(0,0,0,0.25)` : undefined,
                                  }}
                                  onClick={() => setSelectedClipId(clip.id)}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-zinc-100">{clip.label}</div>
                                      <div className="mt-1 text-[9px] uppercase tracking-[0.25em] text-zinc-400 font-mono">
                                        {formatTimelineTime(clip.start)} → {formatTimelineTime(clip.start + clip.duration)}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {clip.sourceUrl ? <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[9px] font-mono">Src</Badge> : null}
                                      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" />
                                    </div>
                                  </div>

                                  <div className="mt-2 flex items-center justify-between gap-3">
                                    <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-500 font-mono">
                                      {clip.kind} {clip.model ? `· ${clip.model}` : ''}
                                    </div>
                                    <div className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.2em] text-zinc-300">
                                      {clip.duration.toFixed(1)}s
                                    </div>
                                  </div>
                                </div>
                              </Rnd>
                            )
                          })}
                        </div>
                      )
                    })}

                    <div
                      className="absolute top-0 z-30 h-full w-px bg-[#002FA7] shadow-[0_0_18px_rgba(0,47,167,0.55)]"
                      style={{ left: TRACK_LABEL_WIDTH + timeline.playhead * pxPerSecond }}
                    >
                      <div className="absolute -top-2 -left-2 h-4 w-4 rounded-full border border-[#002FA7]/40 bg-[#002FA7] shadow-[0_0_0_4px_rgba(0,47,167,0.18)]" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5 p-5">
            <Card className="nodal-glass border border-white/5">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Inspector</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">Selected clip</h3>
                  </div>
                  <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                    {selectedClip ? selectedClip.kind : 'None'}
                  </Badge>
                </div>

                {selectedClip ? (
                  <div className="space-y-3">
                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Label</span>
                      <Input
                        value={selectedClip.label}
                        onChange={(event) => updateClip(selectedClip.id, { label: event.target.value })}
                        className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Start</span>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          value={selectedClip.start}
                          onChange={(event) => updateClip(selectedClip.id, { start: clamp(Number(event.target.value || 0), 0, timeline.duration) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Duration</span>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.5"
                          value={selectedClip.duration}
                          onChange={(event) => updateClip(selectedClip.id, { duration: clamp(Number(event.target.value || 0.5), 0.5, timeline.duration) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                    </div>

                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Track</span>
                      <Select
                        value={selectedClip.trackId}
                        onValueChange={(value) => updateClip(selectedClip.id, { trackId: value })}
                      >
                        <SelectTrigger className="w-full nodal-glass border-white/10 bg-white/[0.02] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-zinc-950 text-white">
                          {timeline.tracks.map((track) => (
                            <SelectItem key={track.id} value={track.id}>
                              {track.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Notes</span>
                      <textarea
                        value={selectedClip.notes || ''}
                        onChange={(event) => updateClip(selectedClip.id, { notes: event.target.value })}
                        className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
                    Select a clip to edit its timing and track.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="nodal-glass border border-white/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Job Library</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">Recent renders</h3>
                  </div>
                  <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[10px] font-mono">
                    {visibleJobs.length}
                  </Badge>
                </div>

                <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
                  {visibleJobs.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
                      Render jobs will appear here.
                    </div>
                  ) : visibleJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-white/10 bg-white/[0.02] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-100">{job.projectName}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono">
                            {job.model} · {job.status}
                          </div>
                        </div>
                        <Badge className="border border-white/10 bg-white/5 text-zinc-400 uppercase tracking-[0.2em] text-[9px] font-mono">
                          {job.duration}s
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenJob(job)}
                          className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                        >
                          Load
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => insertJobClip(job)}
                          className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                        >
                          Add to timeline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="nodal-glass border border-white/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Timeline Actions</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">Build the cut</h3>
                  </div>
                  <WandSparkles className="w-4 h-4 text-zinc-500" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => addBlankClip('generated')}
                    className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                  >
                    <Plus className="w-4 h-4" />
                    Clip
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => addBlankClip('title')}
                    className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                  >
                    <Layers3 className="w-4 h-4" />
                    Title
                  </Button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-sm text-zinc-400">
                  Use the timeline ruler to scrub, drag clips to move them, and pull the edges to trim.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SaveIcon() {
  return <Save className="w-4 h-4" />
}
