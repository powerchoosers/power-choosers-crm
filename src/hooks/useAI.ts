import { useState, useCallback } from 'react'
import { getNepqTargets } from '@/lib/industry-mapping'

/** One full script variant (opener, hook, disturb, close). */
export interface ScriptVariant {
  opener: string
  situation: string
  hook: string
  disturb: string
  close: string
}

/** Script result: primary script, optional gatekeeper variants (company-phone only), optional full-script variants. */
export interface ScriptResult {
  opener: string
  situation: string
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
    situation: String(o.situation ?? o.Situation ?? fallback.situation),
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
    .replace(/following up on\s+some\s+phantom charges\s+flagged\s+in\s+[^.?!]*/gi, 'reaching out because we often see costs buried in the electricity bill most companies do not realize are there')
    .replace(/identified in (?:your|their)\s+recent\s+load\s+profile\s+audit/gi, 'that can show up in electricity agreements')
    .replace(/\bI just need to verify the correct email to send the findings to\b/gi, 'I just want to send a short note to the right person')
}

function isPlaceholderLine(value: string): boolean {
  const normalized = value.toLowerCase().trim()
  if (!normalized) return true
  return normalized === '...' || normalized === '[...]' || normalized === '"..."' || normalized.includes('spoken line here')
}

function ensureQuestion(line: string, fallback: string): string {
  const cleaned = cleanLine(line)
  if (!cleaned || isPlaceholderLine(cleaned)) return fallback
  return cleaned.includes('?') ? cleaned : `${cleaned.replace(/[.!\s]+$/, '')}?`
}

function buildScriptResult(source: Record<string, unknown>, fallback: ScriptResult): ScriptResult {
  const opener = neutralizeUnverifiedClaims(cleanLine(source.opener ?? source.Opener ?? fallback.opener))
  const situation = neutralizeUnverifiedClaims(cleanLine(source.situation ?? source.Situation ?? source.situation_question ?? fallback.situation))
  const hook = neutralizeUnverifiedClaims(cleanLine(source.hook ?? source.Hook ?? fallback.hook))
  const disturb = neutralizeUnverifiedClaims(cleanLine(source.disturb ?? source.Disturb ?? fallback.disturb))
  const close = neutralizeUnverifiedClaims(cleanLine(source.close ?? source.Close ?? fallback.close))

  const result: ScriptResult = {
    opener: isPlaceholderLine(opener) ? fallback.opener : opener,
    situation: ensureQuestion(situation, fallback.situation),
    hook: ensureQuestion(hook, fallback.hook),
    disturb: ensureQuestion(disturb, fallback.disturb),
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
    const nextPattern = '(?:opener|situation|hook|disturb|problem|close|next[-\\s]?step)'
    const re = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*[:\\-]\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextPattern})\\s*[:\\-]|$)`, 'i')
    const match = text.match(re)
    return cleanLine(match?.[1] ?? '')
  }

  const opener = neutralizeUnverifiedClaims(pick(['opener']))
  const situation = neutralizeUnverifiedClaims(pick(['situation', 'situation question']))
  const hook = neutralizeUnverifiedClaims(pick(['hook']))
  const disturb = neutralizeUnverifiedClaims(pick(['disturb', 'problem', 'problem question']))
  const close = neutralizeUnverifiedClaims(pick(['close', 'next-step ask', 'next step ask']))
  if (!opener && !situation && !hook && !disturb && !close) return null
  return {
    opener: !isPlaceholderLine(opener) ? opener : fallback.opener,
    situation: ensureQuestion(situation, fallback.situation),
    hook: ensureQuestion(hook, fallback.hook),
    disturb: ensureQuestion(disturb, fallback.disturb),
    close: !isPlaceholderLine(close) ? close : fallback.close
  }
}

function parseFromFlattenedKeyValue(rawText: string, fallback: ScriptResult): ScriptResult | null {
  const text = rawText.replace(/\r/g, '').trim()
  if (!text) return null

  const pick = (key: 'opener' | 'situation' | 'hook' | 'disturb' | 'close', nextKeys: string[]) => {
    const nextPattern = nextKeys.join('|')
    const re = new RegExp(`${key}\\s*:\\s*([\\s\\S]*?)(?=(?:\\s*[\\n,]+\\s*(?:${nextPattern})\\s*:)|$)`, 'i')
    const match = text.match(re)
    return cleanLine(match?.[1] ?? '')
  }

  const opener = neutralizeUnverifiedClaims(pick('opener', ['situation', 'hook', 'disturb', 'close', 'variants']))
  const situation = neutralizeUnverifiedClaims(pick('situation', ['hook', 'disturb', 'close', 'variants']))
  const hook = neutralizeUnverifiedClaims(pick('hook', ['disturb', 'close', 'variants']))
  const disturb = neutralizeUnverifiedClaims(pick('disturb', ['close', 'variants']))
  const close = neutralizeUnverifiedClaims(pick('close', ['variants']))

  if (!opener && !situation && !hook && !disturb && !close) return null

  return {
    opener: !isPlaceholderLine(opener) ? opener : fallback.opener,
    situation: ensureQuestion(situation, fallback.situation),
    hook: ensureQuestion(hook, fallback.hook),
    disturb: ensureQuestion(disturb, fallback.disturb),
    close: !isPlaceholderLine(close) ? close : fallback.close
  }
}

function parseFromLooseDelimited(rawText: string, fallback: ScriptResult): ScriptResult | null {
  const text = rawText.replace(/\r/g, ' ').replace(/\n/g, ' ').trim()
  if (!text) return null

  const pickLoose = (labels: string[]) => {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\b${escaped}\\b\\s*[:\\-]\\s*([\\s\\S]*?)(?=\\b(?:gatekeepervariants|opener|situation|hook|disturb|problem|close|next[-\\s]?step|variants|engagement question|problem-awareness question)\\b\\s*[:\\-]|$)`, 'i')
      const match = text.match(re)
      const value = cleanLine(match?.[1] ?? '')
      if (value) return value
    }
    return ''
  }

  const opener = neutralizeUnverifiedClaims(pickLoose(['opener', 'best-fit opener']))
  const situation = neutralizeUnverifiedClaims(pickLoose(['situation', 'situation question']))
  const hook = neutralizeUnverifiedClaims(pickLoose(['hook', 'engagement question']))
  const disturb = neutralizeUnverifiedClaims(pickLoose(['disturb', 'problem question', 'problem-awareness question']))
  const close = neutralizeUnverifiedClaims(pickLoose(['close', 'clean next-step ask', 'next-step ask']))

  if (!opener && !situation && !hook && !disturb && !close) return null

  return {
    opener: !isPlaceholderLine(opener) ? opener : fallback.opener,
    situation: ensureQuestion(situation, fallback.situation),
    hook: ensureQuestion(hook, fallback.hook),
    disturb: ensureQuestion(disturb, fallback.disturb),
    close: !isPlaceholderLine(close) ? close : fallback.close
  }
}

/** Strip markdown code fences and parse JSON; normalize to ScriptResult (gatekeeper + variants). */
function parseScriptContent(raw: unknown, riskVector: string): ScriptResult {
  const fallback: ScriptResult = {
    opener: "I'm not sure if you're the right person to speak with, so help me out for a second.",
    situation: "When your team reviews electricity agreements, who usually owns that internally?",
    hook: `Out of curiosity, where do costs feel least clear on your bill today around ${riskVector}?`,
    disturb: "If nothing changes before renewal, what usually happens to budget certainty?",
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
    const looseDelimited = parseFromLooseDelimited(stripped, fallback)
    if (looseDelimited) return looseDelimited
  }
  // Last resort: show raw model line instead of generic placeholder text.
  const usable = cleanLine(stripped.replace(/[{}[\]"]/g, ' '))
  if (usable && !isPlaceholderLine(usable)) {
    return {
      opener: usable,
      situation: fallback.situation,
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

  const generateScript = useCallback(async (payload: AIPayload) => {
    setIsLoading(true)
    setError(null)

    const industry = payload.contact_context.industry || 'Unknown'
    const agentName = payload.contact_context.agent_name || 'Lewis'
    const isCompanyPhone = !!payload.contact_context.is_account_only
    const nepqTargets = getNepqTargets(payload.contact_context.industry)
    const dmList = nepqTargets.decisionMaker.join(' or ')
    const championList = nepqTargets.champion.join(' or ')

    try {
      const vectorInstructionMap: Record<string, string> = {
        OPENER: 'Generate a cold-call opener sequence.',
        OBJECTION_EMAIL: 'Handle: "Can you just send me some information?" using NEPQ objection flow.',
        OBJECTION_PRICE: 'Handle: "We already have a broker" or "price/contract pushback" using NEPQ objection flow.',
        MARKET_DATA: 'Generate a context-based angle tied to business impact and agreement structure risk.',
        LIVE_PIVOT: `Respond to this live statement using NEPQ objection flow: "${payload.contact_context.additional_context || ''}".`
      }

      const vectorInstruction = vectorInstructionMap[payload.vector_type] || 'Generate a call script aligned to NEPQ Texas rules.'
      const userContent = [
        vectorInstruction,
        `Agent: ${agentName}`,
        `Company: ${payload.contact_context.company || 'Unknown'}`,
        `Contact: ${payload.contact_context.name || 'Unknown'} (${payload.contact_context.title || 'Unknown'})`,
        `Industry: ${industry}`,
        `Location: ${payload.contact_context.location || 'Texas'}`,
        `Contract end: ${payload.contact_context.contract_end || 'Unknown'}`,
        `Supplier: ${payload.contact_context.supplier || 'Unknown'}`,
        `Call mode: ${isCompanyPhone ? 'Company phone / gatekeeper likely' : 'Direct line'}`,
        `Decision maker titles to target: ${dmList}`,
        `Champion titles to identify: ${championList}`,
        'Return valid JSON only using opener/situation/hook/disturb/close and optional gatekeeperVariants + variants.'
      ].join('\n')

      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
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
        return parseScriptContent(null, 'agreement structure')
      }

      const content = parseScriptContent(data.content, 'agreement structure')
      return content
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown AI error'
      setError(msg)
      console.error('AI Generation Error:', err)
      return parseScriptContent(null, 'agreement structure')
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
