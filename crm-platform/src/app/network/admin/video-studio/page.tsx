'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  Film,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { CollapsiblePageHeader } from '@/components/layout/CollapsiblePageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createDefaultTimeline, type TimelineState } from '@/components/video-studio/timelineTypes'
import { useUIStore, type RightPanelMode } from '@/store/uiStore'

type VideoJob = {
  id: string
  status: string
  model: string
  prompt: string
  projectName: string
  editGoal?: string | null
  createdAt: string
  updatedAt: string
  duration: number
  outputUrl?: string | null
  usage?: {
    cost?: number | null
  } | null
  timeline?: TimelineState | null
}

type StudioResponse = {
  jobs?: VideoJob[]
  job?: VideoJob
  error?: string
}

const DEFAULT_MODEL = 'google/veo-3.1-lite'

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

export default function VideoStudioProjectsPage() {
  const router = useRouter()
  const { role, loading } = useAuth()
  const isAdmin = role === 'admin'
  const {
    rightPanelMode,
    rightPanelMinimized,
    setRightPanelMode,
    setRightPanelMinimized,
  } = useUIStore()
  const panelSnapshotRef = useRef<{ mode: RightPanelMode; minimized: boolean } | null>(null)
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [projectName, setProjectName] = useState('Nodal Point Brand Cut')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (loading || !isAdmin) return
    let mounted = true

    const loadProjects = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await fetchStudioJson('/api/admin/video-studio')
        if (!mounted) return
        setJobs(Array.isArray(data.jobs) ? data.jobs : [])
        if (data.error) setError(data.error)
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Failed to load video projects')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void loadProjects()

    return () => {
      mounted = false
    }
  }, [loading, isAdmin])

  const totals = useMemo(() => {
    const draft = jobs.filter((job) => job.status === 'draft').length
    const rendering = jobs.filter((job) => ['pending', 'in_progress'].includes(job.status)).length
    const complete = jobs.filter((job) => job.status === 'completed').length
    const spend = jobs.reduce((sum, job) => sum + Number(job.usage?.cost || 0), 0)
    return { draft, rendering, complete, spend }
  }, [jobs])

  const createProject = async () => {
    const safeName = projectName.trim() || 'Untitled Video Project'
    setIsCreating(true)
    setError(null)

    try {
      const data = await fetchStudioJson('/api/admin/video-studio', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save',
          subject: safeName,
          projectName: safeName,
          editGoal: '',
          editBrief: '',
          styleNotes: 'Dark glass, blue signal accents, precise camera movement, premium business tone.',
          safetyNotes: 'Keep it sharp and restrained.',
          model: DEFAULT_MODEL,
          aspectRatio: '16:9',
          duration: 8,
          resolution: '720p',
          referenceMode: 'frame',
          referenceRole: 'first_frame',
          timeline: createDefaultTimeline(),
        }),
      })

      const nextId = data.job?.id
      if (!nextId) throw new Error('Project was created without an id')
      router.push(`/network/admin/video-studio/${nextId}`)
    } catch (err: any) {
      setError(err?.message || 'Failed to create video project')
      toast.error(err?.message || 'Failed to create video project')
    } finally {
      setIsCreating(false)
    }
  }

  if (!loading && !isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="nodal-glass w-full max-w-xl rounded-3xl border border-white/5 p-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Access Restricted</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Video Studio</h1>
          <p className="mt-2 text-zinc-400">This editor is admin-only.</p>
          <Link href="/network/admin" className="mt-6 inline-block text-sm text-[#9db7ff] underline underline-offset-4">
            Return to Admin
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CollapsiblePageHeader
        title="Video Studio"
        description="Admin-only video projects. Open a project to edit its timeline, overlays, media, and optional AI generations."
        backHref="/network/admin"
        primaryAction={{ label: 'New Project', onClick: createProject, icon: isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />, disabled: isCreating }}
      >
        <Badge className="border border-[#002FA7]/30 bg-[#002FA7]/10 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9db7ff]">
          <ShieldCheck className="h-3 w-3" />
          Admin Only
        </Badge>
      </CollapsiblePageHeader>

      {error ? (
        <div className="nodal-glass flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
          <div className="text-sm text-zinc-200">{error}</div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Projects', value: jobs.length, icon: Film },
          { label: 'Drafts', value: totals.draft, icon: Plus },
          { label: 'Rendering', value: totals.rendering, icon: Loader2 },
          { label: 'AI Spend', value: `$${totals.spend.toFixed(2)}`, icon: Sparkles },
        ].map((item) => (
          <Card key={item.label} className="nodal-glass border border-white/5">
            <CardContent className="flex items-end justify-between gap-4 p-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">{item.label}</div>
                <div className="mt-3 font-mono text-3xl tabular-nums text-white">{item.value}</div>
              </div>
              <item.icon className="h-5 w-5 shrink-0 text-zinc-500" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="nodal-glass border border-white/5">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Create Project</div>
              <h2 className="mt-1 text-lg font-semibold text-white">Start with a clean editing workspace</h2>
            </div>
            <div className="flex w-full gap-2 md:max-w-xl">
              <Input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="nodal-glass border-white/10 bg-white/[0.02] text-white"
              />
              <Button
                onClick={createProject}
                disabled={isCreating}
                className="border border-[#002FA7]/30 bg-[#002FA7] text-white hover:bg-[#002FA7]/90"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {isLoading ? (
          <Card className="nodal-glass border border-white/5">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading projects
            </CardContent>
          </Card>
        ) : jobs.length === 0 ? (
          <Card className="nodal-glass border border-white/5">
            <CardContent className="p-8 text-center text-sm text-zinc-500">
              No video projects yet.
            </CardContent>
          </Card>
        ) : jobs.map((job) => (
          <Link
            key={job.id}
            href={`/network/admin/video-studio/${job.id}`}
            className="nodal-glass group rounded-2xl border border-white/5 p-4 transition-all hover:border-[#002FA7]/40 hover:bg-white/[0.04]"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-zinc-100">{job.projectName || 'Untitled project'}</h3>
                  <Badge className="border border-white/10 bg-white/5 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-400">
                    {job.status}
                  </Badge>
                </div>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                  {job.model || DEFAULT_MODEL} / {job.duration || 8}s / updated {formatAge(job.updatedAt)}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden text-right md:block">
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Timeline</div>
                  <div className="mt-1 font-mono text-sm text-zinc-200">{job.timeline?.clips?.length || 0} clips</div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
