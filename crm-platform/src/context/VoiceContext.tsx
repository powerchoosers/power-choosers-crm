'use client'

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { useCallStore } from '@/store/callStore'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { formatToE164 } from '@/lib/utils'
import { usePathname } from 'next/navigation'

interface VoiceMetadata {
  name?: string
  account?: string
  title?: string
  logoUrl?: string
  domain?: string
  industry?: string
  description?: string
  linkedinUrl?: string
  annualUsage?: string
  supplier?: string
  currentRate?: string
  contractEnd?: string
  location?: string
  isAccountOnly?: boolean
  contactId?: string
  accountId?: string
}

interface VoiceContextType {
  device: Device | null
  currentCall: Call | null
  isReady: boolean
  connect: (params: { To: string; From?: string; metadata?: VoiceMetadata }) => Promise<void>
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
  const pathname = usePathname()
  const { setStatus, setActive } = useCallStore()

  const tokenRefreshTimer = useRef<NodeJS.Timeout | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const isInitializing = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  /** Request microphone permission so the browser prompts the user; release stream immediately. Returns true if granted. */
  const requestMicrophonePermission = useCallback(async (): Promise<{ granted: boolean; denied: boolean }> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { granted: false, denied: false }
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

  const resolvePhoneMeta = useCallback(async (phoneNumber: string) => {
    try {
      const response = await fetch(`/api/search?phone=${encodeURIComponent(phoneNumber)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const meta: VoiceMetadata = {}
          if (data.contact) {
            meta.name = data.contact.name
            meta.account = data.contact.account
            meta.title = data.contact.title
            meta.contactId = data.contact.id
            meta.accountId = data.contact.accountId
          } else if (data.account) {
            meta.name = data.account.name
            meta.logoUrl = data.account.logoUrl
            meta.domain = data.account.domain
            meta.accountId = data.account.id
          }
          return meta
        }
      }
    } catch (error) {
      console.warn('[Voice] Metadata resolution failed:', error)
    }
    return null
  }, [])

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
      
      const response = await fetch('/api/twilio/token?identity=agent')
      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.statusText}`)
      }
      const data = await response.json()

      if (!data.token) {
        throw new Error('No token received from server')
      }

      // Cleanup existing device before creating new one
      if (deviceRef.current) {
        const d = deviceRef.current
        console.log('[Voice] Cleaning up existing device... State:', d.state)
        
        try {
          // Only unregister if in a valid state
          if (d.state === 'registered' || d.state === 'registering') {
            // Note: Twilio SDK might throw if we unregister while registering, 
            // but we'll wrap it in try-catch to be safe
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
        // Twilio suggests these for better reliability in browser environments
        edge: ['ashburn', 'roaming'], 
        maxCallSignalingTimeoutMs: 30000,
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

        // Set initial input/output devices
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
        }, 23 * 60 * 60 * 1000) // 23 hours
      })

      newDevice.on('warning', (name, data) => {
        console.warn('[Voice] Device warning:', name, data || {})
      })

      newDevice.on('error', (error) => {
        console.error('[Voice] Device error:', error)
        
        // Don't show toast for "transport unavailable" as we'll try to recover
        // Also only show toasts if we are in the platform area
        const currentPath = window.location.pathname
        const isInPlatform = currentPath?.startsWith('/network') || currentPath?.startsWith('/dashboard')
        if (error.code !== 31009 && isInPlatform) {
          toast.error('Twilio Device Error', { description: error.message })
        }
        
        if (error.code === 20101 || error.code === 31204 || error.code === 31009) {
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

        const toastId = toast.info(`Incoming Call: ${meta?.name || from}`, {
          description: meta?.account ? `from ${meta.account}` : 'Unknown Caller',
          action: {
            label: 'Answer',
            onClick: async () => {
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
              setCurrentCall(call)
              setActive(true)
              setStatus('connected')
              toast.dismiss(toastId)
            }
          },
          duration: 30000, // Longer duration for incoming call
        })
        
        call.on('cancel', () => {
          console.log('[Voice] Call cancelled by caller')
          toast.dismiss(toastId)
          toast.error('Missed Call', {
            description: `from ${meta?.name || from}`,
            duration: 5000,
          })
          setMetadata(null)
          setCurrentCall(null)
          setActive(false)
          setStatus('ended')
        })

        call.on('disconnect', () => {
          toast.dismiss(toastId)
          setCurrentCall(null)
          setActive(false)
          setStatus('ended')
          setMetadata(null)
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
  }, [requestMicrophonePermission, resolvePhoneMeta, setActive, setStatus, user])

  useEffect(() => {
    initDevice()
    return () => {
      if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current)
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
  }, [initDevice])

  // Handle tab visibility changes - refresh connection when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && deviceRef.current) {
        const d = deviceRef.current
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
  }, [initDevice])

  const connect = useCallback(async (params: { To: string; From?: string; metadata?: VoiceMetadata }) => {
    if (!device || !isReady) {
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
        return
      }
      // Permission granted; (re-)initialize device so it can find the microphone
      initDevice()
      toast.info('Setting up voice...', {
        description: 'Try your call again in a moment.',
        duration: 5000,
      })
      return
    }

    const toE164 = formatToE164(params.To)
    const fromE164 = params.From ? formatToE164(params.From) : ''

    if (!toE164) {
      toast.error('Invalid destination number')
      return
    }

    try {
      console.log(`[Voice] Connecting call To: ${toE164}, From: ${fromE164}`)
      
      // Resolve metadata for outbound call if not provided
      const meta = params.metadata || await resolvePhoneMeta(toE164)
      setMetadata(meta)

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
        To: toE164,
        From: fromE164,
      }

      if (params.metadata) {
        connectParams.metadata = JSON.stringify(params.metadata)
      } else if (meta) {
        connectParams.metadata = JSON.stringify(meta)
      }

      const call = await device.connect({ 
        params: connectParams
      })

      // Set dialing status immediately
      setStatus('dialing')
      setActive(true)
      setCurrentCall(call)

      call.on('accept', () => {
        setCurrentCall(call)
        setStatus('connected')
        setActive(true)
      })

      call.on('disconnect', () => {
        setCurrentCall(null)
        setStatus('ended')
        setActive(false)
        setMetadata(null)
      })

      call.on('error', (error) => {
        console.error('[Voice] Call error:', error)
        toast.error('Call failed', { description: error.message })
        setCurrentCall(null)
        setStatus('error')
        setActive(false)
      })

    } catch (error: any) {
      console.error('[Voice] Connect failed:', error)
      toast.error('Could not initiate call', {
        description: error?.message || 'Check your internet connection and Twilio configuration.'
      })
      setStatus('error')
    }
  }, [device, isReady, initDevice, requestMicrophonePermission, resolvePhoneMeta, setActive, setStatus])

  const disconnect = useCallback(() => {
    if (currentCall) {
      currentCall.disconnect()
      setCurrentCall(null)
      setStatus('ended')
      setActive(false)
      setMetadata(null)
    }
  }, [currentCall, setActive, setStatus])

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
