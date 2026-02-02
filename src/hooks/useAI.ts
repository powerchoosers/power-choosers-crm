import { useState, useCallback } from 'react'

export interface AIPayload {
  vector_type: string
  contact_context: {
    title?: string
    industry?: string
    load_zone?: string
    contract_end?: string
    additional_context?: string
  }
}

export function useAI() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateScript = useCallback(async (payload: AIPayload) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `ACT AS A FORENSIC ENERGY BROKER AGENT. 
              VECTOR: ${payload.vector_type}
              CONTEXT: ${JSON.stringify(payload.contact_context)}
              
              Generate a short, high-impact script or insight based on this vector and context. 
              Be concise, professional, and slightly aggressive in a "data-driven" way. 
              No fluff. No standard greetings if not requested.`
            }
          ],
          model: 'openai/gpt-oss-120b:free' // Defaulting to the high-performance model
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate AI response')
      }

      const data = await response.json()
      return data.content as string
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown AI error'
      setError(msg)
      console.error('AI Generation Error:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    generateScript,
    isLoading,
    error
  }
}
