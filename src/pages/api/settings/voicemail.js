import logger from '../_logger.js'
import { supabaseAdmin, requireUser } from '../../../lib/supabase.ts'
import { VOICEMAIL_BUCKET, buildVoicemailStoragePath, getVoicemailGreeting, normalizeVoicemailGreeting } from '../../../lib/voicemail.ts'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}

async function ensureVoicemailBucket() {
  const { data: bucket, error: bucketError } = await supabaseAdmin.storage.getBucket(VOICEMAIL_BUCKET)
  if (!bucketError && bucket) {
    if (!bucket.public) {
      const { error: updateError } = await supabaseAdmin.storage.updateBucket(VOICEMAIL_BUCKET, {
        public: true,
        fileSizeLimit: 15 * 1024 * 1024,
        allowedMimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
      })

      if (updateError) {
        throw new Error(`Unable to make voicemail bucket public: ${updateError.message}`)
      }
    }

    return bucket
  }

  if (bucketError?.status && bucketError.status !== 404) {
    throw new Error(`Unable to inspect voicemail bucket: ${bucketError.message}`)
  }

  const { data, error } = await supabaseAdmin.storage.createBucket(VOICEMAIL_BUCKET, {
    public: true,
    fileSizeLimit: 15 * 1024 * 1024,
    allowedMimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  })

  if (error) {
    throw new Error(`Unable to create voicemail bucket: ${error.message}`)
  }

  return data
}

function decodeAudioDataUrl(audioDataUrl) {
  if (!audioDataUrl || typeof audioDataUrl !== 'string') {
    throw new Error('Missing audio data')
  }

  const match = audioDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid audio payload')
  }

  const mimeType = match[1]
  const base64 = match[2]
  return {
    mimeType,
    buffer: Buffer.from(base64, 'base64'),
  }
}

async function loadUserSettings(emailLower) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, settings')
    .eq('email', emailLower)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to load user settings: ${error.message}`)
  }

  return data || null
}

async function updateUserSettings(emailLower, updates) {
  const { error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('email', emailLower)

  if (error) {
    throw new Error(`Unable to update user settings: ${error.message}`)
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const auth = await requireUser(req)
    if (!auth?.email) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    const emailLower = auth.email.toLowerCase().trim()
    const userRow = await loadUserSettings(emailLower)
    if (!userRow) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'User profile not found' }))
      return
    }

    const settings = (userRow.settings && typeof userRow.settings === 'object' ? userRow.settings : {}) || {}

    if (req.method === 'DELETE') {
      const existingGreeting = getVoicemailGreeting(settings)
      if (existingGreeting?.storagePath) {
        try {
          await supabaseAdmin.storage.from(VOICEMAIL_BUCKET).remove([existingGreeting.storagePath])
        } catch (removeError) {
          logger.warn('[Voicemail] Failed to remove stored audio:', removeError?.message || removeError)
        }
      }

      const nextSettings = {
        ...settings,
        voicemailGreeting: null,
      }

      await updateUserSettings(emailLower, {
        settings: nextSettings,
        updated_at: new Date().toISOString(),
      })

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, voicemailGreeting: null }))
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const audioDataUrl = body.audioDataUrl || body.audioData || ''
    const { mimeType, buffer } = decodeAudioDataUrl(audioDataUrl)

    if (!buffer || !buffer.length) {
      throw new Error('Audio file is empty')
    }

    if (!['audio/wav', 'audio/x-wav', 'audio/wave'].includes(mimeType)) {
      throw new Error('Voicemail must be a WAV file')
    }

    await ensureVoicemailBucket()

    const storagePath = buildVoicemailStoragePath(userRow.id || auth.id || emailLower)
    const { error: uploadError } = await supabaseAdmin.storage
      .from(VOICEMAIL_BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'audio/wav',
        upsert: true,
        cacheControl: '3600',
      })

    if (uploadError) {
      throw new Error(`Failed to upload voicemail: ${uploadError.message}`)
    }

    const { data: publicData } = supabaseAdmin.storage
      .from(VOICEMAIL_BUCKET)
      .getPublicUrl(storagePath)

    const voicemailGreeting = normalizeVoicemailGreeting({
      enabled: true,
      publicUrl: publicData?.publicUrl || null,
      storagePath,
      fileName: 'greeting.wav',
      mimeType: 'audio/wav',
      updatedAt: new Date().toISOString(),
    })

    const nextSettings = {
      ...settings,
      voicemailGreeting,
    }

    await updateUserSettings(emailLower, {
      settings: nextSettings,
      updated_at: new Date().toISOString(),
    })

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      ok: true,
      voicemailGreeting,
      storagePath,
    }))
    return
  } catch (error) {
    logger.error('[Voicemail] Error:', error?.message || error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: error?.message || 'Failed to update voicemail' }))
  }
}
