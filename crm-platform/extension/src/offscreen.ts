import { Call, Device } from '@twilio/voice-sdk'
import { formatPhone, normalizeOrigin, resolveCallerId, trimText } from './shared'

type InitPayload = {
  identity?: string
  apiBase?: string
  callerId?: string | null
  auth?: unknown
}

type DialPayload = {
  to?: string
  callerId?: string | null
  metadata?: Record<string, unknown> | string | null
}

type EventPayload = Record<string, unknown> & {
  kind: string
}

let device: Device | null = null
let currentCall: Call | null = null
let incomingCall: Call | null = null
let currentIdentity = ''
let currentApiBase = ''
let currentCallerId = ''
let lastToken = ''

const wiredCalls = new WeakSet<Call>()

function postEvent(kind: string, payload: Record<string, unknown> = {}) {
  const message = { type: 'TWILIO_EVENT', payload: { kind, ...payload } satisfies EventPayload }
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError
  })
}

function getBaseOrigin(apiBase?: string | null) {
  const normalized = normalizeOrigin(apiBase || currentApiBase || '') || ''
  if (normalized.startsWith('chrome-extension://')) {
    return 'https://www.nodalpoint.io'
  }
  return normalized || 'https://www.nodalpoint.io'
}

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access is not available in this browser.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
}

async function fetchToken(identity: string, apiBase: string) {
  const origin = getBaseOrigin(apiBase)
  const response = await fetch(`${origin}/api/twilio/token?identity=${encodeURIComponent(identity)}`, {
    method: 'GET',
  })
  const text = await response.text()
  let data: any = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.message || data.error : data
    throw new Error(String(message || `Failed to fetch token (${response.status})`))
  }

  const token = trimText(data?.token)
  if (!token) {
    throw new Error('Twilio token response was empty.')
  }

  return token
}

function getCallParams(call: any) {
  return (call?.parameters && typeof call.parameters === 'object' ? call.parameters : {}) as Record<string, unknown>
}

function getCallSid(call: Call | null) {
  if (!call) return null
  const params = getCallParams(call)
  return trimText(params.CallSid || params.callSid || params.sid || params.call_sid || '') || null
}

function getCallDirection(call: Call | null) {
  if (!call) return null
  const params = getCallParams(call)
  return trimText(params.CallDirection || params.direction || '') || null
}

function getFromNumber(call: Call | null) {
  if (!call) return null
  const params = getCallParams(call)
  return trimText(params.originalCaller || params.From || params.from || params.To || params.to || '') || null
}

function getDisplayName(call: Call | null) {
  if (!call) return null
  const params = getCallParams(call)
  const candidates = [
    params.displayName,
    params.label,
    params.contactName,
    params.accountName,
    params.originalCallerName,
  ]
  for (const candidate of candidates) {
    const value = trimText(candidate)
    if (value) return value
  }
  const from = getFromNumber(call)
  return from ? formatPhone(from) || from : null
}

function setAudioDevices(nextDevice: Device) {
  const audio = nextDevice.audio
  if (!audio) return

  try {
    audio.setAudioConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 2,
    })
  } catch {
    // ignore
  }

  try {
    const setup = async () => {
      if (!nextDevice.audio) return

      const inputDevices = nextDevice.audio.availableInputDevices
      if (inputDevices && inputDevices.size > 0) {
        const keys = Array.from(inputDevices.keys())
        const inputDeviceId = keys.includes('default') ? 'default' : keys[0]
        try {
          await nextDevice.audio.setInputDevice(inputDeviceId)
        } catch {
          // ignore
        }
      }

      if (nextDevice.audio.isOutputSelectionSupported) {
        const outputDevices = nextDevice.audio.availableOutputDevices
        if (outputDevices && outputDevices.size > 0) {
          const keys = Array.from(outputDevices.keys())
          const outputDeviceId = keys.includes('default') ? 'default' : keys[0]
          try {
            nextDevice.audio.speakerDevices.set(outputDeviceId)
          } catch {
            // ignore
          }
        }
      }
    }

    void setup()
  } catch {
    // ignore
  }
}

function attachCallListeners(call: Call, kind: 'outgoing' | 'incoming') {
  if (wiredCalls.has(call)) return
  wiredCalls.add(call)

  const startedAt = Date.now()

  call.on('accept', () => {
    currentCall = call
    if (incomingCall === call) {
      incomingCall = null
    }
    postEvent('connected', {
      callSid: getCallSid(call),
      from: getFromNumber(call),
      direction: kind,
      muted: typeof call.isMuted === 'function' ? call.isMuted() : false,
      displayName: getDisplayName(call),
    })
  })

  call.on('disconnect', () => {
    if (currentCall === call) currentCall = null
    if (incomingCall === call) incomingCall = null
    postEvent('ended', {
      callSid: getCallSid(call),
      from: getFromNumber(call),
      direction: kind,
      durationSec: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    })
  })

  call.on('cancel', () => {
    if (currentCall === call) currentCall = null
    if (incomingCall === call) incomingCall = null
    postEvent('cancelled', {
      callSid: getCallSid(call),
      from: getFromNumber(call),
      direction: kind,
      durationSec: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    })
  })

  call.on('error', (error: any) => {
    if (currentCall === call) currentCall = null
    if (incomingCall === call) incomingCall = null
    postEvent('error', {
      callSid: getCallSid(call),
      from: getFromNumber(call),
      direction: kind,
      code: error?.code ?? null,
      message: trimText(error?.message || 'Twilio call error'),
    })
  })

  call.on('mute', () => {
    postEvent('muted', {
      callSid: getCallSid(call),
      muted: typeof call.isMuted === 'function' ? call.isMuted() : false,
    })
  })
}

async function refreshToken() {
  if (!device || !currentIdentity || !currentApiBase) return

  try {
    const token = await fetchToken(currentIdentity, currentApiBase)
    lastToken = token
    await Promise.resolve(device.updateToken(token))
  } catch (error) {
    postEvent('error', {
      message: trimText((error as Error)?.message || 'Failed to refresh Twilio token.'),
    })
  }
}

async function initializeTwilio(payload: InitPayload) {
  const identity = trimText(payload.identity || currentIdentity || 'agent')
  const apiBase = getBaseOrigin(payload.apiBase || currentApiBase)
  const callerId = trimText(payload.callerId || resolveCallerId((payload.auth as any) || null) || '')

  currentIdentity = identity
  currentApiBase = apiBase
  currentCallerId = callerId || currentCallerId

  await requestMicrophonePermission()

  const token = await fetchToken(identity, apiBase)
  lastToken = token

  const canReuseDevice =
    !!device &&
    device.state !== 'destroyed' &&
    currentIdentity === identity &&
    currentApiBase === apiBase

  if (canReuseDevice) {
    try {
      await Promise.resolve(device!.updateToken(token))
      setAudioDevices(device!)
      postEvent('ready', {
        identity,
        callerId: currentCallerId || null,
        reused: true,
      })
      return
    } catch {
      // fall through to recreation
    }
  }

  if (device) {
    try {
      device.destroy()
    } catch {
      // ignore
    }
    device = null
  }

  const nextDevice = new Device(token, {
    codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    enableImprovedSignalingErrorPrecision: true,
    logLevel: 'silent',
    edge: ['ashburn', 'roaming'],
    maxCallSignalingTimeoutMs: 30000,
    tokenRefreshMs: 30000,
  })

  setAudioDevices(nextDevice)

  nextDevice.on('registered', () => {
    postEvent('ready', {
      identity,
      callerId: currentCallerId || null,
      registered: true,
    })
  })

  nextDevice.on('tokenWillExpire', () => {
    void refreshToken()
  })

  nextDevice.on('incoming', (call) => {
    incomingCall = call
    currentCall = null
    attachCallListeners(call, 'incoming')
    postEvent('incoming', {
      callSid: getCallSid(call),
      from: getFromNumber(call),
      displayName: getDisplayName(call),
      direction: getCallDirection(call) || 'incoming',
      contactId: trimText(getCallParams(call).contactId || ''),
      accountId: trimText(getCallParams(call).accountId || ''),
      contactName: trimText(getCallParams(call).contactName || ''),
      accountName: trimText(getCallParams(call).accountName || ''),
    })
  })

  nextDevice.on('error', (error: any) => {
    postEvent('error', {
      code: error?.code ?? null,
      message: trimText(error?.message || 'Twilio device error'),
    })
  })

  nextDevice.on('unregistered', () => {
    postEvent('state', {
      deviceState: 'unregistered',
    })
  })

  await nextDevice.register()
  device = nextDevice
  postEvent('state', {
    deviceState: nextDevice.state,
  })
}

async function dial(payload: DialPayload) {
  if (!device || device.state === 'destroyed') {
    throw new Error('Twilio is not ready yet.')
  }

  if (currentCall || incomingCall) {
    throw new Error('A call is already active.')
  }

  const to = trimText(payload.to || '')
  if (!to) {
    throw new Error('Enter a destination number.')
  }

  const callerId = trimText(payload.callerId || currentCallerId || resolveCallerId(null) || '')
  const metadata = payload.metadata
  const connectParams: Record<string, string> = {
    targetNumber: to,
    callerId,
    metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}),
  }

  const call = await device.connect({
    params: connectParams,
  })

  currentCall = call
  incomingCall = null
  attachCallListeners(call, 'outgoing')

  postEvent('dialing', {
    callSid: getCallSid(call),
    to,
    from: callerId || currentCallerId || null,
    direction: 'outgoing',
  })

  return { ok: true }
}

async function answer() {
  if (!incomingCall) {
    throw new Error('There is no incoming call to answer.')
  }

  const call = incomingCall
  incomingCall = null
  currentCall = call
  attachCallListeners(call, 'incoming')

  await Promise.resolve(call.accept())

  postEvent('state', {
    callSid: getCallSid(call),
    deviceState: device?.state || 'ready',
  })

  return { ok: true }
}

async function hangup() {
  if (currentCall) {
    const call = currentCall
    currentCall = null
    try {
      call.disconnect()
    } catch {
      // ignore
    }
    return { ok: true }
  }

  if (incomingCall) {
    const call = incomingCall
    incomingCall = null
    try {
      call.reject()
    } catch {
      // ignore
    }
    return { ok: true }
  }

  throw new Error('There is no active call to hang up.')
}

async function mute(payload: { muted?: unknown }) {
  if (!currentCall) {
    throw new Error('There is no active call to mute.')
  }

  const muted = Boolean(payload.muted)
  try {
    currentCall.mute(muted)
  } catch {
    throw new Error('Could not change mute state.')
  }

  postEvent('muted', {
    callSid: getCallSid(currentCall),
    muted,
  })

  return { ok: true }
}

async function digits(payload: { digits?: unknown }) {
  if (!currentCall) {
    throw new Error('There is no active call to send digits to.')
  }

  const value = trimText(payload.digits)
  if (!value) {
    throw new Error('Enter digits to send.')
  }

  currentCall.sendDigits(value)
  postEvent('state', {
    callSid: getCallSid(currentCall),
    sentDigits: value,
  })

  return { ok: true }
}

async function disposeTwilio() {
  try {
    if (currentCall) {
      try {
        currentCall.disconnect()
      } catch {
        // ignore
      }
    }
    if (incomingCall) {
      try {
        incomingCall.reject()
      } catch {
        // ignore
      }
    }
  } finally {
    currentCall = null
    incomingCall = null
  }

  if (device) {
    try {
      device.destroy()
    } catch {
      // ignore
    }
    device = null
  }

  return { ok: true, lastToken: Boolean(lastToken) }
}

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (value: any) => void) => {
  const type = trimText(message?.type || '')
  const handledTypes = new Set(['TWILIO_INIT', 'TWILIO_DIAL', 'TWILIO_ANSWER', 'TWILIO_HANGUP', 'TWILIO_MUTE', 'TWILIO_DIGITS', 'TWILIO_DISPOSE', 'OFFSCREEN_PING'])
  if (!handledTypes.has(type)) {
    return false
  }

  void (async () => {
    try {
      switch (type) {
        case 'TWILIO_INIT':
          sendResponse(await initializeTwilio((message.payload || {}) as InitPayload))
          return
        case 'TWILIO_DIAL':
          sendResponse(await dial((message.payload || {}) as DialPayload))
          return
        case 'TWILIO_ANSWER':
          sendResponse(await answer())
          return
        case 'TWILIO_HANGUP':
          sendResponse(await hangup())
          return
        case 'TWILIO_MUTE':
          sendResponse(await mute((message.payload || {}) as { muted?: unknown }))
          return
        case 'TWILIO_DIGITS':
          sendResponse(await digits((message.payload || {}) as { digits?: unknown }))
          return
        case 'TWILIO_DISPOSE':
          sendResponse(await disposeTwilio())
          return
        case 'OFFSCREEN_PING':
          sendResponse({
            ok: true,
            ready: Boolean(device),
            identity: currentIdentity || null,
            apiBase: currentApiBase || null,
          })
          return
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: trimText((error as Error)?.message || 'Offscreen request failed.'),
      })
    }
  })()

  return true
})
