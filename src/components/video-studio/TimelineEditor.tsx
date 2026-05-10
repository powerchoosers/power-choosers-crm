'use client'

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Rnd } from 'react-rnd'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  ImagePlus,
  Keyboard,
  Layers3,
  Loader2,
  Lock,
  Magnet,
  Maximize2,
  Music,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Target,
  Trash2 as DeleteIcon,
  Save,
  Type,
  Unlock,
  Video,
  Volume2,
  VolumeX,
  WandSparkles,
  Zap,
  ZoomIn,
  ZoomOut,
  Blend,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  addClipToTimeline,
  clamp,
  createClipFromJob,
  formatTimelineTime,
  normalizeTimeline,
  snap,
  type TimelineClip,
  type TimelineOverlay,
  type TimelineJob,
  type TimelineState,
  type TimelineTrack,
  type TimelineTransition,
} from './timelineTypes'
import { AudioWaveform } from './AudioWaveform'
import { VideoPreviewMonitor } from './VideoPreviewMonitor'

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
const STAGE_WIDTH = 960
const STAGE_HEIGHT = 540
const FONT_OPTIONS = ['IBM Plex Mono, monospace', 'Georgia, serif', 'Impact, sans-serif', 'Courier New, monospace']

function makeLocalId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const parseAspectRatio = (ratioStr: string = '16:9') => {
  const [w, h] = ratioStr.split(':').map(Number)
  if (!w || !h) return 16 / 9
  return w / h
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
  const stageRef = useRef<HTMLDivElement | null>(null)
  const overlayImageInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [stageSize, setStageSize] = useState({ width: STAGE_WIDTH, height: STAGE_HEIGHT })
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [activeTool, setActiveTool] = useState<'select' | 'blade'>('select')

  const pxPerSecond = BASE_PIXELS_PER_SECOND * timeline.zoom
  const selectedClip = useMemo(
    () => timeline.clips.find((clip) => clip.id === selectedClipId) || null,
    [selectedClipId, timeline.clips]
  )

  const activeClip = useMemo(() => {
    const underPlayhead = timeline.clips.find((clip) => timeline.playhead >= clip.start && timeline.playhead < clip.start + clip.duration)
    if (underPlayhead) return underPlayhead
    if (selectedClip) return selectedClip
    return null
  }, [selectedClip, timeline.clips, timeline.playhead])

  const selectedOverlay = useMemo(
    () => timeline.overlays.find((overlay) => overlay.id === selectedOverlayId) || null,
    [selectedOverlayId, timeline.overlays]
  )

  const activeOverlays = useMemo(() => {
    return timeline.overlays.filter((overlay) => {
      const visibleAtPlayhead = timeline.playhead >= overlay.start && timeline.playhead <= overlay.start + overlay.duration
      return visibleAtPlayhead || overlay.id === selectedOverlayId
    })
  }, [selectedOverlayId, timeline.overlays, timeline.playhead])

  const orderedTracks = useMemo(() => {
    return [...timeline.tracks].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  }, [timeline.tracks])

  const visibleJobs = useMemo(() => jobs.slice(0, 8), [jobs])
  const overlayScale = stageSize.width > 0 ? stageSize.width / STAGE_WIDTH : 1

  useEffect(() => {
    if (selectedClipId && !timeline.clips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(null)
    }
  }, [selectedClipId, timeline.clips])

  useEffect(() => {
    if (selectedOverlayId && !timeline.overlays.some((overlay) => overlay.id === selectedOverlayId)) {
      setSelectedOverlayId(null)
    }
  }, [selectedOverlayId, timeline.overlays])

  useEffect(() => {
    const node = stageRef.current
    if (!node) return

    const ratio = parseAspectRatio(timeline.aspectRatio)

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width || STAGE_WIDTH
      setStageSize({ width, height: width / ratio })
    })

    resizeObserver.observe(node)
    return () => resizeObserver.disconnect()
  }, [timeline.aspectRatio])

  useEffect(() => {
    if (!isPlaying) return
    const frameSeconds = 1 / Math.max(12, timeline.fps || 24)
    const intervalMs = 1000 / Math.max(12, timeline.fps || 24)
    const timer = window.setInterval(() => {
      onTimelineChange((current) => {
        const activeAtPlayhead = current.clips.find((clip) => current.playhead >= clip.start && current.playhead <= clip.start + clip.duration)
        if (activeAtPlayhead?.sourceUrl && activeAtPlayhead?.kind === 'source') {
          // If video is driving, skip incrementing unless we're near the clip boundary to ensure we transition
          if (current.playhead < activeAtPlayhead.start + activeAtPlayhead.duration - 0.05) {
            return current
          }
        }

        const nextPlayhead = current.playhead + frameSeconds
        if (nextPlayhead >= current.duration) {
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

  const updateOverlay = (overlayId: string, updates: Partial<TimelineOverlay>) => {
    onTimelineChange((current) => normalizeTimeline({
      ...current,
      overlays: current.overlays.map((overlay) => (overlay.id === overlayId ? { ...overlay, ...updates } : overlay)),
    }))
  }

  const addOverlay = (kind: TimelineOverlay['kind'], sourceUrl?: string) => {
    const overlay: TimelineOverlay = {
      id: makeLocalId('overlay'),
      kind,
      label: kind === 'text' ? 'Text Overlay' : kind === 'image' ? 'Image Overlay' : 'Icon Overlay',
      start: snap(timeline.playhead, 0.25),
      duration: 5,
      x: 120,
      y: 120,
      width: kind === 'text' ? 360 : 140,
      height: kind === 'text' ? 88 : 140,
      text: kind === 'text' ? 'Nodal Point' : '',
      sourceUrl: sourceUrl || null,
      icon: 'target',
      fontFamily: FONT_OPTIONS[0],
      fontSize: 32,
      fontWeight: '600',
      color: '#f4f4f5',
      backgroundColor: kind === 'text' ? 'rgba(0,0,0,0.32)' : 'transparent',
      opacity: 1,
    }

    onTimelineChange((current) => normalizeTimeline({
      ...current,
      duration: Math.max(current.duration, overlay.start + overlay.duration + 4),
      overlays: [...current.overlays, overlay],
    }))
    setSelectedOverlayId(overlay.id)
    setSelectedClipId(null)
  }

  const addImageOverlay = async (file: File | null) => {
    if (!file) return
    addOverlay('image', URL.createObjectURL(file))
  }

  const addLocalMediaClip = (file: File | null, mediaType: 'video' | 'audio') => {
    if (!file) return
    const track = timeline.tracks.find((item) => item.kind === mediaType) || timeline.tracks[0]
    if (!track) return

    const clip: TimelineClip = {
      id: makeLocalId('clip'),
      kind: mediaType === 'audio' ? 'audio' : 'source',
      label: file.name,
      start: snap(timeline.playhead, 0.25),
      duration: 8,
      trackId: track.id,
      color: track.color || (mediaType === 'audio' ? '#a855f7' : '#002FA7'),
      sourceUrl: URL.createObjectURL(file),
      sourceName: file.name,
      volume: 1,
      opacity: 1,
    }

    onTimelineChange((current) => normalizeTimeline(addClipToTimeline(current, clip)))
    setSelectedClipId(clip.id)
    setSelectedOverlayId(null)
  }

  const deleteSelectedOverlay = () => {
    if (!selectedOverlay) return
    onTimelineChange((current) => normalizeTimeline({
      ...current,
      overlays: current.overlays.filter((overlay) => overlay.id !== selectedOverlay.id),
    }))
    setSelectedOverlayId(null)
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

  const fitToView = () => {
    const scrollElement = scrollRef.current
    if (!scrollElement || timeline.duration <= 0) return
    const availableWidth = scrollElement.clientWidth - TRACK_LABEL_WIDTH - 24
    const idealZoom = clamp(availableWidth / (timeline.duration * BASE_PIXELS_PER_SECOND), 0.5, 3)
    onTimelineChange((current) => ({ ...current, zoom: Number(idealZoom.toFixed(2)) }))
  }

  const stepFrame = (direction: 1 | -1) => {
    const frameSeconds = 1 / Math.max(12, timeline.fps || 24)
    onTimelineChange((current) => ({
      ...current,
      playhead: clamp(snap(current.playhead + frameSeconds * direction, frameSeconds), 0, current.duration),
    }))
  }

  const toggleTrackMute = (trackId: string) => {
    onTimelineChange((current) => normalizeTimeline({
      ...current,
      tracks: current.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
    }))
  }

  const toggleTrackLock = (trackId: string) => {
    onTimelineChange((current) => normalizeTimeline({
      ...current,
      tracks: current.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)),
    }))
  }

  const updateClipSpeed = (clipId: string, speed: number) => {
    updateClip(clipId, { speed: clamp(speed, 0.1, 4) })
  }

  const updateClipTransition = (clipId: string, transitionIn: TimelineTransition, transitionDuration = 0.5) => {
    updateClip(clipId, { transitionIn, transitionDuration })
  }

  // Keyboard shortcuts — J/K/L transport, B blade, N snap, Space play, etc.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          setIsPlaying((c) => !c)
          break
        case 'k':
        case 'K':
          setIsPlaying(false)
          break
        case 'j':
        case 'J':
          stepFrame(-1)
          break
        case 'l':
        case 'L':
          stepFrame(1)
          break
        case 'b':
        case 'B':
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool((t) => (t === 'blade' ? 'select' : 'blade'))
          }
          break
        case 'n':
        case 'N':
          setSnapEnabled((s) => !s)
          break
        case 'a':
        case 'A':
          setActiveTool('select')
          break
        case 'Delete':
        case 'Backspace':
          if (selectedClip) deleteSelectedClip()
          else if (selectedOverlay) deleteSelectedOverlay()
          break
        case '?':
          setShowShortcuts((s) => !s)
          break
        case '=':
        case '+':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); adjustZoom(0.25) }
          break
        case '-':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); adjustZoom(-0.25) }
          break
        case 'Home':
          onTimelineChange((c) => ({ ...c, playhead: 0 }))
          break
        case 'End':
          onTimelineChange((c) => ({ ...c, playhead: c.duration }))
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <Card className="nodal-glass border border-white/5">
      <CardContent className="p-0">
        {/* ─── Header ─── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 px-5 py-3">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Timeline Editor</div>
              <div className="mt-0.5 text-sm text-zinc-200">
                {projectName || 'Untitled project'}
                {activeProjectId ? <span className="text-zinc-600 ml-2 font-mono text-[10px]">{activeProjectId.slice(0, 8)}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
              disabled={isSaving || isGenerating}
              className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SaveIcon />}
              Save
            </Button>
            <Button
              size="sm"
              onClick={onGenerate}
              disabled={isGenerating}
              className="bg-[#002FA7] text-white hover:bg-[#002FA7]/90 border border-[#002FA7]/30"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}
              AI Clip
            </Button>
          </div>
        </div>

        {/* ─── Toolbar ─── */}
        <div className="flex flex-wrap items-center gap-1 border-b border-white/5 px-4 py-1.5 bg-zinc-950/60">
          {/* Transport */}
          <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-white/5">
            <button type="button" onClick={() => onTimelineChange((c) => ({ ...c, playhead: 0 }))} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Go to start (Home)">
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => stepFrame(-1)} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Previous frame (J)">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsPlaying((c) => !c)}
              className={cn('p-1.5 rounded-lg transition-all', isPlaying ? 'bg-[#002FA7]/20 text-[#9db7ff]' : 'hover:bg-white/5 text-zinc-400 hover:text-white')}
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => stepFrame(1)} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Next frame (L)">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => onTimelineChange((c) => ({ ...c, playhead: c.duration }))} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Go to end (End)">
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <div className="ml-1.5 font-mono text-[11px] text-zinc-300 tabular-nums min-w-[110px]">
              {formatTimelineTime(timeline.playhead)} <span className="text-zinc-600">/</span> {formatTimelineTime(timeline.duration)}
            </div>
          </div>

          {/* Tools */}
          <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-white/5">
            <button
              type="button"
              onClick={() => setActiveTool('select')}
              className={cn('p-1.5 rounded-lg transition-all text-[10px] font-mono uppercase tracking-wider flex items-center gap-1', activeTool === 'select' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}
              title="Selection tool (A)"
            >
              <Target className="w-3 h-3" /> Sel
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('blade')}
              className={cn('p-1.5 rounded-lg transition-all text-[10px] font-mono uppercase tracking-wider flex items-center gap-1', activeTool === 'blade' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}
              title="Blade tool (B)"
            >
              <Scissors className="w-3 h-3" /> Cut
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-white/5">
            <button type="button" onClick={splitSelectedClip} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Split at playhead">
              <Scissors className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={duplicateSelectedClip} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Duplicate clip">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={deleteSelectedClip} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-red-400 transition-all" title="Delete (Del)">
              <DeleteIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Snap & Zoom */}
          <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-white/5">
            <button
              type="button"
              onClick={() => setSnapEnabled((s) => !s)}
              className={cn('p-1.5 rounded-lg transition-all flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider', snapEnabled ? 'bg-[#002FA7]/15 text-[#9db7ff]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}
              title="Snap to grid (N)"
            >
              <Magnet className="w-3 h-3" /> Snap
            </button>
          </div>

          <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-white/5">
            <button type="button" onClick={() => adjustZoom(-0.25)} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Zoom out (Ctrl+-)">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <div className="font-mono text-[10px] text-zinc-500 min-w-[32px] text-center">{timeline.zoom.toFixed(1)}x</div>
            <button type="button" onClick={() => adjustZoom(0.25)} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Zoom in (Ctrl++)">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={fitToView} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Fit timeline to view">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add */}
          <div className="flex items-center gap-0.5 pr-2 mr-2 border-r border-white/5">
            <button type="button" onClick={() => addBlankClip('generated')} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Add clip">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => addBlankClip('title')} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Add title card">
              <Layers3 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => videoInputRef.current?.click()} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Import video">
              <Video className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => audioInputRef.current?.click()} className="icon-button-forensic p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all" title="Import audio">
              <Music className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Shortcuts legend */}
          <button
            type="button"
            onClick={() => setShowShortcuts((s) => !s)}
            className={cn('p-1.5 rounded-lg transition-all ml-auto', showShortcuts ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5')}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ─── Shortcuts Legend ─── */}
        {showShortcuts ? (
          <div className="border-b border-white/5 bg-zinc-950/80 px-5 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-1.5 text-[10px] font-mono text-zinc-400">
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">Space</kbd>Play/Pause</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">J</kbd>Prev frame</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">K</kbd>Stop</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">L</kbd>Next frame</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">B</kbd>Blade tool</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">A</kbd>Select tool</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">N</kbd>Snap toggle</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">Del</kbd>Delete</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">Home</kbd>Go to start</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">End</kbd>Go to end</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">Ctrl±</kbd>Zoom</div>
              <div><kbd className="text-zinc-200 bg-white/5 px-1.5 py-0.5 rounded mr-1.5">?</kbd>This panel</div>
            </div>
          </div>
        ) : null}

        <div className="grid xl:grid-cols-[1.2fr_0.8fr]">
          <div className="flex min-w-0 flex-col space-y-5 border-r border-white/5 p-5">
            <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/50">
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

                <div 
                  ref={stageRef} 
                  className="relative w-full bg-zinc-950 overflow-hidden"
                  style={{ aspectRatio: parseAspectRatio(timeline.aspectRatio) }}
                >
                  {timeline.clips.length > 0 ? (
                    <VideoPreviewMonitor
                      timeline={timeline}
                      isPlaying={isPlaying}
                      onPlayStateChange={(playing) => setIsPlaying(playing)}
                      onTimeUpdate={(seconds) => {
                        if (!isPlaying) return
                        onTimelineChange((current) => ({ ...current, playhead: clamp(seconds, 0, current.duration) }))
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-8 text-center">
                      <div>
                        <Video className="mx-auto h-10 w-10 text-zinc-600" />
                        <div className="mt-3 text-sm text-zinc-300">
                          Add clips to the timeline to preview them here.
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Generated clips will automatically appear in the monitor.
                        </div>
                      </div>
                    </div>
                  )}

                  {activeOverlays.map((overlay) => {
                    const selected = overlay.id === selectedOverlayId
                    const Icon = overlay.icon === 'bolt' ? Zap : overlay.icon === 'circle' ? Circle : overlay.icon === 'square' ? Square : Target
                    return (
                      <Rnd
                        key={overlay.id}
                        bounds="parent"
                        size={{ width: overlay.width * overlayScale, height: overlay.height * overlayScale }}
                        position={{ x: overlay.x * overlayScale, y: overlay.y * overlayScale }}
                        minWidth={24}
                        minHeight={24}
                        disableDragging={overlay.locked}
                        onDragStop={(_, data) => updateOverlay(overlay.id, {
                          x: clamp(data.x / overlayScale, 0, STAGE_WIDTH),
                          y: clamp(data.y / overlayScale, 0, STAGE_HEIGHT),
                        })}
                        onResizeStop={(_, __, ref, ___, position) => updateOverlay(overlay.id, {
                          x: clamp(position.x / overlayScale, 0, STAGE_WIDTH),
                          y: clamp(position.y / overlayScale, 0, STAGE_HEIGHT),
                          width: clamp(parseInt(ref.style.width, 10) / overlayScale, 24, STAGE_WIDTH),
                          height: clamp(parseInt(ref.style.height, 10) / overlayScale, 24, STAGE_HEIGHT),
                        })}
                        onMouseDown={() => {
                          setSelectedOverlayId(overlay.id)
                          setSelectedClipId(null)
                        }}
                        className="group"
                      >
                        <div
                          className={cn(
                            'flex h-full w-full items-center justify-center overflow-hidden border transition-all',
                            selected ? 'border-[#002FA7]/70 shadow-[0_0_0_1px_rgba(0,47,167,0.55)]' : 'border-white/10'
                          )}
                          style={{
                            color: overlay.color,
                            background: overlay.backgroundColor,
                            opacity: overlay.opacity,
                          }}
                        >
                          {overlay.kind === 'image' && overlay.sourceUrl ? (
                            <img src={overlay.sourceUrl} alt={overlay.label} className="h-full w-full object-cover" />
                          ) : overlay.kind === 'icon' ? (
                            <Icon className="h-2/3 w-2/3 text-current" />
                          ) : (
                            <div
                              className="w-full px-3 text-center leading-tight"
                              style={{
                                fontFamily: overlay.fontFamily,
                                fontSize: overlay.fontSize ? overlay.fontSize * overlayScale : 32 * overlayScale,
                                fontWeight: overlay.fontWeight,
                              }}
                            >
                              {overlay.text}
                            </div>
                          )}
                        </div>
                      </Rnd>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3">
                {/* Hidden file inputs */}
                <input ref={overlayImageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void addImageOverlay(event.target.files?.[0] || null)} />
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => addLocalMediaClip(event.target.files?.[0] || null, 'video')} />
                <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(event) => addLocalMediaClip(event.target.files?.[0] || null, 'audio')} />

                {/* Overlay controls */}
                <Card className="nodal-glass border border-white/5">
                  <CardContent className="p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Overlay Layers</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => addOverlay('text')} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass text-[10px]">
                        <Type className="w-3 h-3" /> Text
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => overlayImageInputRef.current?.click()} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass text-[10px]">
                        <ImagePlus className="w-3 h-3" /> Image
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addOverlay('icon')} className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass text-[10px]">
                        <Target className="w-3 h-3" /> Icon
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick stats strip */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 font-mono">Clips</div>
                    <div className="font-mono text-sm text-zinc-200">{timeline.clips.length}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 font-mono">Overlays</div>
                    <div className="font-mono text-sm text-zinc-200">{timeline.overlays.length}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 font-mono">FPS</div>
                    <div className="font-mono text-sm text-zinc-200">{timeline.fps}</div>
                  </div>
                </div>
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
                      
                      const container = event.currentTarget;
                      container.setPointerCapture(event.pointerId);

                      const updatePlayhead = (clientX: number) => {
                        scrubFromClientX(clientX);
                      };

                      updatePlayhead(event.clientX);

                      const onMove = (e: PointerEvent) => updatePlayhead(e.clientX);
                      const onUp = () => {
                        container.releasePointerCapture(event.pointerId);
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                      };

                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                    }}
                  >
                    <div
                      className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/95 backdrop-blur-xl pointer-events-none"
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
                          <div className="absolute left-0 top-0 flex h-full w-[172px] items-center justify-between border-r border-white/10 bg-black/40 px-3 z-10 pointer-events-auto">
                            <div className="min-w-0">
                              <div className={cn('text-xs font-medium truncate', track.muted ? 'text-zinc-500 line-through' : 'text-zinc-100')}>{track.name}</div>
                              <div className="mt-0.5 text-[9px] uppercase tracking-[0.25em] text-zinc-600 font-mono">
                                {track.kind}
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button type="button" onClick={() => toggleTrackMute(track.id)} className={cn('p-1 rounded transition-all', track.muted ? 'text-red-400/70' : 'text-zinc-500 hover:text-zinc-300')} title={track.muted ? 'Unmute track' : 'Mute track'}>
                                {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                              </button>
                              <button type="button" onClick={() => toggleTrackLock(track.id)} className={cn('p-1 rounded transition-all', track.locked ? 'text-amber-400/70' : 'text-zinc-500 hover:text-zinc-300')} title={track.locked ? 'Unlock track' : 'Lock track'}>
                                {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>

                          <div className="absolute inset-y-0 left-[172px] right-0 pointer-events-none">
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
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                  setSelectedClipId(clip.id)
                                  setSelectedOverlayId(null)
                                }}
                                data-timeline-clip="true"
                                className="group z-20"
                              >
                                <div
                                  className={cn(
                                    'relative h-full w-full overflow-hidden rounded-2xl border px-3 py-2 text-left shadow-[0_18px_30px_rgba(0,0,0,0.25)] transition-all pointer-events-auto',
                                    selected ? 'border-[#002FA7]/60' : 'border-white/10'
                                  )}
                                  style={{
                                    backgroundImage: `linear-gradient(180deg, ${trackColor}22, ${trackColor}0f)`,
                                    boxShadow: selected ? `0 0 0 1px ${trackColor}55, 0 18px 30px rgba(0,0,0,0.25)` : undefined,
                                  }}
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
                          {trackClips.map((clip, index) => {
                            if (index === 0) return null
                            const prevClip = trackClips[index - 1]
                            const touches = Math.abs(clip.start - (prevClip.start + prevClip.duration)) < 0.05
                            if (!touches) return null
                            const x = TRACK_LABEL_WIDTH + clip.start * pxPerSecond
                            return (
                              <DropdownMenu key={`trans-${clip.id}`}>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="absolute z-40 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded border border-white/20 bg-zinc-800 text-white shadow-lg transition-all hover:border-white/40 hover:bg-zinc-700 pointer-events-auto"
                                    style={{ left: x, top: TRACK_HEIGHT / 2 }}
                                    title="Edit Transition"
                                  >
                                    <Blend className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="border-white/10 bg-zinc-950 text-white min-w-[140px]" side="top" sideOffset={8}>
                                  <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono">Transition</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => { updateClipTransition(clip.id, 'none'); toast.success('Transition removed') }} className="text-xs cursor-pointer focus:bg-white/10">None</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { updateClipTransition(clip.id, 'crossfade'); toast.success('Crossfade applied') }} className="text-xs cursor-pointer focus:bg-white/10">Crossfade</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { updateClipTransition(clip.id, 'dip-to-black'); toast.success('Dip to Black applied') }} className="text-xs cursor-pointer focus:bg-white/10">Dip to Black</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { updateClipTransition(clip.id, 'wipe'); toast.success('Wipe applied') }} className="text-xs cursor-pointer focus:bg-white/10">Wipe</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          })}
                        </div>
                      )
                    })}

                    <div
                      className="absolute top-0 bottom-0 z-30 w-px bg-[#002FA7] shadow-[0_0_18px_rgba(0,47,167,0.55)] pointer-events-none"
                      style={{ left: TRACK_LABEL_WIDTH + timeline.playhead * pxPerSecond }}
                    >
                      <div className="absolute top-0 -left-2 h-4 w-4 rounded-b-full border border-[#002FA7]/40 bg-[#002FA7] shadow-[0_0_0_4px_rgba(0,47,167,0.18)]" />
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
                        className="min-h-16 w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
                      />
                    </label>

                    {/* Speed / Retime */}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono flex items-center gap-1.5"><Gauge className="w-3 h-3" /> Speed</span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="4"
                            value={selectedClip.speed ?? 1}
                            onChange={(event) => updateClipSpeed(selectedClip.id, Number(event.target.value || 1))}
                            className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                          />
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">×</span>
                        </div>
                      </label>
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Transition</span>
                        <Select
                          value={selectedClip.transitionIn || 'none'}
                          onValueChange={(value) => updateClipTransition(selectedClip.id, value as TimelineTransition)}
                        >
                          <SelectTrigger className="w-full nodal-glass border-white/10 bg-white/[0.02] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-white/10 bg-zinc-950 text-white">
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="crossfade">Crossfade</SelectItem>
                            <SelectItem value="dip-to-black">Dip to Black</SelectItem>
                            <SelectItem value="wipe">Wipe</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>

                    {/* Volume / Opacity */}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono flex items-center gap-1.5"><Volume2 className="w-3 h-3" /> Volume</span>
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          max="2"
                          value={selectedClip.volume ?? 1}
                          onChange={(event) => updateClip(selectedClip.id, { volume: clamp(Number(event.target.value || 1), 0, 2) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono flex items-center gap-1.5"><Eye className="w-3 h-3" /> Opacity</span>
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={selectedClip.opacity ?? 1}
                          onChange={(event) => updateClip(selectedClip.id, { opacity: clamp(Number(event.target.value || 1), 0, 1) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                    </div>

                    {selectedClip.kind === 'audio' && selectedClip.sourceUrl ? (
                      <AudioWaveform sourceUrl={selectedClip.sourceUrl} />
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
                    Select a clip to edit its timing and track.
                  </div>
                )}

                {selectedOverlay ? (
                  <div className="border-t border-white/5 pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Overlay Layer</div>
                        <div className="mt-1 text-sm text-zinc-200">{selectedOverlay.label}</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={deleteSelectedOverlay}
                        className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </Button>
                    </div>

                    {selectedOverlay.kind === 'text' ? (
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Text</span>
                        <Input
                          value={selectedOverlay.text || ''}
                          onChange={(event) => updateOverlay(selectedOverlay.id, { text: event.target.value })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                    ) : null}

                    {selectedOverlay.kind === 'icon' ? (
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Icon</span>
                        <Select
                          value={selectedOverlay.icon || 'target'}
                          onValueChange={(value) => updateOverlay(selectedOverlay.id, { icon: value as TimelineOverlay['icon'] })}
                        >
                          <SelectTrigger className="w-full nodal-glass border-white/10 bg-white/[0.02] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-white/10 bg-zinc-950 text-white">
                            <SelectItem value="target">Target</SelectItem>
                            <SelectItem value="bolt">Bolt</SelectItem>
                            <SelectItem value="circle">Circle</SelectItem>
                            <SelectItem value="square">Square</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Start</span>
                        <Input
                          type="number"
                          step="0.25"
                          value={selectedOverlay.start}
                          onChange={(event) => updateOverlay(selectedOverlay.id, { start: clamp(Number(event.target.value || 0), 0, timeline.duration) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Duration</span>
                        <Input
                          type="number"
                          step="0.25"
                          value={selectedOverlay.duration}
                          onChange={(event) => updateOverlay(selectedOverlay.id, { duration: clamp(Number(event.target.value || 0.5), 0.5, timeline.duration) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Color</span>
                        <Input
                          type="color"
                          value={selectedOverlay.color || '#f4f4f5'}
                          onChange={(event) => updateOverlay(selectedOverlay.id, { color: event.target.value })}
                          className="nodal-glass h-10 border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                      <label className="space-y-2 block">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Opacity</span>
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={selectedOverlay.opacity ?? 1}
                          onChange={(event) => updateOverlay(selectedOverlay.id, { opacity: clamp(Number(event.target.value || 1), 0, 1) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </label>
                    </div>

                    {selectedOverlay.kind === 'text' ? (
                      <div className="grid grid-cols-[1fr_92px] gap-3">
                        <Select
                          value={selectedOverlay.fontFamily || FONT_OPTIONS[0]}
                          onValueChange={(value) => updateOverlay(selectedOverlay.id, { fontFamily: value })}
                        >
                          <SelectTrigger className="w-full nodal-glass border-white/10 bg-white/[0.02] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-white/10 bg-zinc-950 text-white">
                            {FONT_OPTIONS.map((font) => (
                              <SelectItem key={font} value={font}>{font.split(',')[0]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={selectedOverlay.fontSize || 32}
                          onChange={(event) => updateOverlay(selectedOverlay.id, { fontSize: clamp(Number(event.target.value || 32), 8, 120) })}
                          className="nodal-glass border-white/10 bg-white/[0.02] text-white"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
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

            <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-3 text-[10px] font-mono text-zinc-600 text-center uppercase tracking-[0.25em]">
              Space = play · B = blade · N = snap · ? = shortcuts
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SaveIcon() {
  return <Save className="w-3.5 h-3.5" />
}
