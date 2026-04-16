import logger from '../_logger.js'
import twilio from 'twilio'
import { supabaseAdmin, requireUser } from '../../../lib/supabase.ts'
import {
  VOICEMAIL_BUCKET,
  buildOutboundVoicemailStoragePath,
  getSelectedTwilioNumberEntry,
  getTwilioNumberEntries,
  getTwilioNumberEntryForIdentifier,
  getOutboundVoicemailDrop,
  getOutboundVoicemailDropForTwilioNumber,
  normalizePhoneNumber,
  normalizeOutboundVoicemailDrop,
} from '../../../lib/voicemail.ts'

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

  const bucketMissing = bucketError && (
    bucketError.status === 404 ||
    bucketError.status === 400 ||
    /bucket not found/i.test(bucketError.message || '')
  )

  if (bucketError && !bucketMissing) {
    throw new Error(`Unable to inspect voicemail bucket: ${bucketError.message}`)
  }

  const { data, error } = await supabaseAdmin.storage.createBucket(VOICEMAIL_BUCKET, {
    public: true,
    fileSizeLimit: 15 * 1024 * 1024,
    allowedMimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  })

  if (error) {
    if (/already exists/i.test(error.message || '')) {
      const { data: existingBucket, error: refetchError } = await supabaseAdmin.storage.getBucket(VOICEMAIL_BUCKET)
      if (refetchError) {
        throw new Error(`Unable to verify voicemail bucket after create: ${refetchError.message}`)
      }

      if (existingBucket && !existingBucket.public) {
        const { error: updateError } = await supabaseAdmin.storage.updateBucket(VOICEMAIL_BUCKET, {
          public: true,
          fileSizeLimit: 15 * 1024 * 1024,
          allowedMimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
        })

        if (updateError) {
          throw new Error(`Unable to make voicemail bucket public: ${updateError.message}`)
        }
      }

      return existingBucket
    }

    throw new Error(`Unable to create voicemail bucket: ${error.message}`)
  }

  return data
}

const TWILIO_INCOMING_NUMBERS_CACHE_TTL = 5 * 60 * 1000
let twilioIncomingNumbersCache = []
let twilioIncomingNumbersCacheUpdatedAt = 0

function toText(value) {
  if (typeof value === 'string') return value.trim()
  if (value == null) return ''
  return String(value).trim()
}

async function getTwilioIncomingNumbers() {
  const now = Date.now()
  if (twilioIncomingNumbersCacheUpdatedAt && now - twilioIncomingNumbersCacheUpdatedAt < TWILIO_INCOMING_NUMBERS_CACHE_TTL && twilioIncomingNumbersCache.length) {
    return twilioIncomingNumbersCache
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return twilioIncomingNumbersCache
  }

  try {
    const client = twilio(accountSid, authToken)
    const list = await client.incomingPhoneNumbers.list({ limit: 1000 })
    twilioIncomingNumbersCache = list
      .map((item) => ({
        sid: item.sid || null,
        number: normalizePhoneNumber(item.phoneNumber) || (item.phoneNumber ? String(item.phoneNumber).trim() : null),
        name: item.friendlyName || null,
      }))
      .filter((item) => Boolean(item.number))
    twilioIncomingNumbersCacheUpdatedAt = now
  } catch (error) {
    logger.warn('[OutboundVoicemail] Failed to load Twilio numbers:', error?.message || error)
  }

  return twilioIncomingNumbersCache
}

async function resolveTwilioNumberDetails(identifier) {
  const normalizedIdentifier = toText(identifier)
  const identifierDigits = normalizedIdentifier.replace(/\D/g, '')
  if (!normalizedIdentifier && !identifierDigits) return null

  const numbers = await getTwilioIncomingNumbers()
  return numbers.find((item) => {
    if (item.sid && normalizedIdentifier && item.sid === normalizedIdentifier) return true

    const itemNumber = toText(item.number)
    const normalizedItemNumber = normalizePhoneNumber(itemNumber)
    const normalizedInputNumber = normalizePhoneNumber(normalizedIdentifier)
    if (normalizedItemNumber && normalizedInputNumber && normalizedItemNumber === normalizedInputNumber) return true

    if (identifierDigits && itemNumber.replace(/\D/g, '') === identifierDigits) return true

    return false
  }) || null
}

async function resolveTargetTwilioNumber(settings, body) {
  const selectedEntry = getSelectedTwilioNumberEntry(settings)
  const requestedSid = toText(body?.twilioNumberSid || body?.selectedTwilioNumberSid || body?.businessPhoneSid || '')
  const selectedPhoneValue = typeof settings?.selectedPhoneNumber === 'string'
    ? settings.selectedPhoneNumber
    : typeof settings?.selectedPhoneNumber === 'object' && settings.selectedPhoneNumber?.number
      ? settings.selectedPhoneNumber.number
      : ''
  const requestedPhoneNumber = toText(body?.selectedPhoneNumber || body?.phoneNumber || body?.number || body?.businessPhone || selectedPhoneValue || selectedEntry?.number || '')

  let entry = null
  if (requestedSid) {
    entry = getTwilioNumberEntryForIdentifier(settings, requestedSid)
  }
  if (!entry && requestedPhoneNumber) {
    entry = getTwilioNumberEntryForIdentifier(settings, requestedPhoneNumber)
  }
  if (!entry && selectedEntry) {
    entry = selectedEntry
  }

  let sid = requestedSid || entry?.sid || null
  let number = requestedPhoneNumber || entry?.number || selectedEntry?.number || null
  let name = toText(body?.twilioNumberName || body?.selectedTwilioNumberName || entry?.name || selectedEntry?.name || '')

  if (!sid && number) {
    const details = await resolveTwilioNumberDetails(number)
    sid = details?.sid || null
    if (!name) {
      name = details?.name || ''
    }
  }

  if (!number && entry?.number) {
    number = entry.number
  }

  if (!name) {
    name = entry?.name || selectedEntry?.name || 'Primary'
  }

  return {
    entry,
    sid: sid || null,
    number: number || null,
    name: name || 'Primary',
  }
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
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const resolvedTarget = await resolveTargetTwilioNumber(settings, body)
      const targetIdentifier = resolvedTarget.sid || resolvedTarget.number || settings.selectedPhoneNumber || null
      const existingDrop = getOutboundVoicemailDropForTwilioNumber(settings, targetIdentifier) || getOutboundVoicemailDrop(settings)

      if (existingDrop?.storagePath) {
        try {
          await supabaseAdmin.storage.from(VOICEMAIL_BUCKET).remove([existingDrop.storagePath])
        } catch (removeError) {
          logger.warn('[OutboundVoicemail] Failed to remove stored audio:', removeError?.message || removeError)
        }
      }

      const nextTwilioNumbers = getTwilioNumberEntries(settings).map((entry) => {
        if (resolvedTarget.sid && entry.sid && entry.sid === resolvedTarget.sid) {
          return {
            ...entry,
            outboundVoicemailDrop: null,
          }
        }

        if (resolvedTarget.number && normalizePhoneNumber(entry.number) === normalizePhoneNumber(resolvedTarget.number)) {
          return {
            ...entry,
            outboundVoicemailDrop: null,
          }
        }

        if (!resolvedTarget.sid && !resolvedTarget.number && entry.selected) {
          return {
            ...entry,
            outboundVoicemailDrop: null,
          }
        }

        return entry
      })

      const nextSettings = {
        ...settings,
        twilioNumbers: nextTwilioNumbers,
        outboundVoicemailDrop: null,
      }

      await updateUserSettings(emailLower, {
        settings: nextSettings,
        updated_at: new Date().toISOString(),
      })

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, outboundVoicemailDrop: null }))
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const audioDataUrl = body.audioDataUrl || body.audioData || ''
    const { mimeType, buffer } = decodeAudioDataUrl(audioDataUrl)
    const resolvedTarget = await resolveTargetTwilioNumber(settings, body)
    const targetIdentifier = resolvedTarget.sid || resolvedTarget.number || settings.selectedPhoneNumber || null
    const existingDrop = getOutboundVoicemailDropForTwilioNumber(settings, targetIdentifier)

    if (!buffer || !buffer.length) {
      throw new Error('Audio file is empty')
    }

    if (!['audio/wav', 'audio/x-wav', 'audio/wave'].includes(mimeType)) {
      throw new Error('Voicemail must be a WAV file')
    }

    await ensureVoicemailBucket()

    const storagePath = buildOutboundVoicemailStoragePath(resolvedTarget.sid || resolvedTarget.number || userRow.id || auth.id || emailLower)
    const { error: uploadError } = await supabaseAdmin.storage
      .from(VOICEMAIL_BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'audio/wav',
        upsert: true,
        cacheControl: '3600',
      })

    if (uploadError) {
      throw new Error(`Failed to upload outbound voicemail: ${uploadError.message}`)
    }

    const { data: publicData } = supabaseAdmin.storage
      .from(VOICEMAIL_BUCKET)
      .getPublicUrl(storagePath)

    const outboundVoicemailDrop = normalizeOutboundVoicemailDrop({
      enabled: true,
      publicUrl: publicData?.publicUrl || null,
      storagePath,
      fileName: 'outbound-drop.wav',
      mimeType: 'audio/wav',
      updatedAt: new Date().toISOString(),
      twilioNumberSid: resolvedTarget.sid || null,
      twilioNumber: resolvedTarget.number || null,
      twilioNumberName: resolvedTarget.name || null,
    })

    const nextTwilioNumbers = getTwilioNumberEntries(settings)
    const targetIndex = nextTwilioNumbers.findIndex((entry) => {
      if (resolvedTarget.sid && entry.sid && entry.sid === resolvedTarget.sid) return true
      if (resolvedTarget.number && normalizePhoneNumber(entry.number) === normalizePhoneNumber(resolvedTarget.number)) return true
      return false
    })

    if (targetIndex === -1 && resolvedTarget.number) {
      nextTwilioNumbers.push({
        name: resolvedTarget.name || 'Primary',
        number: resolvedTarget.number,
        sid: resolvedTarget.sid || null,
        selected: Boolean(
          normalizePhoneNumber(settings.selectedPhoneNumber || '') &&
          normalizePhoneNumber(settings.selectedPhoneNumber || '') === normalizePhoneNumber(resolvedTarget.number)
        ),
        voicemailGreeting: null,
        outboundVoicemailDrop,
      })
    } else if (targetIndex !== -1) {
      nextTwilioNumbers[targetIndex] = {
        ...nextTwilioNumbers[targetIndex],
        name: resolvedTarget.name || nextTwilioNumbers[targetIndex].name || 'Primary',
        number: resolvedTarget.number || nextTwilioNumbers[targetIndex].number,
        sid: resolvedTarget.sid || nextTwilioNumbers[targetIndex].sid || null,
        outboundVoicemailDrop,
      }
    }

    const nextSettings = {
      ...settings,
      twilioNumbers: nextTwilioNumbers,
      outboundVoicemailDrop,
    }

    await updateUserSettings(emailLower, {
      settings: nextSettings,
      updated_at: new Date().toISOString(),
    })

    if (existingDrop?.storagePath && existingDrop.storagePath !== storagePath) {
      try {
        await supabaseAdmin.storage.from(VOICEMAIL_BUCKET).remove([existingDrop.storagePath])
      } catch (removeError) {
        logger.warn('[OutboundVoicemail] Failed to clean previous outbound voicemail audio:', removeError?.message || removeError)
      }
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      ok: true,
      outboundVoicemailDrop,
      storagePath,
      twilioNumberSid: outboundVoicemailDrop.twilioNumberSid,
      twilioNumber: outboundVoicemailDrop.twilioNumber,
      twilioNumberName: outboundVoicemailDrop.twilioNumberName,
    }))
    return
  } catch (error) {
    logger.error('[OutboundVoicemail] Error:', error?.message || error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: error?.message || 'Failed to update outbound voicemail' }))
  }
}
