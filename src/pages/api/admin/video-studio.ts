import { requireUser, supabaseAdmin } from '@/lib/supabase'
import { normalizeTimeline } from '@/components/video-studio/timelineTypes'

const ALLOWED_MODELS = new Set(['google/veo-3.1-lite', 'alibaba/wan-2.6'])
const FALLBACK_MODELS = [
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

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || ''
}

function getReferer() {
  return process.env.API_BASE_URL || 'https://nodalpoint.io'
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function buildPrompt(payload: Record<string, unknown>) {
  const projectName = normalizeText(payload.projectName)
  const editBrief = normalizeText(payload.editBrief)
  const sourceClipUrl = normalizeText(payload.sourceClipUrl)
  const sourceVideoName = normalizeText(payload.sourceVideoName)
  const editGoal = normalizeText(payload.editGoal)
  const styleNotes = normalizeText(payload.styleNotes)
  const safetyNotes = normalizeText(payload.safetyNotes)
  const subject = normalizeText(payload.subject) || 'Nodal Point video edit'

  const promptParts = [
    `Project: ${projectName || subject}`,
    `Edit goal: ${editGoal || 'Create a usable AI-generated clip that fits a Nodal Point edit.'}`,
    `Brief: ${editBrief || 'No brief provided.'}`,
    sourceClipUrl ? `Source clip context: ${sourceClipUrl}` : '',
    sourceVideoName ? `Uploaded source video: ${sourceVideoName}` : '',
    styleNotes ? `Style notes: ${styleNotes}` : '',
    safetyNotes ? `Constraints: ${safetyNotes}` : '',
    'Keep the result clean, premium, and useful for a dark forensic business brand.',
    'Avoid childish motion, random color shifts, and anything that would feel off-brand inside Nodal Point.',
  ]

  return promptParts.filter(Boolean).join('\n')
}

function buildFrameImages(payload: Record<string, unknown>) {
  const referenceImage = normalizeText(payload.referenceImage)
  const referenceRole = normalizeText(payload.referenceRole) === 'last_frame' ? 'last_frame' : 'first_frame'
  const referenceMode = normalizeText(payload.referenceMode) === 'reference' ? 'reference' : 'frame'

  if (!referenceImage) return { frame_images: undefined, input_references: undefined }

  if (referenceMode === 'reference') {
    return {
      frame_images: undefined,
      input_references: [
        {
          type: 'image_url',
          image_url: { url: referenceImage },
        },
      ],
    }
  }

  return {
    frame_images: [
      {
        type: 'image_url',
        image_url: { url: referenceImage },
        frame_type: referenceRole,
      },
    ],
    input_references: undefined,
  }
}

function parseJsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function parseTimelineState(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? normalizeTimeline(value as any) : null
}

function mapJobRow(row: Record<string, any>) {
  const metadata = parseJsonObject(row.metadata)
  const usagePayload = parseJsonObject(row.usage_payload)
  const providerData = parseJsonObject(metadata.providerData)
  const unsignedUrls = Array.isArray(metadata.unsigned_urls)
    ? metadata.unsigned_urls
    : Array.isArray(providerData.unsigned_urls)
      ? providerData.unsigned_urls
      : undefined

  return {
    id: String(row.id),
    generation_id: row.external_job_id || metadata.generation_id || providerData.id || null,
    polling_url: row.polling_url || metadata.polling_url || providerData.polling_url || null,
    status: String(row.status || 'pending'),
    model: String(row.model || ''),
    prompt: String(row.prompt || ''),
    projectName: String(row.project_name || ''),
    editGoal: row.edit_goal ?? null,
    editBrief: row.edit_brief ?? null,
    styleNotes: row.style_notes ?? null,
    safetyNotes: row.safety_notes ?? null,
    sourceClipUrl: row.source_clip_url ?? null,
    sourceVideoName: row.source_video_name ?? null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    aspectRatio: String(row.aspect_ratio || '16:9'),
    duration: Number(row.duration || 8),
    resolution: String(row.resolution || '720p'),
    referenceMode: row.reference_mode === 'reference' ? 'reference' : 'frame',
    referenceRole: row.reference_role === 'last_frame' ? 'last_frame' : 'first_frame',
    referenceImageName: row.reference_image_name ?? null,
    unsigned_urls: unsignedUrls || null,
    outputUrl: row.output_url || unsignedUrls?.[0] || providerData.output_url || null,
    error: row.error ?? null,
    usage: {
      cost: row.usage_cost != null ? Number(row.usage_cost) : usagePayload.cost ?? null,
      is_byok: usagePayload.is_byok ?? null,
    },
    timeline: parseTimelineState(metadata.timeline || metadata.timelineState),
  }
}

async function loadJobsForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('video_studio_jobs')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    throw error
  }

  return Array.isArray(data) ? data.map((row) => mapJobRow(row)) : []
}

async function syncJobStatus(userId: string, jobId: string, apiKey: string) {
  const { data: existingRow, error: fetchError } = await supabaseAdmin
    .from('video_studio_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (!existingRow) {
    return null
  }

  const externalJobId = normalizeText(existingRow.external_job_id)
  if (!externalJobId) {
    return mapJobRow(existingRow)
  }

  const response = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(externalJobId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Failed to load video job')
  }

  const providerData = parseJsonObject(data)
  const usageData = parseJsonObject(providerData.usage)
  const nextMetadata = {
    ...(parseJsonObject(existingRow.metadata) || {}),
    providerData,
    lastPolledAt: new Date().toISOString(),
  }

  const outputUrl =
    normalizeText(providerData.output_url) ||
    (Array.isArray(providerData.unsigned_urls) ? normalizeText(providerData.unsigned_urls[0]) : '') ||
    normalizeText(existingRow.output_url)

  const updatePayload: Record<string, unknown> = {
    status: normalizeText(providerData.status) || existingRow.status,
    output_url: outputUrl || null,
    error: providerData.error || providerData.message || null,
    usage_cost: usageData.cost ?? existingRow.usage_cost ?? null,
    usage_payload: usageData && Object.keys(usageData).length > 0 ? usageData : existingRow.usage_payload || {},
    metadata: nextMetadata,
    updated_at: new Date().toISOString(),
  }

  if (providerData.polling_url) {
    updatePayload.polling_url = normalizeText(providerData.polling_url)
  }

  const { error: updateError } = await supabaseAdmin
    .from('video_studio_jobs')
    .update(updatePayload)
    .eq('id', existingRow.id)
    .eq('owner_id', userId)

  if (updateError) {
    throw updateError
  }

  const { data: refreshedRow, error: refreshedError } = await supabaseAdmin
    .from('video_studio_jobs')
    .select('*')
    .eq('id', existingRow.id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (refreshedError) {
    throw refreshedError
  }

  return refreshedRow ? mapJobRow(refreshedRow) : mapJobRow({ ...existingRow, ...updatePayload })
}

export default async function handler(req: any, res: any) {
  const { user, isAdmin } = await requireUser(req)

  if (!user || !isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const apiKey = getOpenRouterKey()
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' })
  }

  if (req.method === 'GET') {
    const jobId = normalizeText(req.query?.jobId)

    try {
      const jobs = await loadJobsForUser(user.id)

      if (jobId) {
        const job = await syncJobStatus(user.id, jobId, apiKey)
        return res.status(200).json({
          models: [],
          job,
          jobs,
        })
      }

      const response = await fetch('https://openrouter.ai/api/v1/videos/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      const data = await response.json().catch(() => ({}))

      const allowedModels = response.ok && Array.isArray(data?.data)
        ? data.data.filter((model: any) => ALLOWED_MODELS.has(String(model?.id || '').trim()))
        : FALLBACK_MODELS

      return res.status(200).json({
        models: allowedModels,
        jobs,
        error: response.ok ? undefined : data?.error || data?.message || 'Failed to load video studio data',
      })
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message || 'Failed to load video studio data',
      })
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {}
    const action = normalizeText(body.action) === 'save' ? 'save' : 'generate'
    const jobId = normalizeText(body.jobId)
    const recordId = jobId || crypto.randomUUID()
    const model = normalizeText(body.model)
    const prompt = buildPrompt(body)
    const timeline = parseTimelineState(body.timeline)

    if (action !== 'save' && !ALLOWED_MODELS.has(model)) {
      return res.status(400).json({ error: 'Unsupported video model' })
    }

    if (!prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const duration = Number(body.duration)
    const aspectRatio = normalizeText(body.aspectRatio) || '16:9'
    const resolution = normalizeText(body.resolution) || '720p'
    const { frame_images, input_references } = buildFrameImages(body)
    const now = new Date().toISOString()

    const baseRecord = {
      id: recordId,
      owner_id: user.id,
      owner_email: normalizeText(user.email) || null,
      project_name: normalizeText(body.projectName) || normalizeText(body.subject) || 'Nodal Point video edit',
      edit_goal: normalizeText(body.editGoal) || null,
      edit_brief: normalizeText(body.editBrief) || null,
      style_notes: normalizeText(body.styleNotes) || null,
      safety_notes: normalizeText(body.safetyNotes) || null,
      source_clip_url: normalizeText(body.sourceClipUrl) || null,
      source_video_name: normalizeText(body.sourceVideoName) || null,
      model: model || Array.from(ALLOWED_MODELS)[0],
      aspect_ratio: aspectRatio,
      duration: [5, 8].includes(duration) ? duration : 8,
      resolution,
      reference_mode: normalizeText(body.referenceMode) === 'reference' ? 'reference' : 'frame',
      reference_role: normalizeText(body.referenceRole) === 'last_frame' ? 'last_frame' : 'first_frame',
      reference_image_name: normalizeText(body.referenceImageName) || null,
      prompt,
      updated_at: now,
    }

    if (action === 'save') {
      try {
        const { data: savedRow, error: saveError } = await supabaseAdmin
          .from('video_studio_jobs')
          .upsert({
            ...baseRecord,
            status: 'draft',
            external_job_id: null,
            polling_url: null,
            output_url: null,
            error: null,
            usage_cost: null,
            usage_payload: {},
            metadata: {
              timeline: timeline || null,
              savedAt: now,
            },
          }, { onConflict: 'id' })
          .select('*')
          .single()

        if (saveError) {
          return res.status(500).json({
            error: saveError.message || 'Failed to save video draft',
          })
        }

        return res.status(200).json({
          job: mapJobRow(savedRow),
          prompt,
        })
      } catch (error: any) {
        return res.status(500).json({
          error: error?.message || 'Failed to save video draft',
        })
      }
    }

    const payload: Record<string, unknown> = {
      model,
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
    }

    if ([5, 8].includes(duration)) {
      payload.duration = duration
    }

    if (frame_images) payload.frame_images = frame_images
    if (input_references) payload.input_references = input_references

    try {
      const response = await fetch('https://openrouter.ai/api/v1/videos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': getReferer(),
          'X-Title': 'Nodal Point CRM',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        return res.status(response.status).json({
          error: data?.error || data?.message || 'Video generation failed',
          details: data,
        })
      }

      const providerData = parseJsonObject(data)
      const externalJobId = normalizeText(providerData.id || providerData.generation_id)
      const pollingUrl = normalizeText(providerData.polling_url || providerData.url)
      const unsignedUrls = Array.isArray(providerData.unsigned_urls) ? providerData.unsigned_urls : []
      const outputUrl = normalizeText(providerData.output_url || unsignedUrls[0])
      const now = new Date().toISOString()

      const { data: insertedRow, error: insertError } = await supabaseAdmin
        .from('video_studio_jobs')
        .upsert({
          ...baseRecord,
          external_job_id: externalJobId || null,
          polling_url: pollingUrl || null,
          status: normalizeText(providerData.status) || 'pending',
          output_url: outputUrl || null,
          error: providerData.error || null,
          usage_cost: providerData.usage?.cost ?? null,
          usage_payload: parseJsonObject(providerData.usage),
          metadata: {
            providerData,
            unsigned_urls: unsignedUrls,
            timeline: timeline || null,
            createdAt: now,
          },
        }, { onConflict: 'id' })
        .select('*')
        .single()

      if (insertError) {
        return res.status(500).json({
          error: insertError.message || 'Failed to save video job',
          job: providerData,
          prompt,
        })
      }

      return res.status(200).json({
        job: mapJobRow(insertedRow),
        prompt,
      })
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message || 'Video generation failed',
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
