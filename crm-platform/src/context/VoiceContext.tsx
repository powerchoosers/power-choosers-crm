'use client'

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { useCallStore } from '@/store/callStore'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { formatToE164 } from '@/lib/utils'
import { IncomingCallToast } from '@/components/calls/IncomingCallToast'
import type { PowerDialTarget } from '@/lib/powerDialer'
import { supabase } from '@/lib/supabase'
import { isDesktopBridgeAvailable, showDesktopNotification } from '@/lib/desktop-notifications'
import { startPowerDialRingback, stopPowerDialRingback } from '@/lib/audio'

interface VoiceMetadata {
  name?: string
  photoUrl?: string
  account?: string
  title?: string
  logoUrl?: string
  domain?: string
  city?: string
  state?: string
  industry?: string
  description?: string
  linkedinUrl?: string
  annualUsage?: string
  supplier?: string
  currentRate?: string
  contractEnd?: string
  location?: string
  isAccountOnly?: boolean
  isPowerDialBatch?: boolean
  contactId?: string
  accountId?: string
  powerDialSessionId?: string
  powerDialBatchId?: string
  powerDialBatchIndex?: number
  powerDialBatchSize?: number
  powerDialSourceLabel?: string
  powerDialSelectedCount?: number
  powerDialDialableCount?: number
  powerDialTargetCount?: number
  callSid?: string
  answeredBy?: string
  machineDetectionDuration?: number | null
  voicemailDropStatus?: string
}

interface ConnectParams {
  To: string
  From?: string
  metadata?: VoiceMetadata
  powerDialTargets?: PowerDialTarget[]
  powerDialSessionId?: string
  powerDialBatchId?: string
  powerDialBatchIndex?: number
  powerDialBatchSize?: number
  powerDialSourceLabel?: string | null
  powerDialSelectedCount?: number
  powerDialDialableCount?: number
}

interface VoiceContextType {
  device: Device | null
  currentCall: Call | null
  isReady: boolean
  connect: (params: ConnectParams) => Promise<boolean>
  disconnect: () => void
  sendDigits: (digits: string) => void
  mute: (isMuted: boolean) => void
  isMuted: boolean
  metadata: VoiceMetadata | null
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined)

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [device, setDevice] = useState<Device | null>(null)
  const [currentCall, setCurrentCall] = useState<Call | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [metadata, setMetadata] = useState<VoiceMetadata | null>(null)

  const { user } = useAuth()
  const { setStatus, setActive, setCallHealth, setPhoneNumber } = useCallStore()

  const tokenRefreshTimer = useRef<NodeJS.Timeout | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const currentCallRef = useRef<Call | null>(null)
  const powerDialWinnerChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const powerDialWinnerResolvedRef = useRef<string | null>(null)
  const isInitializing = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const wasOfflineRef = useRef(false)
  const isCallSessionActiveRef = useRef(false)

  const hasLiveCall = useCallback((call: Call | null) => {
    if (!call) return false
    const status = call.status()
    return status === 'pending' || status === 'connecting' || status === 'ringing' || status === 'open' || status === 'reconnecting'
  }, [])

  const isCallSessionProtected = useCallback(() => {
    return isCallSessionActiveRef.current || hasLiveCall(currentCallRef.current)
  }, [])

  useEffect(() => {
    currentCallRef.current = currentCall
  }, [currentCall])

  const removePowerDialWinnerChannel = useCallback(() => {
    if (powerDialWinnerChannelRef.current) {
      supabase.removeChannel(powerDialWinnerChannelRef.current)
      powerDialWinnerChannelRef.current = null
    }
  }, [])

  const clearPowerDialWinnerSubscription = useCallback(() => {
    removePowerDialWinnerChannel()
    powerDialWinnerResolvedRef.current = null
  }, [removePowerDialWinnerChannel])

  useEffect(() => {
    return () => {
      clearPowerDialWinnerSubscription()
    }
  }, [clearPowerDialWinnerSubscription])

  /** Request microphone permission so the browser prompts the user; release stream immediately. Returns true if granted. */
  const requestMicrophonePermission = useCallback(async (): Promise<{ granted: boolean; denied: boolean }> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { granted: false, denied: false }
    }

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default' && !isDesktopBridgeAvailable()) {
      try {
        await Notification.requestPermission()
      } catch (err) {
        console.warn('[Voice] Failed to request Notification permission', err)
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      return { granted: true, denied: false }
    } catch (e: unknown) {
      const err = e as { name?: string }
      return { granted: false, denied: err?.name === 'NotAllowedError' }
    }
  }, [])

  const getSearchAuthHeader = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    return (token ? { Authorization: `Bearer ${token}` } : {}) as HeadersInit
  }, [])

  const parseCallMetadata = useCallback((value: unknown) => {
    if (!value) return {} as Record<string, unknown>

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
      } catch {
        return {}
      }
    }

    return typeof value === 'object' ? value as Record<string, unknown> : {}
  }, [])

  const resolvePhoneMeta = useCallback(async (phoneNumber: string) => {
    try {
      const headers = await getSearchAuthHeader()
      const response = await fetch(`/api/search?phone=${encodeURIComponent(phoneNumber)}`, { headers })
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const meta: VoiceMetadata = {}
          if (data.contact) {
            meta.name = data.contact.name
            meta.photoUrl = data.contact.avatarUrl || data.contact.photoUrl
            meta.account = data.contact.account
            meta.title = data.contact.title
            meta.contactId = data.contact.id
            meta.accountId = data.contact.accountId || data.account?.id || data.account?.accountId
            meta.city = data.contact.city
            meta.state = data.contact.state
            meta.industry = data.contact.industry || data.account?.industry
            meta.logoUrl = data.contact.logoUrl || data.account?.logoUrl
            meta.domain = data.contact.domain || data.account?.domain
            meta.isAccountOnly = false
          } else if (data.account) {
            meta.name = data.account.name
            meta.account = data.account.name
            meta.logoUrl = data.account.logoUrl
            meta.domain = data.account.domain
            meta.accountId = data.account.id || data.account.accountId
            meta.city = data.account.city
            meta.state = data.account.state
            meta.industry = data.account.industry
            meta.isAccountOnly = true
          }
          // Keep a minimal raw payload for defensive UI fallbacks
          ;(meta as any).metadata = {
            contactId: meta.contactId,
            accountId: meta.accountId
          }
          return meta
        }
      }
    } catch (error) {
      console.warn('[Voice] Metadata resolution failed:', error)
    }
    return null
  }, [getSearchAuthHeader])

  const extractPowerDialWinner = useCallback((candidate: any, batchId: string) => {
    if (!candidate || !batchId) return null

    const metadata = parseCallMetadata(candidate?.metadata)
    const candidateBatchId = String(candidate?.powerDialBatchId || metadata.powerDialBatchId || '')
    if (candidateBatchId !== batchId) return null

    const status = String(candidate?.status || '').toLowerCase()
    const duration = Number(candidate?.durationSec ?? candidate?.duration ?? 0)
    const isWinner = status === 'answered' || status === 'in-progress' || (status === 'completed' && duration > 0)
    if (!isWinner) return null

    return {
      contactName: String(candidate?.contactName || metadata.contactName || '').trim(),
      accountName: String(candidate?.accountName || metadata.accountName || '').trim(),
      contactTitle: String(candidate?.contactTitle || metadata.contactTitle || '').trim(),
      contactId: String(candidate?.contactId || metadata.contactId || '').trim(),
      accountId: String(candidate?.accountId || metadata.accountId || '').trim(),
      targetPhone: String(candidate?.targetPhone || metadata.targetPhone || candidate?.to || '').trim(),
      id: String(candidate?.callSid || candidate?.id || '').trim(),
      answeredBy: String(candidate?.answeredBy || metadata.answeredBy || '').trim(),
      machineDetectionDuration: candidate?.machineDetectionDuration ?? metadata.machineDetectionDuration ?? null,
      voicemailDropStatus: String(candidate?.voicemailDropStatus || metadata.voicemailDropStatus || '').trim(),
    }
  }, [parseCallMetadata])

  const applyPowerDialWinner = useCallback(({
    winner,
    fallbackMetadata,
    fallbackPhone,
  }: {
    winner: ReturnType<typeof extractPowerDialWinner>
    fallbackMetadata: VoiceMetadata
    fallbackPhone: string
  }) => {
    if (!winner) return false

    const resolutionKey = winner.id || winner.contactId || winner.targetPhone || fallbackPhone || 'resolved'
    if (powerDialWinnerResolvedRef.current === resolutionKey) return true

    const resolvedPhone = formatToE164(winner.targetPhone || fallbackPhone) || fallbackPhone
    powerDialWinnerResolvedRef.current = resolutionKey
    setPhoneNumber(resolvedPhone)
    setMetadata({
      ...fallbackMetadata,
      name: winner.contactName || fallbackMetadata.name,
      account: winner.accountName || fallbackMetadata.account,
      title: winner.contactTitle || fallbackMetadata.title,
      contactId: winner.contactId || fallbackMetadata.contactId,
      accountId: winner.accountId || fallbackMetadata.accountId,
      isPowerDialBatch: false,
      powerDialTargetCount: 1,
      callSid: winner.id || fallbackMetadata.callSid,
      answeredBy: winner.answeredBy || fallbackMetadata.answeredBy,
      machineDetectionDuration: winner.machineDetectionDuration ?? fallbackMetadata.machineDetectionDuration ?? null,
      voicemailDropStatus: winner.voicemailDropStatus || fallbackMetadata.voicemailDropStatus,
    })
    removePowerDialWinnerChannel()
    return true
  }, [extractPowerDialWinner, removePowerDialWinnerChannel, setPhoneNumber])

  const resolvePowerDialWinner = useCallback(async ({
    batchId,
    fallbackMetadata,
    fallbackPhone,
  }: {
    batchId: string
    fallbackMetadata: VoiceMetadata
    fallbackPhone: string
  }) => {
    if (!batchId) return

    const headers = await getSearchAuthHeader()

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const response = await fetch(`/api/calls?powerDialBatchId=${encodeURIComponent(batchId)}&limit=5`, { headers })
        if (powerDialWinnerResolvedRef.current) return

        if (response.ok) {
          const payload = await response.json()
          const calls = Array.isArray(payload?.calls) ? payload.calls : []
          const winner = calls
            .map((call: any) => extractPowerDialWinner(call, batchId))
            .find(Boolean)

          if (winner && applyPowerDialWinner({ winner, fallbackMetadata, fallbackPhone })) {
            return
          }
        }
      } catch (error) {
        console.warn('[Voice] Failed to resolve power dial winner:', error)
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500))
    }
  }, [applyPowerDialWinner, extractPowerDialWinner, getSearchAuthHeader])

  const subscribeToPowerDialWinner = useCallback(({
    batchId,
    fallbackMetadata,
    fallbackPhone,
  }: {
    batchId: string
    fallbackMetadata: VoiceMetadata
    fallbackPhone: string
  }) => {
    if (!batchId) return

    clearPowerDialWinnerSubscription()

    const channel = supabase
      .channel(`power-dial-winner-${batchId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
        },
        (payload) => {
          if (powerDialWinnerResolvedRef.current) return
          const winner = extractPowerDialWinner((payload as any)?.new, batchId)
          if (!winner) return
          applyPowerDialWinner({ winner, fallbackMetadata, fallbackPhone })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void resolvePowerDialWinner({ batchId, fallbackMetadata, fallbackPhone })
        }
      })

    powerDialWinnerChannelRef.current = channel
  }, [applyPowerDialWinner, clearPowerDialWinnerSubscription, extractPowerDialWinner, resolvePowerDialWinner])

  const initDevice = useCallback(async () => {
    // Helper to check if we are in the platform area (check at call time)
    const currentPath = window.location.pathname
    const isPlatform = currentPath?.startsWith('/network') || currentPath?.startsWith('/dashboard')

    // Only initialize on the client side, when user is authenticated, and in platform routes
    if (typeof window === 'undefined' || !user || !isPlatform || !document.cookie.includes('np_session=')) {
      // We don't clean up the device here anymore to avoid dropping active calls if navigating away,
      // but the error guards (isPlatform) will prevent toasts on public pages.
      return
    }

    // Guardrail: never re-initialize while a call session is active.
    if (isCallSessionProtected()) {
      console.log('[Voice] Skipping initDevice because a call session is active')
      return
    }

    // Prevent overlapping initializations
    if (isInitializing.current) {
      console.log('[Voice] Initialization already in progress, skipping...')
      return
    }

    // Request microphone permission first so the browser prompts before Twilio needs the device
    const perm = await requestMicrophonePermission()
    if (!perm.granted) {
      isInitializing.current = false
      if (perm.denied && (currentPath?.startsWith('/network') || currentPath?.startsWith('/dashboard'))) {
        toast.error('Voice needs microphone access', {
          description: 'Please allow microphone in your browser settings and try again.',
          duration: 8000,
        })
      }
      return
    }

    try {
      isInitializing.current = true
      console.log('[Voice] Fetching new access token...')

      const identity = user?.id ? `agent-${user.id}` : 'agent'
      const response = await fetch(`/api/twilio/token?identity=${encodeURIComponent(identity)}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.statusText}`)
      }
      const data = await response.json()

      if (!data.token) {
        throw new Error('No token received from server')
      }

      // If we already have a device, try to update the token first.
      if (deviceRef.current && deviceRef.current.state !== 'destroyed') {
        const d = deviceRef.current
        const callInProgress = isCallSessionProtected()
        if (callInProgress) {
          console.log('[Voice] Call in progress, updating token without re-initializing device')
        }
        try {
          d.updateToken(data.token)
          // Keep refresh timer alive even when we only update token
          if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current)
          tokenRefreshTimer.current = setInterval(initDevice, 50 * 60 * 1000)
          if (callInProgress || d.state === 'registered' || d.state === 'registering') {
            return
          }
        } catch (updateError) {
          if (callInProgress) {
            console.error('[Voice] Token update failed during active call. Skipping device teardown to protect call:', updateError)
            return
          }
          console.error('[Voice] Failed to update token, attempting full re-init:', updateError)
        }
      }

      // Cleanup existing device before creating new one if we get here
      if (deviceRef.current) {
        if (isCallSessionProtected()) {
          console.warn('[Voice] Active call detected. Skipping device cleanup to avoid dropping call.')
          return
        }
        const d = deviceRef.current
        console.log('[Voice] Cleaning up existing device... State:', d.state)
        setIsReady(false)
        setDevice(null)

        try {
          if (d.state === 'registered' || d.state === 'registering') {
            if (d.state === 'registered') {
              await d.unregister()
            }
          }
        } catch (cleanupError) {
          console.warn('[Voice] Error during device unregister:', cleanupError)
        }

        try {
          d.destroy()
        } catch (destroyError) {
          console.warn('[Voice] Error during device destroy:', destroyError)
        }

        deviceRef.current = null
      }

      const newDevice = new Device(data.token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        enableImprovedSignalingErrorPrecision: true,
        logLevel: 'silent', // Twilio/loglevel: 0=TRACE (noisy), silent fully suppresses SDK logs
        edge: ['ashburn', 'roaming'],
        maxCallSignalingTimeoutMs: 30000,
        tokenRefreshMs: 30000, // Refresh 30s before expiry
      })

      // Ported from legacy phone.js: Set audio constraints for better quality
      if (newDevice.audio) {
        newDevice.audio.setAudioConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
        })

        // Set initial input/output devices - check if they exist first
        try {
          const setupAudio = async () => {
            if (!newDevice.audio) return;
            // Wait briefly for media devices to be detected by the SDK
            const inputDevices = newDevice.audio.availableInputDevices
            if (inputDevices && inputDevices.size > 0) {
              const deviceIds = Array.from(inputDevices.keys())
              let inputDeviceId = 'default'
              if (!deviceIds.includes('default') && deviceIds.length > 0) {
                inputDeviceId = deviceIds[0] as string
              }

              try {
                await newDevice.audio.setInputDevice(inputDeviceId)
              } catch (e) {
                console.warn('[Voice] Specifically failed to set input device:', inputDeviceId, e)
              }
            }

            if (newDevice.audio.isOutputSelectionSupported) {
              const outputDevices = newDevice.audio.availableOutputDevices
              if (outputDevices && outputDevices.size > 0) {
                const deviceIds = Array.from(outputDevices.keys())
                let outputDeviceId = 'default'
                if (!deviceIds.includes('default') && deviceIds.length > 0) {
                  outputDeviceId = deviceIds[0] as string
                }
                newDevice.audio.speakerDevices.set(outputDeviceId)
              }
            }
          }

          // Run audio setup but don't block registration on it
          setupAudio().catch(e => console.warn('[Voice] Async audio setup failed:', e))

        } catch (audioInitError) {
          console.warn('[Voice] Initial audio device setup failed:', audioInitError)
        }
      }

      newDevice.on('registered', () => {
        console.log('[Voice] Device registered')
        setIsReady(true)
        isInitializing.current = false
        reconnectAttemptsRef.current = 0 // Reset reconnect counter on success

        // Set up proactive token refresh (refresh at 23 hours, 1 hour before 24h expiry)
        if (tokenRefreshTimer.current) {
          clearTimeout(tokenRefreshTimer.current)
        }
        tokenRefreshTimer.current = setTimeout(() => {
          console.log('[Voice] Proactive token refresh (before expiry)')
          initDevice()
        }, 22 * 60 * 60 * 1000) // Refresh after 22 hours
      })

      // Twilio Best Practice: Listen for token expiration and update proactively
      newDevice.on('tokenWillExpire', () => {
        console.log('[Voice] Token will expire soon, refreshing...')
        if (isCallSessionProtected()) {
          console.log('[Voice] Token refresh deferred because call session is active')
          return
        }
        initDevice()
      })

      newDevice.on('warning', (name, data) => {
        console.warn('[Voice] Device warning:', name, data || {})
        setCallHealth(name === 'constant-audio-input-level' ? 'poor' : 'fair')

        // Signal user if we detect quality issues
        if (name === 'audio-level-sample' && data && data.inputLevel === 0) {
          // Input level 0 means the mic is either muted or failing
          if (currentCall) {
            console.log('[Voice] Local silence detected (Mic volume 0)')
          }
        }

        if (name === 'constant-audio-input-level') {
          console.log('[Voice] Warning: Constant audio input detected. Possible hardware issue.')
          toast('Voice Warning', { description: 'Microphone signal appears frozen. Please check your mic.' })
        }
      })

      newDevice.on('error', (error) => {
        console.error('[Voice] Device error:', error)
        setCallHealth('poor')

        // Don't show toast for "transport unavailable" as we'll try to recover
        // Also only show toasts if we are in the platform area
        const currentPath = window.location.pathname
        const isInPlatform = currentPath?.startsWith('/network') || currentPath?.startsWith('/dashboard')
        if (error.code !== 31009 && isInPlatform) {
          toast.error('Twilio Device Error', { description: error.message })
        }

        if (error.code === 20101 || error.code === 31204 || error.code === 31009) {
          if (isCallSessionProtected()) {
            console.warn('[Voice] Skipping recovery re-init because call session is active')
            return
          }
          // Token expired, invalid, or transport lost - trigger re-init with exponential backoff
          console.log('[Voice] Triggering device re-initialization due to error:', error.code)
          isInitializing.current = false // Allow re-init

          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000) // Max 30s
            reconnectAttemptsRef.current++
            console.log(`[Voice] Reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms`)

            setTimeout(() => {
              initDevice()
            }, delay)
          } else {
            console.error('[Voice] Max reconnection attempts reached. Please refresh the page.')
            toast.error('Connection Lost', {
              description: 'Unable to reconnect to Twilio. Please refresh the page.',
              duration: Infinity
            })
          }
        }
      })

      newDevice.on('incoming', async (call) => {
        console.log('[Voice] Incoming call')

        // Only show incoming call UI if in platform
        const currentPath = window.location.pathname
        const isInPlatform = currentPath?.startsWith('/network') || currentPath?.startsWith('/dashboard')
        if (!isInPlatform) {
          call.reject()
          return
        }

        // Resolve metadata for incoming call
        // Ported from legacy phone.js: Check originalCaller parameter first
        const from = call.parameters.originalCaller || call.parameters.From || ''
        const meta = await resolvePhoneMeta(from)
        setMetadata(meta)
        setPhoneNumber(formatToE164(from) || from)

        let toastId: string | number | undefined
        let nativeNotification: Notification | undefined

        const clearNativeNotification = () => {
          try {
            if (nativeNotification && typeof nativeNotification.close === 'function') {
              nativeNotification.close()
            }
          } catch (e) {
            console.warn('[Voice] Failed to close native notification', e)
          }
        }

        const answerIncomingCall = async () => {
          clearNativeNotification()
          // Ported from legacy phone.js: Set audio devices before answering
          if (newDevice.audio) {
            try {
              const inputDevices = newDevice.audio.availableInputDevices
              let inputDeviceId = 'default'
              if (inputDevices && inputDevices.size > 0) {
                const deviceIds = Array.from(inputDevices.keys())
                if (!deviceIds.includes('default') && deviceIds.length > 0) {
                  inputDeviceId = deviceIds[0] as string
                }
              }
              await newDevice.audio.setInputDevice(inputDeviceId)

              if (newDevice.audio.isOutputSelectionSupported) {
                const outputDevices = newDevice.audio.availableOutputDevices
                let outputDeviceId = 'default'
                if (outputDevices && outputDevices.size > 0) {
                  const deviceIds = Array.from(outputDevices.keys())
                  if (!deviceIds.includes('default') && deviceIds.length > 0) {
                    outputDeviceId = deviceIds[0] as string
                  }
                }
                newDevice.audio.speakerDevices.set(outputDeviceId)
              }
            } catch (audioError) {
              console.warn('[Voice] Audio setup failed for incoming call:', audioError)
            }
          }

          call.accept()
          isCallSessionActiveRef.current = true
          setCurrentCall(call)
          setActive(true)
          setStatus('connected')
          setCallHealth('good')
          if (toastId !== undefined) {
            toast.dismiss(toastId)
          }

          // Track Health Monitor: Check for silence via WebRTC getStats()
          const monitorMediaHealth = async () => {
            if (call.status() !== 'open') return;
            try {
              if (typeof (call as any).getStats !== 'function') {
                console.warn('[Voice] getStats is not supported in this environment');
                return;
              }
              const stats = await (call as any).getStats();
              stats.forEach((report: any) => {
                if (report.localAudioTrackStats) {
                  report.localAudioTrackStats.forEach((stat: any) => {
                    if (stat.audioLevel === 0 && !call.isMuted()) {
                      console.warn('[Voice] Diagnostic: No local audio energy detected (Inbound). Check Mic.');
                    }
                  });
                }
              });
              if (call.status() === 'open') {
                setTimeout(monitorMediaHealth, 5000);
              }
            } catch (err) {
              console.error('[Voice] Media monitor error (Inbound):', err);
            }
          };
          monitorMediaHealth();
        }

        const declineIncomingCall = () => {
          clearNativeNotification()
          call.reject()
          if (toastId !== undefined) {
            toast.dismiss(toastId)
          }
        }

        // 1) Show In-App Toast
        toastId = toast(
          <IncomingCallToast
            meta={meta}
            from={from}
            onAnswer={answerIncomingCall}
            onDecline={declineIncomingCall}
          />,
          {
            duration: 30000, // Longer duration for incoming call
          }
        )

        // 2) Show Global / Desktop Notification
        const nfTitle = `Incoming Call: ${meta?.name || from || 'Unknown'}`
        const nfBody = meta?.account ? `from ${meta.account}` : 'Click to view in CRM.'
        
        if (isDesktopBridgeAvailable()) {
          void showDesktopNotification({
            title: nfTitle,
            body: nfBody,
            kind: 'system',
          })
        } else if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
          try {
            nativeNotification = new window.Notification(nfTitle, {
              body: nfBody,
              requireInteraction: true,
            })
            nativeNotification.onclick = () => {
              window.focus()
            }
          } catch (e) {
            console.warn('[Voice] Error creating native notification', e)
          }
        }

        call.on('cancel', () => {
          clearNativeNotification()
          console.log('[Voice] Call cancelled by caller')
          isCallSessionActiveRef.current = false
          toast.dismiss(toastId)
          toast.error('Missed Call', {
            description: `from ${meta?.name || from}`,
            duration: 5000,
          })
          setMetadata(null)
          setPhoneNumber('')
          setCurrentCall(null)
          setActive(false)
          setStatus('ended')
          setCallHealth('good')
        })

        call.on('disconnect', () => {
          clearNativeNotification()
          isCallSessionActiveRef.current = false
          toast.dismiss(toastId)
          setCurrentCall(null)
          setActive(false)
          setStatus('ended')
          setMetadata(null)
          setPhoneNumber('')
          setCallHealth('good')
        })
      })

      await newDevice.register()
      deviceRef.current = newDevice
      setDevice(newDevice)

      // Refresh token every 50 minutes
      if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current)
      tokenRefreshTimer.current = setInterval(initDevice, 50 * 60 * 1000)

    } catch (error) {
      console.error('[Voice] Failed to init device:', error)
      const currentPath = window.location.pathname
      const isInPlatform = currentPath?.startsWith('/network') || currentPath?.startsWith('/dashboard')
      if (isInPlatform) {
        toast.error('Voice System Offline', {
          description: 'Could not connect to Twilio service.'
        })
      }
    } finally {
      isInitializing.current = false
    }
  }, [requestMicrophonePermission, resolvePhoneMeta, setActive, setStatus, setCallHealth, user, isCallSessionProtected])

  useEffect(() => {
    initDevice()
  }, [initDevice])

  // Cleanup ONLY on true unmount.
  // Do not tie teardown to initDevice dependency changes, or a re-created callback
  // can destroy an active call when tab/window focus shifts.
  useEffect(() => {
    return () => {
      if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current)

      const callSessionActive = isCallSessionActiveRef.current || hasLiveCall(currentCallRef.current)
      if (callSessionActive) {
        console.warn('[Voice] Unmount cleanup skipped because call session is active')
        return
      }

      if (deviceRef.current) {
        const d = deviceRef.current
        console.log('[Voice] Provider unmounting, destroying device. State:', d.state)
        try {
          if (d.state === 'registered') {
            d.unregister()
          }
          d.destroy()
        } catch (e) {
          console.warn('[Voice] Cleanup error during unmount:', e)
        }
        deviceRef.current = null
      }
    }
  }, [hasLiveCall])

  // Handle tab visibility changes - refresh connection when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && deviceRef.current) {
        const d = deviceRef.current
        if (isCallSessionProtected()) {
          return
        }
        // If device is in error state or not registered, try to re-init
        if (d.state === 'destroyed' || d.state === 'unregistered') {
          console.log('[Voice] Tab became visible and device not registered, re-initializing...')
          reconnectAttemptsRef.current = 0 // Reset attempts when user manually activates tab
          initDevice()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [initDevice, isCallSessionProtected])

  // Harden against network drops (e.g. WiFi blip, VPN switch): recover when browser comes back online
  useEffect(() => {
    const handleOffline = () => {
      wasOfflineRef.current = true
      console.log('[Voice] Browser offline – call may drop; will recover when back online.')
    }

    const handleOnline = () => {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
      const isPlatform = currentPath?.startsWith('/network') || currentPath?.startsWith('/dashboard')
      if (!isPlatform || !user) return

      const hadBeenOffline = wasOfflineRef.current
      wasOfflineRef.current = false

      if (isCallSessionProtected()) {
        if (hadBeenOffline) {
          toast.info('Connection restored', {
            description: 'Call is still active.',
            duration: 3000,
          })
        }
        return
      }

      // Clear phantom call state (actual call already dropped when network was lost)
      setCurrentCall(null)
      setActive(false)
      setStatus('ended')
      setMetadata(null)
      setPhoneNumber('')
      setIsReady(false)
      reconnectAttemptsRef.current = 0

      console.log('[Voice] Browser back online – re-initializing device...')
      initDevice()

      if (hadBeenOffline) {
        toast.info('Connection restored', {
          description: 'You can place new calls.',
          duration: 5000,
        })
      }
    }

    const handleDeviceChange = () => {
      console.log('[Voice] Hardware device change detected (Mic/Speaker plugged or unplugged)')
      // If we are in a call, this might be why it went silent.
      if (deviceRef.current && isCallSessionProtected()) {
        toast.info('Hardware change detected', {
          description: 'Your audio device were updated. Re-connecting audio path...'
        })
        return
      }
      // Re-initialize to pick up new default icons/paths
      initDevice()
    }

    if (typeof window === 'undefined') return
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    }

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
      }
    }
  }, [initDevice, setActive, setStatus, user, isCallSessionProtected])

  const connect = useCallback(async (params: ConnectParams) => {
    const callInProgress = isCallSessionProtected()
    const deviceDestroyed = !!device && device.state === 'destroyed'
    const deviceUsable = !!device && !deviceDestroyed && (isReady || callInProgress)

    if (!deviceUsable) {
      // Request microphone permission first so user gets the browser prompt instead of "not ready"
      const perm = await requestMicrophonePermission()
      if (!perm.granted) {
        if (perm.denied) {
          toast.error('Voice needs microphone access', {
            description: 'Please allow microphone in your browser settings and try again.',
            duration: 8000,
          })
        } else {
          toast.error('Voice system not ready', {
            description: 'Microphone access is required to make calls.',
            duration: 6000,
          })
        }
        return false
      }
      // Permission granted; (re-)initialize device so it can find the microphone
      initDevice()
      toast.info('Setting up voice...', {
        description: 'Try your call again in a moment.',
        duration: 5000,
      })
      return false
    }

    const powerDialTargets = Array.isArray(params.powerDialTargets)
      ? params.powerDialTargets.filter((target): target is PowerDialTarget => !!target && !!target.phoneNumber)
      : []
    const isPowerDial = powerDialTargets.length > 0

    const toE164 = formatToE164(params.To)
    const fallbackTarget = isPowerDial
      ? formatToE164(powerDialTargets[0]?.phoneNumber || '')
      : ''
    const targetNumber = fallbackTarget || toE164
    const fromE164 = params.From ? formatToE164(params.From) : ''

    if (!targetNumber) {
      toast.error('Invalid destination number')
      return false
    }

    try {
      console.log(`[Voice] Connecting ${isPowerDial ? 'power dial batch' : 'call'} Target: ${targetNumber}, CallerId: ${fromE164}`)

      // Resolve metadata for outbound call if not provided
      const resolvedMeta = params.metadata || await resolvePhoneMeta(targetNumber)
      const meta: VoiceMetadata = { ...(resolvedMeta || {}) }

      if (isPowerDial) {
        const lead = powerDialTargets[0]
        const isMultiTargetBatch = powerDialTargets.length > 1
        meta.name = isMultiTargetBatch
          ? `${powerDialTargets.length} Targets`
          : (meta.name || lead?.name || 'Power Dial')
        meta.account = meta.account || params.powerDialSourceLabel || lead?.accountName || 'Power Dial'
        meta.title = isMultiTargetBatch
          ? 'Power Dial Batch'
          : (meta.title || lead?.title || undefined)
        meta.photoUrl = isMultiTargetBatch ? undefined : (meta.photoUrl || lead?.photoUrl || undefined)
        meta.logoUrl = isMultiTargetBatch ? undefined : (meta.logoUrl || lead?.logoUrl || undefined)
        meta.domain = isMultiTargetBatch ? undefined : (meta.domain || lead?.domain || undefined)
        meta.contactId = isMultiTargetBatch ? undefined : (meta.contactId || lead?.contactId || undefined)
        meta.accountId = isMultiTargetBatch ? undefined : (meta.accountId || lead?.accountId || undefined)
        meta.isPowerDialBatch = isMultiTargetBatch
        meta.powerDialSessionId = params.powerDialSessionId || meta.powerDialSessionId
        meta.powerDialBatchId = params.powerDialBatchId || meta.powerDialBatchId
        meta.powerDialBatchIndex = params.powerDialBatchIndex ?? meta.powerDialBatchIndex
        meta.powerDialBatchSize = params.powerDialBatchSize ?? meta.powerDialBatchSize
        meta.powerDialSourceLabel = params.powerDialSourceLabel || meta.powerDialSourceLabel
        meta.powerDialSelectedCount = params.powerDialSelectedCount ?? meta.powerDialSelectedCount
        meta.powerDialDialableCount = params.powerDialDialableCount ?? meta.powerDialDialableCount
        meta.powerDialTargetCount = powerDialTargets.length
      }

      setMetadata(meta)
      setPhoneNumber(isPowerDial && powerDialTargets.length > 1 ? '' : targetNumber)

      // Ported from legacy phone.js: Set audio devices before connecting
      if (device.audio) {
        try {
          // Set input device
          const inputDevices = device.audio.availableInputDevices
          let inputDeviceId = 'default'
          if (inputDevices && inputDevices.size > 0) {
            const deviceIds = Array.from(inputDevices.keys())
            if (!deviceIds.includes('default') && deviceIds.length > 0) {
              inputDeviceId = deviceIds[0] as string
            }
          }

          try {
            await device.audio.setInputDevice(inputDeviceId)
          } catch (e) {
            console.warn('[Voice] Failed to set input device, trying unset:', e)
            await device.audio.unsetInputDevice()
          }

          // Set speaker devices if supported
          if (device.audio.isOutputSelectionSupported) {
            const outputDevices = device.audio.availableOutputDevices
            let outputDeviceId = 'default'
            if (outputDevices && outputDevices.size > 0) {
              const deviceIds = Array.from(outputDevices.keys())
              if (!deviceIds.includes('default') && deviceIds.length > 0) {
                outputDeviceId = deviceIds[0] as string
              }
            }
            device.audio.speakerDevices.set(outputDeviceId)
          }
        } catch (audioError) {
          console.warn('[Voice] Audio device setup failed:', audioError)
        }
      }

      const connectParams: Record<string, string> = {
        targetNumber,
        callerId: fromE164,
      }

      const agentData = { agentId: user?.id, agentEmail: user?.email };
      const supplementalMetadata = {
        ...(meta || {}),
        ...agentData,
        ...(isPowerDial
          ? {
              powerDialSessionId: params.powerDialSessionId || meta.powerDialSessionId,
              powerDialBatchId: params.powerDialBatchId || meta.powerDialBatchId,
              powerDialBatchIndex: params.powerDialBatchIndex ?? meta.powerDialBatchIndex,
              powerDialBatchSize: params.powerDialBatchSize ?? meta.powerDialBatchSize,
              powerDialSourceLabel: params.powerDialSourceLabel || meta.powerDialSourceLabel,
              powerDialSelectedCount: params.powerDialSelectedCount ?? meta.powerDialSelectedCount,
              powerDialDialableCount: params.powerDialDialableCount ?? meta.powerDialDialableCount,
              powerDialTargetCount: powerDialTargets.length,
            }
          : {})
      }

      if (isPowerDial) {
        connectParams.powerDialTargets = JSON.stringify(powerDialTargets)
        if (params.powerDialSessionId) connectParams.powerDialSessionId = params.powerDialSessionId
        if (params.powerDialBatchId) connectParams.powerDialBatchId = params.powerDialBatchId
        if (params.powerDialBatchIndex != null) connectParams.powerDialBatchIndex = String(params.powerDialBatchIndex)
        if (params.powerDialBatchSize != null) connectParams.powerDialBatchSize = String(params.powerDialBatchSize)
        if (params.powerDialSourceLabel) connectParams.powerDialSourceLabel = params.powerDialSourceLabel
        if (params.powerDialSelectedCount != null) connectParams.powerDialSelectedCount = String(params.powerDialSelectedCount)
        if (params.powerDialDialableCount != null) connectParams.powerDialDialableCount = String(params.powerDialDialableCount)
      }

      connectParams.metadata = JSON.stringify(supplementalMetadata)

      clearPowerDialWinnerSubscription()
      startPowerDialRingback()
      const call = await device.connect({
        params: connectParams
      })

      // Set dialing status immediately
      isCallSessionActiveRef.current = true
      setStatus('dialing')
      setActive(true)
      setCurrentCall(call)

      call.on('accept', () => {
        stopPowerDialRingback()
        setCurrentCall(call)
        setStatus('connected')
        setActive(true)
        setCallHealth('good')

        if (isPowerDial && params.powerDialBatchId) {
          subscribeToPowerDialWinner({
            batchId: params.powerDialBatchId,
            fallbackMetadata: meta,
            fallbackPhone: targetNumber,
          })
        }

        // Track Health Monitor: Check for silence via WebRTC getStats()
        const monitorMediaHealth = async () => {
          if (call.status() !== 'open') return;
          try {
            if (typeof (call as any).getStats !== 'function') {
              console.warn('[Voice] getStats is not supported in this environment');
              return;
            }
            const stats = await (call as any).getStats();
            stats.forEach((report: any) => {
              if (report.localAudioTrackStats) {
                report.localAudioTrackStats.forEach((stat: any) => {
                  if (stat.audioLevel === 0 && !call.isMuted()) {
                    console.warn('[Voice] Diagnostic: No local audio energy detected. Check Mic.');
                  }
                });
              }
            });
            if (call.status() === 'open') {
              setTimeout(monitorMediaHealth, 5000);
            }
          } catch (err) {
            console.error('[Voice] Media monitor error:', err);
          }
        };
        monitorMediaHealth();
      })

      call.on('disconnect', () => {
        stopPowerDialRingback()
        clearPowerDialWinnerSubscription()
        isCallSessionActiveRef.current = false
        setCurrentCall(null)
        setStatus('ended')
        setActive(false)
        setMetadata(null)
        setPhoneNumber('')
        setCallHealth('good')
      })

      call.on('error', (error) => {
        stopPowerDialRingback()
        clearPowerDialWinnerSubscription()
        console.error('[Voice] Call error:', error)
        toast.error('Call failed', { description: error.message })
        isCallSessionActiveRef.current = false
        setCurrentCall(null)
        setStatus('error')
        setActive(false)
        setCallHealth('poor')
        setPhoneNumber('')
      })

      call.on('warning', () => {
        setCallHealth('fair')
      })

      call.on('warning-cleared', () => {
        setCallHealth('good')
      })

      return true
    } catch (error: any) {
      stopPowerDialRingback()
      clearPowerDialWinnerSubscription()
      console.error('[Voice] Connect failed:', error)
      toast.error('Could not initiate call', {
        description: error?.message || 'Check your internet connection and Twilio configuration.'
      })
      setStatus('error')
      return false
    }
  }, [clearPowerDialWinnerSubscription, device, initDevice, isCallSessionProtected, isReady, requestMicrophonePermission, resolvePhoneMeta, setActive, setCallHealth, setPhoneNumber, setStatus, subscribeToPowerDialWinner, user])

  const disconnect = useCallback(() => {
    if (currentCall) {
      stopPowerDialRingback()
      clearPowerDialWinnerSubscription()
      currentCall.disconnect()
      isCallSessionActiveRef.current = false
      setCurrentCall(null)
      setStatus('ended')
      setActive(false)
      setMetadata(null)
      setPhoneNumber('')
      setCallHealth('good')
    }
  }, [clearPowerDialWinnerSubscription, currentCall, setActive, setCallHealth, setPhoneNumber, setStatus])

  const sendDigits = useCallback((digits: string) => {
    if (currentCall) {
      currentCall.sendDigits(digits)
    }
  }, [currentCall])

  const mute = useCallback((isMuted: boolean) => {
    if (currentCall) {
      currentCall.mute(isMuted)
      setIsMuted(isMuted)
    }
  }, [currentCall])

  return (
    <VoiceContext.Provider value={{
      device,
      currentCall,
      isReady,
      connect,
      disconnect,
      sendDigits,
      mute,
      isMuted,
      metadata
    }}>
      {children}
    </VoiceContext.Provider>
  )
}

export const useVoice = () => {
  const context = useContext(VoiceContext)
  if (context === undefined) {
    throw new Error('useVoice must be used within a VoiceProvider')
  }
  return context
}
