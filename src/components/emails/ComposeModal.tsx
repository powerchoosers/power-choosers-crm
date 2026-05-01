'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import DOMPurify from 'dompurify'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useEmails } from '@/hooks/useEmails'
import { useAuth } from '@/context/AuthContext'
import { generateNodalSignature } from '@/lib/signature'
import { playClick, playWhoosh } from '@/lib/audio'
import { Loader2, X, Paperclip, Sparkles, Minus, Maximize2, Cpu, Check, RotateCcw, Zap, Type, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, ImageIcon, Palette, CalendarClock, Clock3 } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { buildAdaptiveEmailDocument, buildReadablePreviewDocument, ensureAdaptiveEmailDocument } from '@/lib/email-html'
import { ScanlineLoader } from '@/components/chat/ScanlineLoader'
import { INDUSTRY_VECTORS } from '@/lib/industry-mapping'
import { generateStaticHtml, substituteVariables, contactToVariableMap } from '@/lib/foundry'
import { buildFoundryContext, generateSystemPrompt, FoundryContext } from '@/lib/foundry-prompt'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { RichTextEditor } from './RichTextEditor'
import { EmailChipField } from './EmailChipField'
import type { Editor } from '@tiptap/react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ForensicClose } from '@/components/ui/ForensicClose'
import { format } from 'date-fns'

const EMAIL_AI_MODELS = [
  { value: 'google/gemini-2.5-flash', label: 'GEMINI-2.5-FLASH' },
  { value: 'google/gemini-2.5-flash-lite', label: 'GEMINI-2.5-FLASH-LITE' },
  { value: 'google/gemini-2.0-flash-001', label: 'GEMINI-2.0-FLASH' },
  { value: 'sonar-pro', label: 'SONAR-PRO' },
  { value: 'sonar', label: 'SONAR-STANDARD' },
  { value: 'openai/gpt-oss-120b:free', label: 'GPT-OSS-120B' },
  { value: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'NEMOTRON-30B' },
] as const

const TOOLBAR_COLORS = [
  '#FAFAFA', '#A1A1AA', '#EF4444', '#F97316', '#F59E0B',
  '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
  '#002FA7',
]

const CIRCLE_ICON_BUTTON_CLASS =
  'h-8 w-8 shrink-0 rounded-full border border-white/20 bg-transparent text-white transition-all duration-300 hover:border-white/30 hover:bg-white/5 hover:text-white'

export type EmailTypeId = 'cold_first_touch' | 'cold_followup' | 'professional' | 'followup' | 'post_call' | 'internal' | 'support'

function EmailIframePreview({ content }: { content: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(buildReadablePreviewDocument(content))
        doc.close()
      }
    }
  }, [content])

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-[760px] border-0 bg-white"
      title="Email Preview"
    />
  )
}

const DELIVERABILITY_RULES = `
DELIVERABILITY RULES:
- Avoid promotional spam language ("free", "act now", "discount", "save big", "limited time offer", "urgent").
- No em dashes (—) or en dashes (–). They look too machine-generated. Use commas or colons.
- Bullet points must be one single, short sentence. Max 15 words per bullet.
- For cold first-touch: do not include any links. Plain text only.
- TESTING: Do not send to yourself repeatedly. Email providers flag high-frequency same-domain traffic with tracking links as suspicious.`

/** Universal fallback angles — rotated by seed so same contact always gets the same angle. */
const UNIVERSAL_ENERGY_ANGLES = [
  `ANGLE: Contract Opacity / Rate Review
CONTEXT: Most commercial accounts are on contracts signed under different market conditions, often auto-renewing without review.
ANGLES: "When did you last formally benchmark your rate against current market prices?" "Most contracts auto-renew without anyone reviewing them — that's when the spread grows." Focus on contract opacity and the compounding cost of inaction.`,

  `ANGLE: Demand Charge / Ratchet Risk
CONTEXT: A single 15-minute peak interval can lock in the demand/delivery portion of the bill for 12 months in most Texas utility territories.
ANGLES: "One busy day can lock in your delivery costs for the rest of the year." "A single spike in summer stays on the bill all the way through winter." Focus on the asymmetric risk: one interval vs. 12 months of locked-in charges.`,

  `ANGLE: Non-Commodity / Delivery Charges
CONTEXT: In Texas deregulated markets, utility delivery charges (TDSP/TDU) are often 40–60% of the total bill and are rarely benchmarked or reviewed.
ANGLES: "How much of your bill is the utility portion that doesn't drop when commodity rates fall?" "The delivery side of your bill may have grown more than the commodity side without anyone noticing." Focus on the unreviewed portion of the bill.`,

  `ANGLE: Budget Volatility
CONTEXT: Variable rate exposure means energy bills swing significantly month-to-month, making operational budgeting unpredictable and reactive.
ANGLES: "How much did your energy bill swing last summer compared to winter?" "When the grid tightens, who gets the call about the spike?" Focus on budget unpredictability and who owns that risk inside their organization.`,
]

/** Returns a consistent angle for a given seed string (company/contact name) so the same contact always gets the same angle. */
function getUniversalEnergyAngle(seed?: string): string {
  if (!seed) return UNIVERSAL_ENERGY_ANGLES[0]
  const hash = seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return UNIVERSAL_ENERGY_ANGLES[hash % UNIVERSAL_ENERGY_ANGLES.length]
}

/** Maps industry to vertical-specific pain points and angles. Falls back to a universal angle if no specific match. */
function getIndustryAngle(industry: string | undefined, seed?: string): string {
  if (!industry || typeof industry !== 'string') return getUniversalEnergyAngle(seed)
  const normalized = industry.trim().toLowerCase()
  if (!normalized) return getUniversalEnergyAngle(seed)

  // Check for specific verticals
  if (normalized.includes('restaurant') || normalized.includes('food & beverage') || normalized.includes('food and beverage') || normalized.includes('hospitality')) {
    return `VERTICAL: Restaurants/Food Service
PAINS: Tight margins; power costs hit food cost and labor. Evening peaks (kitchen + HVAC + lights). Risk of spoilage during outages.
ANGLES: "Dinner rush can quietly set demand charges that crush margins." "How many minutes of outage before you start losing inventory?" Focus on operational peaks (rush hours) and margin impact, not generic summer peaks.`
  }
  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return `VERTICAL: Hotels/Hospitality
PAINS: Guest comfort (AC), occupancy-driven peaks. Common-area loads (lobby, conference, pool). Seasonality and weekend spikes.
ANGLES: "A few hot weekends can lock in demand charges for the off-season." "Have you ever seen a spike where guest comfort and your bill go in opposite directions?" Focus on occupancy patterns and the guest experience vs. cost tradeoff.`
  }
  if (normalized.includes('nonprofit') || normalized.includes('non-profit') || normalized.includes('non profit') || normalized.includes('shelter') || normalized.includes('community center')) {
    return `VERTICAL: Nonprofits/Community Organizations
PAINS: Fixed or donor-driven budgets. Mission-critical services; outages are reputational risk. Need predictability more than rock-bottom price.
ANGLES: "When the power bill jumps 15%, what program loses funding?" "You can't shut the doors when the grid gets tight; how are you insulating your budget from that volatility?" Focus on budget predictability and mission-critical reliability.`
  }
  if (normalized.includes('school') || normalized.includes('isd') || normalized.includes('education') || normalized.includes('district') || normalized.includes('university') || normalized.includes('college')) {
    return `VERTICAL: Schools/Education
PAINS: Large campuses with HVAC-driven peaks. Bond-funded projects need predictable OPEX. High summer usage when buildings are "empty".
ANGLES: "Empty buildings in August still set 12 months of charges." "What does a summer peak do to next year's budget per student?" Focus on summer HVAC when buildings are empty and per-student budget impact.`
  }
  if (normalized.includes('warehouse') || normalized.includes('logistics') || normalized.includes('distribution') || normalized.includes('3pl') || normalized.includes('freight')) {
    return `VERTICAL: Warehouses/Logistics
PAINS: Demand peaks during loading/unloading windows. Multi-site footprint with inconsistent usage. Refrigerated/conditioned space driving high kW. Contracts not matched to actual load profile.
ANGLES: "One busy loading window can set 12 months of charges." "We mapped your facilities and saw a spread in kW that isn't showing up in base rates." Focus on operational peaks (loading/unloading windows) and multi-site inconsistencies.`
  }
  if (normalized.includes('manufacturing') || normalized.includes('production') || normalized.includes('factory') || normalized.includes('fabrication') || normalized.includes('machining')) {
    return `VERTICAL: Manufacturing
PAINS: Production line peaks, shift changes, HVAC for conditioned spaces. Contracts often don't match actual load shape. High kW during production runs.
ANGLES: "One production run can set demand charges for months." "When all the lines are running, that peak can lock in next year's delivery costs." Focus on production-driven peaks and load shape mismatches between contract and actual usage.`
  }
  if (normalized.includes('healthcare') || normalized.includes('hospital') || normalized.includes('medical') || normalized.includes('clinic') || normalized.includes('urgent care') || normalized.includes('dental')) {
    return `VERTICAL: Healthcare
PAINS: 24/7 operations, critical equipment loads, HVAC for patient comfort. Outages are life-safety risks. Budget predictability matters more than lowest price.
ANGLES: "When the power bill jumps, what service gets cut?" "You can't shut down when the grid gets tight; how are you insulating your budget from that volatility?" Focus on reliability and budget predictability.`
  }
  if (normalized.includes('retail') || normalized.includes('store') || normalized.includes('supermarket') || normalized.includes('grocery')) {
    return `VERTICAL: Retail
PAINS: Customer-facing operations; peaks during business hours. Lighting, HVAC, and equipment loads. Tight margins; power costs hit profitability.
ANGLES: "Peak shopping hours can quietly set demand charges that eat into margins." "When all the lights and AC are maxed during busy hours, that peak locks in charges for months." Focus on customer-facing operational peaks and their margin impact.`
  }
  if (normalized.includes('real estate') || normalized.includes('property') || normalized.includes('commercial real estate') || normalized.includes('property management') || normalized.includes('reit')) {
    return `VERTICAL: Real Estate/Property Management
PAINS: Multi-tenant buildings with inconsistent usage. Common-area loads (hallways, elevators, parking lots). Tenant comfort vs. cost tradeoffs across floors.
ANGLES: "Common-area loads can set demand charges across the whole building." "When tenants crank AC on hot days, that peak locks in charges for all tenants for the next 12 months." Focus on multi-tenant dynamics and common-area load exposure.`
  }
  if (normalized.includes('construction') || normalized.includes('contractor') || normalized.includes('builder') || normalized.includes('general contractor') || normalized.includes('subcontractor')) {
    return `VERTICAL: Construction/Contractors
PAINS: Temporary service at job sites, unpredictable usage patterns. Main office/yard on permanent service with equipment peaks. Project-driven cost spikes.
ANGLES: "Heavy equipment startup at the yard can set demand charges even on slow months." "Are your job site accounts adding up to a number nobody's tracking?" Focus on job site vs. permanent service complexity and equipment-driven peaks.`
  }
  if (normalized.includes('oil') || normalized.includes('gas') || normalized.includes('oilfield') || normalized.includes('petroleum') || normalized.includes('midstream') || normalized.includes('upstream') || normalized.includes('downstream')) {
    return `VERTICAL: Oil & Gas
PAINS: High 24/7 power draws at production sites. Pump jack and compressor loads driving demand. Rate structure may not match intermittent production cycles.
ANGLES: "Pump jack startups during peak summer hours can set demand charges that stay for 12 months even when production dips." "Is your rate structure designed for a facility that runs 24/7 or one that cycles?" Focus on production cycle vs. flat rate mismatch.`
  }
  if (normalized.includes('auto') || normalized.includes('dealership') || normalized.includes('car dealer') || normalized.includes('automotive')) {
    return `VERTICAL: Auto Dealerships
PAINS: Large showroom lighting + HVAC, service bay equipment, EV charging infrastructure. High overhead with pressure on margins.
ANGLES: "Showroom lighting and service bays running 12 hours a day can quietly set demand charges that eat into service department margins." "How does your energy cost per vehicle sold compare to regional benchmarks?" Focus on overhead-to-revenue ratio and the service bay peak load.`
  }
  if (normalized.includes('fitness') || normalized.includes('gym') || normalized.includes('recreation center') || normalized.includes('athletic') || normalized.includes('sport')) {
    return `VERTICAL: Fitness/Recreation
PAINS: HVAC and ventilation costs in high-occupancy workout spaces. Evening and weekend occupancy peaks. Membership-driven revenue vs. fixed utility costs.
ANGLES: "Peak class hours can set demand charges that run for months even on slow weeks." "How much of your monthly overhead is the power bill, and does it match your membership revenue curve?" Focus on peak occupancy periods and the mismatch between usage spikes and flat billing.`
  }
  if (normalized.includes('office') || normalized.includes('professional service') || normalized.includes('law firm') || normalized.includes('accounting') || normalized.includes('consulting') || normalized.includes('financial service')) {
    return `VERTICAL: Professional Services/Office
PAINS: HVAC-heavy during business hours. Predictable 9-5 usage but rate rarely reviewed. Often still on a default utility rate set when they moved in.
ANGLES: "Most offices are on a rate that was set up when they signed their lease and never revisited." "A large open-plan office can have higher demand spikes than expected just from HVAC startup in the morning." Focus on the unreviewed default rate and HVAC startup peaks.`
  }
  if (normalized.includes('data center') || normalized.includes('colocation') || normalized.includes('colo') || normalized.includes('hosting') || normalized.includes('tech') || normalized.includes('technology')) {
    return `VERTICAL: Technology/Data Centers
PAINS: High, consistent 24/7 power draw. Cooling overhead adding 30–40% on top of IT load. Rate structure critical for flat vs. variable loads.
ANGLES: "With 24/7 load, your rate structure should look different than a facility that peaks and drops." "Cooling load can add 30–40% on top of IT power draw — is that reflected in your contract?" Focus on load shape mismatch and cooling overhead.`
  }
  if (normalized.includes('agriculture') || normalized.includes('farm') || normalized.includes('ranch') || normalized.includes('irrigation') || normalized.includes('nursery') || normalized.includes('greenhouse')) {
    return `VERTICAL: Agriculture/Farming
PAINS: Irrigation pumping during hot months creating massive, brief demand peaks. Seasonal usage patterns that don't match year-round rate structures.
ANGLES: "Irrigation pump startups during peak summer hours can set demand charges that last all year." "Your summer irrigation load and your winter storage load look nothing alike — is your rate built for both?" Focus on irrigation-driven demand peaks and the seasonal mismatch.`
  }
  if (normalized.includes('self storage') || normalized.includes('self-storage') || normalized.includes('mini storage') || normalized.includes('storage unit') || normalized.includes('public storage')) {
    return `VERTICAL: Self Storage
PAINS: Climate-controlled units driving HVAC costs. 24/7 lighting and security. Often underestimated energy overhead for what looks like a passive asset class.
ANGLES: "Climate-controlled units are quietly one of the highest per-square-foot energy costs in commercial real estate." "How does the energy cost per occupied unit compare to what you projected when you underwrote the deal?" Focus on surprise energy overhead relative to underwriting assumptions.`
  }
  if (normalized.includes('municipal') || normalized.includes('government') || normalized.includes('city') || normalized.includes('county') || normalized.includes('public sector')) {
    return `VERTICAL: Municipal/Government
PAINS: Multi-building portfolio with inconsistent rate structures. Budget cycles that don't align with energy market timing. Public procurement rules limiting flexibility.
ANGLES: "With multiple buildings across different accounts, the rate spread across your portfolio might surprise you." "Most municipal accounts were set up on default rates during procurement — those rates rarely get benchmarked." Focus on portfolio-wide rate inconsistency and the procurement inertia that locks in uncompetitive rates.`
  }

  // Check INDUSTRY_VECTORS for broader matches
  for (const [vector, values] of Object.entries(INDUSTRY_VECTORS)) {
    const match = values.some(v => normalized.includes(v.toLowerCase()) || v.toLowerCase().includes(normalized))
    if (match) {
      if (vector === 'Food & Beverage') {
        return `VERTICAL: Food & Beverage
PAINS: Tight margins; power costs hit food cost and labor. Evening peaks (kitchen + HVAC + lights).
ANGLES: "Dinner rush can quietly set demand charges that crush margins." Focus on operational peaks and margin impact.`
      }
      if (vector === 'Logistics & Warehouse') {
        return `VERTICAL: Logistics/Warehouse
PAINS: Demand peaks during loading/unloading. Multi-site footprint with inconsistent usage.
ANGLES: "One busy loading window can set 12 months of charges." Focus on operational peaks and multi-site inconsistencies.`
      }
      if (vector === 'Education') {
        return `VERTICAL: Education
PAINS: Large campuses with HVAC-driven peaks. High summer usage when buildings are "empty".
ANGLES: "Empty buildings in August still set 12 months of charges." Focus on summer HVAC when buildings are empty.`
      }
      if (vector === 'Healthcare') {
        return `VERTICAL: Healthcare
PAINS: 24/7 operations, critical equipment loads. Budget predictability matters.
ANGLES: "When the power bill jumps, what service gets cut?" Focus on reliability and budget predictability.`
      }
      if (vector === 'Manufacturing') {
        return `VERTICAL: Manufacturing
PAINS: Production line peaks, shift changes, HVAC for conditioned spaces.
ANGLES: "One production run can set demand charges for months." Focus on production-driven peaks.`
      }
    }
  }

  // No specific industry match — return a universal angle keyed to the seed
  return getUniversalEnergyAngle(seed)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripCodeFences(value: string): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  const fenced = raw.match(/^```(?:html|json|text|markdown)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : raw
}

function htmlToPlainText(value: string): string {
  return (value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
}

function cleanParsedSubject(value: string | null): string | null {
  if (!value) return null
  const cleaned = value
    .replace(/^\s*["'`]+|["'`]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  if (/^(body|email body|message)\s*[:\-]?$/i.test(cleaned)) return null
  return cleaned
}

function cleanParsedBody(value: string): string {
  return (value || '')
    .replace(/^\s*(?:body|email body|message)\s*[:\-]\s*/i, '')
    .replace(/(?:\r?\n|\s*<br\s*\/?>\s*)\s*body\s*$/i, '')
    .trim()
}

function looksLikeStandaloneSubjectLine(line: string): boolean {
  const trimmed = (line || '').trim()
  if (!trimmed) return false
  if (trimmed.length < 4 || trimmed.length > 90) return false
  if (/^(hi|hello|dear)\b/i.test(trimmed)) return false
  if (/[,:;]\s*$/.test(trimmed)) return false
  if (/^(subject|body|email body|message)\b/i.test(trimmed)) return false
  const words = trimmed.split(/\s+/).length
  return words >= 2 && words <= 14
}

function parseAiEmailOutput(rawValue: string): { subject: string | null; body: string } {
  const raw = stripCodeFences(rawValue)
  if (!raw) return { subject: null, body: '' }

  const looksJson = raw.startsWith('{') && raw.endsWith('}')
  if (looksJson) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const candidateSubject = cleanParsedSubject(
          parsed.subject ?? parsed.emailSubject ?? parsed.title ?? null
        )
        const candidateBodyRaw = parsed.body ?? parsed.content ?? parsed.emailBody ?? parsed.message ?? parsed.html ?? ''
        const candidateBody = Array.isArray(candidateBodyRaw)
          ? candidateBodyRaw.join('\n')
          : String(candidateBodyRaw || '')
        if (candidateSubject || candidateBody.trim()) {
          return { subject: candidateSubject, body: cleanParsedBody(candidateBody) }
        }
      }
    } catch {
      // Fall through to text/html parsing.
    }
  }

  const plain = htmlToPlainText(raw)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const plainLines = plain.split('\n')
  const subjectLineIndex = plainLines.findIndex((line) => /^\s*subject\s*[:\-]\s*.+/i.test(line))

  if (subjectLineIndex >= 0) {
    const line = plainLines[subjectLineIndex] || ''
    const subMatch = line.match(/^\s*subject\s*[:\-]\s*(.+)$/i)
    const parsedSubject = cleanParsedSubject(subMatch?.[1] ?? null)
    const plainBody = plainLines.slice(subjectLineIndex + 1).join('\n').trim()

    if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
      const htmlWithoutSubject = raw
        .replace(
          /^\s*(?:<p[^>]*>\s*)?(?:<strong>\s*)?subject\s*[:\-]\s*(?:<\/strong>\s*)?/i,
          ''
        )
        .replace(/^\s*[^<\r\n]+(?:<\/p>)?\s*(?:<br\s*\/?>|\r?\n)+/i, '')
      return {
        subject: parsedSubject,
        body: cleanParsedBody(htmlWithoutSubject || plainBody),
      }
    }

    return { subject: parsedSubject, body: cleanParsedBody(plainBody) }
  }

  // Fallback: if the first short line looks like a subject and the next line starts the body, split it.
  if (plainLines.length >= 2 && looksLikeStandaloneSubjectLine(plainLines[0])) {
    const inferredSubject = cleanParsedSubject(plainLines[0])
    const inferredBody = cleanParsedBody(plainLines.slice(1).join('\n'))
    if (inferredSubject && inferredBody) {
      return { subject: inferredSubject, body: inferredBody }
    }
  }

  return { subject: null, body: cleanParsedBody(raw) }
}

function buildFallbackSubject(
  emailType: EmailTypeId,
  context: ComposeContext | null,
  to: string,
  foundryContext: FoundryContext | null,
  body: string
): string {
  const company = (context?.companyName || context?.accountName || '').trim()
  const contactName = (context?.contactName || '').trim()
  const contactFirst = contactName ? contactName.split(/\s+/)[0] : ''
  const toName = to.includes('@') ? to.split('@')[0] : to
  const target = company || contactFirst || toName || 'your team'

  const cleanSubject = (value: string): string =>
    value
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([:;,])/g, '$1')
      .trim()
      .slice(0, 70)

  const cleanTopic = (value?: string | null): string | null => {
    if (!value) return null
    const sanitized = value
      .replace(/[\r\n]+/g, ' ')
      .replace(/["'“”‘’]+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!sanitized) return null
    const trimmed = sanitized.split(' ').slice(0, 8).join(' ')
    return trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed
  }

  const bodyText = htmlToPlainText(body || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  const bodyLines = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(hi|hello|dear)\b/i.test(line))
    .filter((line) => !/^(best|thanks|sincerely|regards)\b/i.test(line))
  const bodyPreview = bodyLines.join(' ').toLowerCase()
  const bodyTopic = (() => {
    if (!bodyPreview) return null
    if (/(electricity|energy)\b/.test(bodyPreview) && /(pricing|price|rates?|rate)\b/.test(bodyPreview)) return 'electricity pricing'
    if (/(electricity|energy)\b/.test(bodyPreview) && /(agreement|agreements|contract|renewal|terms?)\b/.test(bodyPreview)) return 'electricity agreements'
    if (/(pricing|price|rates?|rate)\b/.test(bodyPreview)) return 'pricing options'
    if (/(contract|agreement|renewal|terms?)\b/.test(bodyPreview)) return 'contract options'
    if (/(locations?|sites?|facilit(y|ies))\b/.test(bodyPreview)) return 'your locations'
    if (/(proposal|pdf|attachment|attached)\b/.test(bodyPreview)) return 'the attached proposal'
    if (/(call|conversation|spoke|talked)\b/.test(bodyPreview)) return 'our call'
    return null
  })()

  const contextTopic = cleanTopic(context?.contextForAi)
  const transcriptTopic = cleanTopic(
    foundryContext?.intelligence.summary ||
      foundryContext?.intelligence.transcripts[0] ||
      context?.contextForAi
  )
  const topic = bodyTopic || contextTopic || transcriptTopic

  const conversationalTopic = (topic || 'update').toLowerCase()
  const conversationalTarget = target === 'your team' ? '' : target

  switch (emailType) {
    case 'post_call':
      return cleanSubject(conversationalTarget ? `${conversationalTopic} for ${conversationalTarget}` : `${conversationalTopic} details`)
    case 'cold_first_touch':
      return cleanSubject(conversationalTarget ? `${conversationalTopic} for ${conversationalTarget}` : `${conversationalTopic} details`)
    case 'cold_followup':
      return cleanSubject(conversationalTarget ? `${conversationalTopic} for ${conversationalTarget}` : `${conversationalTopic} details`)
    case 'followup':
      return cleanSubject(conversationalTarget ? `${conversationalTopic} for ${conversationalTarget}` : `${conversationalTopic} details`)
    case 'internal':
      return cleanSubject(conversationalTarget ? `internal update for ${conversationalTarget}` : `internal update`)
    case 'support':
      return cleanSubject(conversationalTarget ? `support update for ${conversationalTarget}` : `support update`)
    case 'professional':
    default:
      return cleanSubject(conversationalTarget ? `${conversationalTopic} for ${conversationalTarget}` : `${conversationalTopic} details`)
  }
}

function isGenericAiSubject(value: string | null): boolean {
  const normalized = (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!normalized) return true

  const words = normalized.split(' ').length
  if (normalized.length > 68) return true
  if (/\b(i|we|our)\b/.test(normalized) && words > 8) return true
  if (/\bat\b.+\bwe\b/.test(normalized)) return true
  if (/(good|great)\s+talking\s+with\s+you/.test(normalized)) return true
  if (/i\s+wanted\s+to\s+follow\s+up/.test(normalized)) return true
  if (/as\s+we\s+discussed/.test(normalized)) return true
  if (/^follow(?:ing)?\s+up\s+on\s+good\s+talking/.test(normalized)) return true
  if (/^(following up|follow up|quick follow up|checking in|touching base)$/.test(normalized)) return true
  if (/^(following up from our call|follow up from our call|post call follow up)$/.test(normalized)) return true
  if (/^(following up from our call|follow up from our call)\b/.test(normalized)) return true
  if (/^(following up|follow up|quick follow up|checking in|touching base)\b/.test(normalized) && words <= 6) return true

  return false
}

function normalizeSubjectOutput(value: string | null): string | null {
  if (!value) return null
  const firstLine = value.split('\n').find((line) => line.trim().length > 0) || ''
  const cleaned = firstLine
    .replace(/^\s*subject\s*[:\-]\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 70)
  return cleaned || null
}

function isTitleCaseHeavy(value: string | null): boolean {
  const subject = (value || '').trim()
  if (!subject) return false
  const tokens = subject.split(/\s+/).filter((t) => /[A-Za-z]/.test(t))
  if (tokens.length < 5) return false
  const titleLike = tokens.filter((t) => /^[A-Z][a-z]+$/.test(t)).length
  return titleLike / tokens.length > 0.65
}

function aiBodyToEditorHtml(body: string): string {
  const raw = (body || '')
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, '\n')
    .replace(/&lt;\s*\/p\s*&gt;/gi, '\n\n')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  if (!raw) return ''

  // If model already returned HTML, keep it as-is.
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw

  const normalized = raw.replace(/\r\n?/g, '\n')
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

function normalizeEditorHtmlForEmail(html: string): string {
  if (!html) return html

  // Email clients often ignore paragraph margins, so keep paragraph blocks flat
  // and insert explicit spacer rows between them.
  const normalizedParagraphs = html.replace(/<p([^>]*)>/gi, (_match, rawAttrs: string = '') => {
    const attrs = rawAttrs || ''
    const styleMatch = attrs.match(/\sstyle=(['"])(.*?)\1/i)

    if (styleMatch) {
      const quote = styleMatch[1]
      const styleValue = styleMatch[2]
      const hasMargin = /(^|;)\s*margin\s*:/i.test(styleValue)
      const needsSemicolon = styleValue.trim() !== '' && !styleValue.trim().endsWith(';')
      let mergedStyle = hasMargin
        ? styleValue.replace(/margin\s*:[^;]+;?/i, 'margin:0;')
        : `${styleValue}${needsSemicolon ? ';' : ''} margin:0;`
      if (!/line-height\s*:/i.test(mergedStyle)) {
        mergedStyle += `${mergedStyle.trim().endsWith(';') ? '' : ';'} line-height:1.45;`
      }
      return `<p${attrs.replace(styleMatch[0], ` style=${quote}${mergedStyle}${quote}`)}>`
    }

    return `<p${attrs} style="margin:0; line-height:1.45;">`
  })

  return normalizedParagraphs
    .replace(
      /<p([^>]*)>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi,
      '<div class="compose-email-paragraph-spacer" style="line-height:12px; font-size:12px;">&nbsp;</div>'
    )
    .replace(
      /<\/p>\s*<p/gi,
      '</p><div class="compose-email-paragraph-spacer" style="line-height:12px; font-size:12px;">&nbsp;</div><p'
    )
}

function buildComposeEmailDocument(bodyHtml: string, signatureHtml: string): string {
  return buildAdaptiveEmailDocument(bodyHtml, signatureHtml)
}

function ensureDarkModeEmailSupport(html: string): string {
  return ensureAdaptiveEmailDocument(html)
}

interface EmailTypeConfig {
  id: EmailTypeId
  label: string
  /** Base system prompt (identity + rules). Receives { signerName, to, subject }. */
  getSystemPrompt: (ctx: { signerName: string; to: string; subject: string }) => string
  /** Refinement-mode instruction appended when user has existing content. */
  getRefinementInstruction: () => string
  /** Chips shown when body is empty (generation mode). */
  generationChips: { label: string; directive: string }[]
  /** Chips shown when body has content (refinement mode). */
  refinementChips: { label: string; directive: string }[]
}

const EMAIL_TYPES: EmailTypeConfig[] = [
  {
    id: 'cold_first_touch',
    label: 'Cold (first touch)',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are an Energy Market Advisor at Nodal Point. You write FIRST-TOUCH COLD emails that are short, trigger-led, and plain text only.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user provides specific notes or a prompt, you MUST preserve their exact facts, numbers, and intent. Do NOT override their message with generic filler.

STRUCTURE: TRIGGER (one observable: operational peak, tariff change, expansion, or vertical-specific trigger) → PAIN (one sentence, in plain English, using vertical-specific angle if provided: e.g. for restaurants "dinner rush can set demand charges that crush margins", for warehouses "one busy loading window can set 12 months of charges", for schools "empty buildings in August still set 12 months of charges", generic fallback "summer peaks locking in next year's costs") → PROOF (brief peer/similar facility) → One question as CTA.
ANGLES: If VERTICAL-SPECIFIC ANGLE is provided above, use it as supporting context, not a rigid script. If USER CONTEXT includes a named person, prior conversation, or specific business detail, lead with that first and let the angle support the second sentence. If no user context is provided, vary between: summer peaks & transmission charges, winter ratchet effect, pass-through/non-commodity charges, budget volatility, operational peaks.
WORD COUNT: Entire email 40–80 words (first-touch sweet spot for reply rates).
LANGUAGE: Use plain English that ops, finance, and facility managers understand. Do NOT use jargon (4CP, ratchet, TDU, pass-through, demand charge, coincident peak, non-commodity) unless RECIPIENT CONTEXT explicitly indicates the recipient is an energy manager, director of energy, or similar. When in doubt, describe the mechanism in plain language (e.g. "summer peaks that lock in next year's transmission costs", "one winter spike that can set your delivery charges for the next 12 months", "charges from your utility that aren't the energy commodity").
SENDER: ${signerName}
RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Optional. If you include a greeting (e.g. "Hi {firstName},"), you MUST follow it with TWO (2) line breaks so a blank line exists before the email body. NEVER put the body on the same line as the greeting. Patterns:
(a) Plain statement of the problem (no greeting): "When summer peaks hit, a few 15-minute intervals can lock in next year's transmission charges."
(b) Question about visibility: "Does anyone on your team track how summer peaks affect next year's budget?"
(c) Brief observation about their footprint: "With three warehouses in DFW, a few summer peaks can lock in charges across the whole footprint."
(d) Short greeting + blank line + problem: "Hi {firstName},\n\nSummer peaks can quietly set next year's delivery costs."
Do NOT use: "I hope this email finds you well", "I'd love to connect", "circle back", "touch base", "you're likely aware", "you're likely seeing", "you're probably aware". These sound templated and AI-written.
CLOSING: Minimal sign-off: "Best," or "Thanks," followed by the SENDER name from above (first name only for cold, e.g. "Best,\\n[SENDER first name]" or "– [SENDER first name]"). Always use the actual SENDER name from the prompt, not a placeholder. No formal sign-offs.

SUBJECT LINE (when generating): 4–7 words, clear and specific. Do NOT put the recipient's first name in the subject (it looks automated). Use plain-English subject; you may reference company or location when it adds clarity (e.g. "Summer transmission charges in Dallas", "Summer peak risk at your Dallas DC", "Transmission costs on your DFW sites"). Reserve jargon like "4CP exposure" for when the recipient is clearly an energy manager. Match body honestly; no clickbait. Avoid all caps and excessive punctuation.
CTA: Always end with one clear question in plain English. Vary your CTA style randomly — choose one of:
- Yes/no question: "Is anyone tracking how those peaks affect next year's budget?"
- Open question: "What happens to your budget when those peaks hit?"
- Soft suggestion: "Worth a quick look on your side?"
Do not use "4CP exposure", "modeling", "mitigating", or "on your radar" in the closing question unless the recipient is an energy manager. Do not combine multiple asks in one email. Avoid repeating the same CTA wording across emails.

PERSONALIZATION (use RECIPIENT CONTEXT when provided): You may mention the recipient's title or company **once** in the first sentence, but only if you tie it directly to a concrete responsibility or pain (e.g. "As VP of Operations at [Company], you're the one who feels it when summer peaks lock in next year's transmission charges."). If contextForAi includes research facts from the company website or LinkedIn, use **one specific fact** naturally instead of saying you looked at the website or LinkedIn. If contextForAi includes recent activity (new warehouse, expansion, cost-focus, locations like DFW, company news), you may reference **one** of those naturally in the first sentence — make it feel like you know their world, not like you're restating their website. If USER CONTEXT mentions a specific person or touchpoint (for example "Wanda told me you handle agreements"), that must be the opener. If company context includes concrete details like certifications, product lines, or served industries, include one specific detail naturally. If VERTICAL-SPECIFIC ANGLE is provided, use it as support, not as the opener when user context is specific.
PERSONALIZATION RULE: If contextForAi contains an intelligence brief, use at most one fact from it, and only if it is recent, usable, and clearly relevant. If the brief is weak, fallback-like, or missing, ignore it completely. Never say "I saw a report about..." unless the event is named in the same sentence.
GUARDRAILS: Do not over-praise (no "esteemed", "renowned"). Do not write long clauses about their job description; use title only to anchor a specific outcome ("you feel it when…", "you're the one who sees…", "you're the person who gets the call when…"). If no meaningful personalization data is provided, skip title and start directly with the business problem. Use natural, slightly uneven sentences — it should feel like one person writing a quick note, not a marketing email.

${DELIVERABILITY_RULES}
- No links, no images, no bullets, no HTML. Plain text only.
- Output ONLY the email body (or SUBJECT: + body when generating). No meta-commentary.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Sharpen to 40–80 words. Remove hedging. Active voice. One question CTA. Output only the refined body.',
    generationChips: [
      { label: '4CP_RISK', directive: 'Write a 40–70 word first-touch cold email to a warehouse/logistics operator in ERCOT. Avoid jargon in the first sentence; describe the business problem in plain language (e.g. summer peaks locking in next year\'s transmission charges). You may mention "4CP" once in the body if needed, but only after the problem is clear. End with one plain-English question only — e.g. "Is anyone on your team looking at how those summer peaks affect next year\'s costs?", "Does anyone track those peak intervals against your budget?", or "Is that something you\'re already looking at?" Do NOT end with "modeling or mitigating 4CP exposure" or "4CP exposure on your radar." No links, plain text, minimal sign-off using the SENDER name from the system prompt. (Use RECIPIENT CONTEXT / Audience above: plain English for general, precise terms only if Audience says energy manager.)' },
      { label: 'TITLE_INTRO', directive: 'Use RECIPIENT CONTEXT: open with one sentence that ties their title and/or company to the cost pain (e.g. "As [title] at [company], you\'re the one who feels it when summer peaks lock in next year\'s transmission charges."). Then one sentence proof, one question. No flattery. 40–70 words. Plain text.' },
      { label: 'INTRO_AUDIT', directive: 'Warm follow-up: quick reminder of prior interaction, one key finding, soft CTA "Want to see the numbers?" 40–60 words. Plain text.' },
      { label: 'RATCHET_WARNING', directive: 'Write a 40–70 word first-touch cold email. Describe in plain English: one winter peak can set a large part of next year\'s delivery charges for 12 months (do not say "ratchet" unless RECIPIENT CONTEXT / Audience says energy manager). One sentence proof (similar facility). End with one plain-English question (e.g. "Is anyone on your team looking at how that winter peak affects next year\'s costs?" or "Is that something you\'re already tracking?"). No links, plain text, minimal sign-off. (Use Audience above: plain English for general, "ratchet"/TDU only if energy manager.)' },
      { label: 'PASS_THROUGH', directive: 'Write a 40–70 word first-touch cold email. Describe in plain English: charges from the utility that aren\'t the energy commodity (delivery/utility fees on the bill). Do not say "TDU" or "pass-through" unless RECIPIENT CONTEXT / Audience says energy manager. One question about what share of their bill is those delivery/utility charges. No links, plain text. (Use Audience above: plain English for general, TDU/pass-through only if energy manager.)' },
    ],
    refinementChips: [
      { label: 'FORENSIC_OPTIMIZE', directive: 'Rewrite to 40–80 words. Human peer-to-peer tone. No em dashes. Concise, direct. One question CTA. Output only the refined body.' },
      { label: 'EXPAND_TECHNICAL', directive: 'Add one human, plain-English detail about how local market rules affect their costs; max 15 word bullets if used. No em dashes. Output only the refined body.' },
    ],
  },
  {
    id: 'cold_followup',
    label: 'Cold (follow-up)',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are an Energy Market Advisor at Nodal Point. You write COLD FOLLOW-UP emails (second+ touch). Slightly longer allowed; still forensic and direct.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user provides specific notes or a prompt, you MUST preserve their exact facts, numbers, and intent.

STRUCTURE: Brief reminder of prior touch → one concrete finding or proof → soft CTA (question or "want to see the math?"). Up to ~120–150 words. One link or calendar URL allowed only if the directive asks.
LANGUAGE: Use plain English. Do NOT use jargon (4CP, ratchet, TDU, pass-through, demand charge, non-commodity) unless RECIPIENT CONTEXT indicates the recipient is an energy manager, director of energy, or similar. Describe mechanisms in plain language.
SENDER: ${signerName}
RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name: "Hi Sarah," or "Hello Sarah," followed by exactly TWO (2) line breaks. There MUST be a blank line before the body text starts.
CLOSING: Use a standard sign-off: "Best," or "Thanks," followed by the SENDER's full name from the prompt above. Always use the actual SENDER name, not a placeholder.
SUBJECT: Do NOT put the recipient's first name in the subject. You MAY include company/facility name when relevant (e.g. "Summer peak risk at your Dallas DC", "Transmission costs on your DFW sites"). 4–7 words, honest and specific.
CTA: One clear question or ask. Do not combine multiple asks in one email.
PERSONALIZATION: If RECIPIENT CONTEXT gives title/company/contextForAi, you may use it once in the first sentence tied to a concrete pain. If contextForAi contains a research fact from the company website or LinkedIn, use the fact itself, not a sentence about having looked it up. No flattery; no long job-description clauses. If no personalization data, start with the business problem.
PERSONALIZATION: If contextForAi includes an intelligence brief, treat it as supporting context only. Use one fact at most and skip it if the brief looks weak or fallback-like. Never write "I saw a report about..." without naming the actual event.
${DELIVERABILITY_RULES}
- Plain text preferred. No hype. Output ONLY the email body (or SUBJECT: + body when generating).`,
    getRefinementInstruction: () =>
      'REFINEMENT: Sharpen. Remove filler. One clear CTA. Up to 120–150 words. Output only the refined body.',
    generationChips: [
      { label: 'No-reply follow-up', directive: 'Gentle second touch after no reply. One sentence on prior email, one finding or question. Soft CTA. 50–80 words.' },
      { label: 'Audit follow-up', directive: 'Follow-up after sending audit: one key number or finding, "Want to see the math?" 40–60 words.' },
      { label: 'RATCHET_WARNING', directive: 'Follow-up in plain English: one winter peak setting next year\'s delivery charges for 12 months (use "ratchet" only if recipient is energy manager). One finding, one question. 40–60 words.' },
      { label: 'PASS_THROUGH', directive: 'Follow-up in plain English: utility/delivery charges that aren\'t the commodity (use "pass-through" only if recipient is energy manager). One finding, one question. 40–60 words.' },
    ],
    refinementChips: [
      { label: 'FORENSIC_OPTIMIZE', directive: 'Tighten. One CTA. Output only the refined body.' },
      { label: 'Softer', directive: 'Soften tone; keep ask clear. Output only the refined body.' },
    ],
  },
  {
    id: 'professional',
    label: 'Professional',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are an Energy Market Advisor writing on behalf of ${signerName} (Nodal Point). You take the user's rough notes or prompt and turn them into a clear, direct, and professional business email.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions.

TONE: Confident, peer-to-peer, professional, concise.
DO NOT use generic AI openings like "I hope this email finds you well," "I am writing to you today," or "I'm reaching out." 
DO NOT hallucinate or insert the recipient's company background or "about us" information.
Preserve the EXACT facts, numbers, and intent provided by the user. Just elevate the language so it sounds like a professional energy advisor sending a quick update or question to a client/prospect. Avoid overly formal corporate speak; sound like a busy, competent human.

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name followed by TWO (2) line breaks (e.g. "Hi Sarah,\n\n").
CLOSING: Use a standard business sign-off: "Best," or "Thanks," followed by the SENDER's full name from the prompt above.

Output ONLY the email body. Plain text, no markdown.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Tighten and clarify this email. Keep the same intent and tone. Remove redundancy. Improve flow. Output only the revised body.',
    generationChips: [
      { label: 'Meeting recap', directive: 'Draft a brief meeting recap with key points and next steps.' },
      { label: 'Introduce', directive: 'Draft a short professional introduction of myself / our team to the recipient.' },
      { label: 'Request', directive: 'Draft a polite request (e.g. information, action, or response). Be specific and clear.' },
      { label: 'Thank you', directive: 'Draft a concise thank-you email. Sincere and professional.' },
    ],
    refinementChips: [
      { label: 'Tighten', directive: 'Tighten and clarify. Remove redundancy. Same intent.' },
      { label: 'Formalize', directive: 'Make the tone slightly more formal and polished.' },
      { label: 'Shorten', directive: 'Shorten this email while keeping the main message.' },
    ],
  },
  {
    id: 'followup',
    label: 'Follow-up',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are an Energy Market Advisor writing a follow-up email on behalf of ${signerName} (Nodal Point). Tone is helpful and persistent without being pushy.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user provides specific notes or a prompt, you MUST preserve their exact facts, numbers, and intent. Do NOT override their message with generic filler.

TONE: Polite, brief, clear. Confident peer-to-peer advisor. Acknowledge they may be busy. Restate the ask or context in one line if needed. One clear CTA. No guilt or pressure. Do not use generic AI openings like "I hope this email finds you well."

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name (e.g. "Hi Sarah," or "Hello Sarah,").
CLOSING: Use a standard sign-off: "Best," or "Thanks," followed by the SENDER's full name from the prompt above.

Output ONLY the email body. Plain text, no markdown.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this follow-up clearer and more concise. Keep it polite and professional. Output only the revised body.',
    generationChips: [
      { label: 'Polite reminder', directive: 'Draft a polite reminder about a previous email or request. Brief and respectful.' },
      { label: 'Re-attach context', directive: 'Draft a short follow-up that re-attaches context (e.g. "As discussed..." or "Following up on...") with one clear ask.' },
      { label: 'Meeting follow-up', directive: 'Draft a follow-up after a meeting: thank them, recap one or two action items, and suggest next step.' },
      { label: 'No-reply follow-up', directive: 'Draft a gentle second touch after no reply. Acknowledge they are busy; offer one clear next step or question.' },
    ],
    refinementChips: [
      { label: 'Softer', directive: 'Soften the tone; make it less pushy.' },
      { label: 'Clearer CTA', directive: 'Make the call-to-action or ask clearer and more specific.' },
    ],
  },
  {
    id: 'post_call',
    label: 'Post-Call Follow-up',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are an Energy Market Advisor writing a POST-CALL FOLLOW-UP email on behalf of ${signerName} (Nodal Point). This email is sent after a live phone or video conversation with the recipient.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output meta-commentary, questions about the prompt, or instructions. If the user provides specific notes or a prompt, you MUST preserve their exact facts, numbers, and intent. Do NOT override their message with generic filler.

TONE: Warm, collegial, direct, peer-to-peer — like continuing a real conversation in writing. It should feel personal and immediate, not templated. You are a professional advisor, not a typical salesperson. Do not use generic AI openings like "I hope this email finds you well."

STRUCTURE: Short call reference (1 sentence, natural) → Key takeaway or relevant finding for them (1–2 sentences) → One clear next step or ask (1 sentence). 80–130 words total.

PERSONALIZATION: If CALL INTELLIGENCE or NOTES are provided in the context, reference something specific from the conversation. One specific detail beats three generic lines. Make it feel like you were listening.
CALL TIMING: Use call timing cues from context. Never say "today" unless the call happened today. If it was older, use wording like "earlier this week", "a few days ago", or "last week" based on the provided timestamp.
CALL QUALITY: If the transcript is mostly a gatekeeper, receptionist, or routing handoff, do not pretend you had a full substantive conversation. Use wording like "thanks for the direction" or "thanks for pointing me to the right place." Only use "good talking with you" when the transcript shows a real back-and-forth about the actual topic.
CALL ACCURACY: If the recipient asked for something specific, such as a capabilities brief, PDF, vendor info, or manager review, state that specific request in the email. Do not replace it with vague language like "connect with your team" or "as discussed" unless the discussion is named.
NEXT STEP: If the transcript includes a direct instruction or handoff, follow that exact next step. Do not invent a different CTA.
NO FUTURE EMAILS: Do not write phrases like "I'll send over a brief email" or "I'll follow up with more info" unless the user explicitly asked for a later email. The body you write is the email that gets sent now, so include the information directly.

SENDER: ${signerName}
RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: "Hi [firstname]," or "Good talking with you, [firstname]," followed by exactly TWO (2) line breaks. NEVER put the body on the same line as the greeting.
CLOSING: "Best," or "Thanks," followed by the SENDER's first name only (warm, informal).
SUBJECT (when generating): Reference the call topic directly in sentence case. Keep it specific to what was discussed. Avoid generic templates like "following up from our call". 4–9 words.

${DELIVERABILITY_RULES}
- Light formatting is fine. No heavy bullet lists unless specifically requested. Output ONLY the email body (or SUBJECT: + body when generating). No meta-commentary.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this post-call email warmer and more specific. Reference the conversation naturally. One clear next step. Output only the revised body.',
    generationChips: [
      { label: 'Thank you + recap', directive: 'Write a warm post-call thank-you that briefly references the real call outcome and one concrete next step. If the transcript was mainly a routing handoff or front-desk transfer, thank them for the direction instead of implying a deep conversation. Use one specific detail from the transcript and keep the ask tied to the exact next step. Do not say you will send another email later; include the relevant information in this email now. 80–100 words.' },
      { label: 'Send the math', directive: 'Write a short post-call follow-up saying I am following up with the numbers I mentioned on the call. Reference what we discussed. Build curiosity. 70–90 words.' },
      { label: 'Schedule next step', directive: 'Write a post-call follow-up that thanks them for the conversation and proposes one specific next step (follow-up call, sending an audit, or a proposal). 80–100 words.' },
      { label: 'Drip materials', directive: 'Write a post-call follow-up mentioning I am attaching or linking the materials I referenced on the call. Make it feel like a natural continuation. 70–90 words.' },
    ],
    refinementChips: [
      { label: 'More specific', directive: 'Make this more specific to the call that happened. Less generic. Reference one detail from the conversation.' },
      { label: 'Shorter', directive: 'Shorten to 60–80 words. Keep the warmth and the ask.' },
      { label: 'Stronger CTA', directive: 'Make the call-to-action more direct and specific. What exactly is the next step?' },
    ],
  },
  {
    id: 'internal',
    label: 'Internal',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are an Energy Market Advisor writing an internal email (team, colleague, or internal stakeholder) on behalf of ${signerName} (Nodal Point).

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user provides specific notes or a prompt, you MUST preserve their exact facts, numbers, and intent exactly.

TONE: Clear, concise, collegial, peer-to-peer. Can be slightly casual. Get to the point. Bullet points or short paragraphs are fine. No formal marketing language. Do not use generic AI openings like "I hope this email finds you well."

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Optional. Use when it fits the relationship.
CLOSING: Flexible; often just the SENDER's name from the prompt on the last line, or "Thanks," + SENDER name.

Output ONLY the email body. Plain text.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this internal email clearer and shorter. Keep the same information. Output only the revised body.',
    generationChips: [
      { label: 'Quick update', directive: 'Draft a quick internal update (status, blocker, or decision). Brief.' },
      { label: 'Question', directive: 'Draft a short internal question or ask for input.' },
      { label: 'Action needed', directive: 'Draft a brief internal email stating what action is needed and from whom.' },
      { label: 'FYI', directive: 'Draft a short FYI or heads-up for the team.' },
    ],
    refinementChips: [
      { label: 'Shorter', directive: 'Shorten this internal message; keep key info.' },
      { label: 'Bulletize', directive: 'Turn the main points into clear bullet points.' },
    ],
  },
  {
    id: 'support',
    label: 'Support / Customer',
    getSystemPrompt: ({ signerName, to, subject }) =>
      `You are an Energy Market Advisor writing a customer- or support-style email on behalf of ${signerName} (Nodal Point). Tone is helpful, empathetic, and solution-focused.

CRITICAL: You MUST output actual email content (subject + body or body only). NEVER output questions about the prompt, meta-commentary, instructions, or suggestions. If the user provides specific notes or a prompt, you MUST preserve their exact facts, numbers, and intent. Do NOT override their message with generic filler.

TONE: Professional, warm, clear, peer-to-peer. Acknowledge the recipient's situation or question. Provide a clear answer or next step. Avoid jargon. Be concise. Do not use generic AI openings like "I hope this email finds you well."

RECIPIENT: ${to || '(not specified)'}
SUBJECT: ${subject || '(no subject)'}

GREETING: Use a short greeting with the recipient's first name (e.g. "Hi Sarah,").
CLOSING: Use a standard sign-off: "Best," or "Thanks," followed by the SENDER's full name from the prompt above.

Output ONLY the email body. Plain text, no markdown.`,
    getRefinementInstruction: () =>
      'REFINEMENT: Make this support email clearer and more helpful. Keep empathy and accuracy. Output only the revised body.',
    generationChips: [
      { label: 'Acknowledge issue', directive: 'Draft a response that acknowledges an issue or concern and sets expectation for next steps.' },
      { label: 'Resolution summary', directive: 'Draft a short summary of a resolution or answer to a question.' },
      { label: 'Next steps', directive: 'Draft a clear explanation of next steps (what we will do, what they need to do, timeline if relevant).' },
      { label: 'Thank you + close', directive: 'Draft a brief thank-you and closing for a resolved ticket or conversation.' },
    ],
    refinementChips: [
      { label: 'Clearer', directive: 'Make the explanation clearer and easier to follow.' },
      { label: 'Warmer', directive: 'Slightly warmer and more empathetic tone while staying professional.' },
    ],
  },
]

/** Optional context passed when opening from a contact/account dossier. Shown in UI and injected into AI prompt. */
export interface ComposeContext {
  contactId?: string
  accountId?: string
  contactName?: string
  contactTitle?: string
  companyName?: string
  accountName?: string
  /** Industry/vertical (e.g. "Restaurants", "Logistics & Warehouse", "Education") for vertical-specific angles. */
  industry?: string
  /** Account/company description (filtered to avoid generic "what they do" language). Used for contextual details. */
  accountDescription?: string
  /** Notes + call/transcript summary + news for AI. Injected into system prompt when present. */
  contextForAi?: string
  /** When 'cold_plaintext', send first-touch cold as plain text only (no HTML/signature) for deliverability. */
  deliverabilityMode?: 'cold_plaintext' | 'normal'
}

interface ComposeModalProps {
  isOpen: boolean
  onClose: () => void
  to?: string
  subject?: string
  /** Optional contact/account context (e.g. from Contact Dossier). Used for display and AI. */
  context?: ComposeContext | null
}

function SearchResultsDropdown({
  results,
  isLoading,
  onSelect,
  onClose
}: {
  results: any[]
  isLoading: boolean
  onSelect: (email: string) => void
  onClose: () => void
}) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (!isLoading && results.length === 0) return null

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 right-0 mt-1 z-[110] nodal-module-glass rounded-xl border border-white/10 shadow-2xl max-h-[250px] overflow-y-auto np-scroll animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {isLoading ? (
        <div className="p-4 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-signal" />
        </div>
      ) : (
        <div className="p-1.5 space-y-1">
          {results.map((contact) => (
            <button
              key={contact.id}
              onClick={() => onSelect(contact.email)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group"
            >
              <ContactAvatar
                name={contact.name}
                photoUrl={contact.avatarUrl}
                size={32}
                className="w-8 h-8 rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-100 group-hover:text-white truncate">
                  {contact.name}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 truncate">
                  <span className="truncate">{contact.email}</span>
                  {contact.company && (
                    <>
                      <span className="text-white/10">•</span>
                      <span className="truncate">{contact.company}</span>
                    </>
                  )}
                </div>
              </div >
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ComposePanel({
  initialTo,
  initialSubject,
  initialContext,
  onClose,
}: {
  initialTo: string
  initialSubject: string
  initialContext: ComposeContext | null
  onClose: () => void
}) {
  const [toChips, setToChips] = useState<string[]>(() => initialTo ? [initialTo] : [])
  const [ccChips, setCcChips] = useState<string[]>([])
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const context = initialContext
  const [content, setContent] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const { user, profile } = useAuth()
  const { sendEmail, isSending } = useEmails()

  // Foundry template state
  const [selectedFoundryId, setSelectedFoundryId] = useState<string | null>(null)
  const [contentBeforeFoundry, setContentBeforeFoundry] = useState('')
  const [subjectBeforeFoundry, setSubjectBeforeFoundry] = useState('')
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)

  // AI Command Rail state
  const [aiRailOpen, setAiRailOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [selectedGenerationDirective, setSelectedGenerationDirective] = useState('')
  const [emailTypeId, setEmailTypeId] = useState<EmailTypeId>('cold_first_touch')
  // Ref always holds the current emailTypeId — prevents stale closure in async buildFoundryContext callback
  const emailTypeIdRef = useRef<EmailTypeId>('cold_first_touch')
  useEffect(() => { emailTypeIdRef.current = emailTypeId }, [emailTypeId])
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('google/gemini-2.5-flash')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [pendingAiContent, setPendingAiContent] = useState<string | null>(null)
  const [pendingSubjectFromAi, setPendingSubjectFromAi] = useState<string | null>(null)
  const [isApplyingAi, setIsApplyingAi] = useState(false)
  const [showAiApplyEffect, setShowAiApplyEffect] = useState(false)
  const [contentBeforeAi, setContentBeforeAi] = useState('')
  const [showUndoAi, setShowUndoAi] = useState(false)
  const [subjectAnimationKey, setSubjectAnimationKey] = useState(0)
  /** In-modal toggle: when true and type is cold, send as plain text with minimal signature (Option B). */
  const [sendAsPlainText, setSendAsPlainText] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false)
  const [scheduledFor, setScheduledFor] = useState(() => {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${nextHour.getFullYear()}-${pad(nextHour.getMonth() + 1)}-${pad(nextHour.getDate())}T${pad(nextHour.getHours())}:${pad(nextHour.getMinutes())}`
  })
  const [isScheduling, setIsScheduling] = useState(false)

  // Formatting panel state
  const [formattingOpen, setFormattingOpen] = useState(false)

  // TipTap editor instance exposed from RichTextEditor — used to drive the floating formatting toolbar
  const editorRef = useRef<Editor | null>(null)
  // Incrementing this forces ComposePanel to re-render so toolbar active states (bold/italic/etc.) stay in sync
  const [, setEditorTick] = useState(0)
  const handleEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor
    if (editor) {
      editor.on('transaction', () => setEditorTick(t => t + 1))
    }
  }, [])

  // Hidden file input for inserting images from the footer button
  const toolbarImageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSelectedGenerationDirective('')
  }, [emailTypeId])

  const readFileAsBase64 = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result !== 'string') {
          reject(new Error('Failed to read image file'))
          return
        }
        const base64 = result.split(',')[1] || ''
        if (!base64) {
          reject(new Error('Failed to read image file'))
          return
        }
        resolve(base64)
      }
      reader.onerror = () => reject(new Error('Failed to read image file'))
      reader.readAsDataURL(file)
    })
  }, [])

  const uploadToolbarImage = async (file: File) => {
    const { toast } = await import('sonner')
    const toastId = toast.loading('Uploading image...')
    try {
      const base64 = await readFileAsBase64(file)

      const response = await fetch('/api/upload/signature-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          type: 'template-image',
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.details || data?.error || `Failed to upload image (${response.status})`)
      }
      const url = data?.url || data?.imageUrl
      if (!url) {
        throw new Error('Upload succeeded, but no image URL was returned')
      }
      if (editorRef.current && url) {
        editorRef.current.chain().focus().setImage({ src: url }).run()
      }
      toast.success('Image uploaded', { id: toastId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload image'
      toast.error(message, { id: toastId })
    }
  }
  const handleToolbarImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadToolbarImage(file)
    if (toolbarImageInputRef.current) toolbarImageInputRef.current.value = ''
  }

  // Deep foundry context: energy profile + call transcripts loaded from Supabase when contact/account is present
  const [foundryContext, setFoundryContext] = useState<FoundryContext | null>(null)
  const hasCallSignalsInContext = useCallback((raw?: string) => {
    if (!raw) return false
    return /(call time|recent call history|spoke|talked|conversation|meeting|transcript|ai insight)/i.test(raw)
  }, [])

  const refreshFoundryContext = useCallback(async () => {
    if (!context?.contactId && !context?.accountId) return
    setIsLoadingContext(true)
    try {
      const ctx = await buildFoundryContext(supabase, context?.contactId ?? null, context?.accountId ?? null)
      setFoundryContext(ctx)

      const hasTranscripts = (ctx.intelligence.transcripts.length ?? 0) > 0
      const hasCallNotes = hasCallSignalsInContext(context?.contextForAi)
      const canAutoPromote = emailTypeIdRef.current === 'cold_first_touch' || emailTypeIdRef.current === 'cold_followup'
      if ((hasTranscripts || hasCallNotes) && canAutoPromote) {
        setEmailTypeId('post_call')
      }
    } catch (err) {
      console.error('[ComposeModal] Failed to load foundry context:', err)
    } finally {
      setIsLoadingContext(false)
    }
  }, [context?.contactId, context?.accountId, context?.contextForAi, hasCallSignalsInContext])

  useEffect(() => {
    refreshFoundryContext()
  }, [refreshFoundryContext])

  useEffect(() => {
    const onCallProcessed = (evt: Event) => {
      const detail = (evt as CustomEvent<{ contactId?: string; accountId?: string }>).detail
      if (!detail) return
      const sameContact = !!context?.contactId && detail.contactId === context.contactId
      const sameAccount = !!context?.accountId && detail.accountId === context.accountId
      if (sameContact || sameAccount) {
        refreshFoundryContext()
      }
    }
    window.addEventListener('nodal:call-processed', onCallProcessed as EventListener)
    return () => window.removeEventListener('nodal:call-processed', onCallProcessed as EventListener)
  }, [context?.contactId, context?.accountId, refreshFoundryContext])

  const handleFoundrySelect = useCallback((id: string | null) => {
    if (id) {
      // Backup current manual draft before applying template
      if (!selectedFoundryId) {
        setContentBeforeFoundry(content)
        setSubjectBeforeFoundry(subject)
      }
    } else {
      // Revert to manual draft when template is removed
      setContent(contentBeforeFoundry)
      setSubject(subjectBeforeFoundry)
    }
    setSelectedFoundryId(id)
  }, [selectedFoundryId, content, subject, contentBeforeFoundry, subjectBeforeFoundry])

  // Suppress signature when using foundry template
  const shouldShowSignature = !selectedFoundryId
  const signatureHtml = (profile && shouldShowSignature) ? generateNodalSignature(profile, user, true) : ''
  const outgoingSignatureHtml = (profile && shouldShowSignature) ? generateNodalSignature(profile, user, false) : ''
  const signerName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Lewis Patterson' : 'Lewis Patterson'

  const isRefinementMode = content.trim().length > 0
  const emailTypeConfig = EMAIL_TYPES.find((t) => t.id === emailTypeId) ?? EMAIL_TYPES[0]

  /** Subject suggests a meeting recap; use Professional tone so we don't apply cold outreach refinement. */
  const subjectSuggestsMeetingRecap = (s: string) => /meeting\s+recap/i.test((s || '').trim())

  const buildEmailSystemPrompt = useCallback((activeDirective = '') => {
    const effectiveConfig = subjectSuggestsMeetingRecap(subject) ? (EMAIL_TYPES.find((t) => t.id === 'professional') ?? emailTypeConfig) : emailTypeConfig
    let base = effectiveConfig.getSystemPrompt({ signerName, to: toChips[0] || '', subject: subject || '' })
    const directiveMentionsContractTiming = /\b(contract|renewal|renew|expiry|expiration|end date|agreement term)\b/i.test(activeDirective)
    if (context && (context.contactName || context.companyName || context.contactTitle || context.accountName || context.contextForAi || context.industry || context.accountDescription)) {
      const lines: string[] = []
      if (context.contactName || context.contactTitle || context.companyName || context.accountName) {
        lines.push('RECIPIENT CONTEXT (use for personalization):')
        if (context.contactName) lines.push(`- Name: ${context.contactName}`)
        if (context.contactTitle) lines.push(`- Title: ${context.contactTitle}`)
        if (context.companyName) lines.push(`- Company: ${context.companyName}`)
        if (context.accountName && context.accountName !== context.companyName) lines.push(`- Account: ${context.accountName}`)
        const title = (context.contactTitle || '').toLowerCase()
        const isEnergyManager = /energy\s*manager|director\s*of\s*energy|energy\s*director|sustainability\s*manager|facility\s*energy|utility\s*manager/.test(title)
        if (isEnergyManager) lines.push('- Audience: energy manager / energy-focused role — you may use precise terms (4CP, ratchet, TDU, pass-through) when helpful.')
        else lines.push('- Audience: general (ops, finance, facility) — use plain English only; avoid industry jargon.')
      }
      // Industry-specific angle (automatic, invisible to user) — always inject for cold/outreach types
      const isColdOrOutreach = effectiveConfig.id === 'cold_first_touch' || effectiveConfig.id === 'cold_followup'
      if (isColdOrOutreach) {
        const industryAngle = getIndustryAngle(context.industry, context.companyName || context.accountName)
        lines.push('VERTICAL-SPECIFIC ANGLE (supporting context only; use only if it strengthens USER CONTEXT. Do not mention "vertical" or "angle" in the email):')
        lines.push(industryAngle)
      }
      // Account description (filtered to avoid generic "what they do" language)
      if (context.accountDescription?.trim()) {
        const desc = context.accountDescription.trim()
        // Filter out generic company description language
        const genericPatterns = /^(we|they|the company|our company|this company|we are|they are|we provide|they provide|we offer|they offer|specializing in|specializes in|founded in|established in|headquartered in|based in|located in)/i
        const isGeneric = genericPatterns.test(desc) || desc.length < 30 || desc.split(' ').length < 8
        if (!isGeneric) {
          lines.push('COMPANY CONTEXT (use creatively for personalization; do not just restate what they do):')
          lines.push(`- ${desc.slice(0, 200)}${desc.length > 200 ? '…' : ''}`)
        }
      }
      if (context.contextForAi?.trim()) {
        lines.push('NOTES / CALL CONTEXT / RESEARCH (use to personalize and reference prior touchpoints or recent activity):')
        lines.push(context.contextForAi.trim())
        lines.push('RULE: Use only human conversation, substantive notes, or verified account context. Ignore no-answer calls, voicemail menus, extension trees, and other IVR noise.')
      }
      if (lines.length) base += '\n\n' + lines.join('\n')
    }

    // When there is no contact context at all, still inject a universal angle for cold email types
    const isColdOrOutreach = effectiveConfig.id === 'cold_first_touch' || effectiveConfig.id === 'cold_followup'
    const hasContextAngle = context && (context.industry || context.companyName || context.accountName)
    if (isColdOrOutreach && !hasContextAngle) {
      const universalAngle = getUniversalEnergyAngle()
      base += `\n\nVERTICAL-SPECIFIC ANGLE (supporting context when no user-specific trigger is given; do not mention "vertical" or "angle" in the email):\n${universalAngle}`
    }

    // Inject deep context from Supabase: energy profile + call transcripts
    if (foundryContext) {
      const deepLines: string[] = []
      const { energy, intelligence } = foundryContext
      const hasEnergyData = energy.currentRate || energy.contractEnd || energy.annualUsage || energy.supplier || energy.loadZone
      if (hasEnergyData) {
        deepLines.push('ENERGY PROFILE (use for precision when referencing costs or contract details):')
        if (energy.supplier) deepLines.push(`- Current Supplier: ${energy.supplier}`)
        if (energy.currentRate) deepLines.push(`- Current Rate: ${energy.currentRate}/kWh`)
        if (energy.contractEnd) deepLines.push(`- Contract Expiry: ${energy.contractEnd} — this is a live trigger if upcoming`)
        if (energy.annualUsage) deepLines.push(`- Annual Usage: ${energy.annualUsage}`)
        if (energy.loadZone) deepLines.push(`- ERCOT Load Zone: ${energy.loadZone}`)
      }
      if (directiveMentionsContractTiming) {
        if (energy.contractEnd) {
          deepLines.push('')
          deepLines.push(`CONTRACT TIMING DIRECTIVE: User asked for contract/renewal framing. If it fits naturally, reference the actual contract expiry date (${energy.contractEnd}) and explain the risk of waiting until renewal window.`)
        } else {
          deepLines.push('')
          deepLines.push('CONTRACT TIMING DIRECTIVE: User asked for contract/renewal framing, but no contract date is available. Explain the risk of waiting until renewal without inventing a date.')
        }
      }
      if (intelligence.transcripts.length > 0) {
        deepLines.push('')
        deepLines.push('CALL INTELLIGENCE (for post-call or follow-up emails, reference specific talking points from these transcripts):')
        deepLines.push('RULE: Ignore menu recordings, no-answer calls, voicemail greetings, and extension trees. Use only real conversations or substantive call outcomes.')
        intelligence.transcripts.slice(0, 2).forEach(t => deepLines.push(t.slice(0, 600)))
      }
      if ((intelligence.callHistory?.length ?? 0) > 0) {
        deepLines.push('')
        deepLines.push('CALL TIMING CUES (use these to avoid wrong time wording):')
        intelligence.callHistory.slice(0, 3).forEach((entry, idx) => {
          deepLines.push(`- Call ${idx + 1}: ${entry.localTime} (${entry.relativeTimeHint})`)
        })
        deepLines.push('TIMING RULE: Do not say "earlier today" unless timing cue is today. Prefer the relative cue provided.')
      }
      if (intelligence.summary && intelligence.summary.trim() && !context?.contextForAi?.includes(intelligence.summary.slice(0, 40))) {
        deepLines.push('')
        deepLines.push(`CONTACT NOTES: ${intelligence.summary.slice(0, 400)}`)
      }
      if (deepLines.length > 0) base += '\n\n' + deepLines.join('\n')
    }

    if (isRefinementMode) {
      base += '\n\n' + effectiveConfig.getRefinementInstruction()
    }

    base += `

CORE RULES:
- TONE: Peer-to-Peer. Professional but human. Speak like a knowledgeable industry colleague.
- NO JARGON: Use plain English. No buzzwords like "delve", "optimize", "streamline".
- NO DASHES: Use commas or colons. Never use em dashes (—).
- BULLET LENGTH: If using bullets, each must be a single sentence, max 15 words.
- SPECIFICITY: Reference the lead's company and industry naturally.
- FORMATTING: If you include a greeting (e.g. "Lorena,"), it MUST be on its own line. You MUST follow it with a BLANK LINE before starting the email body. NEVER start the body on the same line as the greeting.
`

    const isColdPlaintext =
      (emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup') &&
      (context?.deliverabilityMode === 'cold_plaintext' || sendAsPlainText)

    if (!isRefinementMode) {
      base += `
OUTPUT FORMAT:
- When generating a new email, output on the first line: SUBJECT: <one-line subject>
- Then a blank line, then the email body.
- The email body MUST start with the greeting (e.g. "Jenny,") followed by a BLANK LINE before the body content begins.
- If the directive is body-only, output only the body with no SUBJECT line.
- SUBJECT REQUIREMENT: Always include a subject line for new email generation.
- SUBJECT PERSONALIZATION: Prefer company name in subject when known; if no company is known, use contact first name.
- SUBJECT STYLE: sentence case only. Do NOT capitalize every major word.
- SUBJECT QUALITY: tie subject directly to the body's real topic (agreement, rates, proposal, next step), not generic labels.
- SUBJECT BANS: avoid template openers like "following up", "quick follow-up", "checking in", "touching base".
- Return ONLY the requested content. No meta-commentary.`
    }

    if (isColdPlaintext) {
      base += '\n- FORMAT: Strict plain text. No HTML, no markdown formatting.'
    } else {
      base += '\n- FORMAT: Output HTML for the email body (e.g., <ul>, <li>, <strong>, <br/>). Do NOT wrap in markdown code blocks like ```html. Use basic inline HTML tags to style the text so it can be directly placed into a rich text editor. If asked for a list or bullets, use <ul> and <li> tags.'
    }

    return base
  }, [emailTypeConfig, signerName, toChips, subject, isRefinementMode, context, emailTypeId, sendAsPlainText, foundryContext])

  const combineAiDirective = useCallback((typedPrompt: string, angleOrPresetDirective?: string) => {
    const typed = (typedPrompt || '').trim()
    const preset = (angleOrPresetDirective || '').trim()

    if (typed && preset) {
      return `USER CONTEXT (highest priority: preserve these facts and this intent):
${typed}

ANGLE / STYLE PREFERENCE (secondary: use only if it supports USER CONTEXT):
${preset}

Write one email where USER CONTEXT leads and the angle is supporting context only.`
    }

    return typed || preset
  }, [])

  const generateEmailWithAi = useCallback(async (directive: string) => {
    // Auto-build a directive only when the user/preset did not provide one.
    let effectiveDirective = directive.trim()
    if (!effectiveDirective) {
      if (emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup') {
        // Fallback only: if there is no user directive, guide the model with broad cold-email shape.
        const wordCount = emailTypeId === 'cold_first_touch' ? '40–70' : '80–120'
        effectiveDirective = `Write a ${wordCount} word ${emailTypeId === 'cold_first_touch' ? 'first-touch cold' : 'cold follow-up'} email. If USER CONTEXT exists, lead with that exact context. Use VERTICAL-SPECIFIC ANGLE only as supporting context. Focus on one concrete business risk, not generic energy savings. Plain text, minimal sign-off.`
      } else if (emailTypeId === 'post_call') {
        const hasTranscripts = (foundryContext?.intelligence.transcripts.length ?? 0) > 0
        const hasCallNotes = !!(context?.contextForAi && /call|spoke|talked|conversation|meeting/i.test(context.contextForAi))
        if (hasTranscripts || hasCallNotes) {
          effectiveDirective = `Write a warm 80–120 word post-call follow-up email. Use the concrete ask or handoff from CALL INTELLIGENCE, not a generic recap. If the call included a request for a PDF, capabilities brief, company info, manager review, or vendor materials, mention that plainly. Respect CALL TIMING CUES, and do not imply "today" unless the cue says today. Propose one concrete next step that matches the call.`
        } else {
          effectiveDirective = `Write a warm 80–120 word post-call follow-up email. Reference our recent conversation naturally, with correct timing language. Use the most concrete request or next step you can infer. Propose one clear next step.`
        }
      }
    }
    const refinementFallbackByType: Record<EmailTypeId, string> = {
      cold_first_touch: 'Rewrite to be forensic, direct, 40–80 words. One question CTA. Output only the revised body.',
      cold_followup: 'Sharpen this follow-up. Remove filler. One clear CTA. Up to 120–150 words. Output only the revised body.',
      professional: 'Tighten and clarify this email. Keep the same intent and tone. Remove redundancy. Output only the revised body.',
      followup: 'Make this follow-up clearer and more concise. Keep it polite and professional. Output only the revised body.',
      post_call: 'Make this post-call email warmer and more specific. Reference the actual request or handoff from the call, not a generic recap. One clear next step. Output only the revised body.',
      internal: 'Make this internal email clearer and shorter. Keep the same information. Output only the revised body.',
      support: 'Make this support email clearer and more helpful. Keep empathy and accuracy. Output only the revised body.',
    }
    const effectiveTypeForRecap = subjectSuggestsMeetingRecap(subject) ? 'professional' : emailTypeId
    const finalDirective = effectiveDirective || (isRefinementMode ? refinementFallbackByType[effectiveTypeForRecap] : '')
    if (!finalDirective && !isRefinementMode) return
    if (isRefinementMode && !content.trim()) return
    setAiRailOpen(false)
    setAiError(null)
    setContentBeforeAi(content)
    setShowUndoAi(false)
    setIsAiLoading(true)
    const deriveLiquidSubject = async (candidate: string | null, bodyTextOrHtml: string): Promise<string | null> => {
      if (isRefinementMode) return normalizeSubjectOutput(candidate)

      const normalizedCandidate = normalizeSubjectOutput(candidate)
      const shouldForceDynamicSubject = emailTypeId === 'followup' || emailTypeId === 'post_call'
      if (normalizedCandidate && !isGenericAiSubject(normalizedCandidate) && !shouldForceDynamicSubject) {
        return normalizedCandidate
      }

      const bodyPlain = htmlToPlainText(bodyTextOrHtml || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 1400)

      const contextLabel = [
        context?.companyName || context?.accountName || '',
        context?.contactName || '',
      ].filter(Boolean).join(' | ') || '(none)'

      try {
        const subjectRes = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You generate one email subject line only.
Rules:
- Must reflect the actual BODY content and situation.
- 4 to 9 words, max 65 characters.
- Use sentence case, not title case.
- Avoid cliches/templates: "following up", "quick follow-up", "checking in", "touching base".
- Do not start with: "follow-up", "following up", "quick follow-up", "next step".
- Must include at least one concrete topic from BODY (e.g. rates, agreement, proposal, next step).
- No quotes, no markdown, no explanation.
- Output one plain text subject line only.`,
              },
              {
                role: 'user',
                content: `RECIPIENT_CONTEXT: ${contextLabel}
ORIGINAL_DIRECTIVE: ${finalDirective || '(none)'}
PREVIOUS_SUBJECT_CANDIDATE: ${normalizedCandidate || '(none)'}
BODY:
${bodyPlain}

Return exactly one subject line.`,
              },
            ],
            model: selectedModel,
            userProfile: { firstName: profile?.firstName || signerName.split(' ')[0] || 'Lewis' },
          }),
        })
        const subjectData = await subjectRes.json()
        const aiSubject = normalizeSubjectOutput(
          typeof subjectData?.content === 'string' ? subjectData.content : null
        )
        if (aiSubject && !isGenericAiSubject(aiSubject) && !isTitleCaseHeavy(aiSubject)) {
          return aiSubject
        }
      } catch {
        // Fall through to deterministic fallback below.
      }

      const fallback = buildFallbackSubject(emailTypeId, context, toChips[0] || '', foundryContext, bodyTextOrHtml)
      return normalizeSubjectOutput(normalizedCandidate) || fallback
    }
    try {
      const systemPrompt = buildEmailSystemPrompt(finalDirective)
      const userContent = isRefinementMode
        ? `Apply the refinement task. Current email body:\n\n---\n${content}\n---`
        : finalDirective
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          model: selectedModel,
          userProfile: { firstName: profile?.firstName || signerName.split(' ')[0] || 'Lewis' },
          context: context ? {
            type: context.contactId ? 'contact' : (context.accountId ? 'account' : 'general'),
            id: context.contactId || context.accountId,
            ...context
          } : undefined
        }),
      })
      const data = await response.json()
      if (data.error) throw new Error(data.message || data.error)
      const raw = typeof data.content === 'string' ? data.content.trim() : ''
      // Detect genuine meta-commentary/refusals (anchored to string start, no multiline so ^ = first char only)
      const metaCommentary = /^(I(?:'m| am) (?:sorry|unable|afraid)|I (?:cannot|can't|won't) (?:create|generate|write|send|access|use|browse|complete)|Could you please (?:verify|clarify|provide)|Please (?:verify|confirm) (?:your|the)|(?:As |Being )?an AI[, ]|I(?:'m| am) an AI\b|I (?:do not|don't) have (?:access|the ability)|This (?:appears|seems) to be a (?:verification|harmful|test))/i
      if (metaCommentary.test(raw)) {
        // Attempt to salvage: look for SUBJECT: line or greeting buried after the refusal text
        const subjectIdx = raw.search(/SUBJECT:\s*.+/i)
        const greetingIdx = raw.search(/(Hi|Hello|Dear)\s+[A-Za-z]+,/)
        const salvageIdx = subjectIdx >= 0 ? subjectIdx : greetingIdx >= 0 ? greetingIdx : -1
        if (salvageIdx > 0 && raw.slice(salvageIdx).trim().length > 40) {
          // Use the salvaged content — strip the refusal prefix
          const salvaged = raw.slice(salvageIdx).trim()
          const parsed = parseAiEmailOutput(salvaged)
          let newBody = parsed.body || salvaged
          const parsedSubject = await deriveLiquidSubject(parsed.subject, newBody)
          newBody = newBody.replace(/^((?:Hi|Hello|Dear)?[ \t]*[A-Za-z]+(?: [A-Za-z]+)?,)[ \t\r\n]*/i, '$1\n\n')
          setPendingSubjectFromAi(parsedSubject)
          setPendingAiContent(newBody)
          setAiPrompt('')
          return
        }
        toast.error('AI declined to generate content. Try rephrasing or switching to a different model.')
        setAiError('Model declined to generate; try another model or rephrase.')
        return
      }
      const parsed = parseAiEmailOutput(raw)
      let newBody = parsed.body || raw
      const parsedSubject = await deriveLiquidSubject(parsed.subject, newBody)

      // Force double newline after greeting if missing
      newBody = newBody.replace(/^((?:Hi|Hello|Dear)?[ \t]*[A-Za-z]+(?: [A-Za-z]+)?,)[ \t\r\n]*/i, '$1\n\n')
      setPendingSubjectFromAi(parsedSubject)
      setPendingAiContent(newBody)
      setAiPrompt('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI generation failed'
      setAiError(msg)
      toast.error(msg)
    } finally {
      setIsAiLoading(false)
    }
  }, [buildEmailSystemPrompt, content, isRefinementMode, selectedModel, profile?.firstName, subject, emailTypeId, context, foundryContext, toChips])

  // Fetch available foundry templates
  const { data: foundryAssets } = useQuery<any[]>({
    queryKey: ['transmission_assets', 'email_templates'],
    queryFn: async () => {
      const idToken = await (async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return session?.access_token || null
      })()
      const res = await fetch('/api/foundry/list', {
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      })
      if (!res.ok) {
        // Silently fail if endpoint doesn't exist yet
        return []
      }
      const data = await res.json()
      return (data.assets || []).filter((asset: any) => asset?.content_json?.kind === 'email_template' || asset?.content_json?.templatePath)
    },
    enabled: !!user,
  })

  // Load and compile foundry template when selected
  useEffect(() => {
    if (!selectedFoundryId) return

    const loadTemplate = async () => {
      playClick()
      setIsLoadingTemplate(true)
      try {
        const idToken = await (async () => {
          const { data: { session } } = await supabase.auth.getSession()
          return session?.access_token || null
        })()
        const res = await fetch(`/api/foundry/assets?id=${encodeURIComponent(selectedFoundryId)}`, {
          headers: {
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load template')

        const asset = json?.asset
        if (!asset) throw new Error('Template not found')

        const templatePath = typeof asset?.content_json?.templatePath === 'string' ? asset.content_json.templatePath.trim() : ''

        // Prefer the standalone HTML template file when available.
        let html = ''
        if (templatePath) {
          try {
            const templateRes = await fetch(templatePath)
            if (templateRes.ok) {
              html = await templateRes.text()
            }
          } catch (templateError) {
            console.warn('[FoundryCompose] Template fetch failed, falling back to compiled HTML', templateError)
          }
        }

        if (!html.trim()) {
          html = (asset.compiled_html || '').trim()
        }

        if (!html.trim()) {
          // Generate HTML from blocks as the last fallback.
          html = await generateStaticHtml(asset.content_json?.blocks || [], { profile })
        }

        // Build variable map from contact context (use empty values if no context)
        const contactData = {
          firstName: context?.contactName?.split(' ')[0] || '',
          lastName: context?.contactName?.split(' ').slice(1).join(' ') || '',
          name: context?.contactName || '',
          companyName: context?.companyName || context?.accountName || '',
          company: context?.companyName || context?.accountName || '',
          industry: context?.industry || '',
          accountDescription: context?.accountDescription || '',
        }

        const normalizedWebsite = profile.website || user?.email?.split('@')[1] || 'nodalpoint.io'
        const websiteDomain = normalizedWebsite.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '')
        const websiteUrl = /^https?:\/\//i.test(normalizedWebsite) ? normalizedWebsite : `https://${websiteDomain}`
        const senderPhoto = profile.hostedPhotoUrl || user?.user_metadata?.avatar_url || ''
        const senderName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.name || user?.user_metadata?.full_name || user?.email || 'Nodal Point'
        const senderLocation = [profile.city, profile.state].filter(Boolean).join(', ')

        const senderVariableMap = {
          'sender.name': senderName,
          'sender.title': profile.jobTitle || 'Director of Energy Architecture',
          'sender.jobTitle': profile.jobTitle || 'Director of Energy Architecture',
          'sender.email': profile.email || user?.email || '',
          'sender.phone': profile.selectedPhoneNumber || profile.twilioNumbers?.[0]?.number || '',
          'sender.city': profile.city || '',
          'sender.state': profile.state || '',
          'sender.location': senderLocation,
          'sender.linkedinUrl': profile.linkedinUrl || 'https://linkedin.com/company/nodal-point',
          'sender.website': websiteDomain,
          'sender.websiteUrl': websiteUrl,
          'sender.photoUrl': senderPhoto,
          'sender.avatarUrl': senderPhoto,
          'sender.logoUrl': '/images/nodalpoint-webicon.png',
        }

        const variableMap = {
          ...contactToVariableMap(contactData),
          ...senderVariableMap,
        }

        // Substitute variables
        html = substituteVariables(html, variableMap)

        // Auto-generate AI blocks if needed (only if context is available)
        const aiBlocksToGenerate = context ? (asset.content_json?.blocks || []).filter((block: any) => {
          if (block.type !== 'TEXT_MODULE') return false
          const contentObj = typeof block.content === 'object' ? block.content : { text: String(block.content || ''), useAi: false, aiPrompt: '' }
          return contentObj.useAi === true && contentObj.aiPrompt?.trim() && !contentObj.text?.trim()
        }) : []

        if (aiBlocksToGenerate.length > 0) {
          // Clone blocks to avoid mutating original state directly (though likely safe here)
          const updatedBlocks = JSON.parse(JSON.stringify(asset.content_json?.blocks || []))

          // 1. Fetch Deep Context ONCE for all blocks
          const deepContext = await buildFoundryContext(supabase, context?.contactId, context?.accountId)

          for (const block of aiBlocksToGenerate) {
            const blockIndex = updatedBlocks.findIndex((b: any) => b.id === block.id)
            if (blockIndex === -1) continue

            const contentObj = typeof block.content === 'object' ? block.content : { text: '', useAi: false, aiPrompt: '' }
            const userPrompt = contentObj.aiPrompt?.trim() || ''

            // Build context for AI
            const otherBlocks = updatedBlocks.filter((b: any, idx: number) => idx !== blockIndex)
            const contextParts: string[] = []
            otherBlocks.forEach((b: any, idx: number) => {
              if (b.type === 'TEXT_MODULE') {
                const txt = typeof b.content === 'string' ? b.content : (b.content?.text || '')
                if (txt.trim()) contextParts.push(`Block ${idx + 1}: ${txt.slice(0, 200)}...`)
              } else if (b.type === 'TELEMETRY_GRID') {
                const headers = b.content?.headers?.join(', ') || ''
                contextParts.push(`Block ${idx + 1}: Data Metric Grid (${headers})`)
              }
            })
            const foundryContext = contextParts.length > 0 ? `\n\nOther content in this email:\n${contextParts.join('\n')}` : ''

            // 2. Generate System Prompt
            const numBullets = Array.isArray(contentObj.bullets) ? contentObj.bullets.length : 0
            const prompt = generateSystemPrompt(
              block.type || 'TEXT_MODULE',
              userPrompt,
              deepContext,
              foundryContext,
              numBullets
            )

            try {
              const aiRes = await fetch('/api/foundry/generate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  systemPrompt: prompt,
                  prompt: userPrompt,
                  context: '',
                  blockType: 'narrative',
                }),
              })

              const aiData = await aiRes.json()
              console.log('[FoundryCompose] AI Response:', aiData.text)
              if (aiRes.ok && aiData.text) {
                // specific handling for JSON response from AI
                let generatedText = aiData.text
                let generatedBullets: string[] = []

                try {
                  const rawText = aiData.text.trim()
                  // Try to locate a JSON object in the string if it looks like one might be there
                  let cleanText = rawText
                  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
                  if (jsonMatch) {
                    cleanText = jsonMatch[0]
                  } else {
                    // Fallback cleaning for markdown blocks
                    cleanText = rawText
                      .replace(/^```json\s*/i, '')
                      .replace(/```\s*$/i, '')
                      .trim()
                  }

                  const parsed = JSON.parse(cleanText)
                  generatedText = (parsed.text || aiData.text).replace(/\[\d+\]/g, '').trim()
                  generatedBullets = (parsed.bullets || []).map((b: string) => b.replace(/\[\d+\]/g, '').trim())
                } catch (e) {
                  // Fallback: use raw text if not valid JSON
                  generatedText = aiData.text.trim()
                }

                // Update the block content
                updatedBlocks[blockIndex].content = {
                  ...updatedBlocks[blockIndex].content,
                  text: generatedText,
                  bullets: generatedBullets
                }
              }
            } catch (err) {
              console.error('Failed to generate AI block', err)
              // Setup fallback error text so user sees something happened
              updatedBlocks[blockIndex].content = {
                ...updatedBlocks[blockIndex].content,
                text: "[ AI GENERATION FAILED - NETWORK ERROR ]"
              }
            }
          }

          // REGENERATE HTML with the new content
          const newHtml = await generateStaticHtml(updatedBlocks, { profile })
          html = substituteVariables(newHtml, variableMap)
        }

        html = ensureDarkModeEmailSupport(html)
        setContent(html)

        // Set subject from template name
        if (asset.name) {
          setSubject(asset.name)
        }

        toast.success('Foundry template loaded')
      } catch (err: any) {
        toast.error(err?.message || 'Failed to load template')
        handleFoundrySelect(null)
      } finally {
        setIsLoadingTemplate(false)
      }
    }

    loadTemplate()
  }, [selectedFoundryId, context, user])

  const acceptAiContent = useCallback(() => {
    const body = pendingAiContent ?? ''
    const subj = pendingSubjectFromAi
    if (isApplyingAi) return
    setIsApplyingAi(true)
    setAiRailOpen(false)

    window.setTimeout(() => {
      setContent(aiBodyToEditorHtml(body))
      if (subj != null && subj.trim() !== '') {
        setSubject(subj.trim())
        setSubjectAnimationKey((k) => k + 1)
      }
      setPendingAiContent(null)
      setPendingSubjectFromAi(null)
      // Show undo option only if there was prior content to restore
      if (contentBeforeAi.trim()) setShowUndoAi(true)
      setIsApplyingAi(false)
      setShowAiApplyEffect(true)
      window.setTimeout(() => setShowAiApplyEffect(false), 620)
    }, 180)
  }, [pendingAiContent, pendingSubjectFromAi, contentBeforeAi, isApplyingAi])

  const discardAiContent = useCallback(() => {
    setPendingAiContent(null)
    setPendingSubjectFromAi(null)
  }, [])

  const undoAiContent = useCallback(() => {
    setContent(contentBeforeAi)
    setShowUndoAi(false)
  }, [contentBeforeAi])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setAttachments(prev => [...prev, ...files])
    // Reset input so the same file can be selected again if removed
    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleScheduleSend = async () => {
    if (!toChips.length || !subject || !content) {
      toast.error('Please fill in all fields')
      return
    }

    const scheduledDate = new Date(scheduledFor)
    if (Number.isNaN(scheduledDate.getTime())) {
      toast.error('Pick a valid send time')
      return
    }

    if (scheduledDate.getTime() <= Date.now()) {
      toast.error('Pick a time in the future')
      return
    }

    const isColdType = emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup'
    const isColdPlaintext = isColdType && (context?.deliverabilityMode === 'cold_plaintext' || sendAsPlainText)
    const normalizedEmailBodyHtml = normalizeEditorHtmlForEmail(content)
    const plainTextContent = typeof document !== 'undefined' ? (() => {
      const tmp = document.createElement('div')
      tmp.innerHTML = normalizedEmailBodyHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      return (tmp.textContent || tmp.innerText || '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    })() : normalizedEmailBodyHtml

    const fullHtml = isColdPlaintext
      ? undefined
      : selectedFoundryId
        ? content
        : buildComposeEmailDocument(normalizedEmailBodyHtml, outgoingSignatureHtml || '')

    const attachmentsData = await Promise.all(
      attachments.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            const base64Data = result.split(',')[1] || result
            resolve(base64Data)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        return {
          filename: file.name,
          content: base64,
          type: file.type,
          size: file.size
        }
      })
    )

    try {
      setIsScheduling(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        toast.error('You must be signed in to schedule email')
        return
      }

      const response = await fetch('/api/email/schedule-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: toChips.join(', '),
          cc: showCc && ccChips.length ? ccChips.join(', ') : undefined,
          subject,
          content: isColdPlaintext ? plainTextContent : plainTextContent,
          html: fullHtml ?? (isColdPlaintext ? undefined : content),
          scheduledSendTime: scheduledDate.toISOString(),
          contactId: context?.contactId || null,
          accountId: context?.accountId || null,
          contactName: context?.contactName || null,
          contactCompany: context?.companyName || context?.accountName || null,
          from: user?.email || profile.email || undefined,
          fromName: profile.firstName ? `${profile.firstName} • Nodal Point` : 'Nodal Point',
          attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to schedule email')
      }

      toast.success(`Scheduled for ${format(scheduledDate, 'PPP p')}`)
      playWhoosh()
      onClose()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to schedule email')
    } finally {
      setIsScheduling(false)
      setSchedulePopoverOpen(false)
    }
  }

  const handleSend = async () => {
    if (!toChips.length || !subject || !content) {
      toast.error('Please fill in all fields')
      return
    }

    const isColdType = emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup'
    const isColdPlaintext = isColdType && (context?.deliverabilityMode === 'cold_plaintext' || sendAsPlainText)
    const normalizedEmailBodyHtml = normalizeEditorHtmlForEmail(content)

    // Convert potential HTML to plain text for plain text sends or text fallbacks
    const plainTextContent = typeof document !== 'undefined' ? (() => {
      const tmp = document.createElement('div')
      tmp.innerHTML = normalizedEmailBodyHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      return (tmp.textContent || tmp.innerText || '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    })() : normalizedEmailBodyHtml

    // For standard compose sends, append the compose signature directly so send does not
    // depend on backend profile lookup. Foundry templates remain signature-free.
    const fullHtml = isColdPlaintext
      ? undefined
      : selectedFoundryId
        ? ensureAdaptiveEmailDocument(content)
        : buildComposeEmailDocument(normalizedEmailBodyHtml, outgoingSignatureHtml || '')

    const titleLine = profile?.jobTitle
      ? `${profile.jobTitle}, Nodal Point`
      : 'Director of Energy Architecture, Nodal Point'
    const COLD_PLAINTEXT_BRAND_LINE = 'You have seen the math. Now see your data.'
    const coldPlaintextBody = isColdPlaintext
      ? `${plainTextContent}\n\nBest,\n${signerName}\n${titleLine}\nhttps://nodalpoint.io\n\n${COLD_PLAINTEXT_BRAND_LINE}`
      : null

    // Convert attachments to base64
    const attachmentsData = await Promise.all(
      attachments.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = result.split(',')[1] || result
            resolve(base64Data)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        return {
          filename: file.name,
          content: base64,
          type: file.type,
          size: file.size
        }
      })
    )

    sendEmail(
      {
        to: toChips.join(', '),
        cc: showCc && ccChips.length ? ccChips.join(', ') : undefined,
        subject,
        content: coldPlaintextBody ?? plainTextContent,
        html: fullHtml ?? (coldPlaintextBody ? undefined : content),
        hasSignature: Boolean(!isColdPlaintext && !selectedFoundryId && outgoingSignatureHtml),
        contactId: context?.contactId || null,
        contactName: context?.contactName || null,
        contactCompany: context?.companyName || context?.accountName || null,
        attachments: attachmentsData.length > 0 ? attachmentsData : undefined,
      },
      {
        onSuccess: () => {
          playWhoosh()
          onClose()
        },
      }
    )
  }

  return (
    <motion.div
      key="compose-panel"
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1, height: isMinimized ? 60 : 500 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 26, stiffness: 280 }}
      className={cn(
        "fixed bottom-0 right-4 sm:right-10 z-[100] w-full sm:w-[500px] bg-zinc-950 nodal-monolith-edge rounded-t-xl shadow-2xl flex flex-col overflow-hidden"
      )}
    >
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-white/5 nodal-recessed cursor-pointer hover:bg-black/30 transition-colors"
        onClick={() => isMinimized && setIsMinimized(false)}
      >
        <h3 className="text-lg font-semibold text-white">New Message</h3>
        <div className="flex items-center gap-2">
          <button
            className="icon-button-forensic h-8 w-8 flex items-center justify-center"
            title={isMinimized ? "Maximize" : "Minimize"}
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized(!isMinimized)
            }}
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
          </button>
          <ForensicClose 
            size={18}
            title="Close"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
          />
        </div>
      </div>

      <motion.div
        initial={false}
        animate={isMinimized ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex flex-col h-[calc(100%-60px)] bg-zinc-950"
        style={{ pointerEvents: isMinimized ? 'none' : 'auto' }}
      >
        {/* Fixed Header Section */}
        <div className="flex-none px-6 py-4 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md space-y-2 z-20">
          {/* Deliverability Alert */}
          {toChips.length === 1 && user?.email && toChips[0].toLowerCase() === user.email.toLowerCase() && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="mb-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 overflow-hidden"
            >
              <Zap className="w-3 h-3 text-amber-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Internal Test Mode</span>
                <span className="text-[9px] text-zinc-400 leading-tight">
                  Tracking is disabled for self-sends to protect domain reputation. Avoid repetitive testing to same-root addresses.
                </span>
              </div>
            </motion.div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-500 w-8 flex-shrink-0">To</span>
            <EmailChipField
              chips={toChips}
              onChange={setToChips}
              placeholder="Recipient email..."
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="text-[10px] font-mono text-zinc-500 hover:text-signal transition-colors px-2 py-1 rounded hover:bg-white/5 flex-shrink-0"
              >
                CC
              </button>
            )}
          </div>

          <AnimatePresence>
            {showCc && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-center gap-2"
              >
                <span className="text-xs font-mono text-zinc-500 w-8 flex-shrink-0">Cc</span>
                <EmailChipField
                  chips={ccChips}
                  onChange={setCcChips}
                  placeholder="Carbon copy..."
                  autoFocus
                />
                <ForensicClose 
                  size={14} 
                  onClick={() => {
                    setShowCc(false)
                    setCcChips([])
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-500 w-8">Sub</span>
            <div className="flex-1">
              <motion.div
                key={subjectAnimationKey}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <Input
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="bg-transparent border-0 border-b border-transparent hover:border-white/10 focus-visible:border-signal/50 rounded-none px-0 h-9 text-sm font-medium focus-visible:ring-0 transition-all"
                />
              </motion.div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Scrollable Content Area - Only Editor */}
          <div className="flex-1 overflow-y-auto np-scroll px-6 py-4">
            {/* AI Content Preview - Sticky at Top */}
            {pendingAiContent !== null && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={isApplyingAi ? { opacity: 0, y: -14, scale: 0.96 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: isApplyingAi ? 0.18 : 0.22, ease: 'easeOut' }}
                className="rounded-lg border border-[#002FA7]/30 bg-[#002FA7]/5 overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-wider">AI suggestion — preview</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={acceptAiContent}
                      disabled={isApplyingAi}
                      className="h-7 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                    >
                      <Check className="w-3 h-3" /> Replace with this
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={discardAiContent}
                      disabled={isApplyingAi}
                      className="h-7 text-[10px] text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Discard
                    </Button>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {pendingSubjectFromAi != null && pendingSubjectFromAi.trim() !== '' && (
                    <div>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Subject</span>
                      <p className="text-sm font-medium text-zinc-200 mt-0.5">{pendingSubjectFromAi}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Body</span>
                    <div
                      className="mt-0.5 text-sm text-zinc-300 font-sans whitespace-pre-wrap break-words leading-relaxed prose prose-invert max-w-none prose-sm [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(pendingAiContent) }}
                    />
                  </div>
                </div>
              </motion.div>
            )}


            {pendingAiContent === null && (
              <>
                {/* Foundry Template Indicator */}
                {selectedFoundryId && foundryAssets && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#002FA7]/30 bg-[#002FA7]/5"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#002FA7]" />
                    <span className="text-[10px] font-mono text-[#002FA7] uppercase tracking-wider">
                      Foundry Template: {foundryAssets.find((a: any) => a.id === selectedFoundryId)?.name || 'Loading...'}
                    </span>
                    <ForensicClose 
                      onClick={() => handleFoundrySelect(null)}
                      size={12}
                      title="Remove Template"
                      className="ml-auto"
                    />
                  </motion.div>
                )}

                <div className="flex flex-col relative">
                  <div className="relative">
                    {selectedFoundryId ? (
                      // Show HTML preview for Foundry templates - Refined for inbox parity with Iframe Isolation
                      <div className="w-full min-h-[760px] bg-transparent rounded-xl p-0 md:p-0 flex justify-center items-start overflow-x-auto overflow-y-hidden transition-all duration-500">
                        <div className="w-full max-w-[860px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)] overflow-hidden rounded-xl ring-1 ring-zinc-200/50 flex flex-col transform transition-transform duration-700">
                          <div className="h-12 border-b border-zinc-100 bg-zinc-50 flex items-center px-6 justify-between shrink-0">
                            <div className="flex gap-2.5">
                              <div className="w-3 h-3 rounded-full bg-zinc-200" />
                              <div className="w-3 h-3 rounded-full bg-zinc-200" />
                              <div className="w-3 h-3 rounded-full bg-zinc-200" />
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.4em] font-bold">Transmission_Voter_Isolated</span>
                          </div>
                          <div className="flex-1 overflow-x-hidden min-h-[760px] bg-white">
                            <EmailIframePreview content={content} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Show rich text editor for regular emails
                      <motion.div
                        animate={showAiApplyEffect ? { scale: [0.96, 1, 1.001], opacity: [0.5, 1, 1] } : { scale: 1, opacity: 1 }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                        className="relative"
                      >
                        <RichTextEditor
                          content={content}
                          onChange={(val) => {
                            setContent(val)
                            if (pendingAiContent) {
                              setPendingAiContent(null)
                              setPendingSubjectFromAi(null)
                            }
                          }}
                          className="w-full"
                          onEditorReady={handleEditorReady}
                        />
                        <AnimatePresence>
                          {showAiApplyEffect && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.995 }}
                              animate={{ opacity: [0, 0.32, 0], scale: [0.995, 1, 1.002] }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.62, ease: 'easeOut' }}
                              className="pointer-events-none absolute inset-0 rounded-md border border-[#002FA7]/30 bg-gradient-to-r from-transparent via-[#002FA7]/20 to-transparent"
                            />
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                    {isAiLoading && (
                      <div className="absolute inset-0 min-h-[120px] bg-zinc-950/80 rounded-lg border border-[#002FA7]/20">
                        <ScanlineLoader />
                      </div>
                    )}
                  </div>
                  {aiError && (
                    <p className="mt-1 text-[10px] font-mono text-red-400">{aiError}</p>
                  )}
                  {showUndoAi && !pendingAiContent && (
                    <button
                      type="button"
                      onClick={undoAiContent}
                      className="flex items-center gap-1 mt-1 px-1 text-[9px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Undo AI replace
                    </button>
                  )}

                  {/* Signature - Scrolls with email body */}
                  {signatureHtml && !selectedFoundryId && (
                    <div className="mt-4 opacity-90">
                      <div
                        className="rounded-lg overflow-hidden"
                        dangerouslySetInnerHTML={{ __html: signatureHtml }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Non-Scrollable Bottom Section - Checkboxes, Attachments */}
          <div className="flex-shrink-0 border-t border-white/5 px-6 py-3 space-y-2 bg-zinc-950/50 backdrop-blur-sm">
            {/* Plain Text Checkbox */}
            {(emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup') && !selectedFoundryId && (
              <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors">
                <input
                  type="checkbox"
                  checked={sendAsPlainText}
                  onChange={(e) => setSendAsPlainText(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-[#002FA7] focus:ring-[#002FA7]/50"
                />
                Send as plain text (cold deliverability)
              </label>
            )}

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Attachments</span>
                <div className="space-y-2 max-h-[120px] overflow-y-auto np-scroll">
                  {attachments.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded border border-white/10 bg-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                        <span className="text-xs text-zinc-300 truncate">{file.name}</span>
                        <span className="text-[10px] text-zinc-500 flex-shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <ForensicClose 
                        onClick={() => removeAttachment(idx)}
                        size={12}
                        title="Remove Attachment"
                        className="hover:text-red-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Formatting Toolbar — slides up above footer, identical animation to AI rail */}
        <AnimatePresence>
          {formattingOpen && !selectedFoundryId && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute left-4 right-4 bottom-[calc(4rem+8px)] z-50 backdrop-blur-xl bg-zinc-950/90 border border-white/10 rounded-lg shadow-2xl overflow-visible"
            >
              <div className="flex flex-wrap items-center gap-1 p-2">
                <button
                  onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleBold().run() }}
                  className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('bold') && 'bg-white/10 text-white')}
                  title="Bold"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleItalic().run() }}
                  className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('italic') && 'bg-white/10 text-white')}
                  title="Italic"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleUnderline().run() }}
                  className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('underline') && 'bg-white/10 text-white')}
                  title="Underline"
                >
                  <UnderlineIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <button
                  onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleBulletList().run() }}
                  className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('bulletList') && 'bg-white/10 text-white')}
                  title="Bullet List"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().toggleOrderedList().run() }}
                  className={cn('p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors', editorRef.current?.isActive('orderedList') && 'bg-white/10 text-white')}
                  title="Numbered List"
                >
                  <ListOrdered className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 transition-colors flex items-center gap-1"
                      title="Text Color"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <Palette className="w-4 h-4" />
                      <div
                        className="w-3 h-3 rounded-full border border-white/20"
                        style={{ backgroundColor: editorRef.current?.getAttributes('textStyle').color || 'transparent' }}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2 bg-zinc-950 border-white/10 nodal-monolith-edge z-[300]" align="start" side="top">
                    <div className="grid grid-cols-6 gap-1.5">
                      {TOOLBAR_COLORS.map((color) => (
                        <button
                          key={color}
                          className={cn(
                            'w-6 h-6 rounded-md hover:scale-110 transition-transform',
                            editorRef.current?.getAttributes('textStyle').color === color && 'ring-2 ring-white/50'
                          )}
                          style={{ backgroundColor: color }}
                          onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().setColor(color).run() }}
                        />
                      ))}
                      <button
                        className="col-span-6 mt-1 text-[10px] text-zinc-400 hover:text-white transition-colors py-1"
                        onMouseDown={(e) => { e.preventDefault(); editorRef.current?.chain().focus().unsetColor().run() }}
                      >
                        Reset Color
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {schedulePopoverOpen && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute left-4 right-4 md:left-auto md:right-4 md:w-[360px] bottom-[calc(4rem+8px)] z-50 backdrop-blur-xl bg-zinc-950/90 border border-white/10 rounded-lg shadow-2xl overflow-visible"
            >
              <div className="p-3 space-y-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">Send time</div>
                  <Input
                    type="datetime-local"
                    value={scheduledFor}
                    min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="bg-white/5 border-white/10 text-zinc-100"
                  />
                </div>
                <div className="flex items-start gap-2 text-[11px] text-zinc-400">
                  <Clock3 className="w-3.5 h-3.5 mt-0.5 text-[#002FA7] shrink-0" />
                  <p>
                    This saves as a scheduled email in the Scheduled tab and the Supabase cron job sends it when the time hits.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setSchedulePopoverOpen(false)} className="text-zinc-400 hover:text-white hover:bg-white/5">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleScheduleSend}
                    disabled={isScheduling}
                    className="bg-[#002FA7] hover:bg-[#002FA7]/90 text-white min-w-[124px]"
                  >
                    {isScheduling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarClock className="w-4 h-4 mr-2" />}
                    Schedule email
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Command Rail — slides up above footer */}
        <AnimatePresence>
          {aiRailOpen && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute left-4 right-4 bottom-[calc(4rem+8px)] z-50 h-auto min-h-12 backdrop-blur-xl bg-zinc-950/90 border border-white/10 rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={emailTypeId} onValueChange={(v) => setEmailTypeId(v as EmailTypeId)}>
                    <SelectTrigger className="h-8 w-auto min-w-[120px] bg-white/5 border-white/10 text-[10px] font-sans text-zinc-400 tracking-wider rounded-lg">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 nodal-monolith-edge z-[200]">
                      {EMAIL_TYPES.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-[10px] font-sans focus:bg-[#002FA7]/20">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="h-8 w-auto min-w-[140px] bg-white/5 border-white/10 text-[10px] font-mono text-zinc-400 uppercase tracking-wider rounded-lg">
                      <Cpu className="w-3.5 h-3.5 text-[#002FA7]" />
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 nodal-monolith-edge z-[200]">
                      {EMAIL_AI_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-[10px] font-mono focus:bg-[#002FA7]/20">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={isRefinementMode ? 'Refine: human tone / no dashes' : '> ENTER_HUMAN_DIRECTIVE...'}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        generateEmailWithAi(combineAiDirective(aiPrompt, isRefinementMode ? '' : selectedGenerationDirective))
                      }
                    }}
                    className="flex-1 min-w-[160px] h-8 bg-transparent border-white/10 rounded-lg text-[11px] font-mono placeholder:text-zinc-500 focus:ring-0 focus:border-[#002FA7]/30"
                  />
                  <Button
                    size="sm"
                    onClick={() => generateEmailWithAi(combineAiDirective(aiPrompt, isRefinementMode ? '' : selectedGenerationDirective))}
                    disabled={isAiLoading || ((!aiPrompt.trim() && !selectedGenerationDirective.trim()) && !isRefinementMode) || (isRefinementMode && !content.trim())}
                    className="h-8 bg-[#002FA7] hover:bg-[#002FA7]/90 text-white text-[10px] font-mono uppercase"
                  >
                    {isAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Generate'}
                  </Button>
                  <ForensicClose 
                    onClick={() => setAiRailOpen(false)}
                    size={16}
                    title="Close AI Rail"
                    className="ml-1"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isRefinementMode
                    ? emailTypeConfig.refinementChips.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => generateEmailWithAi(chip.directive)}
                        disabled={isAiLoading}
                        className="text-[10px] font-mono px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                      >
                        {chip.label}
                      </button>
                    ))
                    : emailTypeConfig.generationChips.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setSelectedGenerationDirective(chip.directive)
                          if (!aiPrompt.trim()) {
                            generateEmailWithAi(chip.directive)
                          }
                        }}
                        disabled={isAiLoading}
                        className={cn(
                          'text-[10px] font-mono px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors',
                          selectedGenerationDirective === chip.directive && 'border-[#002FA7]/60 text-zinc-100 bg-[#002FA7]/15'
                        )}
                      >
                        {chip.label}
                      </button>
                    ))}
                </div>
                {/* Context status indicators */}
                {isLoadingContext && (
                  <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500 uppercase tracking-wider px-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Loading contact context...
                  </div>
                )}
                {!isLoadingContext && (emailTypeId === 'cold_first_touch' || emailTypeId === 'cold_followup') && (
                  <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider px-1 space-y-0.5">
                    <div>
                      {context?.industry
                        ? `Angle: ${context.industry} vertical`
                        : context?.companyName || context?.accountName
                          ? `Angle: auto-selected for ${context.companyName || context.accountName}`
                          : 'Angle: universal (no industry context)'}
                    </div>
                    {selectedGenerationDirective.trim() && (
                      <div className="text-[#002FA7]/80">Prompt priority: your typed context first, selected angle second</div>
                    )}
                  </div>
                )}
                {!isLoadingContext && emailTypeId === 'post_call' && (
                  <div className={`text-[9px] font-mono uppercase tracking-wider px-1 ${(foundryContext?.intelligence.callHistory.length ?? 0) > 0 ? 'text-emerald-500/70' : 'text-zinc-500'}`}>
                    {(foundryContext?.intelligence.callHistory.length ?? 0) > 0
                      ? `✓ ${(foundryContext!.intelligence.callHistory.length ?? 0)} call signal${(foundryContext!.intelligence.callHistory.length ?? 0) > 1 ? 's' : ''} loaded — AI will use call insights + timing`
                      : context?.contextForAi ? '✓ call notes detected' : 'No prior call data — AI will write a generic warm follow-up'}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-none px-6 py-4 border-t border-white/5 nodal-recessed flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="email-attachment-input"
              aria-label="Select file to attach"
            />
            <Button
              variant="outline"
              size="icon"
              asChild
              className={CIRCLE_ICON_BUTTON_CLASS}
            >
              <label htmlFor="email-attachment-input" title="Attach Files" className="cursor-pointer">
                <Paperclip className="w-4 h-4" />
              </label>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className={CIRCLE_ICON_BUTTON_CLASS}
              onClick={() => toolbarImageInputRef.current?.click()}
              title="Insert Image"
              aria-label="Insert Image"
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
            <input
              type="file"
              ref={toolbarImageInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleToolbarImageChange}
            />
            <Button
              variant="outline"
              size="icon"
              className={cn(
                CIRCLE_ICON_BUTTON_CLASS,
                formattingOpen && "bg-zinc-50 text-[#002FA7] border-[#002FA7]/30 shadow-[0_0_10px_rgba(0,47,167,0.1)]"
              )}
              onClick={() => { setFormattingOpen(f => !f); setAiRailOpen(false); setSchedulePopoverOpen(false) }}
              title="Text Formatting"
            >
              <Type className={cn("h-4 w-4", formattingOpen && "fill-current")} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                CIRCLE_ICON_BUTTON_CLASS,
                aiRailOpen && "bg-zinc-50 text-[#002FA7] border-[#002FA7]/30 shadow-[0_0_10px_rgba(0,47,167,0.1)]"
              )}
              onClick={() => { setAiRailOpen(r => !r); setFormattingOpen(false); setSchedulePopoverOpen(false) }}
              title="AI Assistant (Spark)"
            >
              <Sparkles className={cn("h-4 w-4", aiRailOpen && "fill-current")} />
            </Button>
            {/* Foundry Template Selector - Refactored to Circle Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    CIRCLE_ICON_BUTTON_CLASS,
                    selectedFoundryId && "bg-zinc-50 text-[#002FA7] border-[#002FA7]/30 shadow-[0_0_10px_rgba(0,47,167,0.1)]"
                  )}
                  title="Foundry Template (Zap)"
                >
                  <Zap className={cn("h-4 w-4", selectedFoundryId && "fill-current")} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="center"
                className="bg-zinc-950 nodal-monolith-edge z-[200] min-w-[200px]"
              >
                <div className="px-2 py-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-widest border-b border-white/5 mb-1">
                  Foundry Templates
                </div>
                <DropdownMenuItem
                  onClick={() => handleFoundrySelect(null)}
                  className="text-[10px] font-mono focus:bg-[#002FA7]/20 flex items-center justify-between"
                >
                  None (Standard Email)
                  {!selectedFoundryId && <Check className="w-3 h-3 text-[#002FA7]" />}
                </DropdownMenuItem>
                {foundryAssets?.map((asset: any) => (
                  <DropdownMenuItem
                    key={asset.id}
                    onClick={() => handleFoundrySelect(asset.id)}
                    className="text-[10px] font-mono focus:bg-[#002FA7]/20 flex items-center justify-between"
                  >
                    {asset.name}
                    {selectedFoundryId === asset.id && <Check className="w-3 h-3 text-[#002FA7]" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                CIRCLE_ICON_BUTTON_CLASS,
                schedulePopoverOpen && "bg-white/5 border-white/40 shadow-[0_0_10px_rgba(255,255,255,0.08)]"
              )}
              onClick={() => {
                setSchedulePopoverOpen((open) => !open)
                setFormattingOpen(false)
                setAiRailOpen(false)
              }}
              title="Schedule Email"
              aria-label="Schedule Email"
            >
              <CalendarClock className="h-4 w-4" />
            </Button>
            {isLoadingTemplate && <Loader2 className="w-4 h-4 animate-spin text-[#002FA7]" />}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white hover:bg-white/5">
              Discard
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="bg-white text-zinc-950 hover:bg-zinc-200 min-w-[100px]"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send now
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function ComposeModal({ isOpen, onClose, to: initialTo = '', subject: initialSubject = '', context: initialContext = null }: ComposeModalProps) {

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <ComposePanel initialTo={initialTo} initialSubject={initialSubject} initialContext={initialContext ?? null} onClose={onClose} />
      )}
    </AnimatePresence>,
    document.body
  )
}
