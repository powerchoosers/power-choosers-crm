'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { useCallStore } from '@/store/callStore'
import { toast } from 'sonner'
import { formatToE164 } from '@/lib/utils'

interface VoiceMetadata {
  name?: string
  account?: string
  title?: string
  logoUrl?: string
  domain?: string
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
  
  const { setStatus, setActive } = useCallStore()
  const tokenRefreshTimer = useRef<NodeJS.Timeout | null>(null)

  const resolvePhoneMeta = async (phoneNumber: string) => {
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
          } else if (data.account) {
            meta.name = data.account.name
            meta.logoUrl = data.account.logoUrl
            meta.domain = data.account.domain
          }
          return meta
        }
      }
    } catch (error) {
      console.warn('[Voice] Metadata resolution failed:', error)
    }
    return null
  }

  const initDevice = async () => {
    // Only initialize on the client side
    if (typeof window === 'undefined') return

    try {
      const response = await fetch('/api/twilio/token?identity=agent')
      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.statusText}`)
      }
      const data = await response.json()

      if (!data.token) {
        throw new Error('No token received from server')
      }

      const newDevice = new Device(data.token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        enableImprovedSignalingErrorPrecision: true,
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
      })

      newDevice.on('warning', (name, data) => {
        console.warn('[Voice] Device warning:', name, data || {})
      })

      newDevice.on('error', (error) => {
        console.error('[Voice] Device error:', error)
        toast.error('Twilio Device Error', { description: error.message })
        if (error.code === 20101 || error.code === 31204) {
          // Token expired or invalid, re-init
          initDevice()
        }
      })

      newDevice.on('incoming', async (call) => {
        console.log('[Voice] Incoming call')
        
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
      setDevice(newDevice)

      // Refresh token every 50 minutes
      if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current)
      tokenRefreshTimer.current = setInterval(initDevice, 50 * 60 * 1000)

    } catch (error) {
      console.error('[Voice] Failed to init device:', error)
      toast.error('Voice System Offline', { 
        description: 'Could not connect to Twilio service.' 
      })
    }
  }

  useEffect(() => {
    initDevice()
    return () => {
      if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current)
      if (device) {
        device.unregister()
        device.destroy()
      }
    }
  }, [])

  const connect = async (params: { To: string; From?: string; metadata?: VoiceMetadata }) => {
    if (!device || !isReady) {
      toast.error('Voice system not ready')
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

      const call = await device.connect({ 
        params: {
          To: toE164,
          From: fromE164
        }
      })

      setCurrentCall(call)
      setStatus('dialing')
      setActive(true)

      call.on('accept', () => {
        setStatus('connected')
        toast.success('Call Connected')
      })

      call.on('disconnect', () => {
        setCurrentCall(null)
        setStatus('ended')
        setActive(false)
        setIsMuted(false)
        toast.info('Call Ended')
      })

      call.on('error', (error) => {
        console.error('[Voice] Call error:', error)
        toast.error('Call Error', { description: error.message })
        setCurrentCall(null)
        setStatus('ended')
        setActive(false)
      })

    } catch (error) {
      console.error('[Voice] Connect failed:', error)
      toast.error('Failed to place call')
    }
  }

  const disconnect = () => {
    if (currentCall) {
      currentCall.disconnect()
    } else if (device) {
      // Sometimes device.disconnectAll() is safer
      // device.disconnectAll();
    }
  }

  const sendDigits = (digits: string) => {
    if (currentCall) {
      currentCall.sendDigits(digits)
    }
  }

  const mute = (muted: boolean) => {
    if (currentCall) {
      currentCall.mute(muted)
      setIsMuted(muted)
    }
  }

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
