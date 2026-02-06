import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export type ProcessingStatus = 'idle' | 'processing' | 'ready' | 'error'

interface UseCallProcessorProps {
  callSid: string
  recordingUrl?: string
  recordingSid?: string
  contactId?: string
  accountId?: string
}

export function useCallProcessor({ callSid, recordingUrl, recordingSid, contactId, accountId }: UseCallProcessorProps) {
  const [status, setStatus] = useState<ProcessingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Subscribe to changes for this specific call (calls table uses camelCase: callSid, aiInsights)
  useEffect(() => {
    if (!callSid) return

    const channel = supabase
      .channel(`call-updates-${callSid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `callSid=eq.${callSid}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new || {}
          const hasInsights = !!(row.aiInsights ?? row.ai_insights)
          const hasTranscript = !!(row.transcript)
          if (hasInsights || hasTranscript) {
            setStatus('ready')
            queryClient.invalidateQueries({ queryKey: ['contact-calls', contactId] })
            queryClient.invalidateQueries({ queryKey: ['calls'] })
            if (accountId) {
              queryClient.invalidateQueries({ queryKey: ['account-calls', accountId] })
            }
            toast.success('Insights ready', { description: 'Click the eye icon to view call insights.' })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [callSid, contactId, accountId, queryClient])

  const processCall = useCallback(async () => {
    if (!callSid) return

    setStatus('processing')
    setError(null)
    toast.info('Processing call', { description: 'Starting AI analysis...' })

    try {
      // Step 1: Request CI processing
      const response = await fetch('/api/twilio/ci-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callSid,
          recordingUrl,
          recordingSid,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || data.details || 'Failed to process call')
      }

      const data = await response.json()
      
      if (data.ok) {
        setStatus('processing')

        const transcriptSid = data.transcriptSid
        let intervalId: ReturnType<typeof setInterval> | null = null

        const onComplete = () => {
          if (intervalId) clearInterval(intervalId)
          intervalId = null
          setStatus('ready')
          if (contactId) queryClient.invalidateQueries({ queryKey: ['contact-calls', contactId] })
          queryClient.invalidateQueries({ queryKey: ['calls'] })
          if (accountId) queryClient.invalidateQueries({ queryKey: ['account-calls', accountId] })
          toast.success('Insights ready', { description: 'View the call to see AI analysis and transcript.' })
        }

        const pokeAnalyzer = async () => {
          try {
            const pollRes = await fetch('/api/twilio/poll-ci-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcriptSid, callSid }),
            })
            const pollData = await pollRes.json().catch(() => ({}))
            if (pollData.analysisComplete === true) {
              onComplete()
              return
            }
            if (pollData.analysisFailed === true) {
              if (intervalId) clearInterval(intervalId)
              setStatus('error')
              setError(pollData.message || 'Analysis failed')
              toast.error('Processing failed', { description: pollData.message || 'Analysis failed' })
              return
            }
          } catch (e) {
            console.warn('Poll CI analysis failed:', e)
          }
        }

        pokeAnalyzer()

        intervalId = setInterval(() => {
          setStatus(prev => {
            if (prev === 'ready' || prev === 'error') return prev
            pokeAnalyzer()
            return prev
          })
        }, 4000)

        setTimeout(() => {
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }, 5 * 60 * 1000)
      } else {
        throw new Error(data.message || 'Failed to start processing')
      }
    } catch (err) {
      console.error('Error processing call:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to start processing'
      setError(errorMessage)
      setStatus('error')
      toast.error('Processing failed', { description: errorMessage })
    }
  }, [callSid, recordingUrl, recordingSid, contactId, accountId, queryClient])

  return {
    status,
    error,
    processCall,
  }
}
