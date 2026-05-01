import { cors } from '../_cors.js';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import logger from '../_logger.js';
import { generateForensicSignature } from '@/lib/signature';
import { buildForensicNoteEntries, formatForensicNoteClipboard } from '@/lib/forensic-notes';
import { buildUsableCallContextEntries, buildUsableCallContextBlock } from '@/lib/call-context';
import { getTexasEnergyContext, normalizeCityKey } from '@/lib/texas-territory';
import { buildSequenceTemplateVariables, renderSequenceTemplate } from '@/lib/sequence-template';
import { getBurnerFromEmail } from '@/lib/burner-email';
import { buildIntelligenceBriefContext } from '@/lib/intelligence-brief-context';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildSourceTruthLine(linkedInUrl, website) {
  if (linkedInUrl) return 'SOURCE_TRUTH: LinkedIn is available as a research signal only. Do NOT mention LinkedIn, profiles, or how you found them in the email copy.';
  if (website) return 'SOURCE_TRUTH: LinkedIn not available. Do NOT mention LinkedIn. You may reference company website/public company info.';
  return 'SOURCE_TRUTH: LinkedIn and website not available. Do NOT mention LinkedIn or website; use generic public company research wording.';
}

function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
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

function formatMwh(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return `$${num.toFixed(2)}/MWh`;
}

function summarizeTelemetry(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const latest = rows[0] || {};
  const previous = rows[1] || {};
  const hubAvg = Number(latest?.prices?.hub_avg);
  const prevHubAvg = Number(previous?.prices?.hub_avg);
  const reserves = Number(latest?.grid?.reserves);
  const scarcityProb = latest?.grid?.scarcity_prob ?? 'unknown';
  const trend = Number.isFinite(hubAvg) && Number.isFinite(prevHubAvg)
    ? hubAvg > prevHubAvg
      ? `rates up versus prior snapshot (${formatMwh(prevHubAvg)})`
      : hubAvg < prevHubAvg
        ? `rates easing versus prior snapshot (${formatMwh(prevHubAvg)})`
        : `flat versus prior snapshot (${formatMwh(prevHubAvg)})`
    : '';

  const parts = [
    'ERCOT snapshot:',
    Number.isFinite(hubAvg) ? `hub avg ${formatMwh(hubAvg)}` : null,
    Number.isFinite(reserves) ? `reserves ${reserves.toLocaleString()} MW` : null,
    `scarcity probability ${scarcityProb}`,
    trend || null
  ].filter(Boolean);

  return parts.join(', ');
}

async function buildLiveSignalContext(account, accountDomain) {
  const segments = [];
  const normalizedDomain = normalizeDomain(accountDomain || account?.website || account?.domain || '');

  if (normalizedDomain && !normalizedDomain.endsWith('nodalpoint.io')) {
    try {
      const { data: companyNews } = await supabase
        .from('apollo_news_articles')
        .select('title, snippet, published_at')
        .eq('domain', normalizedDomain)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(3);

      const companySignal = (companyNews || [])
        .map((item) => normalizeLiveSignalText([item?.title, item?.snippet]))
        .filter(Boolean)
        .join(' | ');

      if (companySignal) {
        segments.push(`Company news: ${companySignal}`);
      }
    } catch (error) {
      logger.warn('[Sequence Review] Company news lookup failed:', error.message);
    }
  }

  try {
    const { data: cacheRow } = await supabase
      .from('ai_cache')
      .select('insights')
      .eq('key', 'energy-news')
      .maybeSingle();

    const energyItems = Array.isArray(asObject(cacheRow?.insights)?.items) ? asObject(cacheRow?.insights).items : [];
    const energySignal = (energyItems || [])
      .slice(0, 4)
      .map((item) => normalizeLiveSignalText([item?.title, item?.snippet]))
      .filter(Boolean)
      .join(' | ');

    if (energySignal) {
      segments.push(`Market news: ${energySignal}`);
    }
  } catch (error) {
    logger.warn('[Sequence Review] Energy news lookup failed:', error.message);
  }

  try {
    const { data: telemetryRows } = await supabase
      .from('market_telemetry')
      .select('timestamp, prices, grid')
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(2);

    const telemetrySignal = summarizeTelemetry(telemetryRows || []);
    if (telemetrySignal) {
      segments.push(telemetrySignal);
    }
  } catch (error) {
    logger.warn('[Sequence Review] Market telemetry lookup failed:', error.message);
  }

  return segments.join('\n');
}

function detectReplyStage(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/(pattern[-\s]?interrupt|no[-\s]?reply|breakup|ghost)/.test(text)) return 'no_reply';
  if (/(first[-\s]?touch|forensic opener|day\s*0|day\s*1|intro)/.test(text)) return 'first_touch';
  if (/(follow[-\s]?up|opened|clicked|day\s*3|day\s*7|day\s*14)/.test(text)) return 'follow_up';
  return 'general';
}

function normalizeStringList(value) {
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

function extractPrimarySiteDetails(account) {
  const direct = typeof account?.address === 'string' ? account.address.trim() : '';
  const city = typeof account?.city === 'string' ? account.city.trim() : '';
  const state = typeof account?.state === 'string' ? account.state.trim() : '';
  const serviceAddresses = Array.isArray(account?.service_addresses) ? account.service_addresses : [];

  if (serviceAddresses.length > 0) {
    const candidates = [];
    for (const item of serviceAddresses) {
      if (typeof item === 'string' && item.trim()) {
        candidates.push({ address: item.trim(), city: '', state: '', isPrimary: false });
        continue;
      }
      if (item && typeof item === 'object') {
        const normalized = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
        const serviceAddress = typeof item.address === 'string' ? item.address.trim() : '';
        const serviceCity = typeof item.city === 'string' ? item.city.trim() : '';
        const serviceState = typeof item.state === 'string' ? item.state.trim() : '';
        const flagText = [normalized.type, normalized.label, normalized.name, normalized.kind]
          .filter((part) => typeof part === 'string')
          .join(' ')
          .toLowerCase();
        const isPrimary = [normalized.isPrimary, normalized.primary, normalized.is_primary, normalized.preferred, normalized.default]
          .some((flag) => flag === true || flag === 'true' || flag === 1 || flag === '1')
          || /\b(primary|headquarters|head office|hq|main|billing)\b/.test(flagText);
        candidates.push({
          address: serviceAddress || [serviceCity, serviceState].filter(Boolean).join(', '),
          city: serviceCity,
          state: serviceState,
          isPrimary,
        });
      }
    }

    if (candidates.length > 0) {
      return candidates.find((candidate) => candidate.isPrimary) || candidates[0];
    }
  }

  return {
    address: direct || [city, state].filter(Boolean).join(', '),
    city,
    state,
  };
}

function extractPrimarySiteAddress(account) {
  return extractPrimarySiteDetails(account).address;
}

function extractHierarchyIds(metadata) {
  const safeMeta = asObject(metadata);
  const relationships = asObject(safeMeta.relationships);
  const parentAccountId = typeof relationships.parentAccountId === 'string' && relationships.parentAccountId.trim()
    ? relationships.parentAccountId.trim()
    : typeof safeMeta.parentAccountId === 'string' && safeMeta.parentAccountId.trim()
      ? safeMeta.parentAccountId.trim()
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

function isLikelyUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function buildReplyFirstDirective(stage) {
  const map = {
    first_touch: [
      'REPLY-FIRST NOTE: Keep the body at 50-80 words in 2 short paragraphs.',
      'Pick exactly one reply lane: real event, renewal/timing, budget variance, operations/load, routing/owner, or market timing. Do not blend lanes.',
      'Lane selection by role: controller/CFO/accounting = budget variance, trust in current price, renewal timing, or budget surprise; facilities/operations/real estate/warehouse/logistics/manufacturing = load timing, demand peaks, uptime, or site usage; purchasing/contracts/procurement = renewal timing, vendor fit, or contract cleanup; owner/GM = leverage, timing, or simple cost check; school/church/nonprofit/healthcare = stewardship, comfort, reliability, or predictability.',
      'Do not choose delivery charges or demand charges unless the company has a physical site, usage pattern, TDU context, or industry profile that makes that angle believable. For small offices, professional services, schools, clinics, and light retail, use budget predictability, renewal timing, cooling, comfort, or who owns the review.',
      'Use one concrete research fact from the company description, website, public news, or LinkedIn headline/about when available. LinkedIn is a research signal only and must never be mentioned in the email.',
      'Use one concrete company, event, role, city, or location fact and make the payoff explicit without asking for a bill: a one-page snapshot, short read, simple yes/no reply, or routing reply.',
      'First-touch tone should be direct but calm. Prefer a low-friction CTA like "Want me to send the one-page snapshot?", "Reply yes and I\'ll send the short read.", "Does this sit with you or someone else?", or "Am I barking up the right tree on this?" Never ask for a bill in first touch.',
      'If the account is a subsidiary, use the operating company name and mention the parent only once if it helps orientation. If the account is outside Texas, position Nodal Point as helping nationwide accounts in deregulated markets, not Texas-only.',
      'If the site is in Texas and a single TDU is clearly known, use the plain name once naturally: Oncor, CenterPoint, AEP Texas, TNMP, or LP&L. If the city is mixed or ambiguous, do not force a utility name.',
      'Subject line: 1-4 words, plain, specific, and value-led. Finance examples: budget drift, fixed cost check. Ops examples: load timing, delivery gap. Purchasing examples: renewal timing, vendor fit. Owner examples: simple cost check, timing before renewal.',
      'Never mention LinkedIn, profiles, or how you found them.'
    ].join('\n'),
    follow_up: [
      'REPLY-FIRST NOTE: Keep the body at 45-75 words.',
      'Add one new fact or angle. Reference prior contact by topic only, never opens or clicks. Do not repeat the same lane from the prior note if the prompt gives a new signal.',
      'Reinforce one concrete output that does not require document sharing yet: a one-page snapshot, a short read, a short call, or a routing reply.',
      'Follow-up tone should be more diagnostic and a little more direct than first touch. Prefer one direct CTA only, and do not ask for a bill unless this is clearly a later, high-intent step.',
      'If the account is a subsidiary, keep the operating company and parent company separate. Anchor the note to the site or local location, not the corporate HQ unless that is the actual site.',
      'If the site is in Texas and a single TDU is clearly known, use the plain name once naturally. Keep it as a location cue, not jargon.',
      'Subject line: 1-4 words, specific and plain. Slightly more diagnostic than Day 1. Examples: rate vs delivery, demand adds cost, timing check.'
    ].join('\n'),
    no_reply: [
      'REPLY-FIRST NOTE: Keep the body at 30-50 words and max 2 sentences.',
      'Assume you already reached the right person. Do not ask who owns electricity review.',
      'Sentence 1 should state the value in plain English and name one likely leak area.',
      'Sentence 2 should use a tiny reply ask: a routing reply, a yes/no, or permission to send a short read.',
      'No-reply tone should be sharper and cleaner than prior touches. Do not be soft here.',
      'Never ask for a bill, statement, or invoice in this branch.',
      'If the account is outside Texas, keep the market framing broad enough for a deregulated market and do not imply Texas-only coverage.',
      'If the site is in Texas and a single TDU is clearly known, use the plain name once naturally, but keep the message short.',
      'Subject line: 1-4 words, direct and sharp. Make it the cleanest in the sequence. Examples: short read, quick yes/no, close the loop.'
    ].join('\n'),
    general: [
      'REPLY-FIRST NOTE: Use the shortest draft that still gives one real observation and a concrete reason to reply.',
      'Make the value explicit: the recipient should know exactly what you will tell them back and why it matters.',
      'One CTA only. Early stages use low-friction asks. Later/high-intent stages may optionally ask for a bill only to confirm hard numbers.',
      'As the sequence progresses, the tone should move from thoughtful, to diagnostic, to direct, to clean closure.',
      'Do not confuse a parent company with the operating company. If there is a subsidiary relationship, keep the local site and operating entity in view.',
      'Subject line: 1-4 words, but vary it by title and stage. Do not keep reusing the same cost-view phrasing.'
    ].join('\n')
  };

  return map[stage] || map.general;
}

function senderDomainFromEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw.includes('@')) return 'nodalpoint.io';
  const domain = raw.split('@')[1] || 'nodalpoint.io';
  return domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'nodalpoint.io';
}

function appendPreviewUnsubscribeFooter(html, email) {
  const content = String(html || '');
  const recipient = String(email || '').trim();
  if (!content || !recipient) return content;
  if (content.includes('data-nodal-unsubscribe-footer="1"') || content.includes('Unsubscribe or manage preferences')) {
    return content;
  }
  const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nodalpoint.io').replace(/\/+$/, '');
  const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipient)}`;
  const footer =
    `<div data-nodal-unsubscribe-footer="1" style="margin-top:32px;padding-top:16px;border-top:1px solid #3f3f46;font-family:sans-serif;font-size:11px;color:#71717a;text-align:center;line-height:1.6;">` +
    `<p style="margin:0 0 4px 0;">Nodal Point &middot; Energy Intelligence &middot; Fort Worth, TX</p>` +
    `<p style="margin:0;">You received this because we identified a potential opportunity for your energy portfolio. ` +
    `<a href="${unsubscribeUrl}" style="color:#71717a;text-decoration:underline;">Unsubscribe or manage preferences</a></p>` +
    `</div>`;
  return `${content}${footer}`;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { executionId, emailId, action } = req.body || {};
  const normalizedAction = String(action || '').toLowerCase().trim();

  if (!executionId || !['generate', 'regenerate', 'accept'].includes(normalizedAction)) {
    res.status(400).json({ error: 'executionId and valid action are required' });
    return;
  }

  try {
    const { data: execution, error: executionError } = await supabase
      .from('sequence_executions')
      .select('id, sequence_id, member_id, step_type, status, metadata, scheduled_at')
      .eq('id', executionId)
      .single();

    if (executionError || !execution) {
      res.status(404).json({ error: 'Sequence execution not found' });
      return;
    }

    const executionMeta = asObject(execution.metadata);
    const effectiveType = execution.step_type === 'protocolNode'
      ? String(executionMeta.type || '').toLowerCase()
      : String(execution.step_type || '').toLowerCase();

    if (effectiveType !== 'email') {
      res.status(400).json({ error: 'Only email executions support review actions' });
      return;
    }

    if (normalizedAction === 'accept') {
      const nowIso = new Date().toISOString();
      const scheduledAt = execution.scheduled_at && new Date(execution.scheduled_at).getTime() > Date.now()
        ? execution.scheduled_at
        : nowIso;
      const acceptedPatch = {
        reviewAccepted: true,
        reviewAcceptedAt: nowIso,
      };

      const nextExecutionMeta = { ...executionMeta, ...acceptedPatch };
      const { error: updateExecutionError } = await supabase
        .from('sequence_executions')
        .update({
          metadata: nextExecutionMeta,
          status: 'queued',
          scheduled_at: scheduledAt,
          updated_at: nowIso
        })
        .eq('id', execution.id);

      if (updateExecutionError) throw updateExecutionError;

      const targetEmailId = emailId || `seq_exec_${execution.id}`;
      const { data: existingScheduledEmail } = await supabase
        .from('emails')
        .select('id, metadata')
        .eq('id', targetEmailId)
        .maybeSingle();

      const mergedEmailMeta = {
        ...asObject(existingScheduledEmail?.metadata),
        reviewAccepted: true,
        reviewAcceptedAt: acceptedPatch.reviewAcceptedAt,
      };

      const { error: emailAcceptError } = await supabase
        .from('emails')
        .update({
          status: 'queued',
          scheduledSendTime: scheduledAt,
          timestamp: scheduledAt,
          metadata: mergedEmailMeta,
          updatedAt: nowIso
        })
        .eq('id', targetEmailId);
      if (emailAcceptError) {
        logger.warn('[Sequence Review] Accept metadata patch warning:', emailAcceptError.message);
      }

      res.status(200).json({ success: true, action: normalizedAction });
      return;
    }

    const { data: memberData, error: memberError } = await supabase
      .from('sequence_members')
      .select('id, "targetId", "sequenceId"')
      .eq('id', execution.member_id)
      .single();

    if (memberError || !memberData?.targetId) {
      res.status(404).json({ error: 'Member/contact context not found' });
      return;
    }

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, email, notes, "firstName", "lastName", title, city, state, "linkedinUrl", "accountId"')
      .eq('id', memberData.targetId)
      .maybeSingle();

    if (contactError || !contact) {
      res.status(404).json({ error: 'Contact context not found' });
      return;
    }
    let account = null;
    if (contact.accountId) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('name, domain, website, linkedin_url, industry, description, employees, revenue, annual_usage, load_factor, city, state, electricity_supplier, current_rate, contract_end_date, address, service_addresses, metadata, intelligence_brief_headline, intelligence_brief_detail, intelligence_brief_talk_track, intelligence_brief_signal_date, intelligence_brief_reported_at, intelligence_brief_confidence_level, intelligence_brief_status')
        .eq('id', contact.accountId)
        .maybeSingle();
      account = acc || null;
    }

    const hierarchyIds = extractHierarchyIds(account?.metadata);
    const relatedIds = [hierarchyIds.parentAccountId, ...(hierarchyIds.subsidiaryAccountIds || [])].filter(isLikelyUuid);
    const { data: relatedAccounts } = relatedIds.length
      ? await supabase
        .from('accounts')
        .select('id, name')
        .in('id', relatedIds)
      : { data: [] };
    const relatedAccountMap = new Map((relatedAccounts || []).map((row) => [row.id, row.name]));
    const parentCompanyName = hierarchyIds.parentAccountId ? relatedAccountMap.get(hierarchyIds.parentAccountId) || null : null;
    const subsidiaryCompanyNames = (hierarchyIds.subsidiaryAccountIds || [])
      .map((id) => relatedAccountMap.get(id))
      .filter(Boolean);
    const organizationRole = hierarchyIds.parentAccountId
      ? 'subsidiary'
      : hierarchyIds.subsidiaryAccountIds.length > 0
        ? 'parent'
        : 'standalone';
    const accountCity = account?.city ? account.city.trim() : null;
    const accountState = account?.state ? account.state.trim() : null;
    const contactCity = contact.city ? contact.city.trim() : null;
    const contactState = contact.state ? contact.state.trim() : null;
    const primarySite = extractPrimarySiteDetails(account);
    const primarySiteAddress = primarySite.address;
    const siteCity = typeof primarySite.city === 'string' && primarySite.city.trim()
      ? primarySite.city.trim()
      : accountCity || contactCity || '';
    const siteState = typeof primarySite.state === 'string' && primarySite.state.trim()
      ? primarySite.state.trim()
      : accountState || contactState || '';
    const texasEnergy = getTexasEnergyContext(siteCity, siteState, primarySite.address || siteCity);
    const utilityTerritory = typeof account?.utility_territory === 'string' && account.utility_territory.trim()
      ? account.utility_territory.trim()
      : texasEnergy.utilityTerritory;
    const marketContext = typeof account?.market_context === 'string' && account.market_context.trim()
      ? account.market_context.trim()
      : texasEnergy.marketContext;
    const hierarchySummary = [
      `Operating company: ${account?.name || 'Unknown'}`,
      `Parent company: ${parentCompanyName || hierarchyIds.parentAccountId || 'none'}`,
      `Subsidiaries: ${subsidiaryCompanyNames.length ? subsidiaryCompanyNames.join('; ') : hierarchyIds.subsidiaryAccountIds.length ? `${hierarchyIds.subsidiaryAccountIds.length} linked account(s)` : 'none'}`,
      `Role: ${organizationRole}`
    ].join(' | ');

    const { data: rawCalls } = await supabase
      .from('calls')
      .select('id, transcript, summary, aiInsights, timestamp, direction, status, duration, "contactId", "accountId"')
      .or(contact.accountId
        ? `contactId.eq.${contact.id},accountId.eq.${contact.accountId}`
        : `contactId.eq.${contact.id}`)
      .order('timestamp', { ascending: false })
      .limit(6);
    const usableCalls = buildUsableCallContextEntries(rawCalls || [], 4);
    const usableCallContext = buildUsableCallContextBlock(rawCalls || [], 4);

    const noteEntries = buildForensicNoteEntries([
      {
        label: `CONTACT NOTE • ${[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'UNKNOWN CONTACT'}`,
        notes: contact.notes || null,
      },
      {
        label: `ACCOUNT NOTE • ${account?.name || 'UNKNOWN ACCOUNT'}`,
        notes: account?.description || null,
      },
    ]);
    const noteContext = noteEntries.length > 0 ? formatForensicNoteClipboard(noteEntries) : '';
    const briefContext = buildIntelligenceBriefContext({
      intelligenceBriefHeadline: account?.intelligence_brief_headline || null,
      intelligenceBriefDetail: account?.intelligence_brief_detail || null,
      intelligenceBriefTalkTrack: account?.intelligence_brief_talk_track || null,
      intelligenceBriefSignalDate: account?.intelligence_brief_signal_date || null,
      intelligenceBriefReportedAt: account?.intelligence_brief_reported_at || null,
      intelligenceBriefConfidenceLevel: account?.intelligence_brief_confidence_level || null,
      intelligenceBriefStatus: account?.intelligence_brief_status || null,
    });

    const { data: sequence } = await supabase
      .from('sequences')
      .select('id, bgvector, metadata, "ownerId"')
      .eq('id', execution.sequence_id)
      .maybeSingle();

    const sequenceSender = sequence?.bgvector?.settings?.senderEmail || sequence?.metadata?.sender_email || null;
    const preferredFrom = String(sequenceSender || '').trim();
    const fromEmail = getBurnerFromEmail(preferredFrom || String(executionMeta.from || '').trim() || 'l.patterson@nodalpoint.io');
    const senderDomain = senderDomainFromEmail(fromEmail);

    let senderFirstName = null;
    if (sequence?.ownerId) {
      const { data: ownerUser } = await supabase
        .from('users')
        .select('first_name')
        .or(`id.eq.${sequence.ownerId},email.eq.${sequence.ownerId}`)
        .maybeSingle();
      senderFirstName = ownerUser?.first_name || null;
    }

    const linkedInUrl = contact.linkedinUrl || account?.linkedin_url || null;
    const accountDomain = account?.domain || null;
    const website = account?.website || (accountDomain ? `https://${accountDomain}` : null);
    // Prefer the actual site over HQ/contact city when available.
    const location = primarySiteAddress
      ? primarySiteAddress
      : siteCity
      ? `${siteCity}${siteState ? `, ${siteState}` : ''}`
      : accountCity
      ? `${accountCity}${accountState ? `, ${accountState}` : ''}`
      : contactCity
      ? `${contactCity}${contactState ? `, ${contactState}` : ''}`
      : null;
    const sourceTruthLine = buildSourceTruthLine(linkedInUrl, website);
    const replyStage = detectReplyStage(executionMeta?.prompt || '');
    const researchFacts = [
      account?.description ? `Company summary: ${account.description}` : null,
      account?.industry ? `Industry: ${account.industry}` : null,
      account?.employees ? `Scale: ${account.employees} employees` : null,
      account?.revenue ? `Revenue: ${account.revenue}` : null,
      primarySiteAddress ? `Site address: ${primarySiteAddress}` : null,
      siteCity ? `Site city: ${siteCity}` : null,
      (accountCity || accountState) ? `HQ: ${[accountCity, accountState].filter(Boolean).join(', ')}` : null,
      account?.website || accountDomain ? `Website: ${account.website || accountDomain}` : null,
      account?.linkedin_url ? 'LinkedIn: available' : null,
      siteState ? `Site state: ${siteState}` : null,
      utilityTerritory ? `Utility territory: ${utilityTerritory}` : null,
      texasEnergy.tduDisplay ? `TDU: ${texasEnergy.tduDisplay}` : null,
      texasEnergy.tduCandidates.length ? `TDU candidates: ${texasEnergy.tduCandidates.join('; ')}` : null,
      contact.title ? `Contact title: ${contact.title}` : null,
      contact.city || contact.state ? `Contact location: ${[contact.city, contact.state].filter(Boolean).join(', ')}` : null,
      marketContext ? `Market context: ${marketContext}` : null,
      parentCompanyName ? `Parent company: ${parentCompanyName}` : null,
      subsidiaryCompanyNames.length ? `Subsidiaries: ${subsidiaryCompanyNames.join('; ')}` : null,
      `Organization role: ${organizationRole}`,
      `Hierarchy summary: ${hierarchySummary}`,
      noteContext ? `Dossier notes:\n${noteContext}` : null,
      briefContext ? `Intelligence brief:\n${briefContext}` : null,
      usableCallContext ? `Transmission log:\n${usableCallContext}` : null,
      contact.notes ? `Contact notes: ${contact.notes.slice(0, 250)}` : null
    ].filter(Boolean).join('\n');

    const targetEmailId = String(emailId || executionMeta.emailRecordId || `seq_exec_${execution.id}`);
    const defaultSubject = String(
      executionMeta.subject || executionMeta.aiSubject || executionMeta.label || 'Message from Nodal Point'
    ).trim();
    const wantsLiveSignals = Array.isArray(executionMeta.vectors)
      && executionMeta.vectors.some((value) => ['recent_news', 'market_signal', 'market_news', 'live_news'].includes(String(value)));
    const liveSignalContext = wantsLiveSignals
      ? await buildLiveSignalContext(account, accountDomain)
      : '';

    // Calculate contract end year (mirrors edge function logic)
    const contractEndYear = account?.contract_end_date
      ? new Date(account.contract_end_date).getUTCFullYear()
      : null;

    const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
    const host = req.headers.host;
    const optimizeUrl = `${protocol}://${host}/api/ai/optimize`;

    const optimizeRes = await fetch(optimizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${executionMeta?.prompt || 'Draft a personalized follow-up'}\n\n${buildReplyFirstDirective(replyStage)}\n\n${sourceTruthLine}`,
        provider: 'openrouter',
        type: 'email',
        vectors: Array.isArray(executionMeta?.vectors) ? executionMeta.vectors : [],
        mode: 'generate_email',
        sequenceStage: replyStage,
        contact: {
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email,
          company: account?.name || null,
          website: account?.website || accountDomain || null,
          linkedin_url: account?.linkedin_url || linkedInUrl || null,
          company_description: account?.description || null,
          employees: account?.employees ?? null,
          revenue: account?.revenue ?? null,
          annual_usage: account?.annual_usage ?? null,
          load_factor: account?.load_factor ?? null,
          research_summary: researchFacts || null,
          title: contact.title || null,
          industry: account?.industry || null,
          electricity_supplier: account?.electricity_supplier || null,
          current_rate: account?.current_rate || null,
          contract_end_date: account?.contract_end_date || null,
          contract_end_year: Number.isFinite(contractEndYear) ? contractEndYear : null,
          city: accountCity || contactCity || null,
          state: accountState || contactState || null,
          location,
          address: account?.address || null,
          service_addresses: account?.service_addresses || null,
          site_address: primarySiteAddress || null,
          site_state: siteState || null,
          site_city: siteCity || null,
          tdu: texasEnergy.tduDisplay || null,
          tdu_candidates: texasEnergy.tduCandidates || [],
          market_context: marketContext,
          utility_territory: utilityTerritory || null,
          parent_company: parentCompanyName,
          parent_company_id: hierarchyIds.parentAccountId,
          subsidiary_companies: subsidiaryCompanyNames,
          subsidiary_count: subsidiaryCompanyNames.length,
          organization_role: organizationRole,
          hierarchy_summary: hierarchySummary,
          linkedin_url: linkedInUrl,
          domain: accountDomain,
          website,
          has_linkedin: !!linkedInUrl,
          has_website: !!website,
          source_label: linkedInUrl ? 'linkedin' : (website ? 'website' : 'public_company_info'),
          sender_email: fromEmail,
          sender_domain: senderDomain,
          sender_first_name: senderFirstName,
          news: liveSignalContext || null,
          market_news: liveSignalContext || null,
          market_signal: liveSignalContext || null,
          liveSignals: liveSignalContext || null,
          call_context: usableCallContext || null,
          transcript: usableCalls[0]?.transcriptSnippet || null,
          notes: noteContext || null,
          intelligence_brief_headline: account?.intelligence_brief_headline || null,
          intelligence_brief_detail: account?.intelligence_brief_detail || null,
          intelligence_brief_talk_track: account?.intelligence_brief_talk_track || null,
          intelligence_brief_signal_date: account?.intelligence_brief_signal_date || null,
          intelligence_brief_reported_at: account?.intelligence_brief_reported_at || null,
          intelligence_brief_confidence_level: account?.intelligence_brief_confidence_level || null,
          intelligence_brief_status: account?.intelligence_brief_status || null
        }
      })
    });

    if (!optimizeRes.ok) {
      const optimizeText = await optimizeRes.text();
      throw new Error(`AI generation failed: ${optimizeText}`);
    }

    const optimizeData = await optimizeRes.json();
    const generatedBody = String(
      optimizeData.optimized || optimizeData.optimizedContent || optimizeData.content || ''
    ).trim();
    const generatedSubject = String(
      optimizeData.subject || defaultSubject
    ).trim();

    if (!generatedBody) {
      throw new Error('AI generation returned empty body');
    }

    const templateVariables = buildSequenceTemplateVariables({
      contact: {
        id: contact.id || null,
        firstName: contact.firstName || null,
        lastName: contact.lastName || null,
        name: contact.name || null,
        email: contact.email || null,
        title: contact.title || null,
        phone: contact.phone || null,
        mobile: contact.mobile || null,
        workDirectPhone: contact.workDirectPhone || null,
        otherPhone: contact.otherPhone || null,
        companyPhone: contact.companyPhone || null,
        city: contactCity || null,
        state: contactState || null,
        location,
        address: contact.address || null,
        linkedinUrl: linkedInUrl || null,
        website: website || null,
        notes: contact.notes || null,
        listName: contact.listName || null,
        companyName: account?.name || null,
        industry: account?.industry || null,
        electricitySupplier: account?.electricity_supplier || null,
        annualUsage: account?.annual_usage || null,
        currentRate: account?.current_rate || null,
        contractEnd: account?.contract_end_date || null,
        accountDescription: account?.description || null,
        metadata: contact.metadata || null
      },
      account: {
        name: account?.name || null,
        industry: account?.industry || null,
        domain: accountDomain || null,
        description: account?.description || null,
        companyPhone: account?.phone || null,
        contractEnd: account?.contract_end_date || null,
        location,
        city: accountCity || null,
        state: accountState || null,
        address: primarySiteAddress || account?.address || null,
        linkedinUrl: linkedInUrl || null,
        annualUsage: account?.annual_usage || null,
        electricitySupplier: account?.electricity_supplier || null,
        currentRate: account?.current_rate || null,
        revenue: account?.revenue || null,
        employees: account?.employees || null
      },
      site: {
        city: siteCity || accountCity || null,
        state: siteState || accountState || null,
        address: primarySiteAddress || account?.address || null,
        utilityTerritory: utilityTerritory || null,
        tdu: texasEnergy.tduDisplay || null,
        marketContext: marketContext || null
      }
    });

    const renderedBody = renderSequenceTemplate(generatedBody, templateVariables);
    const renderedSubject = renderSequenceTemplate(generatedSubject, templateVariables);

    if (/\{\{\s*[^}]+\s*\}\}/.test(renderedBody) || /\{\{\s*[^}]+\s*\}\}/.test(renderedSubject)) {
      throw new Error('Sequence template still contains unresolved variables after rendering');
    }

    let finalBody = renderedBody;

    if (!finalBody.includes('NODAL_FORENSIC_SIGNATURE') && !finalBody.includes('nodal-signature')) {
      const lookupEmail = fromEmail.endsWith('@getnodalpoint.com')
        ? fromEmail.replace('@getnodalpoint.com', '@nodalpoint.io')
        : fromEmail;
      const { data: userData } = await supabase
        .from('users')
        .select('first_name, last_name, job_title, hosted_photo_url')
        .eq('email', lookupEmail)
        .maybeSingle();

      const profile = userData
        ? {
          firstName: userData.first_name,
          lastName: userData.last_name,
          jobTitle: userData.job_title,
          hostedPhotoUrl: userData.hosted_photo_url,
          email: fromEmail
        }
        : {
          firstName: 'Lewis',
          lastName: 'Patterson',
          jobTitle: null,
          email: fromEmail
        };
      const signature = generateForensicSignature(profile, { senderEmail: fromEmail, websiteDomain: senderDomain });
      finalBody = `${finalBody}${signature}`;
    }

    finalBody = appendPreviewUnsubscribeFooter(finalBody, contact.email);

    const nowIso = new Date().toISOString();

    const nextExecutionMeta = {
      ...executionMeta,
      body: finalBody,
      subject: renderedSubject,
      from: fromEmail,
      senderEmail: fromEmail,
      senderDomain,
      previewGeneratedAt: nowIso,
      reviewAccepted: false,
      emailRecordId: executionMeta.emailRecordId || `seq_exec_${execution.id}`,
    };

    const { error: saveExecutionError } = await supabase
      .from('sequence_executions')
      .update({
        metadata: nextExecutionMeta,
        status: 'pending_send',
        updated_at: nowIso
      })
      .eq('id', execution.id);

    if (saveExecutionError) throw saveExecutionError;

    const { data: existingEmail } = await supabase
      .from('emails')
      .select('id, metadata, "from"')
      .eq('id', targetEmailId)
      .maybeSingle();

    const nextEmailMeta = {
      ...asObject(existingEmail?.metadata),
      source: 'sequence',
      sequenceExecutionId: execution.id,
      sequenceId: execution.sequence_id,
      memberId: execution.member_id,
      reviewAccepted: false,
      previewGeneratedAt: nowIso,
      emailRecordId: targetEmailId,
      status: 'pending_send',
      sentAt: null,
      aiPrompt: String(executionMeta?.prompt || '').trim() || null,
      generatedBody: renderedBody,
      generatedSubject: renderedSubject
    };
    // Always use the sequence-configured fromEmail (from bgvector.settings.senderEmail).
    // Keep the ownership metadata, but do not let an older placeholder `from` win here.
    const preservedOwner = typeof nextEmailMeta.ownerId === 'string' ? nextEmailMeta.ownerId : null;

    const baseEmailPayload = {
      id: targetEmailId,
      contactId: contact.id || null,
      accountId: contact.accountId || null,
      from: fromEmail,
      to: contact.email ? [contact.email] : [],
      subject: renderedSubject,
      html: finalBody,
      text: finalBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      aiPrompt: String(executionMeta?.prompt || '').trim() || null,
      status: 'pending_send',
      type: 'scheduled',
      is_read: true,
      scheduledSendTime: execution.scheduled_at,
      timestamp: execution.scheduled_at,
      sentAt: null,
      updatedAt: nowIso,
      ownerId: preservedOwner,
      metadata: nextEmailMeta
    };

    const { error: upsertEmailError } = await supabase
      .from('emails')
      .upsert(baseEmailPayload, { onConflict: 'id' });

    if (upsertEmailError) {
      throw upsertEmailError;
    }

    const { data: savedEmail, error: verifyEmailError } = await supabase
      .from('emails')
      .select('id')
      .eq('id', targetEmailId)
      .maybeSingle();

    if (verifyEmailError || !savedEmail) {
      throw verifyEmailError || new Error(`Generated email row was not persisted for ${targetEmailId}`);
    }

    res.status(200).json({
      success: true,
      action: normalizedAction,
      subject: renderedSubject,
      generated: !!generatedBody
    });
  } catch (error) {
    logger.error('[Sequence Review] Failed:', error);
    try {
      const failedAt = new Date().toISOString();
      const failureReason = String(error?.message || 'Failed to process sequence review action').trim().slice(0, 500);
      const failureText = `Generation failed: ${failureReason}`;
      const failureMetadata = {
        ...asObject(executionMeta),
        source: 'sequence',
        sequenceExecutionId: execution.id,
        sequenceId: execution.sequence_id,
        memberId: execution.member_id,
        emailRecordId: targetEmailId,
        status: 'failed',
        failureReason,
        failedAt,
        senderEmail: fromEmail,
        senderDomain,
        from: fromEmail,
        ownerId: fromEmail,
      };

      const { error: failureUpsertError } = await supabase
        .from('emails')
        .upsert({
          id: targetEmailId,
          contactId: contact?.id || null,
          accountId: contact?.accountId || null,
          from: fromEmail,
          to: contact?.email ? [contact.email] : [],
      subject: defaultSubject,
          html: '',
          text: failureText,
          status: 'failed',
          type: 'scheduled',
          is_read: true,
          scheduledSendTime: execution?.scheduled_at || null,
          timestamp: execution?.scheduled_at || failedAt,
          sentAt: null,
          updatedAt: failedAt,
          ownerId: fromEmail,
          metadata: failureMetadata
        }, { onConflict: 'id' });

      if (failureUpsertError) {
        logger.warn('[Sequence Review] Failed email upsert warning:', failureUpsertError.message);
      }
    } catch (persistError) {
      logger.warn('[Sequence Review] Failed to persist failed email row:', persistError?.message || persistError);
    }
    res.status(500).json({ error: error?.message || 'Failed to process sequence review action' });
  }
}
