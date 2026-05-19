export type AudienceSource =
  | 'sequence'
  | 'decision_maker_card'
  | 'account_primary'
  | 'protocol_task'
  | 'fallback'

export type AudienceRoleFamily =
  | 'finance'
  | 'operations'
  | 'facilities'
  | 'procurement'
  | 'executive'
  | 'real_estate'
  | 'technology'
  | 'healthcare'
  | 'education'
  | 'public_sector'
  | 'nonprofit'
  | 'hospitality'
  | 'retail'
  | 'logistics'
  | 'manufacturing'
  | 'other'

export interface AudienceProfileInput {
  id?: string | null
  contactId?: string | null
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  jobTitle?: string | null
  email?: string | null
  linkedinUrl?: string | null
  linkedin_url?: string | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
  company?: string | null
  companyName?: string | null
  accountName?: string | null
  accountId?: string | null
  industry?: string | null
}

export interface AudienceProfile {
  source: AudienceSource
  sourceLabel: string
  contactId: string | null
  contactName: string
  contactFirstName: string
  contactTitle: string
  companyName: string
  industry: string
  roleFamily: AudienceRoleFamily
  roleSummary: string
  careAbouts: string[]
  openerHint: string
  questionHint: string
  backgroundSignals: string[]
  evidence: string[]
  guardrails: string[]
  linkedInUrl: string | null
}

type AudienceAccountLike = {
  name?: string | null
  industry?: string | null
  description?: string | null
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function uniqueStrings(values: unknown[], limit = 10): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const text = cleanText(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }

  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectSignals(input: unknown, depth = 0, limit = 12): string[] {
  if (!input || limit <= 0 || depth > 4) return []

  if (typeof input === 'string') {
    const text = cleanText(input)
    return text ? [text] : []
  }

  if (Array.isArray(input)) {
    const result: string[] = []
    for (const item of input) {
      result.push(...collectSignals(item, depth + 1, Math.max(0, limit - result.length)))
      if (result.length >= limit) break
    }
    return uniqueStrings(result, limit)
  }

  if (!isRecord(input)) return []

  const record = input as Record<string, unknown>
  const priorityKeys = [
    'headline',
    'about',
    'summary',
    'bio',
    'description',
    'jobTitle',
    'job_title',
    'title',
    'role',
    'position',
    'positions',
    'experience',
    'workHistory',
    'work_history',
    'posts',
    'recentPosts',
    'recent_posts',
    'company',
    'companyName',
    'company_name',
    'location',
    'industry',
    'department',
    'seniority',
  ]

  const orderedKeys = [
    ...priorityKeys.filter((key) => key in record),
    ...Object.keys(record).filter((key) => !priorityKeys.includes(key)),
  ]

  const result: string[] = []
  for (const key of orderedKeys) {
    if (result.length >= limit) break
    const value = record[key]
    if (value == null) continue

    if (typeof value === 'string') {
      const text = cleanText(value)
      if (text) result.push(text)
      continue
    }

    if (Array.isArray(value) || isRecord(value)) {
      const nested = collectSignals(value, depth + 1, limit - result.length)
      result.push(...nested)
    }
  }

  return uniqueStrings(result, limit)
}

function getSourceLabel(source: AudienceSource): string {
  switch (source) {
    case 'sequence':
      return 'Sequence contact'
    case 'decision_maker_card':
      return 'Decision-maker card'
    case 'account_primary':
      return 'Account primary contact'
    case 'protocol_task':
      return 'Protocol task contact'
    default:
      return 'Fallback contact'
  }
}

function inferRoleFamily(title: string, industry: string, signals: string[]): AudienceRoleFamily {
  const combined = `${title} ${industry} ${signals.join(' ')}`.toLowerCase()

  if (/(chief financial officer|\bcfo\b|controller|finance|accounting|treasurer|budget|audit)/.test(combined)) return 'finance'
  if (/(procurement|purchasing|contracts|vendor|buyer|sourcing|materials management|supply chain)/.test(combined)) return 'procurement'
  if (/(chief operating officer|\bcoo\b|operations|operations manager|director of operations|plant manager|site operations)/.test(combined)) return 'operations'
  if (/(facilities|facility|maintenance|engineering|plant operations|real estate|site acquisition|development|lease|portfolio)/.test(combined)) return 'real_estate'
  if (/(technology|it\b|information technology|cio\b|cto\b|systems|cyber|infrastructure|digital)/.test(combined)) return 'technology'
  if (/(owner|founder|ceo\b|chief executive officer|president|partner|principal|general manager|managing director|executive director)/.test(combined)) return 'executive'
  if (/(medical|clinical|physician|nurse|care|patient|therapy|healthcare|hospital|clinic|wellness|behavioral health|mental health)/.test(combined)) return 'healthcare'
  if (/(school|education|superintendent|principal|dean|campus|academy|student|teacher|district)/.test(combined)) return 'education'
  if (/(city of|county|municipal|public sector|government|city manager|administrator|public safety)/.test(combined)) return 'public_sector'
  if (/(nonprofit|foundation|charity|mission|ministry|faith|church|501c3|community)/.test(combined)) return 'nonprofit'
  if (/(hotel|hospitality|guest|resort|lodging|inn|motel|banquet|event)/.test(combined)) return 'hospitality'
  if (/(retail|store|merchandising|brand|showroom)/.test(combined)) return 'retail'
  if (/(logistics|warehouse|freight|distribution|shipping|3pl|nvocc|cargo|transport)/.test(combined)) return 'logistics'
  if (/(manufacturing|production|plant|factory|fabrication|processing|packaging|food manufacturing|food production)/.test(combined)) return 'manufacturing'

  return 'other'
}

function buildCareAbouts(roleFamily: AudienceRoleFamily, title: string, companyName: string): string[] {
  const baseTitle = title || 'this person'
  const generic = [
    'plain-English answer',
    'who owns the decision',
    'what matters before renewal',
  ]

  const byRole: Record<AudienceRoleFamily, string[]> = {
    finance: ['budget clarity', 'no surprise charges', 'renewal timing', 'which site is driving the swing'],
    operations: ['site usage', 'what is driving the peaks', 'keeping operations steady', 'which locations are carrying the load'],
    facilities: ['building uptime', 'equipment timing', 'comfort and reliability', 'which sites need the most attention'],
    procurement: ['vendor fit', 'renewal timing', 'contract cleanup', 'what should be compared before the next step'],
    executive: ['risk', 'timing', 'simple next step', 'whether this is worth attention now'],
    real_estate: ['site openings', 'lease timing', 'location-by-location costs', 'which properties are carrying the most'],
    technology: ['uptime', 'equipment load', 'steady operations', 'what grows with the business'],
    healthcare: ['reliability', 'patient comfort', 'equipment uptime', 'site-level differences'],
    education: ['campus calendars', 'summer cooling', 'classroom comfort', 'which buildings drive the bill'],
    public_sector: ['stewardship', 'budget protection', 'critical services', 'avoiding surprises'],
    nonprofit: ['mission funds', 'budget protection', 'service continuity', 'avoiding surprises'],
    hospitality: ['guest comfort', 'laundry and HVAC', 'site-level usage', 'which property is the outlier'],
    retail: ['store-level peaks', 'showroom or floor load', 'which locations are different', 'whether the bill lines up with traffic'],
    logistics: ['dock activity', 'refrigeration if any', 'site usage timing', 'which locations are driving peaks'],
    manufacturing: ['production schedules', 'equipment start times', 'which lines create the spikes', 'whether the plant timing is still right'],
    other: generic,
  }

  const selected = byRole[roleFamily] || generic
  return uniqueStrings([
    ...selected,
    baseTitle ? `${baseTitle} at ${companyName || 'the company'}` : '',
  ], 5)
}

function buildRoleSummary(roleFamily: AudienceRoleFamily, title: string, companyName: string): string {
  const company = companyName || 'the company'
  const base = title || 'this contact'
  switch (roleFamily) {
    case 'finance':
      return `${base} usually cares about budget surprises and whether the bill is still making sense at ${company}.`
    case 'operations':
      return `${base} usually cares about how site usage, timing, and uptime are showing up at ${company}.`
    case 'facilities':
      return `${base} usually cares about building uptime, comfort, and which sites are carrying the heaviest load at ${company}.`
    case 'procurement':
      return `${base} usually cares about renewal timing, supplier fit, and whether the current setup still makes sense at ${company}.`
    case 'executive':
      return `${base} usually cares about risk, timing, and whether this deserves attention now at ${company}.`
    case 'real_estate':
      return `${base} usually cares about site openings, leases, and which properties are carrying the cost at ${company}.`
    case 'technology':
      return `${base} usually cares about uptime, equipment load, and growth pressure at ${company}.`
    case 'healthcare':
      return `${base} usually cares about reliability, patient comfort, and equipment uptime at ${company}.`
    case 'education':
      return `${base} usually cares about campus schedules, comfort, and summer load at ${company}.`
    case 'public_sector':
    case 'nonprofit':
      return `${base} usually cares about stewardship, mission funds, and avoiding surprise costs at ${company}.`
    case 'hospitality':
      return `${base} usually cares about guest comfort, laundry, HVAC, and site-level usage at ${company}.`
    case 'retail':
      return `${base} usually cares about store-level traffic, lighting, HVAC, and which locations are the outliers at ${company}.`
    case 'logistics':
      return `${base} usually cares about dock timing, refrigeration if any, and which sites are carrying the peaks at ${company}.`
    case 'manufacturing':
      return `${base} usually cares about production timing, equipment starts, and the plant peak at ${company}.`
    default:
      return `${base} needs a plain-English explanation of what is driving the bill at ${company}.`
  }
}

function buildOpenerHint(profile: AudienceProfile): string {
  const firstName = profile.contactFirstName || profile.contactName.split(/\s+/)[0] || 'there'
  const company = profile.companyName || 'the company'
  switch (profile.roleFamily) {
    case 'finance':
      return `At ${company}, ${firstName} usually cares about budget surprises and which sites are driving the spikes.`
    case 'operations':
      return `At ${company}, ${firstName} usually cares about site usage, timing, and what is driving the spikes.`
    case 'facilities':
      return `At ${company}, ${firstName} usually cares about building uptime and which buildings need the most attention.`
    case 'procurement':
      return `At ${company}, ${firstName} usually cares about renewal timing and whether the current setup still makes sense.`
    case 'executive':
      return `At ${company}, ${firstName} usually cares about the risk side and whether this deserves attention now.`
    case 'real_estate':
      return `At ${company}, ${firstName} usually focuses on the site and lease side.`
    case 'technology':
      return `At ${company}, ${firstName} usually cares about uptime and growth.`
    case 'healthcare':
      return `At ${company}, ${firstName} usually cares about reliability.`
    case 'education':
      return `At ${company}, ${firstName} usually cares about campus timing.`
    case 'public_sector':
    case 'nonprofit':
      return `At ${company}, ${firstName} usually cares about protecting the budget.`
    case 'hospitality':
      return `At ${company}, ${firstName} usually cares about guest comfort and usage.`
    case 'retail':
      return `At ${company}, ${firstName} usually cares about store-level usage.`
    case 'logistics':
      return `At ${company}, ${firstName} usually cares about dock timing.`
    case 'manufacturing':
      return `At ${company}, ${firstName} usually cares about production timing.`
    default:
      return `At ${company}, ${firstName} usually wants a plain-English explanation of what is driving the bill.`
  }
}

function buildQuestionHint(profile: AudienceProfile): string {
  switch (profile.roleFamily) {
    case 'finance':
      return 'Have you been able to separate which sites are carrying the biggest peaks?'
    case 'operations':
      return 'Have you mapped which parts of the operation are driving the spikes?'
    case 'facilities':
      return 'Have you seen which buildings are setting the highest charges?'
    case 'procurement':
      return 'Are you already comparing the current setup before the next renewal?'
    case 'executive':
      return 'Is this the kind of issue you want flagged before it becomes a bigger bill story?'
    case 'real_estate':
      return 'Have you been able to compare the sites one by one yet?'
    case 'technology':
      return 'Have you seen whether the growth side is creating a new load pattern?'
    case 'healthcare':
      return 'Have you been able to separate the sites that are carrying the most pressure?'
    case 'education':
      return 'Have you looked at whether campus timing is what is pushing the bill?'
    case 'public_sector':
    case 'nonprofit':
      return 'Have you checked whether one site is creating the charge that keeps showing up on the budget?'
    case 'hospitality':
      return 'Have you been able to tell which property is setting the highest charge?'
    case 'retail':
      return 'Have you seen which stores are driving the bill the hardest?'
    case 'logistics':
      return 'Have you mapped which sites are creating the peak charges?'
    case 'manufacturing':
      return 'Have you been able to separate the production timing from the bill yet?'
    default:
      return 'Have you looked at which part of the operation is driving the highest charges?'
  }
}

function buildGuardrails(profile: AudienceProfile): string[] {
  const base = [
    'Use plain English.',
    'Use the first name once at most, only if it helps the opener.',
    'Do not mention LinkedIn, profiles, or scraping in the output.',
    'Keep the note to one business problem and one question.',
  ]

  const byRole: Record<AudienceRoleFamily, string[]> = {
    finance: ['Focus on budget surprises, timing, and site-level variance.'],
    operations: ['Focus on site usage, uptime, and the work that actually drives the peak.'],
    facilities: ['Focus on building uptime, comfort, and the sites that carry the most load.'],
    procurement: ['Focus on renewal timing, vendor fit, and who owns the next step.'],
    executive: ['Focus on risk, timing, and a simple next decision.'],
    real_estate: ['Focus on sites, leases, and which properties are different.'],
    technology: ['Focus on uptime, equipment growth, and infrastructure pressure.'],
    healthcare: ['Focus on reliability, patient care, and equipment uptime.'],
    education: ['Focus on campus schedules, summer load, and comfort.'],
    public_sector: ['Focus on stewardship and budget protection.'],
    nonprofit: ['Focus on mission funds and avoiding surprise costs.'],
    hospitality: ['Focus on guest comfort, laundry, and HVAC.'],
    retail: ['Focus on store-level usage and traffic patterns.'],
    logistics: ['Focus on dock activity, refrigeration if any, and site timing.'],
    manufacturing: ['Focus on production timing, equipment starts, and the plant peak.'],
    other: ['Focus on the business problem that would matter to this person.'],
  }

  return uniqueStrings([...base, ...(byRole[profile.roleFamily] || byRole.other)], 8)
}

export function buildAudienceProfile(
  contact: AudienceProfileInput | null | undefined,
  account: AudienceAccountLike | null | undefined = null,
  source: AudienceSource = 'fallback',
  sourceLabel?: string,
): AudienceProfile | null {
  if (!contact && !account) return null

  const metadata = isRecord(contact?.metadata) ? contact.metadata : null
  const nestedApollo = isRecord(metadata?.original_apollo_data) ? metadata?.original_apollo_data as Record<string, unknown> : null

  const contactId = firstText(contact?.contactId, contact?.id, metadata?.contactId, metadata?.contact_id, nestedApollo?.contactId)
  const contactName = firstText(
    contact?.name,
    [contact?.firstName, contact?.lastName].filter(Boolean).join(' '),
    nestedApollo?.fullName,
    nestedApollo?.firstName && nestedApollo?.lastName ? `${nestedApollo.firstName} ${nestedApollo.lastName}` : '',
  )
  const contactFirstName = firstText(contact?.firstName, nestedApollo?.firstName, contactName.split(/\s+/)[0]) || 'there'
  const contactTitle = firstText(
    contact?.title,
    contact?.jobTitle,
    metadata?.job_title,
    metadata?.jobTitle,
    metadata?.title,
    nestedApollo?.jobTitle,
  )
  const companyName = firstText(
    account?.name,
    contact?.companyName,
    contact?.company,
    contact?.accountName,
    metadata?.companyName,
    metadata?.company,
    nestedApollo?.companyName,
  )
  const industry = firstText(
    account?.industry,
    contact?.industry,
    metadata?.industry,
    nestedApollo?.industry,
  )
  const linkedInUrl = firstText(
    contact?.linkedinUrl,
    contact?.linkedin_url,
    metadata?.linkedin_url,
    metadata?.linkedinUrl,
    nestedApollo?.linkedin,
  )

  const backgroundSignals = uniqueStrings([
    ...collectSignals(contact?.notes, 0, 4),
    ...collectSignals(metadata?.notes, 0, 4),
    ...collectSignals(metadata?.about, 0, 4),
    ...collectSignals(metadata?.summary, 0, 4),
    ...collectSignals(metadata?.headline, 0, 4),
    ...collectSignals(metadata?.description, 0, 4),
    ...collectSignals(metadata?.experience, 0, 4),
    ...collectSignals(metadata?.positions, 0, 4),
    ...collectSignals(metadata?.workHistory, 0, 4),
    ...collectSignals(metadata?.work_history, 0, 4),
    ...collectSignals(metadata?.posts, 0, 4),
    ...collectSignals(metadata?.recentPosts, 0, 4),
    ...collectSignals(metadata?.contact, 0, 4),
    ...collectSignals(nestedApollo, 0, 6),
  ], 10)

  const roleFamily = inferRoleFamily(contactTitle, industry, backgroundSignals)
  const profile: AudienceProfile = {
    source,
    sourceLabel: sourceLabel || getSourceLabel(source),
    contactId: contactId || null,
    contactName: contactName || contactFirstName || companyName || 'Unknown contact',
    contactFirstName,
    contactTitle: contactTitle || 'Unknown title',
    companyName: companyName || 'Unknown company',
    industry: industry || 'Unknown industry',
    roleFamily,
    roleSummary: buildRoleSummary(roleFamily, contactTitle, companyName || 'the company'),
    careAbouts: buildCareAbouts(roleFamily, contactTitle, companyName || 'the company'),
    openerHint: buildOpenerHint({
      source,
      sourceLabel: sourceLabel || getSourceLabel(source),
      contactId: contactId || null,
      contactName: contactName || contactFirstName || companyName || 'Unknown contact',
      contactFirstName,
      contactTitle: contactTitle || 'Unknown title',
      companyName: companyName || 'Unknown company',
      industry: industry || 'Unknown industry',
      roleFamily,
      roleSummary: '',
      careAbouts: [],
      openerHint: '',
      questionHint: '',
      backgroundSignals: [],
      evidence: [],
      guardrails: [],
      linkedInUrl: linkedInUrl || null,
    }),
    questionHint: buildQuestionHint({
      source,
      sourceLabel: sourceLabel || getSourceLabel(source),
      contactId: contactId || null,
      contactName: contactName || contactFirstName || companyName || 'Unknown contact',
      contactFirstName,
      contactTitle: contactTitle || 'Unknown title',
      companyName: companyName || 'Unknown company',
      industry: industry || 'Unknown industry',
      roleFamily,
      roleSummary: '',
      careAbouts: [],
      openerHint: '',
      questionHint: '',
      backgroundSignals: [],
      evidence: [],
      guardrails: [],
      linkedInUrl: linkedInUrl || null,
    }),
    backgroundSignals,
    evidence: uniqueStrings([
      contactName ? `Name: ${contactName}` : '',
      contactTitle ? `Title: ${contactTitle}` : '',
      companyName ? `Company: ${companyName}` : '',
      industry ? `Industry: ${industry}` : '',
      linkedInUrl ? 'LinkedIn URL on file' : '',
      ...backgroundSignals.slice(0, 4).map((signal) => `Profile: ${signal}`),
    ], 8),
    guardrails: buildGuardrails({
      source,
      sourceLabel: sourceLabel || getSourceLabel(source),
      contactId: contactId || null,
      contactName: contactName || contactFirstName || companyName || 'Unknown contact',
      contactFirstName,
      contactTitle: contactTitle || 'Unknown title',
      companyName: companyName || 'Unknown company',
      industry: industry || 'Unknown industry',
      roleFamily,
      roleSummary: '',
      careAbouts: [],
      openerHint: '',
      questionHint: '',
      backgroundSignals: [],
      evidence: [],
      guardrails: [],
      linkedInUrl: linkedInUrl || null,
    }),
    linkedInUrl: linkedInUrl || null,
  }

  return profile
}

export function buildAudienceProfileBlock(profile: AudienceProfile | null | undefined): string {
  if (!profile) return ''

  const lines = [
    'AUDIENCE PROFILE:',
    `- Source: ${profile.sourceLabel}${profile.source === 'sequence' ? ' (sequence wins over the decision-maker card if they differ)' : ''}`,
    profile.contactName ? `- Name: ${profile.contactName}` : null,
    profile.contactTitle ? `- Title: ${profile.contactTitle}` : null,
    profile.companyName ? `- Company: ${profile.companyName}` : null,
    profile.industry ? `- Industry: ${profile.industry}` : null,
    `- Role family: ${profile.roleFamily}`,
    profile.roleSummary ? `- What this person likely cares about: ${profile.roleSummary}` : null,
    profile.careAbouts.length ? `- Care abouts: ${profile.careAbouts.join('; ')}` : null,
    profile.openerHint ? `- Opener hint: ${profile.openerHint}` : null,
    profile.questionHint ? `- Question hint: ${profile.questionHint}` : null,
    profile.backgroundSignals.length ? `- Background signals: ${profile.backgroundSignals.slice(0, 5).join('; ')}` : null,
    profile.evidence.length ? `- Evidence: ${profile.evidence.join('; ')}` : null,
    `- Guardrails: ${profile.guardrails.join('; ')}`,
  ].filter(Boolean)

  return lines.join('\n')
}

export function buildAudienceLead(profile: AudienceProfile | null | undefined): string {
  if (!profile) return ''
  return profile.openerHint || ''
}
