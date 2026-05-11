import twilio from 'twilio'
import { supabaseAdmin } from './supabase'
import {
  getOutboundVoicemailDropForTwilioNumber,
  resolveUserForBusinessNumber,
} from './voicemail'

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value == null) return ''
  return String(value).trim()
}

export interface TriggerOutboundVoicemailDropParams {
  callSid: string
  businessNumber?: string | null
  candidateIdentifiers?: Array<string | null | undefined>
}

export interface TriggerOutboundVoicemailDropResult {
  status: 'dropped' | 'missing-config' | 'failed' | 'skipped'
  playUrl?: string
  reason?: string
}

export async function triggerOutboundVoicemailDrop({
  callSid,
  businessNumber,
  candidateIdentifiers = [],
}: TriggerOutboundVoicemailDropParams): Promise<TriggerOutboundVoicemailDropResult> {
  const normalizedCallSid = toText(callSid)
  if (!normalizedCallSid) {
    return {
      status: 'skipped',
      reason: 'missing-call-sid',
    }
  }

  const identifiers = Array.from(
    new Set(
      [businessNumber, ...candidateIdentifiers]
        .map((value) => toText(value))
        .filter(Boolean)
    )
  )

  const primaryIdentifier = identifiers[0] || ''
  if (!primaryIdentifier) {
    return {
      status: 'missing-config',
      reason: 'missing-business-number',
    }
  }

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, email, settings')
    .limit(1000)

  if (error) {
    return {
      status: 'failed',
      reason: error.message || 'failed-to-load-users',
    }
  }

  const matchedUser = identifiers
    .map((identifier) => resolveUserForBusinessNumber(users, identifier))
    .find(Boolean) || null
  const settings = matchedUser?.settings || {}
  let outboundVoicemailDrop = null

  for (const identifier of identifiers) {
    outboundVoicemailDrop = getOutboundVoicemailDropForTwilioNumber(settings, identifier)
    if (outboundVoicemailDrop?.publicUrl) {
      break
    }
  }

  if (!outboundVoicemailDrop?.publicUrl || !outboundVoicemailDrop?.enabled) {
    return {
      status: 'missing-config',
      reason: matchedUser ? 'no-enabled-voicemail-drop' : 'no-matching-user',
    }
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return {
      status: 'failed',
      reason: 'missing-twilio-credentials',
    }
  }

  const client = twilio(accountSid, authToken)
  const twiml = new twilio.twiml.VoiceResponse()
  const playUrl =
    outboundVoicemailDrop.publicUrl +
    (outboundVoicemailDrop.publicUrl.includes('?') ? '&' : '?') +
    `cb=${Date.now()}`

  twiml.play(playUrl)
  twiml.hangup()

  await client.calls(normalizedCallSid).update({
    twiml: twiml.toString(),
  })

  // Update call record in database with voicemail drop metadata
  try {
    // First, fetch the existing call to get current metadata
    const { data: existingCall } = await supabaseAdmin
      .from('calls')
      .select('metadata')
      .eq('callSid', normalizedCallSid)
      .single()

    const currentMetadata = existingCall?.metadata || {}
    const updatedMetadata = {
      ...currentMetadata,
      answeredBy: 'machine_start',
      voicemailDropStatus: 'dropped',
      voicemailDropAt: new Date().toISOString(),
      voicemailDropUrl: playUrl,
      voicemailDropType: 'manual',
    }

    const { error: updateError } = await supabaseAdmin
      .from('calls')
      .update({ metadata: updatedMetadata })
      .eq('callSid', normalizedCallSid)

    if (updateError) {
      console.error('[Voicemail Drop] Failed to update call metadata:', updateError)
    }
  } catch (metadataError) {
    console.error('[Voicemail Drop] Error updating metadata:', metadataError)
  }

  return {
    status: 'dropped',
    playUrl,
  }
}
