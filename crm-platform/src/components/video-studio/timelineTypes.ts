export type TimelineTrackKind = 'video' | 'audio' | 'title'
export type TimelineClipKind = 'source' | 'generated' | 'title' | 'audio'

export type TimelineTrack = {
  id: string
  name: string
  kind: TimelineTrackKind
  color: string
  muted?: boolean
}

export type TimelineClip = {
  id: string
  kind: TimelineClipKind
  label: string
  start: number
  duration: number
  trackId: string
  color: string
  sourceUrl?: string | null
  sourceName?: string | null
  model?: string | null
  notes?: string | null
  volume?: number
  opacity?: number
  locked?: boolean
}

export type TimelineState = {
  duration: number
  zoom: number
  playhead: number
  fps: number
  tracks: TimelineTrack[]
  clips: TimelineClip[]
}

export type TimelineJob = {
  id: string
  projectName: string
  model: string
  status: string
  duration: number
  createdAt?: string
  outputUrl?: string | null
  sourceClipUrl?: string | null
  sourceVideoName?: string | null
  updatedAt: string
  aspectRatio?: string
  resolution?: string
  referenceMode?: 'frame' | 'reference'
  referenceRole?: 'first_frame' | 'last_frame'
  editGoal?: string | null
  editBrief?: string | null
  styleNotes?: string | null
  safetyNotes?: string | null
  referenceImageName?: string | null
  prompt: string
  error?: string | null
  usage?: {
    cost?: number | null
  } | null
  timeline?: TimelineState | null
}

const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'video-main', name: 'Primary Video', kind: 'video', color: '#002FA7' },
  { id: 'video-alt', name: 'Alternate Cut', kind: 'video', color: '#14b8a6' },
  { id: 'audio-bed', name: 'Audio Bed', kind: 'audio', color: '#a855f7' },
  { id: 'titles', name: 'Titles', kind: 'title', color: '#f59e0b' },
]

function makeId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function snap(value: number, step = 0.25) {
  return Math.round(value / step) * step
}

export function formatTimelineTime(seconds: number) {
  const safeSeconds = Math.max(0, Number(seconds || 0))
  const whole = Math.floor(safeSeconds)
  const minutes = Math.floor(whole / 60)
  const remaining = whole % 60
  const fraction = Math.round((safeSeconds - whole) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}.${fraction}`
}

export function createDefaultTimeline(): TimelineState {
  return {
    duration: 60,
    zoom: 1,
    playhead: 0,
    fps: 24,
    tracks: DEFAULT_TRACKS.map((track) => ({ ...track })),
    clips: [],
  }
}

export function normalizeTimeline(input?: Partial<TimelineState> | null): TimelineState {
  const base = createDefaultTimeline()
  const tracks = Array.isArray(input?.tracks) && input.tracks.length > 0 ? input.tracks : base.tracks
  const clips = Array.isArray(input?.clips) ? input.clips : []
  const safeClips = clips
    .filter((clip) => clip && clip.trackId)
    .map((clip) => ({
      ...clip,
      id: clip.id || makeId('clip'),
      kind: clip.kind || 'generated',
      label: String(clip.label || 'Clip'),
      start: Math.max(0, Number(clip.start || 0)),
      duration: Math.max(0.5, Number(clip.duration || 1)),
      trackId: String(clip.trackId),
      color: String(clip.color || '#002FA7'),
      volume: clip.volume ?? 1,
      opacity: clip.opacity ?? 1,
    }))
    .sort((a, b) => a.start - b.start)

  const maxEnd = safeClips.reduce((sum, clip) => Math.max(sum, clip.start + clip.duration), 0)

  return {
    duration: Math.max(base.duration, Number(input?.duration || 0), maxEnd > 0 ? maxEnd + 4 : base.duration),
    zoom: clamp(Number(input?.zoom || base.zoom), 0.5, 3),
    playhead: clamp(Number(input?.playhead || 0), 0, Math.max(base.duration, maxEnd)),
    fps: Number(input?.fps || base.fps) || base.fps,
    tracks: tracks.map((track, index) => ({
      ...track,
      id: track.id || makeId(`track_${index}`),
      name: String(track.name || `Track ${index + 1}`),
      kind: track.kind || 'video',
      color: String(track.color || DEFAULT_TRACKS[index % DEFAULT_TRACKS.length].color),
    })),
    clips: safeClips,
  }
}

export function createClipFromJob(job: TimelineJob): TimelineClip {
  const duration = Math.max(1, Number(job.duration || 8))
  const sourceUrl = job.outputUrl || job.sourceClipUrl || null
  const isFinished = String(job.status || '').toLowerCase() === 'completed'

  return {
    id: makeId(`clip_${job.id}`),
    kind: 'generated',
    label: job.projectName || job.model || 'Generated clip',
    start: 0,
    duration,
    trackId: 'video-main',
    color: isFinished ? '#10b981' : '#002FA7',
    sourceUrl,
    sourceName: job.referenceImageName || job.sourceVideoName || job.projectName || null,
    model: job.model,
    notes: job.prompt,
    volume: 1,
    opacity: 1,
  }
}

export function addClipToTimeline(timeline: TimelineState, clip: TimelineClip): TimelineState {
  const nextClips = [...timeline.clips, clip].sort((a, b) => a.start - b.start)
  const maxEnd = nextClips.reduce((sum, item) => Math.max(sum, item.start + item.duration), 0)

  return {
    ...timeline,
    duration: Math.max(timeline.duration, maxEnd + 4),
    clips: nextClips,
  }
}
