import { useState, useCallback } from 'react'

export interface AIPayload {
  vector_type: string
  contact_context: {
    agent_name?: string
    agent_title?: string
    name?: string
    title?: string
    company?: string
    industry?: string
    description?: string
    location?: string
    annual_usage?: string
    supplier?: string
    load_zone?: string
    contract_end?: string
    additional_context?: string
  }
}

export function useAI() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const industryRisks: Record<string, string> = {
    'Manufacturing': 'production spikes triggering demand ratchets',
    'Real Estate': 'transmission charges eroding Net Operating Income (NOI)',
    'Logistics': 'ghost capacity charges on idle facilities',
    'Technology': 'scarcity adders during peak compute times',
    'Retail': 'seasonal base-load inflation',
    'Hospitality': 'occupancy-driven peak demand surcharges',
    'Healthcare': 'reliability premiums on critical life-safety circuits',
    'Education': 'unmanaged off-peak capacity leakage',
  }

  const generateScript = useCallback(async (payload: AIPayload) => {
    setIsLoading(true)
    setError(null)

    const industry = payload.contact_context.industry || 'Unknown'
    const riskVector = industryRisks[industry] || 'unmanaged capacity charges'

    const systemPrompt = `You are the Nodal Point "Forensic Architect". Your mission is to generate high-leverage outreach scripts using the NEPQ (Neuro-Emotional Persuasion Questioning) methodology.

AGENT CONTEXT:
- Name: ${payload.contact_context.agent_name}
- Title: ${payload.contact_context.agent_title}

TARGET CONTEXT:
- Name: ${payload.contact_context.name}
- Title: ${payload.contact_context.title}
- Company: ${payload.contact_context.company}
- Industry: ${payload.contact_context.industry}
- Description: ${payload.contact_context.description || 'Not available'}
- Location: ${payload.contact_context.location || 'Not available'}
- Energy Usage: ${payload.contact_context.annual_usage || 'Unknown'} kWh/year
- Current Supplier: ${payload.contact_context.supplier || 'Unknown'}
- Contract End: ${payload.contact_context.contract_end || 'Unknown'}

STRICT RULES:
1. PERSONALIZATION: The script MUST feel specifically tailored to ${payload.contact_context.company}. Use the company description and industry to mention specific operational risks or market dynamics relevant to them.
2. AGENT IDENTITY: Start the opener by introducing yourself as ${payload.contact_context.agent_name} from Nodal Point. Do NOT sound like a telemarketer.
3. NEPQ TONE: Use low-pressure, curious, and professional language. Avoid "How are you today?" or "I'm calling to save you money."
4. NO JARGON: Do not use industry terms like "deregulation", "LOA", or "RFP" unless explaining them in a forensic/analytical way.
5. SPECIFIC RISK: ${payload.contact_context.industry ? `Mention the specific risk of ${industryRisks[payload.contact_context.industry] || 'unmanaged volatility'} affecting their operations.` : ''}

OUTPUT SCHEMA (JSON ONLY):
{
  "opener": "Short, curious introduction. 'Hi [Name], it's ${payload.contact_context.agent_name} with Nodal Point...'",
  "hook": "The specific reason for the call today, mentioning ${payload.contact_context.company}'s specific situation or industry risk.",
  "disturb": "A NEPQ-style question that gently 'disturbs' their current state of mind about their energy strategy.",
  "close": "A low-pressure request for a brief diagnostic conversation."
}

Vector Type: ${payload.vector_type}
Additional Live Context: ${payload.contact_context.additional_context || 'None'}`

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: systemPrompt
            }
          ],
          model: 'openai/gpt-oss-120b:free',
          jsonMode: true
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate AI response')
      }

      const data = await response.json()
      
      // Handle potential stringified JSON in content
      try {
        const content = typeof data.content === 'string' ? JSON.parse(data.content) : data.content
        return content
      } catch (e) {
        console.error('Failed to parse AI JSON output:', data.content)
        return {
          opener: "I'm not sure if you're the right person to speak with...",
          hook: `I noticed some ${riskVector} that might be impacting your operations.`,
          disturb: "Usually, when that happens, it leads to significant cost leakage that goes unnoticed.",
          close: "Would you be open to a brief look at the data to see if that's actually the case?"
        }
      }
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
