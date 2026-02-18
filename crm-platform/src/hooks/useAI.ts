import { useState, useCallback } from 'react'
import { getNepqTargets } from '@/lib/industry-mapping'

/** One full script variant (opener, hook, disturb, close). */
export interface ScriptVariant {
  opener: string
  hook: string
  disturb: string
  close: string
}

/** Script result: primary script, optional gatekeeper variants (company-phone only), optional full-script variants. */
export interface ScriptResult {
  opener: string
  hook: string
  disturb: string
  close: string
  /** 2–3 gatekeeper lines — only when calling company phone; pick one to use. */
  gatekeeperVariants?: string[]
  /** 2–3 alternative full scripts (opener, hook, disturb, close) for the same vector. */
  variants?: ScriptVariant[]
}

function normalizeVariant(o: Record<string, unknown>, fallback: ScriptResult): ScriptVariant {
  return {
    opener: String(o.opener ?? o.Opener ?? fallback.opener),
    hook: String(o.hook ?? o.Hook ?? fallback.hook),
    disturb: String(o.disturb ?? o.Disturb ?? fallback.disturb),
    close: String(o.close ?? o.Close ?? fallback.close)
  }
}

/** Strip markdown code fences and parse JSON; normalize to ScriptResult (gatekeeper + variants). */
function parseScriptContent(raw: unknown, riskVector: string): ScriptResult {
  const fallback: ScriptResult = {
    opener: "I'm not sure if you're the right person to speak with...",
    hook: `I noticed some ${riskVector} that might be impacting your operations.`,
    disturb: "Usually, when that happens, it leads to waste that nobody's tracking.",
    close: "Would you be opposed to a brief look at the data to see if that's the case?"
  }
  if (raw == null) return fallback
  let str: string
  if (typeof raw === 'string') {
    str = raw.trim()
  } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    const result: ScriptResult = {
      opener: String(o.opener ?? o.Opener ?? fallback.opener),
      hook: String(o.hook ?? o.Hook ?? fallback.hook),
      disturb: String(o.disturb ?? o.Disturb ?? fallback.disturb),
      close: String(o.close ?? o.Close ?? fallback.close)
    }
    const gk = o.gatekeeperVariants ?? (o.gatekeeper != null && String(o.gatekeeper).trim() ? [String(o.gatekeeper).trim()] : undefined)
    if (Array.isArray(gk) && gk.length > 0) result.gatekeeperVariants = gk.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
    if (Array.isArray(o.variants) && o.variants.length > 0) {
      result.variants = o.variants
        .filter((v): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v))
        .slice(0, 5)
        .map((v) => normalizeVariant(v, result))
      if (result.variants.length === 0) delete result.variants
    }
    return result
  } else {
    return fallback
  }
  if (!str) return fallback
  const stripped = str
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      const result: ScriptResult = {
        opener: String(parsed.opener ?? parsed.Opener ?? fallback.opener),
        hook: String(parsed.hook ?? parsed.Hook ?? fallback.hook),
        disturb: String(parsed.disturb ?? parsed.Disturb ?? fallback.disturb),
        close: String(parsed.close ?? parsed.Close ?? fallback.close)
      }
      const gk = parsed.gatekeeperVariants ?? (parsed.gatekeeper != null && String(parsed.gatekeeper).trim() ? [String(parsed.gatekeeper).trim()] : undefined)
      if (Array.isArray(gk) && gk.length > 0) result.gatekeeperVariants = gk.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
      if (Array.isArray(parsed.variants) && parsed.variants.length > 0) {
        result.variants = parsed.variants
          .filter((v): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v))
          .slice(0, 5)
          .map((v) => normalizeVariant(v, result))
        if (result.variants.length === 0) delete result.variants
      }
      return result
    }
  } catch {
    // ignore parse error
  }
  return fallback
}

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

    const agentName = payload.contact_context.agent_name || 'Trey'
    const agentTitle = payload.contact_context.agent_title || 'Director of Energy Architecture'
    const isCompanyPhone = !!payload.contact_context.is_account_only
    const nepqTargets = getNepqTargets(payload.contact_context.industry)
    const dmList = nepqTargets.decisionMaker.join(' or ')
    const championList = nepqTargets.champion.join(' or ')

    const systemPrompt = `You are a Forensic Energy Consultant at Nodal Point. Generate cold-call scripts that are human, sharp, and aligned with our philosophy. Use the agent name and title provided; they come from our plugins and must appear in the script.

## Identity & Tone
- Persona: Peer-level, authoritative, slightly impatient with market mediocrity. Not "salesy."
- Language rule: NEVER use "Ghost Capacity." ALWAYS use "phantom charges" (and "hidden fees," "waste," "fees nobody's tracking").
- Philosophy: Complexity is a tax. We don't sell plans; we delete structural waste. Be the critic.

## Agent (from plugins — use these)
- Agent name: ${agentName}
- Agent title: ${agentTitle}

## Target
${isCompanyPhone
        ? `- Calling the COMPANY PHONE (corporate line). No contact name yet; you must get past the gatekeeper first.`
        : `- Name: ${payload.contact_context.name}\n- Title: ${payload.contact_context.title}\n- Company: ${payload.contact_context.company}`}
- Company: ${payload.contact_context.company}
- Industry: ${payload.contact_context.industry}
- Location: ${payload.contact_context.location || 'Houston'}
- Description: ${payload.contact_context.description || 'Not available'}
- Energy usage: ${payload.contact_context.annual_usage || 'Unknown'} kWh/year | Supplier: ${payload.contact_context.supplier || 'Unknown'} | Contract end: ${payload.contact_context.contract_end || 'Unknown'}
- Industry-specific risk to lean on: ${riskVector}
${isCompanyPhone ? `
## Who we're actually looking for (use this in gatekeeper asks)
- For ${payload.contact_context.industry}: Decision Maker = ${dmList}. Champion (user) = ${championList}. Signal a *money* conversation (Controller, CFO, operating budget), NOT Facilities/IT—otherwise gatekeepers route to a "black hole." Avoid vague "who handles infrastructure costs"; that sounds like you're calling about the parking lot or a transformer.
` : ''}

## Research instruction (Forensic Scan)
Before writing, mentally: (1) One industry-specific energy pain. (2) Local context (e.g. Houston / CenterPoint rate hikes). (3) If possible, a peer org in the same sector for social proof.

## NEPQ (Neuro-Emotional Persuasion Questioning) — gatekeeper and connection
- NEPQ works with human nature: Safety, Clarity, Control. "Help me out" is one of the most powerful openers with gatekeepers—it lowers their status frame and invites them to be your ally (Internal Referral frame).
- Connection → Situation → Problem awareness. We're not selling; we're auditing / following up on a specific issue. Gatekeepers transfer "fixing an error" or "mandatory review" much more readily than "savings plan" or "energy broker."

## In-call assistance (when prospect/gatekeeper says something — use these rebuttals)
- **"What is this in regards to?"** NEVER say you want to save them money on their energy bill. ALWAYS say: "It's regarding the phantom charges identified in their recent load profile audit. I just need to verify the correct email to send the findings to."
- **"Just send an email"** → "I will—I need the right person so the findings don't sit in a generic inbox. Who handles the operating budget or vendor contracts for the building?"
- **"We already have a broker"** → "This isn't about switching—it's about errors in how the current load is being billed. I need to send the audit to whoever can fix that."
- **If they bristle at "energy" or "electricity"** → Use "operating budget," "delivery charges," or "load profile audit" instead. Frame: we're auditors fixing an error, not vendors offering a savings plan.

## Script sections — your job (you have full control)
We give principles and frames; you write what actually works.

- **Gatekeeper** (ONLY when calling company phone): Provide 3–4 gatekeeper variants, each a complete line the agent could say. Use these frames (you write the exact words):
  1. **Structural Audit**: Sound like an auditor who found a mathematical error. Mention "structural cost audit" on [Company]'s electricity load profile. Ask who you should speak with—Controller or CFO (signals money, not maintenance).
  2. **Regulatory Shift**: Leverage recent utility/transmission rate adjustments (e.g. CenterPoint 2025/2026). "Brief on rate adjustments that affect Houston [Industry] companies." Ask who oversees the *operating budget* for the building (avoids "energy" = broker reflex).
  3. **Phantom Charge Specialist**: You're following up on phantom charges flagged in the delivery portion of [Company]'s utility file. Ask who handles *vendor contracts* for the facility (billing error = more likely transfer than "savings plan").
  4. **Internal Referral (NEPQ)**: "I was hoping you could help me out"—then your name, Nodal Point, and you're trying to find the person responsible for protecting [Company] from summer delivery spikes on the energy bill. Optionally name a title (e.g. Facilities Director) or "someone else I should be talking to?" Makes the gatekeeper your ally.
  Do NOT use vague "who handles infrastructure costs"—too broad; sounds like facilities/IT. Be specific so the call has a clear next step.
- **Opener**: Permission-based or pattern-interrupt. Use agent name. Short. No jargon. You choose the exact wording.
- **Hook**: Why you're calling—company, industry, the risk (phantom charges / hidden fees). Location or peer proof when it fits. You choose the angle and phrasing.
- **Disturb**: A "wait, what?" question—when was the last time someone showed them the waste, or what happens to their budget if X. You choose the question.
- **Close**: No-oriented, low-pressure commitment. You choose the exact wording.

## Freedom
Create 2–3 full script variants (opener, hook, disturb, close) and, when company phone, 3–4 gatekeeper variants (one per frame above, or mix). Keep each line punchy and under ~50 words. No technical jargon (no 4CP, demand ratchet, LOA, RFP, ancillary services, coincident peak). You have full control over the output for each section.

Current vector: ${payload.vector_type}
${payload.vector_type === 'LIVE_PIVOT' ? `Live context from the call: "${payload.contact_context.additional_context || 'None'}"` : ''}

OUTPUT (valid JSON only):
{
  ${isCompanyPhone ? '"gatekeeperVariants": ["Structural Audit frame", "Regulatory Shift frame", "Phantom Charge frame", "Internal Referral / NEPQ frame"],\n  ' : ''}"opener": "...",
  "hook": "...",
  "disturb": "...",
  "close": "...",
  "variants": [
    { "opener": "...", "hook": "...", "disturb": "...", "close": "..." },
    { "opener": "...", "hook": "...", "disturb": "...", "close": "..." }
  ]
}
- When company phone: include gatekeeperVariants (array of 3–4 strings). One per frame: Structural Audit, Regulatory Shift, Phantom Charge Specialist, Internal Referral (NEPQ). Each string is a complete gatekeeper line; agent picks one.
- Include 2–3 full-script variants. Primary (opener/hook/disturb/close) is first recommended; variants are alternatives to play with.`

    try {
      let userContent = ''
      switch (payload.vector_type) {
        case 'OPENER':
          userContent = isCompanyPhone
            ? `Generate the full opening script for a cold call to ${payload.contact_context.company}'s main line. Include 3–4 gatekeeper variants (Structural Audit, Regulatory Shift, Phantom Charge Specialist, Internal Referral / NEPQ). Use the DM/Champion titles for ${payload.contact_context.industry}. Then primary opener/hook/disturb/close plus 2–3 full-script variants.`
            : `Generate the full opening script for a cold call to ${payload.contact_context.name}, ${payload.contact_context.title} at ${payload.contact_context.company}. Include 2–3 variant scripts.`
          break
        case 'OBJECTION_EMAIL':
          userContent = `Prospect said "Can you just send me some information?" Generate a response that diffuses it and moves toward a commitment. Primary script + 2–3 variants.`
          break
        case 'OBJECTION_PRICE':
          userContent = `Prospect said they're under contract or pushed back on price. Use the Forensic Audit pivot. Primary script + 2–3 variants.`
          break
        case 'MARKET_DATA':
          userContent = `Generate a data-driven script for ${payload.contact_context.industry} — market intelligence, hidden liabilities, phantom charges. Primary + 2–3 variants.`
          break
        case 'LIVE_PIVOT':
          userContent = `Prospect or gatekeeper just said: "${payload.contact_context.additional_context}". Generate a response: if it's a gatekeeper question ("what is this in regards to?", "send an email", "we have a broker") use the in-call rebuttals (phantom charges / load profile audit / verify email; never "save them money"). Otherwise pivot to our value prop. Primary + 2 variants.`
          break
        default:
          userContent = isCompanyPhone
            ? `Generate a bespoke cold call script for ${payload.contact_context.company} (company line). Include 3–4 gatekeeper variants (NEPQ frames) and 2–3 full-script variants.`
            : `Generate a bespoke cold call script for ${payload.contact_context.name} at ${payload.contact_context.company}. Primary + 2–3 variants.`
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
          model: 'google/gemini-2.5-flash',
          jsonMode: true
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate AI response')
      }

      const data = await response.json()

      if (data.error) {
        setError(typeof data.message === 'string' ? data.message : data.error)
        return parseScriptContent(null, riskVector)
      }

      const content = parseScriptContent(data.content, riskVector)
      return content
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown AI error'
      setError(msg)
      console.error('AI Generation Error:', err)
      return parseScriptContent(null, 'phantom charges')
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
