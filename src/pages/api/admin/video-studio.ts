import { requireUser } from '@/lib/supabase'

const ALLOWED_MODELS = new Set([
  'google/veo-3.1-lite',
  'alibaba/wan-2.6',
])

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
      const url = jobId
        ? `https://openrouter.ai/api/v1/videos/${encodeURIComponent(jobId)}`
        : 'https://openrouter.ai/api/v1/videos/models'

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        return res.status(response.status).json({
          error: data?.error || data?.message || 'Failed to load video studio data',
        })
      }

      if (jobId) {
        return res.status(200).json({
          job: data,
        })
      }

      const allowedModels = Array.isArray(data?.data)
        ? data.data.filter((model: any) => ALLOWED_MODELS.has(String(model?.id || '').trim()))
        : []

      return res.status(200).json({
        models: allowedModels,
      })
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message || 'Failed to load video studio data',
      })
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {}
    const model = normalizeText(body.model)

    if (!ALLOWED_MODELS.has(model)) {
      return res.status(400).json({ error: 'Unsupported video model' })
    }

    const prompt = buildPrompt(body)
    if (!prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const duration = Number(body.duration)
    const aspectRatio = normalizeText(body.aspectRatio) || '16:9'
    const resolution = normalizeText(body.resolution) || '720p'
    const { frame_images, input_references } = buildFrameImages(body)

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

      return res.status(200).json({
        job: data,
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
