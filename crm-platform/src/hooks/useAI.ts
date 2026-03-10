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

function cleanLine(value: unknown): string {
  return String(value ?? '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function neutralizeUnverifiedClaims(line: string): string {
  return line
    .replace(/following up on\s+some\s+phantom charges\s+flagged\s+in\s+[^.?!]*/gi, 'reaching out because we often see hidden cost drivers depending on agreement structure')
    .replace(/identified in (?:your|their)\s+recent\s+load\s+profile\s+audit/gi, 'that can show up in electricity agreements')
    .replace(/\bI just need to verify the correct email to send the findings to\b/gi, 'I just want to send a short note to the right person')
}

function isPlaceholderLine(value: string): boolean {
  const normalized = value.toLowerCase().trim()
  if (!normalized) return true
  return normalized === '...' || normalized === '[...]' || normalized === '"..."' || normalized.includes('spoken line here')
}

function buildScriptResult(source: Record<string, unknown>, fallback: ScriptResult): ScriptResult {
  const opener = neutralizeUnverifiedClaims(cleanLine(source.opener ?? source.Opener ?? fallback.opener))
  const hook = neutralizeUnverifiedClaims(cleanLine(source.hook ?? source.Hook ?? fallback.hook))
  const disturb = neutralizeUnverifiedClaims(cleanLine(source.disturb ?? source.Disturb ?? fallback.disturb))
  const close = neutralizeUnverifiedClaims(cleanLine(source.close ?? source.Close ?? fallback.close))

  const result: ScriptResult = {
    opener: isPlaceholderLine(opener) ? fallback.opener : opener,
    hook: isPlaceholderLine(hook) ? fallback.hook : hook,
    disturb: isPlaceholderLine(disturb) ? fallback.disturb : disturb,
    close: isPlaceholderLine(close) ? fallback.close : close
  }

  const gk = source.gatekeeperVariants
    ?? (source.gatekeeper != null && cleanLine(source.gatekeeper) ? [cleanLine(source.gatekeeper)] : undefined)
  if (Array.isArray(gk) && gk.length > 0) {
    result.gatekeeperVariants = gk
      .map((s) => neutralizeUnverifiedClaims(cleanLine(s)))
      .filter((s) => s && !isPlaceholderLine(s))
      .slice(0, 5)
  }
  if (Array.isArray(source.variants) && source.variants.length > 0) {
    result.variants = source.variants
      .filter((v): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v))
      .slice(0, 5)
      .map((v) => normalizeVariant(v, result))
    if (result.variants.length === 0) delete result.variants
  }
  return result
}

function parseFromLabeledText(rawText: string, fallback: ScriptResult): ScriptResult | null {
  const text = rawText.replace(/\r/g, '').trim()
  if (!text) return null
  const pick = (labels: string[]) => {
    const labelPattern = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const nextPattern = '(?:opener|hook|disturb|problem|close|next[-\\s]?step)'
    const re = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*[:\\-]\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextPattern})\\s*[:\\-]|$)`, 'i')
    const match = text.match(re)
    return cleanLine(match?.[1] ?? '')
  }

  const opener = neutralizeUnverifiedClaims(pick(['opener']))
  const hook = neutralizeUnverifiedClaims(pick(['hook']))
  const disturb = neutralizeUnverifiedClaims(pick(['disturb', 'problem', 'problem question']))
  const close = neutralizeUnverifiedClaims(pick(['close', 'next-step ask', 'next step ask']))
  if (!opener && !hook && !disturb && !close) return null
  return {
    opener: !isPlaceholderLine(opener) ? opener : fallback.opener,
    hook: !isPlaceholderLine(hook) ? hook : fallback.hook,
    disturb: !isPlaceholderLine(disturb) ? disturb : fallback.disturb,
    close: !isPlaceholderLine(close) ? close : fallback.close
  }
}

function parseFromFlattenedKeyValue(rawText: string, fallback: ScriptResult): ScriptResult | null {
  const text = rawText.replace(/\r/g, '').trim()
  if (!text) return null

  const pick = (key: 'opener' | 'hook' | 'disturb' | 'close', nextKeys: string[]) => {
    const nextPattern = nextKeys.join('|')
    const re = new RegExp(`${key}\\s*:\\s*([\\s\\S]*?)(?=(?:\\s*[\\n,]+\\s*(?:${nextPattern})\\s*:)|$)`, 'i')
    const match = text.match(re)
    return cleanLine(match?.[1] ?? '')
  }

  const opener = neutralizeUnverifiedClaims(pick('opener', ['hook', 'disturb', 'close', 'variants']))
  const hook = neutralizeUnverifiedClaims(pick('hook', ['disturb', 'close', 'variants']))
  const disturb = neutralizeUnverifiedClaims(pick('disturb', ['close', 'variants']))
  const close = neutralizeUnverifiedClaims(pick('close', ['variants']))

  if (!opener && !hook && !disturb && !close) return null

  return {
    opener: !isPlaceholderLine(opener) ? opener : fallback.opener,
    hook: !isPlaceholderLine(hook) ? hook : fallback.hook,
    disturb: !isPlaceholderLine(disturb) ? disturb : fallback.disturb,
    close: !isPlaceholderLine(close) ? close : fallback.close
  }
}

/** Strip markdown code fences and parse JSON; normalize to ScriptResult (gatekeeper + variants). */
function parseScriptContent(raw: unknown, riskVector: string): ScriptResult {
  const fallback: ScriptResult = {
    opener: "I'm not sure if you're the right person to speak with, so help me out for a second.",
    hook: `I noticed some ${riskVector} that might be impacting your operations.`,
    disturb: "Usually, when that happens, it leads to waste that nobody's tracking.",
    close: "Would you be opposed to a brief look at the data to see if that's the case?"
  }
  if (raw == null) return fallback
  let str: string
  if (typeof raw === 'string') {
    str = raw.trim()
  } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return buildScriptResult(raw as Record<string, unknown>, fallback)
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
    if (parsed && typeof parsed === 'object') return buildScriptResult(parsed, fallback)
  } catch {
    // If model wraps JSON with prose, recover the largest object block.
    const firstBrace = stripped.indexOf('{')
    const lastBrace = stripped.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const extracted = stripped.slice(firstBrace, lastBrace + 1)
        const parsed = JSON.parse(extracted) as Record<string, unknown>
        return buildScriptResult(parsed, fallback)
      } catch {
        // continue
      }
    }
    const labeled = parseFromLabeledText(stripped, fallback)
    if (labeled) return labeled
    const flattened = parseFromFlattenedKeyValue(stripped, fallback)
    if (flattened) return flattened
  }
  // Last resort: show raw model line instead of generic placeholder text.
  const usable = cleanLine(stripped.replace(/[{}[\]"]/g, ' '))
  if (usable && !isPlaceholderLine(usable)) {
    return {
      opener: usable,
      hook: fallback.hook,
      disturb: fallback.disturb,
      close: fallback.close
    }
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
    const isLogistics = /logistics|warehouse|distribution|freight|trucking|3pl/i.test(industry)

    const agentName = payload.contact_context.agent_name || 'Trey'
    const agentTitle = payload.contact_context.agent_title || 'Energy Consultant'
    const isCompanyPhone = !!payload.contact_context.is_account_only
    const nepqTargets = getNepqTargets(payload.contact_context.industry)
    const dmList = nepqTargets.decisionMaker.join(' or ')
    const championList = nepqTargets.champion.join(' or ')

    const systemPrompt = `You are a Nodal Point call coach. Generate cold-call scripts that are human, sharp, and aligned with our process. Use the agent name provided. Title is optional.

## Identity & Tone
 - Persona: Calm, curious, commercially sharp, peer-to-peer. Not "salesy."
- Language rule: NEVER use "Ghost Capacity." ALWAYS use "phantom charges" (and "hidden fees," "waste," "fees nobody's tracking").
- Philosophy: Complexity is a tax. We don't sell plans; we delete structural waste. Be the critic.
- Plain-English rule: Keep it conversational and easy to say out loud. No jargon on first call.
- Truthfulness rule: NEVER imply we already audited this specific company, found flagged errors, or reviewed their file unless verified evidence is explicitly provided in the input context.
- Uncertainty framing: Use "possible," "might," "one issue we sometimes see," and "depending on agreement structure."

## Agent (from plugins — use these)
- Agent name: ${agentName}
- Agent title: ${agentTitle}

## First-call objective (in this exact order)
1) Book a short meeting
2) Get a copy of the electricity bill
3) Identify the decision maker
Do NOT sell rates on first call. Do NOT promise savings.

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
- Connection → Situation → Problem awareness. We are not promising savings and we are not claiming an audit already happened.

## In-call assistance (when prospect/gatekeeper says something — use these rebuttals)
 - **"What is this in regards to?"** NEVER say guaranteed savings. Say: "Quick review request. We help Texas operators uncover costs buried in the electricity bill most companies do not realize are there, especially around delivery charges and demand-related spikes. I was trying to find who owns that internally."
- **"Just send an email"** -> "Happy to. I want to make it relevant, so who handles utility costs or agreement reviews there?"
- **"We already have a broker"** -> "That makes sense. I am curious, do they mostly shop rates, or also help with demand exposure and delivery-charge structure?"
- **If they bristle at "energy" or "electricity"** -> Use "operating budget," "utility cost structure," and "agreement review."

## Script sections — your job (you have full control)
We give principles and frames; you write what actually works.

- **Gatekeeper** (ONLY when calling company phone): Provide 3–4 gatekeeper variants, each a complete line the agent could say. Use these frames (you write the exact words):
  1. **Structural Review**: Mention we help with electricity agreement structure reviews for Texas operators. Ask who handles utility cost strategy—Controller/CFO/VP Operations.
  2. **Regulatory Shift**: Leverage recent utility/transmission rate adjustments (e.g. CenterPoint 2025/2026). "Brief on rate adjustments that affect Houston [Industry] companies." Ask who oversees the *operating budget* for the building (avoids "energy" = broker reflex).
  3. **Cost Driver Review**: Mention possible delivery-charge and demand-spike exposure depending on agreement structure. Ask who handles *vendor contracts* or utility cost review.
  4. **Internal Referral (NEPQ)**: "I was hoping you could help me out"—then your name, Nodal Point, and you're trying to find the person responsible for protecting [Company] from summer delivery spikes on the energy bill. Optionally name a title (e.g. Facilities Director) or "someone else I should be talking to?" Makes the gatekeeper your ally.
  Do NOT use vague "who handles infrastructure costs"—too broad; sounds like facilities/IT. Be specific so the call has a clear next step.
- **Opener**: Permission-based or pattern-interrupt. Use agent name. Short. No jargon. You choose the exact wording.
- **Hook**: Why you're calling—company, industry, the risk (phantom charges / hidden fees). Location or peer proof when it fits. You choose the angle and phrasing.
- **Disturb**: A "wait, what?" question—when was the last time someone showed them the waste, or what happens to their budget if X. You choose the question.
- **Close**: No-oriented, low-pressure commitment. You choose the exact wording.

## Required call flow for scripts
- Start with a disarming opener ("might be in the wrong place" / "quick question").
- Route to decision maker quickly.
- Use one engagement/discovery question that invites a real answer.
- Close with a low-pressure 10-15 minute meeting ask.

${isLogistics ? `## Logistics and warehouse guidance (apply strongly)
- Lean on operational drivers: forklifts, conveyors, compressors, refrigeration, warehouse peak usage.
- Mention hidden cost drivers: demand spikes, delivery charges, seasonal summer spikes, renewal timing.
- Example phrasing style: "one issue we see with warehouse operations is demand spikes hitting the bill harder than expected depending on how the agreement is structured."
- Keep framing on business impact and agreement structure, not headline rates.
` : ''}

## Freedom
Create 2–3 full script variants (opener, hook, disturb, close) and, when company phone, 3–4 gatekeeper variants (one per frame above, or mix). Keep each line punchy and under ~50 words. No technical jargon (no 4CP, demand ratchet, LOA, RFP, ancillary services, coincident peak). You have full control over the output for each section.

Current vector: ${payload.vector_type}
${payload.vector_type === 'LIVE_PIVOT' ? `Live context from the call: "${payload.contact_context.additional_context || 'None'}"` : ''}

OUTPUT (valid JSON only, no placeholders and no ellipses):
{
  ${isCompanyPhone ? '"gatekeeperVariants": ["<complete gatekeeper line 1>", "<complete gatekeeper line 2>", "<complete gatekeeper line 3>", "<complete gatekeeper line 4>"],\n  ' : ''}"opener": "<complete spoken opener line>",
  "hook": "<complete spoken hook line>",
  "disturb": "<complete spoken problem question>",
  "close": "<complete spoken next-step ask>",
  "variants": [
    { "opener": "<line>", "hook": "<line>", "disturb": "<line>", "close": "<line>" },
    { "opener": "<line>", "hook": "<line>", "disturb": "<line>", "close": "<line>" }
  ]
}
- When company phone: include gatekeeperVariants (array of 3–4 strings). One per frame: Structural Review, Regulatory Shift, Cost Driver Review, Internal Referral (NEPQ). Each string is a complete gatekeeper line; agent picks one.
- Include 2–3 full-script variants. Primary (opener/hook/disturb/close) is first recommended; variants are alternatives to play with.`

    try {
      let userContent = ''
      switch (payload.vector_type) {
        case 'OPENER':
          userContent = isCompanyPhone
            ? `Generate the full opening script for a cold call to ${payload.contact_context.company}'s main line. Include 3–4 gatekeeper variants (Structural Review, Regulatory Shift, Cost Driver Review, Internal Referral / NEPQ). Use the DM/Champion titles for ${payload.contact_context.industry}. Primary script should mirror Lewis's style: disarming opener, route to decision maker, and value framing around costs buried in the electricity bill most companies do not realize are there. Include 2–3 full-script variants where one is softer. Do not imply prior findings were already identified at this company.`
            : `Generate the full opening script for a cold call to ${payload.contact_context.name}, ${payload.contact_context.title} at ${payload.contact_context.company}. Primary should follow: disarming opener -> engagement question -> low-pressure meeting ask. Include 2–3 variants with one softer alternate and one direct version.`
          break
        case 'OBJECTION_EMAIL':
          userContent = `Prospect said "Can you just send me some information?" Generate a response that diffuses it and moves toward a commitment. Primary script + 2–3 variants.`
          break
        case 'OBJECTION_PRICE':
          userContent = `Prospect said they're under contract or pushed back on price. Use the agreement-structure pivot (not rate selling). Primary script + 2–3 variants.`
          break
        case 'MARKET_DATA':
          userContent = `Generate a data-driven script for ${payload.contact_context.industry} — market intelligence, hidden liabilities, phantom charges. Primary + 2–3 variants.`
          break
        case 'LIVE_PIVOT':
          userContent = `Prospect or gatekeeper just said: "${payload.contact_context.additional_context}". Generate a response: if it's a gatekeeper question ("what is this in regards to?", "send an email", "we have a broker") use the in-call rebuttals with uncertainty-first phrasing and no claim that we already audited them. Otherwise pivot to our value prop. Primary + 2 variants.`
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
          // Use native Gemini route (not OpenRouter) for tighter JSON behavior in call scripting.
          model: 'gemini-2.5-flash',
          jsonMode: true,
          temperature: 0.45,
          contextPurpose: 'active_call_script'
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
