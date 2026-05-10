'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Film,
  ImagePlus,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { TimelineEditor } from '@/components/video-studio/TimelineEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useUIStore, type RightPanelMode } from '@/store/uiStore'
import {
  createClipFromJob,
  createDefaultTimeline,
  normalizeTimeline,
  type TimelineJob,
  type TimelineState,
} from '@/components/video-studio/timelineTypes'

type VideoModelInfo = {
  id: string
  name: string
  description?: string | null
  supported_aspect_ratios?: string[] | null
  supported_durations?: number[] | null
  supported_resolutions?: string[] | null
  generate_audio?: boolean | null
  pricing_skus?: Record<string, string> | null
}

type VideoJob = {
  id: string
  generation_id?: string | null
  polling_url?: string | null
  status: string
  model: string
  prompt: string
  projectName: string
  editGoal?: string | null
  editBrief?: string | null
  styleNotes?: string | null
  safetyNotes?: string | null
  sourceClipUrl?: string | null
  sourceVideoName?: string | null
  createdAt: string
  updatedAt: string
  aspectRatio: string
  duration: number
  resolution: string
  referenceMode: 'frame' | 'reference'
  referenceRole: 'first_frame' | 'last_frame'
  referenceImageName?: string | null
  unsigned_urls?: string[] | null
  outputUrl?: string | null
  error?: string | null
  usage?: {
    cost?: number | null
    is_byok?: boolean | null
  } | null
  timeline?: TimelineState | null
}

type StudioResponse = {
  models?: VideoModelInfo[]
  jobs?: VideoJob[]
  job?: Record<string, any>
  prompt?: string
  error?: string
}

const FALLBACK_MODELS: VideoModelInfo[] = [
  {
    id: 'google/veo-3.1-lite',
    name: 'Google Veo 3.1 Lite',
    description: 'High polish clip generation for clean hero shots and premium motion.',
    supported_aspect_ratios: ['16:9'],
    supported_durations: [5, 8],
    supported_resolutions: ['720p'],
    generate_audio: true,
    pricing_skus: { generate: '0.50' },
  },
  {
    id: 'alibaba/wan-2.6',
    name: 'Alibaba Wan 2.6',
    description: 'Faster iteration path for stylized drafts, cutaways, and variations.',
    supported_aspect_ratios: ['16:9', '9:16', '1:1'],
    supported_durations: [5, 8],
    supported_resolutions: ['720p', '1080p'],
    generate_audio: true,
    pricing_skus: { generate: '0.25' },
  },
]

function formatAge(value: string) {
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true })
  } catch {
    return value
  }
}

function getSessionToken() {
  return supabase.auth.getSession().then(({ data }) => data.session?.access_token || null)
}

async function fetchStudioJson(path: string, init?: RequestInit) {
  const token = await getSessionToken()
  const headers = new Headers(init?.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, {
    ...init,
    headers,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed')
  }
  return data as StudioResponse
}

function buildPrompt(inputs: {
  projectName: string
  editBrief: string
  editGoal: string
  styleNotes: string
  safetyNotes: string
  sourceClipUrl: string
  sourceVideoName?: string
}) {
  const lines = [
    `Project: ${inputs.projectName || 'Nodal Point video edit'}`,
    `Edit goal: ${inputs.editGoal || 'Create a premium AI clip that can be cut into the edit.'}`,
    `Brief: ${inputs.editBrief || 'No brief provided.'}`,
    inputs.sourceClipUrl ? `Source clip context: ${inputs.sourceClipUrl}` : '',
    inputs.sourceVideoName ? `Uploaded source video: ${inputs.sourceVideoName}` : '',
    inputs.styleNotes ? `Style notes: ${inputs.styleNotes}` : '',
    inputs.safetyNotes ? `Constraints: ${inputs.safetyNotes}` : '',
    'Brand context: dark forensic CRM, restrained blue signal accents, sharp corporate clarity.',
    'Avoid cartoon motion, noisy color palettes, and generic social media filler.',
  ]

  return lines.filter(Boolean).join('\n')
}

function makeJobId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `job_${Date.now()}`
}

function timelineFromJob(job: TimelineJob) {
  const normalized = normalizeTimeline(job.timeline || undefined)
  if (normalized.clips.length > 0) {
    return normalized
  }

  if (job.outputUrl || job.sourceClipUrl) {
    return normalizeTimeline({
      ...normalized,
      clips: [createClipFromJob(job)],
    })
  }

  return normalized
}

export default function VideoStudioPage() {
  const params = useParams()
  const routeProjectId = Array.isArray(params?.id) ? params.id[0] : params?.id
  const { role, loading } = useAuth()
  const isAdmin = role === 'admin'
  const {
    rightPanelMode,
    rightPanelMinimized,
    setRightPanelMode,
    setRightPanelMinimized,
  } = useUIStore()
  const panelSnapshotRef = useRef<{ mode: RightPanelMode; minimized: boolean } | null>(null)

  const [models, setModels] = useState<VideoModelInfo[]>(FALLBACK_MODELS)
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<TimelineState>(() => createDefaultTimeline())
  const [projectName, setProjectName] = useState('Nodal Point Brand Cut')
  const [editGoal, setEditGoal] = useState('Generate a cinematic clip that matches the forensic Nodal Point brand.')
  const [editBrief, setEditBrief] = useState('Use this for a short hero clip, B-roll replacement, or opening sting.')
  const [styleNotes, setStyleNotes] = useState('Dark glass, blue signal accents, precise camera movement, premium business tone.')
  const [safetyNotes, setSafetyNotes] = useState('No generic stock footage feel. No bright playful palette. Keep it sharp and restrained.')
  const [sourceClipUrl, setSourceClipUrl] = useState('')
  const [sourceVideoName, setSourceVideoName] = useState<string | null>(null)
  const [sourceVideoPreviewUrl, setSourceVideoPreviewUrl] = useState<string | null>(null)
  const [isExtractingFrame, setIsExtractingFrame] = useState(false)
  const [referenceMode, setReferenceMode] = useState<'frame' | 'reference'>('frame')
  const [referenceRole, setReferenceRole] = useState<'first_frame' | 'last_frame'>('first_frame')
  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState('')
  const [referenceImageName, setReferenceImageName] = useState('')
  const [modelId, setModelId] = useState(FALLBACK_MODELS[0].id)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [duration, setDuration] = useState<'5' | '8'>('8')
  const [resolution, setResolution] = useState('720p')
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  const currentModel = useMemo(
    () => models.find((model) => model.id === modelId) || models[0],
    [models, modelId]
  )

  const modelDurations = currentModel?.supported_durations?.length ? currentModel.supported_durations : [5, 8]
  const modelRatios = currentModel?.supported_aspect_ratios?.length ? currentModel.supported_aspect_ratios : ['16:9']
  const modelResolutions = currentModel?.supported_resolutions?.length ? currentModel.supported_resolutions : ['720p']

  useEffect(() => {
    panelSnapshotRef.current = {
      mode: rightPanelMode,
      minimized: rightPanelMinimized,
    }

    if (!rightPanelMinimized) {
      setRightPanelMinimized(true)
    }

    return () => {
      const snapshot = panelSnapshotRef.current
      if (!snapshot) return
      setRightPanelMode(snapshot.mode)
      setRightPanelMinimized(snapshot.minimized)
    }
    // This should run once on entry and restore once on exit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (sourceVideoPreviewUrl) {
        URL.revokeObjectURL(sourceVideoPreviewUrl)
      }
    }
  }, [sourceVideoPreviewUrl])

  useEffect(() => {
    if (loading || !isAdmin) return
    let mounted = true

    const loadModels = async () => {
      setIsLoadingModels(true)
      setError(null)

      try {
        const data = await fetchStudioJson('/api/admin/video-studio')
        if (!mounted) return
        const fetchedModels = Array.isArray(data.models) && data.models.length > 0 ? data.models : FALLBACK_MODELS
        const fetchedJobs = Array.isArray(data.jobs) ? data.jobs : []
        setModels(fetchedModels)
        setJobs(fetchedJobs)
        const routeJob = routeProjectId ? fetchedJobs.find((job) => job.id === routeProjectId) : null
        if (routeJob) {
          setProjectName(routeJob.projectName || 'Nodal Point Brand Cut')
          setEditGoal(routeJob.editGoal || '')
          setEditBrief(routeJob.editBrief || '')
          setStyleNotes(routeJob.styleNotes || '')
          setSafetyNotes(routeJob.safetyNotes || '')
          setSourceClipUrl(routeJob.sourceClipUrl || '')
          setSourceVideoName(routeJob.sourceVideoName || null)
          setReferenceImageDataUrl('')
          setReferenceImageName(routeJob.referenceImageName || '')
          setModelId(routeJob.model)
          setAspectRatio(routeJob.aspectRatio || '16:9')
          setDuration(String(routeJob.duration || 8) as '5' | '8')
          setResolution(routeJob.resolution || '720p')
          setReferenceMode(routeJob.referenceMode || 'frame')
          setReferenceRole(routeJob.referenceRole || 'first_frame')
          setTimeline(timelineFromJob(routeJob))
          setActiveProjectId(routeJob.id)
        } else if (routeProjectId) {
          setActiveProjectId(routeProjectId)
        }
        if (data.error) {
          setError(data.error)
        }
        if (!fetchedModels.some((model) => model.id === modelId) && fetchedModels[0]) {
          setModelId(fetchedModels[0].id)
        }
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Failed to load model list')
        setModels(FALLBACK_MODELS)
      } finally {
        if (mounted) setIsLoadingModels(false)
      }
    }

    void loadModels()

    return () => {
      mounted = false
    }
  }, [loading, isAdmin, routeProjectId])

  useEffect(() => {
    const activeJobs = jobs.filter((job) => ['pending', 'in_progress'].includes(job.status))
    if (activeJobs.length === 0) return

    const interval = window.setInterval(async () => {
      const updates = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const data = await fetchStudioJson(`/api/admin/video-studio?jobId=${encodeURIComponent(job.id)}`)
            const fresh = data.job || {}
            return {
              ...job,
              status: String(fresh.status || job.status),
              updatedAt: new Date().toISOString(),
              polling_url: fresh.polling_url || job.polling_url || null,
              generation_id: fresh.generation_id || job.generation_id || null,
              unsigned_urls: Array.isArray(fresh.unsigned_urls) ? fresh.unsigned_urls : job.unsigned_urls || null,
              outputUrl: fresh.unsigned_urls?.[0] || job.outputUrl || null,
              error: fresh.error || job.error || null,
              usage: fresh.usage || job.usage || null,
              timeline: fresh.timeline ? normalizeTimeline(fresh.timeline) : job.timeline || null,
            } as VideoJob
          } catch {
            return job
          }
        })
      )

      setJobs((current) => current.map((job) => updates.find((item) => item.id === job.id) || job))
    }, 10000)

    return () => window.clearInterval(interval)
  }, [jobs])

  const refreshModels = async () => {
    setIsLoadingModels(true)
    setError(null)
    try {
      const data = await fetchStudioJson('/api/admin/video-studio')
      const fetchedModels = Array.isArray(data.models) && data.models.length > 0 ? data.models : FALLBACK_MODELS
      const fetchedJobs = Array.isArray(data.jobs) ? data.jobs : []
      setModels(fetchedModels)
      setJobs(fetchedJobs)
      if (data.error) {
        setError(data.error)
      }
      if (!fetchedModels.some((model) => model.id === modelId) && fetchedModels[0]) {
        setModelId(fetchedModels[0].id)
      }
      toast.success('Model list refreshed')
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh model list')
      toast.error(err?.message || 'Failed to refresh model list')
    } finally {
      setIsLoadingModels(false)
    }
  }

  const handleReferenceUpload = async (file: File | null) => {
    if (!file) {
      setReferenceImageDataUrl('')
      setReferenceImageName('')
      return
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

    setReferenceImageDataUrl(dataUrl)
    setReferenceImageName(file.name)
  }

  const handleSourceVideoUpload = (file: File | null) => {
    if (!file) {
      setSourceVideoName(null)
      setSourceVideoPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      return
    }

    setSourceVideoName(file.name)
    setSourceVideoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
  }

  const extractFirstFrame = async () => {
    if (!sourceVideoPreviewUrl) {
      toast.error('Upload a source video first')
      return
    }

    setIsExtractingFrame(true)
    try {
      const frameUrl = await new Promise<string>((resolve, reject) => {
        const video = document.createElement('video')
        video.src = sourceVideoPreviewUrl
        video.muted = true
        video.playsInline = true

        const cleanup = () => {
          video.onloadedmetadata = null
          video.onseeked = null
          video.onerror = null
        }

        video.onloadedmetadata = () => {
          const seekTime = Math.min(0.12, Math.max(0, (video.duration || 0) * 0.05))
          video.currentTime = Number.isFinite(seekTime) ? seekTime : 0
        }

        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth || 1280
            canvas.height = video.videoHeight || 720
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Could not create canvas context')
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const dataUrl = canvas.toDataURL('image/png')
            cleanup()
            resolve(dataUrl)
          } catch (err) {
            cleanup()
            reject(err)
          }
        }

        video.onerror = () => {
          cleanup()
          reject(new Error('Could not read the uploaded video'))
        }
      })

      setReferenceImageDataUrl(frameUrl)
      setReferenceImageName(sourceVideoName ? `${sourceVideoName} frame` : 'source-frame.png')
      setReferenceMode('frame')
      setReferenceRole('first_frame')
      toast.success('First frame extracted')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to extract frame')
    } finally {
      setIsExtractingFrame(false)
    }
  }

  const handleGenerate = async () => {
    if (!modelId) return
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        jobId: activeProjectId || routeProjectId || undefined,
        action: 'generate',
        subject: projectName,
        projectName,
        editGoal,
        editBrief,
        styleNotes,
        safetyNotes,
        sourceClipUrl,
        sourceVideoName: sourceVideoName || undefined,
        model: modelId,
        aspectRatio,
        duration: Number(duration),
        resolution,
        referenceMode,
        referenceRole,
        referenceImage: referenceImageDataUrl,
        referenceImageName,
        timeline,
      }

      const prompt = buildPrompt({
        projectName,
        editGoal,
        editBrief,
        styleNotes,
        safetyNotes,
        sourceClipUrl,
        sourceVideoName: sourceVideoName || undefined,
      })

      const data = await fetchStudioJson('/api/admin/video-studio', {
        method: 'POST',
        body: JSON.stringify({ ...payload, prompt }),
      })

      const job = (data.job || {}) as Record<string, any>
      const nextJob: VideoJob = {
        id: String(job.id || makeJobId()),
        generation_id: job.generation_id || null,
        polling_url: job.polling_url || null,
        status: String(job.status || 'pending'),
        model: modelId,
        prompt: data.prompt || prompt,
        projectName,
        editGoal,
        editBrief,
        styleNotes,
        safetyNotes,
        sourceClipUrl,
        sourceVideoName: sourceVideoName || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aspectRatio,
        duration: Number(duration),
        resolution,
        referenceMode,
        referenceRole,
        referenceImageName: referenceImageName || null,
        unsigned_urls: Array.isArray(job.unsigned_urls) ? job.unsigned_urls : null,
        outputUrl: Array.isArray(job.unsigned_urls) ? job.unsigned_urls[0] || null : null,
        error: job.error || null,
        usage: job.usage || null,
        timeline: job.timeline ? normalizeTimeline(job.timeline) : timeline,
      }

      setJobs((current) => [nextJob, ...current.filter((item) => item.id !== nextJob.id)])
      setActiveProjectId(nextJob.id)
      setTimeline(nextJob.timeline ? normalizeTimeline(nextJob.timeline) : timeline)
      toast.success('Video job submitted')
    } catch (err: any) {
      setError(err?.message || 'Failed to submit video job')
      toast.error(err?.message || 'Failed to submit video job')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!modelId) return
    setIsSavingDraft(true)
    setError(null)

    try {
      const payload = {
        jobId: activeProjectId || routeProjectId || undefined,
        action: 'save',
        subject: projectName,
        projectName,
        editGoal,
        editBrief,
        styleNotes,
        safetyNotes,
        sourceClipUrl,
        sourceVideoName: sourceVideoName || undefined,
        model: modelId,
        aspectRatio,
        duration: Number(duration),
        resolution,
        referenceMode,
        referenceRole,
        referenceImage: referenceImageDataUrl,
        referenceImageName,
        timeline,
      }

      const prompt = buildPrompt({
        projectName,
        editGoal,
        editBrief,
        styleNotes,
        safetyNotes,
        sourceClipUrl,
        sourceVideoName: sourceVideoName || undefined,
      })

      const data = await fetchStudioJson('/api/admin/video-studio', {
        method: 'POST',
        body: JSON.stringify({ ...payload, prompt }),
      })

      const job = (data.job || {}) as Record<string, any>
      const nextJob: VideoJob = {
        id: String(job.id || activeProjectId || routeProjectId || makeJobId()),
        generation_id: job.generation_id || null,
        polling_url: job.polling_url || null,
        status: String(job.status || 'draft'),
        model: modelId,
        prompt: data.prompt || prompt,
        projectName,
        editGoal,
        editBrief,
        styleNotes,
        safetyNotes,
        sourceClipUrl,
        sourceVideoName: sourceVideoName || null,
        createdAt: String(job.createdAt || job.created_at || new Date().toISOString()),
        updatedAt: String(job.updatedAt || job.updated_at || new Date().toISOString()),
        aspectRatio,
        duration: Number(duration),
        resolution,
        referenceMode,
        referenceRole,
        referenceImageName: referenceImageName || null,
        unsigned_urls: Array.isArray(job.unsigned_urls) ? job.unsigned_urls : null,
        outputUrl: Array.isArray(job.unsigned_urls) ? job.unsigned_urls[0] || null : null,
        error: job.error || null,
        usage: job.usage || null,
        timeline: job.timeline ? normalizeTimeline(job.timeline) : timeline,
      }

      setJobs((current) => [nextJob, ...current.filter((item) => item.id !== nextJob.id)])
      setActiveProjectId(nextJob.id)
      setTimeline(nextJob.timeline ? normalizeTimeline(nextJob.timeline) : timeline)
      toast.success('Draft saved')
    } catch (err: any) {
      setError(err?.message || 'Failed to save draft')
      toast.error(err?.message || 'Failed to save draft')
    } finally {
      setIsSavingDraft(false)
    }
  }

  const reopenProject = (job: TimelineJob) => {
    setProjectName(job.projectName || 'Nodal Point Brand Cut')
    setEditGoal(job.editGoal || '')
    setEditBrief(job.editBrief || '')
    setStyleNotes(job.styleNotes || '')
    setSafetyNotes(job.safetyNotes || '')
    setSourceClipUrl(job.sourceClipUrl || '')
    setSourceVideoName(job.sourceVideoName || null)
    setSourceVideoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setReferenceImageDataUrl('')
    setReferenceImageName(job.referenceImageName || '')
    setModelId(job.model)
    setAspectRatio(job.aspectRatio || '16:9')
    setDuration(String(job.duration || 8) as '5' | '8')
    setResolution(job.resolution || '720p')
    if (job.referenceImageName) setReferenceImageName(job.referenceImageName)
    setReferenceMode(job.referenceMode || 'frame')
    setReferenceRole(job.referenceRole || 'first_frame')
    setTimeline(timelineFromJob(job))
    setActiveProjectId(job.id)
    toast.success('Project reopened')
  }

  const totals = useMemo(() => {
    const pending = jobs.filter((job) => ['pending', 'in_progress'].includes(job.status)).length
    const completed = jobs.filter((job) => job.status === 'completed').length
    const totalCost = jobs.reduce((sum, job) => sum + Number(job.usage?.cost || 0), 0)
    return { pending, completed, totalCost }
  }, [jobs])

  if (!loading && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="nodal-glass rounded-3xl border border-white/5 p-8 max-w-xl w-full">
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Access Restricted</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Video Studio</h1>
          <p className="mt-2 text-zinc-400">
            This editor is admin-only.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link href="/network/admin" className="text-sm text-[#9db7ff] underline underline-offset-4">
              Return to Admin
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (true) {
    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <CollapsiblePageHeader
          title={projectName || 'Video Project'}
          description="Timeline editor first. AI generation stays available when you need a new clip."
          backHref="/network/admin/video-studio"
          primaryAction={{ label: 'Save Draft', onClick: handleSaveDraft, icon: isSavingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />, disabled: isSavingDraft || isSubmitting }}
          secondaryAction={{ label: aiPanelOpen ? 'Close AI' : 'Open AI', onClick: () => setAiPanelOpen((current) => !current), icon: <WandSparkles className="w-4 h-4" />, disabled: false }}
        >
          <Badge className="border border-[#002FA7]/30 bg-[#002FA7]/10 text-[#9db7ff] uppercase tracking-[0.2em] text-[10px] font-mono">
            <ShieldCheck className="w-3 h-3" />
            Admin Only
          </Badge>
        </CollapsiblePageHeader>

        {error ? (
          <div className="nodal-glass rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80 font-mono">Attention</div>
                <div className="mt-1 text-zinc-100 font-medium">{error}</div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={refreshModels}
              className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
            >
              Retry
            </Button>
          </div>
        ) : null}

        <TimelineEditor
          projectName={projectName}
          jobs={jobs}
          timeline={timeline}
          onTimelineChange={setTimeline}
          onOpenJob={reopenProject}
          onSaveDraft={handleSaveDraft}
          onGenerate={handleGenerate}
          isSaving={isSavingDraft}
          isGenerating={isSubmitting}
          activeProjectId={activeProjectId || routeProjectId || null}
        />

        <Card className="nodal-glass border border-white/5">
          <button
            type="button"
            onClick={() => setAiPanelOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
          >
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">AI Clip Generator</div>
              <div className="mt-1 text-sm text-zinc-300">
                {currentModel?.name || 'Model unavailable'} / {aspectRatio} / {duration}s / {resolution}
              </div>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-zinc-500 transition-transform', aiPanelOpen ? 'rotate-180' : '')} />
          </button>

          {aiPanelOpen ? (
            <CardContent className="border-t border-white/5 p-5">
              <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <label className="space-y-2 block">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Project name</span>
                    <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="nodal-glass border-white/10 bg-white/[0.02] text-white" />
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Prompt goal</span>
                    <textarea
                      value={editGoal}
                      onChange={(event) => setEditGoal(event.target.value)}
                      className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
                    />
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Prompt brief</span>
                    <textarea
                      value={editBrief}
                      onChange={(event) => setEditBrief(event.target.value)}
                      className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Style notes</span>
                      <textarea
                        value={styleNotes}
                        onChange={(event) => setStyleNotes(event.target.value)}
                        className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Constraints</span>
                      <textarea
                        value={safetyNotes}
                        onChange={(event) => setSafetyNotes(event.target.value)}
                        className="min-h-20 w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#002FA7]/40"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Source clip URL</span>
                      <Input
                        value={sourceClipUrl}
                        onChange={(event) => setSourceClipUrl(event.target.value)}
                        placeholder="Optional source or reference URL"
                        className="nodal-glass border-white/10 bg-white/[0.02] text-white placeholder:text-zinc-600"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Upload source video</span>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(event) => handleSourceVideoUpload(event.target.files?.[0] || null)}
                        className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-950 hover:file:bg-zinc-200"
                      />
                    </label>
                  </div>

                  {sourceVideoPreviewUrl ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                      <video src={sourceVideoPreviewUrl} controls className="h-48 w-full bg-black object-cover" />
                      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2">
                        <div className="truncate text-sm text-zinc-200">{sourceVideoName || 'Source video'}</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void extractFirstFrame()}
                          disabled={isExtractingFrame}
                          className="border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 nodal-glass"
                        >
                          {isExtractingFrame ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                          Extract frame
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    {models.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setModelId(model.id)
                          const nextRatio = model.supported_aspect_ratios?.[0]
                          const nextDuration = model.supported_durations?.[0]
                          const nextResolution = model.supported_resolutions?.[0]
                          if (nextRatio) {
                            setAspectRatio(nextRatio)
                            setTimeline((current) => ({ ...current, aspectRatio: nextRatio }))
                          }
                          if (nextDuration) setDuration(String(nextDuration) as '5' | '8')
                          if (nextResolution) setResolution(nextResolution)
                        }}
                        className={cn(
                          'w-full rounded-2xl border p-3 text-left transition-all nodal-glass',
                          modelId === model.id ? 'border-[#002FA7]/40 bg-[#002FA7]/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                        )}
                      >
                        <div className="text-sm font-semibold text-zinc-100">{model.name}</div>
                        <div className="mt-1 text-xs text-zinc-500">{model.id}</div>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Select 
                      value={aspectRatio} 
                      onValueChange={(value) => {
                        setAspectRatio(value)
                        setTimeline((current) => ({ ...current, aspectRatio: value }))
                      }}
                    >
                      <SelectTrigger className="w-full nodal-glass border-white/10 bg-white/[0.02] text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-zinc-950 text-white">
                        {modelRatios.map((ratio) => <SelectItem key={ratio} value={ratio}>{ratio}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={duration} onValueChange={(value) => setDuration(value as '5' | '8')}>
                      <SelectTrigger className="w-full nodal-glass border-white/10 bg-white/[0.02] text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-zinc-950 text-white">
                        {modelDurations.map((value) => <SelectItem key={value} value={String(value)}>{value}s</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger className="w-full nodal-glass border-white/10 bg-white/[0.02] text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-zinc-950 text-white">
                        {modelResolutions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3">
                    <label className="space-y-2 block">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono">Reference frame</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (event) => {
                          try {
                            await handleReferenceUpload(event.target.files?.[0] || null)
                          } catch (err: any) {
                            toast.error(err?.message || 'Failed to read image')
                          }
                        }}
                        className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-950 hover:file:bg-zinc-200"
                      />
                    </label>
                    {referenceImageDataUrl ? (
                      <img src={referenceImageDataUrl} alt={referenceImageName || 'Reference'} className="h-40 w-full rounded-2xl border border-white/10 object-cover" />
                    ) : null}
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={isSubmitting}
                    className="w-full border border-[#002FA7]/30 bg-[#002FA7] text-white hover:bg-[#002FA7]/90"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                    Generate AI Clip
                  </Button>
                </div>
              </div>
            </CardContent>
          ) : null}
        </Card>
      </div>
    )
  }

}
