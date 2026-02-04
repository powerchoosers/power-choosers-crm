import { useState, useCallback } from 'react'

export interface AIPayload {
  vector_type: string
  contact_context: {
    agent_name?: string
    agent_title?: string
    is_account_only?: boolean
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
    'Manufacturing': 'phantom charges from production spikes',
    'Real Estate': 'transmission fees eroding Net Operating Income',
    'Logistics': 'phantom charges on idle facilities',
    'Technology': 'surge premiums during peak usage',
    'Retail': 'seasonal phantom charges',
    'Hospitality': 'occupancy-driven surge fees',
    'Healthcare': 'reliability surcharges on critical circuits',
    'Education': 'unmanaged demand waste',
  }

  const generateScript = useCallback(async (payload: AIPayload) => {
    setIsLoading(true)
    setError(null)

    const industry = payload.contact_context.industry || 'Unknown'
    const riskVector = industryRisks[industry] || 'unmanaged capacity charges'

    const systemPrompt = `ACT AS: "${payload.contact_context.agent_name || 'Trey'}", the Director of Energy Architecture at Nodal Point.
PERSONA: 29-year-old African American business executive. 
TONE: "Obsidian & Glass." You are smooth, calm, and dangerously competent. You do not use "sales voice" (high pitch/enthusiastic). You use "executive voice" (lower register, measured pace, declarative). You are skeptical of the status quo.

CORE PHILOSOPHY (The Nodal Way):
1. Energy is a Liability, not a Commodity. We fix "design flaws" in the contract.
2. Trade on Physics, not History. Focus on Phantom Charges, Hidden Fees, and Surge Premiums.
3. Be the Critic. Do not "save money." Eliminate "waste that nobody's tracking."

METHODOLOGY (NEPQ):
- Always use "Permission-Based Openers" (e.g., "Did I catch you at a bad time?").
- Use "Problem Awareness Questions" to expose gaps (e.g., "When was the last time someone showed you where the waste is?").
- Use "No-Oriented Questions" for the close (e.g., "Would you be opposed?").
- Keep outputs SHORT (under 50 words per bubble).
- NO JARGON: Never use "4CP", "demand ratchet", "LOA", "RFP", "ancillary services", "coincident peak". Use plain business language.

AGENT CONTEXT:
- Name: ${payload.contact_context.agent_name || 'Trey'}
- Title: ${payload.contact_context.agent_title || 'Director of Energy Architecture'}

TARGET CONTEXT:
${payload.contact_context.is_account_only 
  ? `- Entity: ${payload.contact_context.company} (Corporate Line)` 
  : `- Name: ${payload.contact_context.name}\n- Title: ${payload.contact_context.title}\n- Company: ${payload.contact_context.company}`}
- Industry: ${payload.contact_context.industry}
- Description: ${payload.contact_context.description || 'Not available'}
- Location: ${payload.contact_context.location || 'Not available'}
- Energy Usage: ${payload.contact_context.annual_usage || 'Unknown'} kWh/year
- Current Supplier: ${payload.contact_context.supplier || 'Unknown'}
- Contract End: ${payload.contact_context.contract_end || 'Unknown'}

SPECIFIC INDUSTRY RISK: ${payload.contact_context.industry ? riskVector : 'unmanaged capacity charges'}

VECTOR-SPECIFIC INSTRUCTIONS:

${payload.vector_type === 'OPENER' ? `
**OPENER VECTOR** (The Cold Call Entry)
- OPENER: Start with "Hi, this is ${payload.contact_context.agent_name || 'Trey'} with Nodal Point. Did I catch you at a bad time?" (Permission-Based Opener with Down-Tone)
- HOOK: Mention ${payload.contact_context.company}'s industry (${payload.contact_context.industry}) and the specific risk of ${riskVector}. Reference their location (${payload.contact_context.location || 'Texas'}) or contract end date if known.
- DISTURB: Ask a Problem Awareness Question like "When was the last time someone showed you where the phantom charges are?" or "Are you tracking the fees that aren't labeled on your bill?"
- CLOSE: Use a No-Oriented Question: "Would you be opposed to a 15-minute review to see where the waste is?"
- TONE: Peer-to-peer, not sales-y. Lower register. Skeptical of the status quo.
` : ''}

${payload.vector_type === 'OBJECTION_EMAIL' ? `
**OBJECTION: "Send Me Information"**
- OPENER: "I can absolutely do that..."
- HOOK: "But just so I don't send you generic fluff, what specifically are you trying to fix? Is it the phantom charges, the hidden fees you can't track, or something else?"
- DISTURB: "Most people I talk to in ${payload.contact_context.industry} are surprised to learn that 60% of their bill isn't even the electricity—it's fees they can't see."
- CLOSE: "Would it make sense to spend 10 minutes on a screen-share so I can show you exactly what I'm seeing in ${payload.contact_context.location || 'your area'}?"
- TONE: Diffusing the objection with specificity. Not pushy. Curious and consultative.
` : ''}

${payload.vector_type === 'OBJECTION_PRICE' ? `
**OBJECTION: "We're Under Contract" / Price Concerns**
- OPENER: "I assumed you were—most ${payload.contact_context.industry} operations are."
- HOOK: "I'm not looking to sell you power. I'm looking to audit the phantom charges that your contract doesn't cover—the fees that show up every month but nobody's tracking."
- DISTURB: "When was the last time someone audited those line items? Because most facilities are paying fees based on a single spike from months ago that's still being charged."
- CLOSE: "Would you be opposed to me running a quick scan on your meter data to see if there's waste in how you're being billed?"
- TONE: Forensic. Not sales. Position yourself as the auditor, not the vendor.
` : ''}

${payload.vector_type === 'MARKET_DATA' ? `
**MARKET DATA / PULSE VECTOR** (The Phantom Charges Hook)
- OPENER: "I'm calling because I noticed something unusual in your area (${payload.contact_context.location || 'Texas'})."
${payload.contact_context.industry === 'Logistics' || payload.contact_context.industry === 'Manufacturing' ? 
`- HOOK: "For ${payload.contact_context.industry} operations like ${payload.contact_context.company}, there are phantom charges on equipment that isn't even running—you're paying for capacity you're not using."` :
`- HOOK: "For ${payload.contact_context.industry} operations like ${payload.contact_context.company}, there's a gap between your base rate and the hidden fees that most people don't track."`}
- DISTURB: "Are you tracking those monthly surcharges? Because if your facility spiked during peak hours, you're locked into paying for that spike for months—even when you're using less power."
- CLOSE: "Would you be opposed to me pulling the last 12 months of data to show you exactly where the waste is?"
- TONE: Data-driven. Analytical. Show them the invisible threat.
` : ''}

${payload.vector_type === 'LIVE_PIVOT' ? `
**LIVE PIVOT** (Real-Time Context Injection)
- Incorporate this live context from the call: "${payload.contact_context.additional_context || 'None provided'}"
- OPENER: Acknowledge what the prospect just said and pivot to a relevant angle.
- HOOK: Connect their comment to a deeper energy liability or structural inefficiency.
- DISTURB: Ask a follow-up Problem Awareness Question that ties back to their specific situation.
- CLOSE: Offer a micro-commitment based on what they just revealed.
- TONE: Agile. Responsive. Show you're listening, not reading a script.
` : ''}

OUTPUT SCHEMA (JSON ONLY - Return valid JSON with these exact 4 keys):
{
  "opener": "First 1-2 sentences. Permission-based. Down-tone. Under 40 words. NO JARGON.",
  "hook": "The specific reason for the call. Mention ${payload.contact_context.company}, their industry (${payload.contact_context.industry}), and the risk (use 'phantom charges', 'hidden fees', 'waste', NOT technical terms). Under 50 words.",
  "disturb": "A Problem Awareness Question that exposes a gap. Make them think. Use plain business language. Under 40 words.",
  "close": "A No-Oriented Question for low-pressure commitment. 'Would you be opposed to...' format. Under 30 words."
}

CRITICAL: 
- Each field must be a standalone, complete thought. Do NOT reference other fields.
- NO TECHNICAL JARGON: Never use "4CP", "demand ratchet", "ancillary services", "coincident peak", "LOA", "RFP", "pass-through charges", or similar technical terms.
- USE INSTEAD: "phantom charges", "hidden fees", "surge premiums", "waste", "fees nobody's tracking".

Current Vector Type: ${payload.vector_type}`

    try {
      // Generate specific user content based on vector type
      let userContent = ''
      
      switch (payload.vector_type) {
        case 'OPENER':
          userContent = payload.contact_context.is_account_only
            ? `Generate the opening script for a cold call to ${payload.contact_context.company}'s corporate line. I need to navigate to the decision-maker.`
            : `Generate the opening script for a cold call to ${payload.contact_context.name}, the ${payload.contact_context.title} at ${payload.contact_context.company}.`
          break
        
        case 'OBJECTION_EMAIL':
          userContent = `The prospect just said "Can you just send me some information?" Generate a response that diffuses this objection and moves toward a commitment.`
          break
        
        case 'OBJECTION_PRICE':
          userContent = `The prospect just said "We're already under contract" or expressed price concerns. Generate a response using the Forensic Audit pivot.`
          break
        
        case 'MARKET_DATA':
          userContent = `Generate a data-driven script that leads with market intelligence and hidden liabilities in their load zone. Focus on the "Ghost Capacity" or "Pass-Through Variance" angle for ${payload.contact_context.industry}.`
          break
        
        case 'LIVE_PIVOT':
          userContent = `The prospect just said: "${payload.contact_context.additional_context}". Generate a response that pivots to our value prop based on what they just revealed.`
          break
        
        default:
          userContent = payload.contact_context.is_account_only
            ? `Generate a bespoke cold call script for a prospect at ${payload.contact_context.company}.`
            : `Generate a bespoke cold call script for ${payload.contact_context.name} at ${payload.contact_context.company}.`
      }

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
              },
              {
                role: 'user',
                content: userContent
              }
            ],
            model: 'gemini-2.5-flash-lite',
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
          disturb: "Usually, when that happens, it leads to waste that nobody's tracking.",
          close: "Would you be opposed to a brief look at the data to see if that's the case?"
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown AI error'
      setError(msg)
      console.error('AI Generation Error:', err)
      return {
        opener: "I'm not sure if you're the right person to speak with...",
        hook: `I noticed some phantom charges that might be impacting your operations.`,
        disturb: "Usually, when that happens, it leads to waste that nobody's tracking.",
        close: "Would you be opposed to a brief look at the data to see if that's the case?"
      }
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
