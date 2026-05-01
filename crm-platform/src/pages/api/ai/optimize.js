import { cors } from '../_cors.js';
import logger from '../_logger.js';
import { getTexasEnergyContext, normalizeCityKey } from '@/lib/texas-territory';
import { buildIntelligenceBriefContext } from '@/lib/intelligence-brief-context';

function extractJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {
      return null;
    }
  }
}

function normalizeBodyHtml(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (/<\s*p[>\s]/i.test(text)) return text;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return '';

  return lines.map((line) => `<p>${line}</p>`).join('');
}

function normalizeSubject(input) {
  const value = String(input || '').trim();
  if (!value) return 'Message from Nodal Point';
  return value.replace(/\s+/g, ' ').slice(0, 140);
}

function normalizeLiveSignalText(input) {
  if (!input) return '';
  if (Array.isArray(input)) {
    return input
      .map((item) => normalizeLiveSignalText(item))
      .filter(Boolean)
      .join(' | ');
  }
  if (typeof input === 'object') {
    const title = normalizeLiveSignalText(input.title);
    const snippet = normalizeLiveSignalText(input.snippet);
    const summary = normalizeLiveSignalText(input.summary);
    return [title, snippet || summary].filter(Boolean).join(': ');
  }
  return String(input).trim();
}

function normalizeSenderFirstName(input) {
  const cleaned = String(input || '').replace(/<[^>]*>/g, '').trim();
  if (!cleaned) return 'Lewis';
  const first = cleaned.split(/\s+/)[0] || 'Lewis';
  return first.replace(/[^A-Za-z'-]/g, '') || 'Lewis';
}

function ensureThanksSignoff(input, senderFirstName) {
  const html = String(input || '').trim();
  if (!html) return html;

  const firstName = normalizeSenderFirstName(senderFirstName);
  const hasExactSignoff = new RegExp(
    `<p[^>]*>\\s*Thanks,\\s*<br\\s*\\/?\\>\\s*${firstName}\\s*<\\/p>\\s*$`,
    'i'
  ).test(html);
  if (hasExactSignoff) return html;

  // Remove common closings at the end so the enforced signoff stays consistent.
  const withoutClose =
    html.replace(
      /(?:<p[^>]*>\s*(?:Best regards|Regards|Sincerely|Cheers|Thanks|Thank you),?\s*(?:<br\s*\/?>\s*[^<]+)?<\/p>\s*|<p[^>]*>\s*(?:Best regards|Regards|Sincerely|Cheers|Thanks|Thank you),?\s*<\/p>\s*<p[^>]*>[\s\S]*?<\/p>\s*)+$/i,
      ''
    ).trim();

  return `${withoutClose}<p>Thanks,<br>${firstName}</p>`;
}

function cleanCompanyName(input) {
  const raw = String(input || '').trim();
  if (!raw) return 'Unknown';

  const hasRelationshipDescriptor = /\b(?:a|an|part of|subsidiary of|division of|member of)\b/i.test(raw)
    || /,\s*(?:a|an)\s+[^,]+?\s+company\b/i.test(raw);

  let cleaned = raw;

  // Outreach should use the operating name, not the full legal entity string.
  cleaned = cleaned.replace(/\s+d\/b\/a\s+.+$/i, '');
  cleaned = cleaned.replace(/\s+dba\s+.+$/i, '');
  cleaned = cleaned.replace(/\s+a\/k\/a\s+.+$/i, '');
  cleaned = cleaned.replace(/\s+aka\s+.+$/i, '');
  cleaned = cleaned.replace(/,\s*(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '');
  cleaned = cleaned.replace(/\s+(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '');
  if (!hasRelationshipDescriptor) {
    cleaned = cleaned.replace(/,\s*(company)\.?$/i, '');
    cleaned = cleaned.replace(/\s+(company)\.?$/i, '');
  }
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned || raw;
}

function normalizeListOfStrings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const address = typeof item.address === 'string' ? item.address.trim() : '';
        const city = typeof item.city === 'string' ? item.city.trim() : '';
        const state = typeof item.state === 'string' ? item.state.trim() : '';
        return address || [city, state].filter(Boolean).join(', ');
      }
      return '';
    })
    .filter(Boolean);
}

function extractPrimarySiteDetails(value) {
  const empty = { address: '', city: '', state: '' };
  if (!value) return empty;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? { address: trimmed, city: '', state: '' } : empty;
  }

  if (Array.isArray(value)) {
    const candidates = [];
    for (const item of value) {
      const details = extractPrimarySiteDetails(item);
      if (!details.address && !details.city && !details.state) continue;

      const normalized = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
      const flagText = [normalized.type, normalized.label, normalized.name, normalized.kind]
        .filter((part) => typeof part === 'string')
        .join(' ')
        .toLowerCase();
      const isPrimary = [normalized.isPrimary, normalized.primary, normalized.is_primary, normalized.preferred, normalized.default]
        .some((flag) => flag === true || flag === 'true' || flag === 1 || flag === '1')
        || /\b(primary|headquarters|head office|hq|main|billing)\b/.test(flagText);

      candidates.push({ ...details, isPrimary });
    }
    if (candidates.length > 0) {
      return candidates.find((candidate) => candidate.isPrimary) || candidates[0];
    }
    return empty;
  }

  if (typeof value === 'object') {
    const address = typeof value.address === 'string' ? value.address.trim() : '';
    const city = typeof value.city === 'string' ? value.city.trim() : '';
    const state = typeof value.state === 'string' ? value.state.trim() : '';
    return { address: address || [city, state].filter(Boolean).join(', '), city, state };
  }

  return empty;
}

function extractHierarchyIds(metadata) {
  const safeMeta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const relationships = safeMeta.relationships && typeof safeMeta.relationships === 'object' && !Array.isArray(safeMeta.relationships)
    ? safeMeta.relationships
    : {};
  const parentAccountId = typeof relationships.parentAccountId === 'string' && relationships.parentAccountId.trim()
    ? relationships.parentAccountId.trim()
    : typeof safeMeta.parentAccountId === 'string' && safeMeta.parentAccountId.trim()
      ? safeMeta.parentAccountId.trim()
      : typeof safeMeta.parent_company_id === 'string' && safeMeta.parent_company_id.trim()
        ? safeMeta.parent_company_id.trim()
        : null;
  const subsidiaryAccountIds = Array.isArray(relationships.subsidiaryAccountIds)
    ? relationships.subsidiaryAccountIds
      .filter((id) => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean)
    : Array.isArray(safeMeta.subsidiaryAccountIds)
      ? safeMeta.subsidiaryAccountIds
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
      : [];
  return { parentAccountId, subsidiaryAccountIds };
}

function softenFirstTouchEnergyJargon(input, strategy) {
  const text = String(input || '');
  const strategyText = String(strategy || '');
  const isFirstTouch = /first[-\s]?touch|day\s*1|forensic opener/i.test(strategyText);
  if (!text || !isFirstTouch) return text;

  return text
    .replace(/\b4CP\b/gi, 'summer peak periods')
    .replace(/\bTDUs\b/g, 'local utilities')
    .replace(/\bTDU\b/g, 'local utility')
    .replace(/\bESI\s*ID\b/gi, 'service account number');
}

function cleanSequenceCopy(input) {
  let text = String(input || '');
  if (!text) return text;

  // ── Open tracking disclosure — strip any phrase revealing recipient opened/viewed ──
  text = text
    .replace(/[Ss]ince you (?:opened|viewed|read|looked at)(?: my| the)? (?:last |previous |prior )?(?:email|message|note)[,.]?\s*/gi, '')
    .replace(/[Bb]ecause you (?:opened|viewed|looked at)(?: my)? (?:last |previous |prior )?(?:email|message|note)[,.]?\s*/gi, '')
    .replace(/(?:I noticed|I saw)(?: that)? you (?:recently |just )?(?:opened|viewed|looked at|read|checked out)(?: my| the)? (?:last |previous |prior )?(?:email|message|note)[^.]*?[.]\s*/gi, '')
    .replace(/I saw your team[^.]+?(?:opened|viewed|read) my (?:last |previous )?(?:email|message|note)[^.]*?[.]\s*/gi, '')
    .replace(/my (?:last |previous |prior )?(?:email|note|message) seemed to (?:hit home|resonate|land well|catch your eye|catch your attention)[^.]*?[.]\s*/gi, '')
    .replace(/you (?:recently |just )?(?:opened|read|viewed|looked at) my (?:last |previous )?(?:email|message|note)[^.]*?[,.]\s*/gi, '')

  // ── "We" → "I" for review/diagnostic language ──
  text = text
    .replace(/\bWe review these\b/gi, 'I review these')
    .replace(/\bwe (?:regularly )?(?:review|audit|diagnose|analyze) (?:these |electricity |energy |power )?(?:bills|statements|invoices)\b/gi, 'I review these bills')

  // ── Past conditional CTAs → present conditional ──
  text = text
    .replace(/\bif you sent(?: over| me)?\b/gi, 'if you send')
    .replace(/\bif you shared\b/gi, 'if you share')
    .replace(/\bI could reply\b/gi, "I'll reply")
    .replace(/\bI could send\b/gi, "I'll send")
    .replace(/\bI could (?:take a look|have a look|look at it|look it over|review it)\b/gi, 'I can take a look')
    .replace(/\bI could quickly\b/gi, 'I can quickly')
    .replace(/\bI could (?:highlight|share|give|provide|point out)\b/gi, (m) => m.replace('could', 'can'))
    .replace(/\bWould that be helpful\?\s*/gi, "If that's worth a look, reply and I'll send a short read. ")
    .replace(/\bWould that quick review be helpful\?\s*/gi, "If that's worth a look, reply and I'll send a short read. ")
    .replace(/\bWould you be open to me reviewing it\?\s*/gi, "If you'd like, I'll send a short read first. ")
    .replace(/\bWould you be open to me taking a look(?: if you sent it over)?\?\s*/gi, "Want me to send the one-page snapshot? ")
    .replace(/\bWant me to take a look\?\s*/gi, "Want me to send the one-page snapshot? ")
    .replace(/\bWorth a quick check\?\s*/gi, "Want me to send the one-page snapshot? ")
    .replace(/\bWould you be open to a 15-minute call next week\?\s*/gi, "Want me to send the one-page snapshot? ")
    .replace(/\bWould you be open to a quick call next week\?\s*/gi, "Want me to send the one-page snapshot? ")
    .replace(/\bWould you be open to a short call next week\?\s*/gi, "Want me to send the one-page snapshot? ")
    .replace(/\bI can reply with a quick 2-3 point forensic snapshot\b/gi, "I'll send a short read")
    .replace(/\bI can reply with 2-3 observations\b/gi, "I'll send a short read")
    .replace(/\b2-3 specific observations\b/gi, "a short read")
    .replace(/\bshort breakdown of what stands out\b/gi, 'a short read on the cost side')
    .replace(/\bI review electricity statements for Nodal Point\b/gi, 'I review commercial electricity costs')
    .replace(/\bMy company, Nodal Point, helps businesses understand their energy bills better\.?\s*/gi, 'I review commercial electricity costs for Nodal Point. ')
    .replace(/\bI review these bills\b/gi, 'I review these electricity costs')
    .replace(/\b3-point readout\b/gi, 'one-page snapshot')

  return text;
}

function deGenericizeFirstTouchCopy(input, strategy) {
  const text = String(input || '');
  const strategyText = String(strategy || '');
  const isFirstTouch = /first[-\s]?touch|day\s*1|forensic opener/i.test(strategyText);
  if (!text || !isFirstTouch) return text;

  return text
    // Strip LinkedIn attribution phrases — replace with neutral research language
    .replace(/I noticed on LinkedIn that\s*/gi, 'I was reviewing the space and saw that ')
    .replace(/I noticed on LinkedIn[,.]?\s*/gi, 'Based on my research, ')
    .replace(/I saw on LinkedIn that\s*/gi, 'I was reviewing publicly available information and saw that ')
    .replace(/I saw on LinkedIn[,.]?\s*/gi, 'I was doing some research and ')
    .replace(/I came across your (?:profile|page|post) on LinkedIn[,.]?\s*/gi, 'I was reviewing your background and ')
    .replace(/Came across your ([^<]+?) (?:role|profile|post) on LinkedIn[,.]?\s*/gi, 'Reviewing your background as $1, ')
    .replace(/I noticed on ([^<]+?) website that/gi, 'I was reviewing $1 and saw that')
    .replace(/Reviewing ([^<]+?), I noticed/gi, 'I was reviewing $1 and saw')
    .replace(/many organizations in your sector see costs shift constantly in the ERCOT market/gi, 'a lot of companies in your space see those costs move with ERCOT')
    .replace(/I regularly diagnose Texas electricity bills, looking for billing errors or contract issues/gi, 'I review Texas electricity bills for billing issues and contract leaks')
    .replace(/I offer a quick check on those details/gi, 'I can send a quick cost view on those details')
    .replace(/If you sent me your latest electricity statement, I could reply with a 2-3 point snapshot of what stands out/gi, 'If useful, I can send a short view of what I would check first')
    .replace(/If you sent me your latest bill, I could reply with a few bullet points on what stands out/gi, 'If useful, I can send a short view of what I would check first');
}

function enforceStageSpecificCTA(input, replyStage) {
  let text = String(input || '');
  const stage = normalizeReplyStage(replyStage);
  if (!text) return text;

  const billAskPatterns = [
    /\bsend (?:me |over |across )?(?:the |your )?(?:latest |current )?(?:electricity |utility |power )?(?:statement|bill|invoice)\b[^.?!]*/gi,
    /\bshare (?:the |your )?(?:latest |current )?(?:electricity |utility |power )?(?:statement|bill|invoice)\b[^.?!]*/gi,
    /\bif you send (?:me |over |across )?(?:the |your )?(?:latest |current )?(?:electricity |utility |power )?(?:statement|bill|invoice)\b[^.?!]*/gi,
    /\bif you share (?:the |your )?(?:latest |current )?(?:electricity |utility |power )?(?:statement|bill|invoice)\b[^.?!]*/gi
  ];

  if (stage === 'first_touch') {
    for (const pattern of billAskPatterns) {
      text = text.replace(pattern, "reply and I'll send a short read");
    }
  } else if (stage === 'follow_up') {
    for (const pattern of billAskPatterns) {
      text = text.replace(pattern, "reply and I'll send the one-page snapshot");
    }
  } else if (stage === 'no_reply') {
    for (const pattern of billAskPatterns) {
      text = text.replace(pattern, 'reply and I can send the short cost view');
    }
    text = text.replace(/\bwho (?:at [^?.,]+ )?(?:handles|reviews|owns) (?:your |the )?(?:electricity|energy|utility|power) (?:agreement|agreements|bill|bills|review)\??/gi, 'if this sits with you, reply and I can send the short cost view');
  }

  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s+\./g, '.')
    .replace(/,\s+\./g, '.')
    .trim();
}

function normalizeReplyStage(value) {
  const stage = String(value || '').toLowerCase().trim();
  if (!stage) return 'general';
  if (stage.includes('first') && stage.includes('touch')) return 'first_touch';
  if (stage.includes('forensic opener') || stage.includes('day 1') || stage.includes('day1') || stage.includes('day_1') || stage.includes('intro')) {
    return 'first_touch';
  }
  if (stage.includes('no reply') || stage.includes('no-reply') || stage.includes('pattern interrupt') || stage.includes('pattern-interrupt') || stage.includes('breakup') || stage.includes('ghost')) {
    return 'no_reply';
  }
  if (stage.includes('follow') || stage.includes('opened') || stage.includes('clicked') || stage.includes('day 3') || stage.includes('day3') || stage.includes('day 7') || stage.includes('day7') || stage.includes('day 14') || stage.includes('day14')) {
    return 'follow_up';
  }
  return 'general';
}

function detectReplyStage(prompt, draft) {
  const text = `${prompt || ''}\n${draft || ''}`.toLowerCase();
  if (/(pattern[-\s]?interrupt|no[-\s]?reply|breakup|ghost)/.test(text)) return 'no_reply';
  if (/(first[-\s]?touch|forensic opener|day\s*0|day\s*1|intro)/.test(text)) return 'first_touch';
  if (/(follow[-\s]?up|opened|clicked|day\s*3|day\s*7|day\s*14)/.test(text)) return 'follow_up';
  return 'general';
}

function buildReplyStageDirective(stage) {
  const directives = {
    first_touch: [
      '- FIRST TOUCH: 50-80 words, 2 short paragraphs.',
      '- Pick exactly one reply lane: real event, renewal/timing, budget variance, operations/load, routing/owner, or market timing. Do not blend lanes.',
      '- Lane selection by role/title: controller/CFO/accounting = budget variance, trust in current price, renewal timing, or budget surprise; facilities/operations/warehouse/logistics/manufacturing = load timing, demand peaks, uptime, or site usage; purchasing/contracts/procurement/asset management = renewal timing, vendor fit, or contract cleanup; owner/CEO/president/GM/VP = leverage, timing, or a simple cost check; school/church/nonprofit/healthcare = stewardship, predictability, comfort, or reliability.',
      '- Do not choose "delivery charges" or "demand charges" unless the company has a physical site, usage pattern, TDU context, or industry profile that makes that angle believable. For small offices, professional services, schools, clinics, and light retail, use budget predictability, renewal timing, cooling, comfort, or who owns the review.',
      '- Use one concrete research fact from the company description, website, public news, or LinkedIn headline/about when available. LinkedIn is a research signal only and must never be mentioned in the email.',
      '- Start with one concrete company, role, city, operating, or event fact. Make the first sentence sound like a real observation, not a template. Avoid the phrase "the useful question is."',
      '- Make the payoff explicit without asking for a bill. Offer one low-friction next step only: a one-page snapshot, a short read, a yes/no reply, or a routing reply.',
      '- First-touch tone should be direct but calm. First-touch CTA must be easy to answer. Good patterns: "Want me to send the one-page snapshot?" "Reply yes and I\'ll send the short read." "Does this sit with you or someone else?" "Am I barking up the right tree on this?"',
      '- Never ask for a utility bill, statement, or invoice in first touch.',
      '- Subject line should match the persona and stage: finance = budget drift / timing / fixed cost; operations = load timing / delivery gap / demand; purchasing = renewal timing / vendor fit; owner = timing / leverage / simple check. Examples: budget drift, fixed cost check, load timing, delivery gap, renewal timing, simple cost check.',
      '- Never mention LinkedIn, a profile, or how the person was found.',
    ].join('\n'),
    follow_up: [
      '- FOLLOW-UP: 45-75 words, 2-3 short paragraphs.',
      '- Add one new fact or angle. Reference prior contact by topic only, never opens/clicks. Do not repeat the same lane from the prior note if the prompt gives a new signal.',
      '- Reinforce one concrete output that does not require document sharing yet: a one-page snapshot, a short read, a short call, or a routing reply.',
      '- Follow-up tone should be more diagnostic and a little more direct than first touch.',
      '- Use one direct CTA only. Good patterns: "Want me to send the one-page snapshot?" "Reply yes and I\'ll send the short read." "Is this worth checking before renewal?"',
      '- Do not ask for a bill unless this is explicitly a later, high-intent step.',
      '- Subject line should sound slightly more diagnostic than Day 1, not generic. Examples: rate vs delivery, demand adds cost, timing check.',
    ].join('\n'),
    no_reply: [
      '- NO REPLY: 30-50 words, maximum 2 sentences.',
      '- Assume you already reached the right person. Do not ask who owns electricity review.',
      '- Sentence 1 should state the value in plain English and name one likely leak area.',
      '- Sentence 2 should use a tiny reply ask: a routing reply, a yes/no, or permission to send a short read.',
      '- No-reply tone should be sharper and cleaner than prior touches. Do not be soft here.',
      '- Never ask for a bill, statement, or invoice in this branch.',
      '- Subject line should be the sharpest and simplest one in the sequence. Examples: short read, quick yes/no, close the loop.',
    ].join('\n'),
    general: [
      '- Keep the note short, but never vague. Give one real observation and one concrete reason to reply.',
      '- Make the value explicit: the recipient should know exactly what you will tell them back and why it matters.',
      '- Use a plain subject line with 1-4 words, but vary it by title and stage. Do not keep reusing the same cost-view phrasing.',
      '- One CTA only. Early stages use low-friction asks. Later/high-intent stages may optionally ask for a bill only to confirm hard numbers.',
      '- As the sequence progresses, the tone should move from thoughtful, to diagnostic, to direct, to clean closure.',
    ].join('\n')
  };

  return directives[stage] || directives.general;
}

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { draft, type, context, contact, prompt, provider, mode = 'generate_email', vectors = [], sequenceStage, replyStage: replyStageInput } = req.body;
  const replyStage = normalizeReplyStage(sequenceStage || replyStageInput || detectReplyStage(prompt, draft));
  const liveSignalVectorIds = new Set(['recent_news', 'market_signal', 'market_news', 'live_news']);
  const wantsLiveSignals = Array.isArray(vectors) && vectors.some((value) => liveSignalVectorIds.has(String(value)));

  if (!draft && !prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Draft content or prompt is required' }));
    return;
  }

  // Handle OpenRouter (ChatGPT-OSS)
  if (provider === 'openrouter') {
    const openRouterKey = process.env.OPEN_ROUTER_API_KEY;
    if (!openRouterKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OpenRouter API key not configured' }));
      return;
    }

    try {
      let systemInstruction = '';
      let userContent = '';
      const hasLinkedIn = !!(contact?.has_linkedin || contact?.linkedin_url || contact?.linkedinUrl);
      const hasWebsite = !!(contact?.has_website || contact?.website || contact?.domain);
      const sourceLabel = contact?.source_label || (hasLinkedIn ? 'linkedin' : (hasWebsite ? 'website' : 'public_company_info'));
      const hasEnergyVector = Array.isArray(vectors) && vectors.some(v => ['energy_context', 'energy_intel'].includes(String(v)));
      const contactTitle = typeof contact?.title === 'string' && contact.title.trim() ? contact.title.trim() : 'Unknown';
      const contactIndustry = typeof contact?.industry === 'string' && contact.industry.trim() ? contact.industry.trim() : 'Unknown';
      const stateValue = typeof contact?.state === 'string' ? contact.state.trim() : '';
      const primarySiteDetails = extractPrimarySiteDetails(
        contact?.site_address ||
        contact?.service_addresses ||
        contact?.serviceAddresses ||
        contact?.address
      );
      const hierarchyIds = extractHierarchyIds(contact?.metadata);
      const parentCompanyId = typeof contact?.parent_company_id === 'string' && contact.parent_company_id.trim()
        ? contact.parent_company_id.trim()
        : hierarchyIds.parentAccountId;
      const parentCompanyCount = Number.isFinite(Number(contact?.subsidiary_count))
        ? Number(contact.subsidiary_count)
        : hierarchyIds.subsidiaryAccountIds.length;
      const siteState = typeof contact?.site_state === 'string' && contact.site_state.trim()
        ? contact.site_state.trim()
        : primarySiteDetails.state || stateValue;
      const siteCity = typeof contact?.site_city === 'string' && contact.site_city.trim()
        ? contact.site_city.trim()
        : primarySiteDetails.city || '';
      const siteAddress = typeof contact?.site_address === 'string' && contact.site_address.trim()
        ? contact.site_address.trim()
        : primarySiteDetails.address
          || (typeof contact?.address === 'string' && contact.address.trim()
            ? contact.address.trim()
            : '');
      const texasEnergy = getTexasEnergyContext(siteCity, siteState, siteAddress || primarySiteDetails.address || siteCity);
      const utilityTerritory = typeof contact?.utility_territory === 'string' && contact.utility_territory.trim()
        ? contact.utility_territory.trim()
        : texasEnergy.utilityTerritory;
      const explicitTduDisplay = typeof contact?.tdu === 'string' && contact.tdu.trim()
        ? contact.tdu.trim()
        : typeof contact?.tdu_display === 'string' && contact.tdu_display.trim()
          ? contact.tdu_display.trim()
          : '';
      const explicitTduCandidates = Array.isArray(contact?.tdu_candidates)
        ? contact.tdu_candidates
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
        : [];
      const marketContext = typeof contact?.market_context === 'string' && contact.market_context.trim()
        ? contact.market_context.trim()
        : texasEnergy.marketContext;
      const tduCandidates = explicitTduCandidates.length ? explicitTduCandidates : texasEnergy.tduCandidates;
      const tduDisplay = explicitTduDisplay || texasEnergy.tduDisplay;
      const parentCompany = typeof contact?.parent_company === 'string' && contact.parent_company.trim()
        ? contact.parent_company.trim()
        : typeof contact?.parentCompany === 'string' && contact.parentCompany.trim()
          ? contact.parentCompany.trim()
          : typeof contact?.parent_company_name === 'string' && contact.parent_company_name.trim()
            ? contact.parent_company_name.trim()
            : typeof contact?.metadata?.relationships?.parentCompanyName === 'string' && contact.metadata.relationships.parentCompanyName.trim()
              ? contact.metadata.relationships.parentCompanyName.trim()
            : null;
      const subsidiaryCompanies = [
        ...(Array.isArray(contact?.subsidiary_companies) ? contact.subsidiary_companies : []),
        ...(Array.isArray(contact?.subsidiaryCompanies) ? contact.subsidiaryCompanies : []),
        ...(Array.isArray(contact?.metadata?.relationships?.subsidiaryCompanies) ? contact.metadata.relationships.subsidiaryCompanies : []),
      ]
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
      const organizationRole = typeof contact?.organization_role === 'string' && contact.organization_role.trim()
        ? contact.organization_role.trim()
        : parentCompany || parentCompanyId
          ? 'subsidiary'
          : subsidiaryCompanies.length || parentCompanyCount
            ? 'parent'
            : 'standalone';
      let contactLocation = siteAddress;
      if (!contactLocation) {
        if (siteCity) {
          contactLocation = `${siteCity}${siteState ? `, ${siteState}` : ''}`;
        } else if (primarySiteDetails.city) {
          contactLocation = `${primarySiteDetails.city}${primarySiteDetails.state ? `, ${primarySiteDetails.state}` : ''}`;
        } else if (typeof contact?.location === 'string' && contact.location.trim()) {
          contactLocation = contact.location.trim();
        } else if (typeof contact?.city === 'string' && contact.city.trim()) {
          contactLocation = `${contact.city.trim()}${contact?.state ? `, ${String(contact.state).trim()}` : ''}`;
        } else {
          contactLocation = 'Unknown';
        }
      }
      const companyName = cleanCompanyName(contact?.company || contact?.operating_company || contact?.outreach_company);
      const hierarchySummary = typeof contact?.hierarchy_summary === 'string' && contact.hierarchy_summary.trim()
        ? contact.hierarchy_summary.trim()
        : typeof contact?.relationship_summary === 'string' && contact.relationship_summary.trim()
          ? contact.relationship_summary.trim()
          : [
            `Operating company: ${companyName}`,
            `Parent company: ${parentCompany || parentCompanyId || 'none'}`,
            `Subsidiaries: ${subsidiaryCompanies.length ? subsidiaryCompanies.join('; ') : parentCompanyCount ? `${parentCompanyCount} linked account(s)` : 'none'}`,
            `Role: ${organizationRole}`,
            siteAddress ? `Site: ${siteAddress}` : null,
            `Market: ${marketContext}`,
          ].filter(Boolean).join(' | ');
      const companyDescription = typeof contact?.company_description === 'string' && contact.company_description.trim()
        ? contact.company_description.trim()
        : typeof contact?.description === 'string' && contact.description.trim()
          ? contact.description.trim()
          : '';
      const companyResearch = typeof contact?.research_summary === 'string' && contact.research_summary.trim()
        ? contact.research_summary.trim()
        : typeof contact?.context_for_ai === 'string' && contact.context_for_ai.trim()
          ? contact.context_for_ai.trim()
          : '';
      const callContext = typeof contact?.call_context === 'string' && contact.call_context.trim()
        ? contact.call_context.trim()
        : typeof contact?.transcript === 'string' && contact.transcript.trim()
          ? contact.transcript.trim()
          : '';
      const employeeCount = contact?.employees ?? contact?.employee_count ?? contact?.headcount ?? null;
      const supplier = (contact?.electricity_supplier || contact?.supplier || contact?.metadata?.energy?.supplier || 'Unknown');
      const currentRate = (contact?.current_rate ?? contact?.metadata?.energy?.current_rate ?? 'Unknown');
      const contractEndRaw = (contact?.contract_end_date || contact?.contractEndDate || null);
      const contractEndYear = contact?.contract_end_year || (contractEndRaw ? new Date(contractEndRaw).getUTCFullYear() : null);
      const annualUsage = contact?.annual_usage ?? contact?.metadata?.energy?.annual_usage ?? null;
      const loadFactor = contact?.load_factor ?? contact?.metadata?.energy?.load_factor ?? null;
      const recentSignal = typeof contact?.recent_signal === 'string' && contact.recent_signal.trim()
        ? contact.recent_signal.trim()
        : typeof contact?.news === 'string' && contact.news.trim()
          ? contact.news.trim()
          : typeof contact?.notes === 'string' && contact.notes.trim()
            ? contact.notes.trim()
            : '';
      const liveSignalContext = wantsLiveSignals
        ? normalizeLiveSignalText(
          contact?.liveSignals ||
          contact?.market_signal ||
          contact?.market_news ||
          contact?.news ||
          contact?.recent_news ||
          ''
        )
        : '';
      const intelligenceBriefContext = buildIntelligenceBriefContext({
        intelligenceBriefHeadline: contact?.intelligence_brief_headline || contact?.intelligenceBriefHeadline || null,
        intelligenceBriefDetail: contact?.intelligence_brief_detail || contact?.intelligenceBriefDetail || null,
        intelligenceBriefTalkTrack: contact?.intelligence_brief_talk_track || contact?.intelligenceBriefTalkTrack || null,
        intelligenceBriefSignalDate: contact?.intelligence_brief_signal_date || contact?.intelligenceBriefSignalDate || null,
        intelligenceBriefReportedAt: contact?.intelligence_brief_reported_at || contact?.intelligenceBriefReportedAt || null,
        intelligenceBriefConfidenceLevel: contact?.intelligence_brief_confidence_level || contact?.intelligenceBriefConfidenceLevel || null,
        intelligenceBriefStatus: contact?.intelligence_brief_status || contact?.intelligenceBriefStatus || null,
      });

      const dataVectors = [
        `- TARGET_IDENTITY: ${contact?.name || 'Unknown'} (${contactIndustry}) at ${companyName}`,
        `- COMPANY_OUTREACH_NAME: ${companyName}`,
        contact?.company && companyName !== contact.company ? `- COMPANY_LEGAL_NAME: ${contact.company}` : null,
        siteAddress ? `- SITE_ADDRESS: ${siteAddress}` : null,
        siteCity ? `- SITE_CITY: ${siteCity}` : null,
        siteState ? `- SITE_STATE: ${siteState}` : null,
        utilityTerritory ? `- UTILITY_TERRITORY: ${utilityTerritory}` : null,
        tduDisplay ? `- TDU_DISPLAY: ${tduDisplay}` : null,
        tduCandidates.length ? `- TDU_CANDIDATES: ${tduCandidates.join('; ')}` : null,
        `- MARKET_CONTEXT: ${marketContext}`,
        `- ORG_STRUCTURE: role=${organizationRole}; parent=${parentCompany || parentCompanyId || 'none'}; parent_id=${parentCompanyId || 'none'}; subsidiaries=${subsidiaryCompanies.length ? subsidiaryCompanies.join('; ') : parentCompanyCount ? `${parentCompanyCount} linked account(s)` : 'none'}`,
        hierarchySummary ? `- HIERARCHY_SUMMARY: ${hierarchySummary}` : null,
        parentCompany ? `- PARENT_COMPANY: ${parentCompany}` : null,
        parentCompanyId ? `- PARENT_COMPANY_ID: ${parentCompanyId}` : null,
        subsidiaryCompanies.length ? `- SUBSIDIARY_COMPANIES: ${subsidiaryCompanies.join('; ')}` : null,
        parentCompanyCount && !subsidiaryCompanies.length ? `- SUBSIDIARY_COUNT: ${parentCompanyCount}` : null,
        companyDescription ? `- COMPANY_DESCRIPTION: ${companyDescription}` : null,
        companyResearch ? `- COMPANY_RESEARCH: ${companyResearch}` : null,
        callContext ? `- CALL_CONTEXT: ${callContext}` : null,
        employeeCount ? `- COMPANY_SCALE: ${employeeCount} employees` : null,
        `- ROLE: ${contactTitle}`,
        `- LOCATION: ${contactLocation}`,
        `- VECTOR_STATE: energy_enabled=${hasEnergyVector}`,
        hasEnergyVector
          ? `- ENERGY_INTEL: Supplier ${supplier}, Current Rate ${currentRate}, Utility Territory ${utilityTerritory || 'Unknown'}, TDU ${tduDisplay || 'Unknown'}, Factor ${loadFactor || 'Unknown'}, Annual Usage ${annualUsage || 'Unknown'}, Contract End Year ${contractEndYear || 'Unknown'}`
          : '- ENERGY_INTEL: disabled_by_vector',
        `- SOURCE_TRUTH: source_label=${sourceLabel}, has_linkedin=${hasLinkedIn}, has_website=${hasWebsite}`,
        contact?.linkedin_url && `- LINKEDIN_URL: ${contact.linkedin_url}`,
        contact?.linkedinUrl && `- LINKEDIN_URL: ${contact.linkedinUrl}`,
        contact?.website && `- WEBSITE: ${contact.website}`,
        contact?.domain && `- DOMAIN: ${contact.domain}`,
        wantsLiveSignals && `- LIVE_MARKET_SIGNAL: ${liveSignalContext || 'No live signal available.'}`,
        intelligenceBriefContext || null,
        recentSignal ? `- RECENT_SIGNAL: ${recentSignal}` : null,
        vectors.includes('transcripts') && `- PREVIOUS_DIALOG: ${callContext || 'No usable call transcripts.'}`,
        contact?.metadata && `- EXTENDED_METADATA: ${JSON.stringify(contact.metadata)}`
      ].filter(Boolean).join('\n');

      if (mode === 'optimize_prompt') {
        systemInstruction = `
          You are the Nodal Architect. Your task is to clean and tighten a prompt that will be used to generate cold email copy.

          RULES:
          1. Keep it under 80 words.
          2. Preserve hard facts, names, dates, stage, and constraints.
          3. Make the outcome explicit: one concrete observation, one pain signal, one low-friction ask, one yes/no question.
          4. If the prompt is for a first touch, follow-up, or no-reply step, keep that stage explicit and keep the note short.
          5. Remove filler, marketing fluff, and vague language.
          6. Output ONLY the optimized prompt text. No explanations.
        `;
        userContent = `Original prompt:\n\n${prompt}`;
      } else if (mode === 'generate_email') {
        systemInstruction = `
          You write cold emails for an Energy Analyst at Nodal Point. You do not sell, you diagnose.

          RULES:
          1. Max 90 words.
          2. 6th grade vocabulary. No corporate jargon.
          3. NO bullet points. Write in 2–3 short paragraphs.
          4. NO em-dashes (—). Use commas or periods.
          5. Start with first name and a comma only. No "Hi" or "Hello."
          6. If you use bullets, this email fails. Use paragraphs only.
          7. NO CITATIONS OR LINKS: Do not include any external links, URLs, or bracketed citations (e.g. [source.com]).
          8. TEXAS DEREGULATED MARKET (ERCOT): Keep context Texas/ERCOT and forbid UK references (like "Citizens Advice").
            - If the account is outside Texas, position Nodal Point as helping nationwide accounts in deregulated markets. Do not imply Texas-only coverage.
          9. HOOK RULE:
            - Sentence one must mention the specific site/location being discussed (address, city, or operating site) and tie that place to one SPECIFIC, concrete operational reality.
            - If the account is a subsidiary, use the operating company name and mention the parent only once if it helps orient the reader. Never confuse the parent company with the site.
            - If the site is in Texas and a single TDU is clearly known, use that plain name once naturally: Oncor, CenterPoint, AEP Texas, TNMP, or LP&L. If the city is mixed or ambiguous, do not force a utility name.
            - CRITICAL: City + industry alone is NOT a hook. "For logistics companies in Houston, costs can shift quite a bit" tells the recipient nothing specific about them and reads as a template. Use one fact from: account description, company scale, revenue, a known operational characteristic of that specific industry in that market, the parent/subsidiary structure, the site address, or a recent signal. If no specific data exists, make an observation about that industry's energy profile (e.g., "cold storage facilities in Dallas run 24/7 baseload which concentrates demand charge exposure" or "rail service yards carry high fixed-load hours that push peak billing hard") — never a generic "costs can shift" statement.
            - Avoid vague openers: "energy costs are tough", "costs can shift quite a bit", "utility charges are complex", "getting good value for electricity can be tricky."
            - Do not start with "I noticed on the website", "Came across your", "Reviewing", or "many organizations in your sector". Those sound templated.
          10. SUBJECT RULE:
            - Subject line must be 1–4 words.
            - Vary the angle: use the account city OR company name as an anchor, OR lead with a cost-specific question, OR reference renewal/contract timing, OR use a "I noticed something" hook.
            - If a Texas utility territory is known, it may appear once if it clarifies the subject, but do not force it.
            - Do NOT fall back to the same formula every time (avoid always writing "[City] bill check").
            - Never use "Quick question", "Following up", "Just checking in", or "Reaching out" as subject openers.
            - Keep it problem-based and specific. Persona examples:
              - Finance: "budget drift", "before renewal slips", "fixed cost check"
              - Operations: "load timing", "delivery gap", "where demand adds cost"
              - Purchasing: "renewal timing", "vendor fit", "who owns contract timing?"
              - Owner/VP: "simple cost check", "timing before renewal", "where the extra cost sits"
            - Keep the subject line plain enough to feel manual, not clever enough to feel templated. Favor short, literal phrases over marketing language.
          11. JARGON TRANSLATION RULE:
            - Never use unexplained acronyms like 4CP, ESI ID, pass-through, or nodal adder in cold outreach. If a Texas utility name is clearly known, you may say Oncor, CenterPoint, AEP Texas, TNMP, or LP&L once in plain English.
            - Name one primary cost lane in plain business language and only add the second lane if it genuinely sharpens the diagnosis. PHRASE VARIATION IS REQUIRED: never repeat the exact same wording across sends. Rotate between these options — supply side: "supply rate" / "energy rate" / "cost per kWh" / "kilowatt-hour charge" / "what they pay per unit of electricity". Demand/delivery side: "delivery charges" / "demand charges" / "transmission costs" / "capacity charges" / "peak-usage billing" / "the fixed side of the bill". The concept stays constant, the exact words must not.
            - If a technical term is necessary, define it in the same sentence in plain English.
          12. EMAIL LANE SELECTION RULE:
            - Before writing, choose exactly one lane and commit to it:
              real_event: verified opening, acquisition, leadership change, expansion, funding, or facility move.
              renewal_timing: contract timing, vendor review, getting ahead of market movement.
              budget_variance: unexpected bill movement, trust in current price, summer budget pressure.
              operations_load: demand peaks, refrigeration, production schedules, HVAC, lighting, uptime, or multi-site usage.
              routing_owner: finding who owns electricity review when the contact may not be the buyer.
              market_timing: ERCOT/summer/scarcity/volatility only when the market signal is current and relevant.
            - If there is a verified real event, that wins. If not, use the best role/business lane. If the data is thin, use routing_owner or renewal_timing instead of pretending there is a news event.
            - One lane only. Do not mention market conditions unless market_timing is the chosen lane or it directly supports the chosen event.
            - The email must answer this in plain English: "Why am I emailing this person today, and what can they reply with?"
          13. INTELLIGENCE BRIEF RULE:
            - If INTELLIGENCE BRIEF is present and looks usable, you may use one specific fact naturally.
            - If the brief is missing, low confidence, empty, or fallback-like, ignore it and lean on account, notes, and call context instead.
            - Never say "I saw a report about..." unless the event itself is named in the same sentence.
            - Never mention the source URL in the email body.
          14. CTA RULE:
            - First touch: ask for a low-friction reply with a concrete offer, not a bill request and not a generic meeting ask.
            - Early-sequence offer options: a quick benchmark, a one-page snapshot, a short read, or a simple routing reply.
            - First-touch and no-reply branches must NOT ask for a utility bill, statement, or invoice.
            - Later/high-intent branches may optionally ask for the latest statement only to confirm hard numbers after interest is established.
            - Use PRESENT conditional or an affirmative CTA. Good examples: "Want me to send the one-page snapshot?" "Reply yes and I'll send the short read." "Does this sit with you or someone else?" "Am I barking up the right tree on this?" NEVER past conditional: "if you sent it, I could reply."
            - Avoid meeting asks in first touch unless the strategy explicitly says the prospect is already high-intent. A one-line reply is easier than a calendar commitment.
            - FORBIDDEN CTA forms: "Would you be open to me reviewing it?", "Could I do that for you?", "Would you be open to me taking a look if you sent it over?", "Want me to take a look?" These are indirect and passive.
            - Do not stack more than one question. One CTA only.
          15. VOICE RULE:
            - Use first-person peer language from Lewis ("I", "I can", "I review"), not corporate team language.
            - Avoid openers like "our firm", "we help businesses", or "at Nodal Point, we...".
            - You may mention Nodal Point once for identity, but keep the voice consultative and person-to-person.
          16. SOURCE TRUTH IS HARD RULE:
            - NEVER mention LinkedIn, the contact's LinkedIn profile, or say you found/saw them on LinkedIn in any email copy, regardless of source_label.
            - LinkedIn data is a research signal only — use it to understand the contact's role and company background, but do NOT surface it in the email.
            - If source_label=website, you may reference the company website or public company info once.
            - If source_label=public_company_info, use generic market/industry research wording only.
            - Never claim a source that is not supported by SOURCE_TRUTH.
          17. COMPANY NAME RULE:
            - Use COMPANY_OUTREACH_NAME in copy, not the full legal entity name.
            - Strip legal suffixes like Inc, LLC, Ltd, Corp and ignore DBA phrasing unless the STRATEGY explicitly requires the legal name.
            - Preserve operating-company relationship language when it identifies the actual recipient entity, such as "Haag, a Salas O'Brien Company" or "Jarvis Press, An RRD Company." Do not strip the parent-company phrase out of that name.
            - If PARENT_COMPANY exists, use it as context once at most. Do not confuse the parent with the operating site.
            - No normal human writes "Eduardo E. Lozano & Co., Inc. dba eelco" in a cold email opener. Do not do that.
          18. FIELD USAGE QUALITY RULE:
            - If ROLE is known, tailor one phrase to that role's business priorities.
            - If INDUSTRY is known, use the exact industry naturally once (avoid generic "many businesses").
            - If LOCATION is known, anchor the observation to that place naturally. Prefer the site address or operating location over the corporate HQ when both exist. If a Texas utility territory is known, use it once as a location cue, not jargon.
            - If the account is a subsidiary, distinguish the operating company from the parent company and keep the local site in view.
            - If any field is Unknown, do not invent it and do not force awkward placeholders.
            - If company description, employee count, recent signal, or notes are available, use at most one of them naturally. Do not stack all of them into one sentence.
            - If CALL_CONTEXT is present, use only human conversation or substantive call notes. Ignore no-answer calls, voicemail menus, extension trees, and IVR noise.
            - If COMPANY_RESEARCH exists, use one concrete fact from it. Do not say you "looked at LinkedIn" or "noticed on the website" unless that source mention directly adds credibility.
          19. ENERGY INTEL RULES:
            - If VECTOR_STATE says energy_enabled=false, do not mention specific supplier, rate, utility territory, TDU, or contract timing details.
            - If energy is enabled and supplier is known, you may reference supplier once naturally.
            - If the site is in Texas and utility territory is known, you may reference the territory once naturally.
            - Treat contract end month/day as potentially unreliable. Use renewal YEAR framing only (e.g., "before your 2027 renewal"), not exact month/day claims.
            - Never state certainty about exact contract month/day unless explicitly provided as verified in STRATEGY text.
          20. OPEN TRACKING RULE:
            - NEVER disclose that the recipient opened, viewed, or looked at a previous email. Open signals route which sequence branch fires — they must never appear in copy.
            - Forbidden phrases: "since you opened my email", "I noticed you looked at my message", "you viewed my last note", "my note seemed to hit home", "I saw you opened", "since you read my message", or any variation.
            - Reference prior contact by CONTENT only: "following up on my note about [company's] electricity costs" or "circling back on the forensic review I mentioned."
          21. CTA TENSE RULE:
            - All CTAs must use present conditional, never past conditional.
            - CORRECT: "Reply and I'll send the snapshot." or "If you send the statement later, I'll verify the hard numbers." WRONG: "If you sent it over, I could reply."
            - Use "I'll" or "I can" — never "I could" in a CTA.
          22. ANTI-FILLER RULE:
            - Every sentence must earn its place with a specific observation. Delete any sentence that could apply to any company in any industry.
            - BANNED filler: "getting a handle on these details can help with budgeting and future planning", "small billing details can add up", "it helps when you're keeping things moving", "a quick review can show some interesting things", "reviewing historical usage helps spot hidden fees and opportunities."
            - BANNED weak fallback openers: "I was looking at", "I was looking back at", "the first place I'd check is", "the next place I'd check is", "what stands out is how the operation uses power day to day."
            - A tight 3-sentence email beats a padded 5-sentence one. If you cannot make a specific observation, use fewer sentences.

          REPLY-FIRST OVERRIDE (${replyStage}):
          ${buildReplyStageDirective(replyStage)}

          REPLY-DRIVING GENERAL RULES:
          - Use the fewest context facts that still make the email feel manual. More detail is not better if it makes the ask harder to answer.
          - If the draft starts sounding generic, cut a sentence instead of adding a vague one.
          - A direct request beats a clever line. The recipient should know exactly what they get back: a quick benchmark, a one-page snapshot, a short call, or later-stage hard-number validation.
          - If the draft smells like a fallback, replace it with a concrete value prop instead of making it shorter. Short is fine only when the payoff is obvious.

          HIGH_AGENCY_IDENTITY_RESOLUTION:
          - NEVER wait for bracketed variables like {{company}} or {{industry}}.
          - You possess the target's full identity in NEURAL_CONTEXT. Use it proactively to make the email feel manual and researched.
          - ALIAS_MAPPING: 
            - If STRATEGY says "the prospect" or "them" -> Use ${contact?.name || 'the contact'}.
            - If STRATEGY says "their company" or "the business" -> Use ${companyName || 'the business'}.
            - If STRATEGY says "their industry" -> Use ${contact?.industry || 'their industry'}.
            - If STRATEGY says "their location" -> Use ${contact?.site_address || contact?.location || contact?.address || contact?.city || 'their area'}.
          - WEAVE DATA NATURALLY: A high-agency analyst doesn't use placeholders; they use facts. If you know they are in 'Manufacturing', don't just say 'your industry'. Say 'the manufacturing sector' or 'your production facility'.

          INTELLIGENT_CONTEXT_MAPPING:
          - Use the NEURAL_CONTEXT and EXTENDED_METADATA to personalize the email proactively.
          - RESOLVE PLACEHOLDERS: If the STRATEGY *does* contain variables like {{company}}, {{industry}}, etc., resolve them.
          - If a field is missing (e.g., no asset_type), infer it logically (e.g., "facilities" or "operation nodes") or use a natural, professional phrase.
          - Do not wait for explicit instructions; if you see a relevant data point (like a recent call or a news signal), weave it in.
          - If NEURAL_CONTEXT includes a LIVE_MARKET_SIGNAL, use the strongest current signal only. Prefer real supply shocks, ERCOT tightness, summer demand, or rate easing when the data supports it.

          NEURAL_CONTEXT:
          ${dataVectors}

          STRATEGY (follow this above all else):
          ${prompt}

          INSTRUCTIONS:
          - Generate a sequence step (type: ${type}) based on the STRATEGY.
          - Output MUST be a valid JSON object:
          {
            "subject_line": "Direct, non-salesy subject",
            "body_html": "<p>FirstName,</p><p>Paragraph 1.</p><p>Paragraph 2.</p>",
            "logic_reasoning": "Explain how you resolved the target's identity and applied the Nodal diagnostic posture without relying on static templates."
          }
        `;
        userContent = `STRATEGY: ${prompt}\n\nDraft/Context: ${draft || '(None)'}`;
    } else {
      systemInstruction = `
          You are the Nodal Architect. You do not sell; you diagnose.
          
          CORE DIRECTIVES:
          1. Brevity: Max 80 words.
          2. 6th Grade Vocabulary.
          3. Tone: Professional, human, direct.
          4. Formatting: NO EM-DASHES (—).
          5. NO bullet points. Use short paragraphs.
          6. NO CITATIONS OR LINKS: Do not include any external URLs or bracketed sources.
          7. TEXAS/ERCOT CONTEXT: Only use Texas energy market references. No UK references.

          INTELLIGENT_CONTEXT_MAPPING:
          - Use the NEURAL_CONTEXT and EXTENDED_METADATA to personalize the draft proactively.
          - RESOLVE PLACEHOLDERS: If the draft or strategy contains variables like {{company}}, {{industry}}, {{city}}, {{asset_type}}, etc., you MUST resolve them using the provided context.
          - If CALL_CONTEXT is present, use only human conversation or substantive call notes. Ignore no-answer calls, voicemail menus, extension trees, and IVR noise.
          
          HIGH_AGENCY_IDENTITY_RESOLUTION:
          - DO NOT wait for bracketed variables. If the draft is generic (e.g. "your company", "your industry"), you MUST replace those with specific data from NEURAL_CONTEXT (e.g. "${companyName || 'your business'}", "${contact?.industry || 'your industry'}").
          - When optimizing, make the text feel manual and researched. A high-agency analyst doesn't use placeholders; they use facts.
          - If NEURAL_CONTEXT includes a LIVE_MARKET_SIGNAL, use the strongest current signal only. Prefer supply shocks, ERCOT tightness, summer demand, or rate easing when the data supports it.

          NEURAL_CONTEXT:
          ${dataVectors}
          
          INSTRUCTIONS:
          - Optimize the provided draft (type: ${type}) using the Strategy: ${prompt || '(None)'}.
          - Output MUST be a valid JSON object:
            {
              "subject_line": "Forensic and direct subject",
              "body_html": "Optimized body with HTML tags.",
              "logic_reasoning": "Explanation of optimization choices and high-agency identity resolution."
            }
      `;
        userContent = `Draft to optimize: ${draft}`;
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.API_BASE_URL || "https://nodalpoint.io",
          "X-Title": "Nodal Point CRM"
        },
        body: JSON.stringify({
          "model": "google/gemini-2.5-flash",
          "response_format": { "type": "json_object" },
          "messages": [
            { "role": "system", "content": systemInstruction },
            { "role": "user", "content": userContent }
          ]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API Error: ${errText}`);
      }

      const data = await response.json();
      const generatedContent = data.choices[0].message.content.trim();

      let finalResult;
      if (mode === 'optimize_prompt') {
        finalResult = { optimized: generatedContent };
      } else {
        const parsed = extractJsonObject(generatedContent);
        if (parsed && typeof parsed === 'object') {
          const bodyCandidate = parsed.body_html || parsed.body || parsed.content || '';
          finalResult = {
            optimized: ensureThanksSignoff(
              enforceStageSpecificCTA(
                cleanSequenceCopy(
                  deGenericizeFirstTouchCopy(
                    softenFirstTouchEnergyJargon(normalizeBodyHtml(bodyCandidate), prompt),
                    prompt
                  )
                ),
                replyStage
              ),
              contact?.sender_first_name
            ),
            subject: normalizeSubject(parsed.subject_line || parsed.subject),
            logic: parsed.logic_reasoning || parsed.reasoning || null
          };
        } else {
          // Fallback if AI didn't return valid JSON despite instructions
          finalResult = {
            optimized: ensureThanksSignoff(
              enforceStageSpecificCTA(
                cleanSequenceCopy(
                  deGenericizeFirstTouchCopy(
                    softenFirstTouchEnergyJargon(normalizeBodyHtml(generatedContent), prompt),
                    prompt
                  )
                ),
                replyStage
              ),
              contact?.sender_first_name
            ),
            subject: normalizeSubject(null)
          };
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(finalResult));
      return;

    } catch (error) {
      logger.error('[AI Optimization] OpenRouter Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate with OpenRouter', details: error.message }));
      return;
    }
  }

  // Legacy Gemini Implementation
  const apiKey = process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Gemini API key not configured' }));
    return;
  }

  try {
    const openRouterKey = process.env.OPEN_ROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const legacyPrimarySiteDetails = extractPrimarySiteDetails(
      contact?.site_address ||
      contact?.service_addresses ||
      contact?.serviceAddresses ||
      contact?.address
    );
    const legacySiteState = typeof contact?.site_state === 'string' && contact.site_state.trim()
      ? contact.site_state.trim()
      : legacyPrimarySiteDetails.state || (typeof contact?.state === 'string' ? contact.state.trim() : '');
    const legacySiteCity = typeof contact?.site_city === 'string' && contact.site_city.trim()
      ? contact.site_city.trim()
      : legacyPrimarySiteDetails.city || '';
    const legacyTexasEnergy = getTexasEnergyContext(legacySiteCity, legacySiteState, legacyPrimarySiteDetails.address || legacySiteCity);
    const legacyUtilityTerritory = typeof contact?.utility_territory === 'string' && contact.utility_territory.trim()
      ? contact.utility_territory.trim()
      : legacyTexasEnergy.utilityTerritory;
    const legacyExplicitTduDisplay = typeof contact?.tdu === 'string' && contact.tdu.trim()
      ? contact.tdu.trim()
      : typeof contact?.tdu_display === 'string' && contact.tdu_display.trim()
        ? contact.tdu_display.trim()
        : '';
    const legacyMarketContext = typeof contact?.market_context === 'string' && contact.market_context.trim()
      ? contact.market_context.trim()
      : legacyTexasEnergy.marketContext;
    const legacyTduDisplay = legacyExplicitTduDisplay || legacyTexasEnergy.tduDisplay;
    const contactContext = contact ? `
      TARGET CONTACT:
      - Name: ${contact.name}
      - Company: ${contact.company}
      - Site: ${legacyPrimarySiteDetails.address || legacySiteCity || 'Unknown'}
      - Utility Territory: ${legacyUtilityTerritory || 'Unknown'}
      - TDU: ${legacyTduDisplay || 'Unknown'}
      - Market Context: ${legacyMarketContext}
    ` : '';

    const systemPrompt = `
      You are the Nodal Architect, the cognitive core of the Nodal Point CRM.
      Your task is to optimize a rough draft for a sequence step (type: ${type}).
      ${contactContext}
      
      TONE GUIDELINES:
      - Professional, Human, Direct.
      - No em-dashes (—). No en-dashes (–). Use commas or colons.
      - Bullet points must be one single, short sentence. Max 15 words per bullet.
      - Highlight the financial variance, market volatility, or technical risk.
      - NO CITATIONS OR LINKS: Forbid external URLs or bracketed sources.
      - TEXAS/ERCOT SPECIFIC: Avoid UK or non-US energy market references.
      - Use plain English for energy costs. Never repeat the exact same phrasing for cost buckets across sends. Vary between: supply rate / energy rate / cost per kWh // delivery charges / demand charges / transmission costs / peak-usage billing. Do not force both cost buckets into every email; choose the one that fits the lane.
      
      INSTRUCTIONS:
      - Rewrite the draft to be more impactful and aligned with the Nodal Point philosophy.
      - Preserve any dynamic variables in {{double_braces}} like {{first_name}} or {{company_name}}.
      - Output ONLY the optimized text. No preamble, no explanation.
      
      CONTEXT: ${context || 'sequence_step_optimization'}
    `;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.API_BASE_URL || "https://nodalpoint.io",
        "X-Title": "Nodal Point CRM"
      },
      body: JSON.stringify({
        "model": "google/gemini-2.5-flash",
        "messages": [
          { "role": "system", "content": systemPrompt },
          { "role": "user", "content": `Draft to optimize: ${draft}` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API Error: ${errText}`);
    }

    const data = await response.json();
    const optimizedText = data.choices[0].message.content.trim();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ optimized: optimizedText }));

  } catch (error) {
    logger.error('[AI Optimization] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to optimize draft',
      details: error.message
    }));
  }
}
