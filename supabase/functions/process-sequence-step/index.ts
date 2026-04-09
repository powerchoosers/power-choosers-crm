// @ts-nocheck
/**
 * Process Sequence Step Edge Function - Version 26
 * - Resolves 503 error by using direct Vercel API.
 * - Supports dynamic delay units (minutes, hours, days, etc.) from metadata.
 * - Controls 'wait_until' window based on node settings.
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'
import { getTexasEnergyContext } from '../lib/texas-territory.ts'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

const jobSchema = z.object({
    jobId: z.number(),
    execution_id: z.string(),
    sequence_id: z.string(),
    member_id: z.string(),
    step_type: z.string(),
    metadata: z.any().optional()
})

const QUEUE_NAME = 'sequence_jobs'
const API_BASE_URL = (
    Deno.env.get('PUBLIC_BASE_URL') ||
    Deno.env.get('NEXT_PUBLIC_BASE_URL') ||
    'https://www.nodalpoint.io'
).replace(/\/+$/, '');

function appendPreviewUnsubscribeFooter(html: string, email?: string | null): string {
    const content = String(html || '');
    const recipient = String(email || '').trim();
    if (!content || !recipient) return content;
    if (content.includes('data-nodal-unsubscribe-footer="1"') || content.includes('Unsubscribe or manage preferences')) {
        return content;
    }
    const unsubscribeUrl = `${API_BASE_URL}/unsubscribe?email=${encodeURIComponent(recipient)}`;
    const footer =
        `<div data-nodal-unsubscribe-footer="1" style="margin-top:32px;padding-top:16px;border-top:1px solid #3f3f46;font-family:sans-serif;font-size:11px;color:#71717a;text-align:center;line-height:1.6;">` +
        `<p style="margin:0 0 4px 0;">Nodal Point &middot; Energy Intelligence &middot; Fort Worth, TX</p>` +
        `<p style="margin:0;">You received this because we identified a potential opportunity for your energy portfolio. ` +
        `<a href="${unsubscribeUrl}" style="color:#71717a;text-decoration:underline;">Unsubscribe or manage preferences</a></p>` +
        `</div>`;
    return `${content}${footer}`;
}

function normalizeMetadata(raw: any): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
    if (Array.isArray(raw)) {
        const out: Record<string, any> = {};
        for (const item of raw) {
            if (!item) continue;
            if (typeof item === 'object' && !Array.isArray(item)) {
                Object.assign(out, item);
                continue;
            }
            if (typeof item === 'string') {
                try {
                    const parsed = JSON.parse(item);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        Object.assign(out, parsed);
                    }
                } catch {
                    // ignore invalid json fragments
                }
            }
        }
        return out;
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, any>;
            }
        } catch {
            return {};
        }
    }
    return {};
}

function cleanCompanyName(input: any): string {
    const raw = String(input || '').trim();
    if (!raw) return 'your company';

    const hasRelationshipDescriptor = /\b(?:a|an|part of|subsidiary of|division of|member of)\b/i.test(raw)
        || /,\s*(?:a|an)\s+[^,]+?\s+company\b/i.test(raw);

    const cleaned = raw
        .replace(/\s+d\/b\/a\s+.+$/i, '')
        .replace(/\s+dba\s+.+$/i, '')
        .replace(/\s+a\/k\/a\s+.+$/i, '')
        .replace(/\s+aka\s+.+$/i, '')
        .replace(/,\s*(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '')
        .replace(/\s+(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '')
        .replace(hasRelationshipDescriptor ? /\s+$/ : /,\s*(company)\.?$/i, '')
        .replace(hasRelationshipDescriptor ? /\s+$/ : /\s+(company)\.?$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return cleaned || raw;
}

function isTexasState(value: any): boolean {
    const text = String(value || '').trim().toLowerCase();
    return text === 'tx' || text === 'texas';
}

function normalizeStringList(value: any): string[] {
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

function extractPrimarySiteDetails(account: any): { address: string; city: string; state: string } {
    const direct = typeof account?.address === 'string' ? account.address.trim() : '';
    const city = typeof account?.city === 'string' ? account.city.trim() : '';
    const state = typeof account?.state === 'string' ? account.state.trim() : '';
    const serviceAddresses = Array.isArray(account?.service_addresses) ? account.service_addresses : [];

    if (serviceAddresses.length > 0) {
        const candidates: Array<{ address: string; city: string; state: string; isPrimary: boolean }> = [];
        for (const item of serviceAddresses) {
            if (typeof item === 'string' && item.trim()) {
                candidates.push({ address: item.trim(), city: '', state: '', isPrimary: false });
                continue;
            }
            if (item && typeof item === 'object') {
                const normalized = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
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
            const normalizedCity = normalizeCityKey(city);
            const normalizedState = normalizeCityKey(state);
            const preferred = candidates.find((candidate) => candidate.isPrimary)
                || candidates.find((candidate) => normalizedCity && normalizeCityKey(candidate.city) === normalizedCity)
                || candidates.find((candidate) => normalizedState && normalizeCityKey(candidate.state) === normalizedState)
                || candidates[0];
            return preferred;
        }
    }

    return {
        address: direct || [city, state].filter(Boolean).join(', '),
        city,
        state,
    };
}

function normalizeCityKey(value: any): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, ' ');
}

const TEXAS_UTILITY_TERRITORY_BY_CITY: Record<string, string> = {
    dallas: 'Oncor',
    'fort worth': 'Oncor',
    arlington: 'Oncor',
    plano: 'Oncor',
    irving: 'Oncor',
    mckinney: 'Oncor',
    denton: 'Oncor',
    tyler: 'Oncor',
    'wichita falls': 'Oncor',
    waxahachie: 'Oncor',
    houston: 'CenterPoint',
    pasadena: 'CenterPoint',
    pearland: 'CenterPoint',
    'sugar land': 'CenterPoint',
    baytown: 'CenterPoint',
    beaumont: 'CenterPoint',
    galveston: 'CenterPoint',
    'corpus christi': 'AEP Texas',
    laredo: 'AEP Texas',
    mcallen: 'AEP Texas',
    harlingen: 'AEP Texas',
    victoria: 'AEP Texas',
    midland: 'TNMP',
    odessa: 'TNMP',
    pecos: 'TNMP',
    lubbock: 'LP&L',
};

function deriveUtilityTerritory(city: any, state: any): string {
    if (!isTexasState(state)) return '';
    return TEXAS_UTILITY_TERRITORY_BY_CITY[normalizeCityKey(city)] || 'Texas/ERCOT';
}

function extractPrimarySiteAddress(account: any): string {
    return extractPrimarySiteDetails(account).address;
}

function extractHierarchyIds(metadata: any): { parentAccountId: string | null; subsidiaryAccountIds: string[] } {
    const safeMeta = normalizeMetadata(metadata);
    const relationships = normalizeMetadata(safeMeta.relationships);
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

function normalizeReplyStage(value: any): 'first_touch' | 'follow_up' | 'no_reply' | 'general' {
    const stage = String(value || '').toLowerCase().trim();
    if (!stage) return 'general';
    if (/(first[-\s]?touch|forensic opener|day\s*0|day\s*1|day1|day_1|intro)/.test(stage)) return 'first_touch';
    if (/(no[-\s]?reply|no reply|pattern[-\s]?interrupt|pattern interrupt|breakup|ghost)/.test(stage)) return 'no_reply';
    if (/(follow[-\s]?up|opened|clicked|day\s*3|day3|day\s*7|day7|day\s*14|day14)/.test(stage)) return 'follow_up';
    return 'general';
}

function detectReplyStage(prompt: any, draft: any): 'first_touch' | 'follow_up' | 'no_reply' | 'general' {
    const text = `${prompt || ''}\n${draft || ''}`.toLowerCase();
    if (/(no[-\s]?reply|no reply|pattern[-\s]?interrupt|pattern interrupt|breakup|ghost)/.test(text)) return 'no_reply';
    if (/(first[-\s]?touch|forensic opener|day\s*0|day\s*1|day1|day_1|intro)/.test(text)) return 'first_touch';
    if (/(follow[-\s]?up|opened|clicked|day\s*3|day3|day\s*7|day7|day\s*14|day14)/.test(text)) return 'follow_up';
    return 'general';
}

function buildReplyStageDirective(stage: string): string {
    const directives: Record<string, string> = {
        first_touch: [
            '- FIRST TOUCH: 60-90 words, 2-3 short paragraphs.',
            '- Pick one primary value lane based on the role/title: controller/CFO/accounting = budget variance, renewal timing, or approval pressure; facilities/operations/warehouse/logistics/manufacturing = demand spikes, delivery charges, or load timing; purchasing/contracts/procurement/asset management = renewal timing and vendor coordination; owner/CEO/president/GM/VP = leverage, timing, and simplicity; mission-driven orgs (church, school, nonprofit, healthcare) = stewardship and predictability. Use one lane only.',
            '- Start with one concrete company, role, city, or operating fact.',
            '- Make the payoff explicit without asking for a bill. Offer one low-friction next step only: a one-page cost view, a short breakdown of where cost is coming from, or a simple yes/no reply.',
            '- First-touch tone should be thoughtful and specific, not pushy. First-touch CTA must stay low-friction. Good patterns: "Worth seeing where the extra cost is likely coming from?" "Okay if I send the one-page cost view?" "Am I barking up the right tree on this?"',
            '- Never ask for a utility bill, statement, or invoice in first touch.',
            '- If the account is a subsidiary, use the operating company name and mention the parent only once if it helps orientation. If the account is outside Texas, position Nodal Point as helping nationwide accounts in deregulated markets, not Texas-only.',
            '- If the site is in Texas and utility territory is known, use the plain name once naturally: Oncor, CenterPoint, AEP Texas, TNMP, or LP&L. Do not use market shorthand.',
            '- Subject line should match the persona and stage: finance = budget drift / timing / fixed cost; operations = utility territory / delivery / demand; purchasing = renewal timing / vendor fit; owner = timing / leverage / simple check. Examples: "budget drift", "fixed cost", "load timing", "renewal timing", "simple cost check".',
            '- Never mention LinkedIn, a profile, or how you found them.',
        ].join('\n'),
        follow_up: [
            '- FOLLOW-UP: 50-80 words, 2-3 short paragraphs.',
            '- Add one new fact or angle. Reference prior contact by topic only, never opens or clicks.',
            '- Reinforce one concrete output that does not require document sharing yet: a cost breakdown, a rate-vs-delivery view, a short call, or a routing reply.',
            '- Follow-up tone should be more diagnostic and a little more direct than first touch.',
            '- If the account is a subsidiary, keep the operating company and parent company separate. Anchor the note to the site or local location, not the corporate HQ unless that is the actual site.',
            '- If the site is in Texas and utility territory is known, use the plain name once naturally. Keep it as a location cue, not jargon.',
            '- Use one direct CTA only. Good patterns: "Reply and I\'ll send the cost breakdown." "Want the rate-vs-delivery view?" "Is this worth a quick look?"',
            '- Do not ask for a bill unless this is explicitly a later, high-intent step.',
            '- Subject line should sound slightly more diagnostic than Day 1, not generic. Examples: "rate vs delivery", "demand adds cost", "timing check".',
        ].join('\n'),
        no_reply: [
            '- NO REPLY: 35-55 words, maximum 2 sentences.',
            '- Assume you already reached the right person. Do not ask who owns electricity review.',
            '- Sentence 1 should state the value in plain English and name one likely leak area.',
            '- Sentence 2 should use a tiny reply ask: a routing reply, a yes/no, or permission to send a short cost view.',
            '- No-reply tone should be sharper and cleaner than prior touches.',
            '- Never ask for a bill, statement, or invoice in this branch.',
            '- If the account is outside Texas, keep the market framing broad enough for a deregulated market and do not imply Texas-only coverage.',
            '- If the site is in Texas and utility territory is known, use the plain name once naturally, but keep the message short.',
            '- Subject line should be the sharpest and simplest one in the sequence. Examples: "short cost view", "quick yes/no", "close the loop".',
        ].join('\n'),
        general: [
            '- Keep the note short, but never vague. Give one real observation and one concrete reason to reply.',
            '- Make the value explicit: the recipient should know exactly what you will tell them back and why it matters.',
            '- Use a plain subject line with 1-4 words, but vary it by title and stage. Finance should sound like budget/timing; operations like utility territory, delivery, or demand; purchasing like renewal/vendor; owner like simple check/leverage.',
            '- One CTA only. Early stages use low-friction asks. Later/high-intent stages may optionally ask for a bill only to confirm hard numbers.',
            '- As the sequence progresses, the tone should move from thoughtful, to diagnostic, to direct, to clean closure.',
            '- Do not confuse a parent company with the operating company. If there is a subsidiary relationship, keep the local site and operating entity in view.',
        ].join('\n')
    };

    return directives[stage] || directives.general;
}

function pickValueLane(member: any): string {
    const title = String(member?.contact_title || '').toLowerCase();
    const industry = String(member?.account_industry || '').toLowerCase();

    if (/(cfo|controller|finance|accounting|accounts|vp finance|director finance|chief financial)/.test(title)) {
        return 'budget variance or renewal timing';
    }

    if (/(purchasing|procurement|contracts|asset management|buyer|materials management|purchasing manager)/.test(title)) {
        return 'renewal timing or vendor coordination';
    }

    if (/(facility|facilities|operations|plant|maintenance|logistics|warehouse|production|engineering|supply chain|operations manager|plant manager)/.test(title) || /(manufacturing|logistics|warehouse|distribution|food|cold storage|hospitality|retail|industrial)/.test(industry)) {
        return 'demand spikes or delivery charges';
    }

    if (/(owner|ceo|president|principal|founder|general manager|gm|managing director)/.test(title)) {
        return 'timing or leverage before renewal';
    }

    if (/(school|church|nonprofit|health|hospital|education|government|municipal)/.test(industry) || /(school|church|nonprofit|health|hospital|education|director|superintendent|pastor|principal|administrator)/.test(title)) {
        return 'stewardship and predictability';
    }

    return 'delivery charges';
}

function buildContextualFallbackBody(member: any, replyStage: string, location?: string | null, utilityTerritory?: string | null): string {
    const stage = normalizeReplyStage(replyStage);
    const firstName = String(member?.firstName || '').trim();
    const companyName = cleanCompanyName(member?.company_name || member?.company || member?.account_name || 'your company');
    const companyPhrase = location
        ? `${companyName} in ${location}${utilityTerritory ? ` (${utilityTerritory})` : ''}`
        : utilityTerritory
            ? `${companyName} (${utilityTerritory})`
            : companyName;
    const opener = firstName ? `${firstName},\n\n` : '';
    const valueLane = pickValueLane(member);

    if (stage === 'no_reply') {
        return `${opener}I'm probably already with the right person, and the useful question is whether ${companyPhrase} is leaking margin through ${valueLane}.\n\nIf you want the short cost view, reply yes and I'll send it.`;
    }

    if (stage === 'follow_up') {
        return `${opener}I was looking back at ${companyPhrase}, and the useful question is whether the drift is coming from ${valueLane}.\n\nReply and I'll send the short cost breakdown.`;
    }

    if (stage === 'first_touch') {
        return `${opener}I was looking at ${companyPhrase}, and the useful question is whether the spend drift sits in ${valueLane}.\n\nOkay if I send the one-page cost view?`;
    }

    return `${opener}I was looking at ${companyPhrase}, and the useful question is whether the spend drift sits in ${valueLane}.\n\nI can send the cost view first, and if you want hard numbers after that, I can review the latest statement.`;
}

Deno.serve(async (req: Request) => {
    console.log('[DEBUG] Received request:', req.method);

    try {
        const body = await req.json()
        const parseResult = z.array(jobSchema).safeParse(body)
        if (parseResult.error) {
            console.error('[DEBUG] Validation error:', parseResult.error);
            return new Response(`invalid request body`, { status: 400 })
        }

        const results = [];
        for (const job of parseResult.data) {
            console.log('[DEBUG] Processing job:', job.jobId, 'Execution:', job.execution_id);
            try {
                const outcome = await processJob(job)
                results.push({ jobId: job.jobId, status: 'success', outcome });
            } catch (err) {
                console.error('[DEBUG] Job failed:', job.jobId, err.message);
                await sql`
          UPDATE sequence_executions 
          SET status = 'failed', error_message = ${err.message}, updated_at = NOW()
          WHERE id = ${job.execution_id}
        `.catch(() => { });
                await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${job.jobId}::bigint)`.catch(() => { });
                results.push({ jobId: job.jobId, status: 'failed', error: err.message });
            }
        }

        return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
        console.error('[DEBUG] Top level error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
})

async function processJob(job) {
    const { jobId, execution_id } = job

    const [execution] = await sql`SELECT * FROM sequence_executions WHERE id = ${execution_id}`
    if (!execution) throw new Error(`Execution ${execution_id} not found`)
    const statusBefore = execution.status;

    if (execution.status === 'processing' || execution.status === 'completed' || execution.status === 'waiting') {
        console.log('[DEBUG] Job already handled, status:', execution.status);
        await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`
        return;
    }

    const metadata = normalizeMetadata(execution.metadata);

    // Keep DB row metadata in normalized object form for downstream logic.
    if (JSON.stringify(metadata) !== JSON.stringify(execution.metadata)) {
        await sql`
          UPDATE sequence_executions
          SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW()
          WHERE id = ${execution.id}
        `;
    }

    execution.metadata = metadata;

    const effectiveType = execution.step_type === 'protocolNode'
        ? (metadata.type || 'delay')
        : execution.step_type;

    if (effectiveType === 'email') {
        const existingBody = String(execution.metadata?.body || execution.metadata?.aiBody || '').trim();
        if (!existingBody) {
            const generatedPatch = await handleGeneration(execution, job);
            const patchedExecution = {
                ...execution,
                metadata: {
                    ...execution.metadata,
                    ...generatedPatch
                }
            };
            await handleSend(patchedExecution, job);
        } else {
            await handleSend(execution, job)
        }
    } else if (effectiveType === 'linkedin') {
        // LinkedIn is a manual gate: create/attach task and wait for user completion.
        await handleLinkedInTask(execution, job)
    } else {
        // Delay node or other passive node
        console.log('[DEBUG] Processing passive node:', effectiveType);
        await skipNode(execution, job)
    }

    await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`
    const [postExecution] = await sql`SELECT status, metadata FROM sequence_executions WHERE id = ${execution_id}`;
    return {
        type: effectiveType,
        statusBefore,
        statusAfter: postExecution?.status || null,
        hasBodyAfter: !!String(postExecution?.metadata?.body || postExecution?.metadata?.aiBody || '').trim()
    };
}

function extractGeneratedBody(result: any): string {
    const direct = [
        result?.optimized,
        result?.optimizedContent,
        result?.content,
        result?.body,
        result?.email,
        result?.data?.content,
        result?.data?.body,
        result?.data?.optimized
    ];
    for (const value of direct) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (text) return text;
    }
    return '';
}

async function handleGeneration(execution, job) {
    const metadata = normalizeMetadata(execution.metadata);

    const [member] = await sql`
    SELECT m.id,
           c.email as contact_email,
           c."firstName",
           c."lastName",
           c.title as contact_title,
           c.city as contact_city,
           c.state as contact_state,
           c."linkedinUrl" as contact_linkedin_url,
           a.name as company_name,
           a.domain as account_domain,
           a.website as account_website,
           a.description as account_description,
           a.employees as account_employees,
           a.revenue as account_revenue,
           a.annual_usage as account_annual_usage,
           a.load_factor as account_load_factor,
           a.industry as account_industry,
           a.city as account_city,
           a.state as account_state,
           a.address as account_address,
           a.service_addresses as account_service_addresses,
           a.metadata as account_metadata,
           a.electricity_supplier as account_supplier,
           a.current_rate as account_current_rate,
           a.contract_end_date as account_contract_end_date,
           COALESCE(
             s.bgvector->'settings'->>'senderEmail',
             s.metadata->>'sender_email',
             u.email
           ) as sequence_sender_email,
           u.first_name as owner_first_name
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    LEFT JOIN accounts a ON c."accountId" = a.id
    LEFT JOIN sequences s ON s.id = m."sequenceId"
    LEFT JOIN users u ON (u.id = s."ownerId" OR u.email = s."ownerId")
    WHERE m.id = ${execution.member_id}
  `

    const linkedInUrl = member.contact_linkedin_url || null;
    const accountDomain = member.account_domain || null;
    const website = accountDomain ? `https://${accountDomain}` : null;
    const sourceLabel = linkedInUrl ? 'linkedin' : (website ? 'website' : 'public_company_info');
    const accountCity = member.account_city ? member.account_city.trim() : null;
    const accountState = member.account_state ? member.account_state.trim() : null;
    const contactCity = member.contact_city ? member.contact_city.trim() : null;
    const contactState = member.contact_state ? member.contact_state.trim() : null;
    const primarySite = extractPrimarySiteDetails({
        address: member.account_address,
        service_addresses: member.account_service_addresses,
        city: accountCity,
        state: accountState
    });
    const primarySiteAddress = primarySite.address;
    const siteCity = primarySite.city || accountCity || contactCity || '';
    const siteState = primarySite.state || accountState || contactState || '';
    const texasEnergy = getTexasEnergyContext(siteCity, siteState, primarySiteAddress || siteCity);
    const utilityTerritory = typeof member.utility_territory === 'string' && member.utility_territory.trim()
        ? member.utility_territory.trim()
        : texasEnergy.utilityTerritory;
    const location = primarySiteAddress
        ? primarySiteAddress
        : siteCity
            ? `${siteCity}${siteState ? `, ${siteState}` : ''}`
            : accountCity
                ? `${accountCity}${accountState ? `, ${accountState}` : ''}`
                : contactCity
                    ? `${contactCity}${contactState ? `, ${contactState}` : ''}`
                    : null;
    const hierarchyIds = extractHierarchyIds(member.account_metadata);
    const relatedIds = [hierarchyIds.parentAccountId, ...(hierarchyIds.subsidiaryAccountIds || [])].filter(Boolean);
    const relatedAccounts = relatedIds.length
        ? await sql`
            SELECT id, name
            FROM accounts
            WHERE id::text = ANY(${relatedIds}::text[])
        `
        : [];
    const relatedAccountMap = new Map((relatedAccounts || []).map((row: any) => [row.id, row.name]));
    const parentCompanyName = hierarchyIds.parentAccountId ? relatedAccountMap.get(hierarchyIds.parentAccountId) || null : null;
    const subsidiaryCompanyNames = (hierarchyIds.subsidiaryAccountIds || [])
        .map((id) => relatedAccountMap.get(id))
        .filter(Boolean);
    const organizationRole = hierarchyIds.parentAccountId
        ? 'subsidiary'
        : hierarchyIds.subsidiaryAccountIds.length > 0
            ? 'parent'
            : 'standalone';
    const marketContext = texasEnergy.marketContext;
    const hierarchySummary = [
        `Operating company: ${member.company_name || 'Unknown'}`,
        `Parent company: ${parentCompanyName || hierarchyIds.parentAccountId || 'none'}`,
        `Subsidiaries: ${subsidiaryCompanyNames.length ? subsidiaryCompanyNames.join('; ') : hierarchyIds.subsidiaryAccountIds.length ? `${hierarchyIds.subsidiaryAccountIds.length} linked account(s)` : 'none'}`,
        `Role: ${organizationRole}`
    ].join(' | ');
    const sourceTruthLine = linkedInUrl
        ? 'SOURCE_TRUTH: LinkedIn is available as a research signal only. Do NOT mention LinkedIn, profiles, or how you found them in the email copy.'
        : website
            ? 'SOURCE_TRUTH: LinkedIn not available. Do NOT mention LinkedIn. You may reference company website/public company info.'
            : 'SOURCE_TRUTH: LinkedIn and website not available. Do NOT mention LinkedIn or website; use generic public company research wording.';
    const replyStage = normalizeReplyStage(
        metadata?.replyStage ||
        metadata?.sequenceStage ||
        detectReplyStage(metadata?.prompt || metadata?.label || metadata?.name || '', metadata?.body || metadata?.aiBody || '')
    );
    const contractEndYear = member.account_contract_end_date
        ? new Date(member.account_contract_end_date).getUTCFullYear()
        : null;
    const senderEmail = String(member.sequence_sender_email || '').trim() || null;
    const senderDomain = senderEmail && senderEmail.includes('@')
        ? senderEmail.split('@')[1]
        : null;

    const response = await fetch(`${API_BASE_URL}/api/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SupabaseEdgeFunction/1.0' },
        body: JSON.stringify({
            prompt: `${metadata?.prompt || 'Draft a personalized follow-up'}\n\n${buildReplyStageDirective(replyStage)}\n\n${sourceTruthLine}`,
            provider: 'openrouter',
            type: 'email',
            vectors: Array.isArray(metadata?.vectors) ? metadata.vectors : [],
            mode: 'generate_email',
            sequenceStage: replyStage,
            replyStage,
            contact: {
                name: `${member.firstName} ${member.lastName}`,
                email: member.contact_email,
                company: member.company_name,
                website: member.account_website || website || null,
                company_description: member.account_description || null,
                employees: member.account_employees ?? null,
                revenue: member.account_revenue ?? null,
                annual_usage: member.account_annual_usage ?? null,
                load_factor: member.account_load_factor ?? null,
                title: member.contact_title || null,
                industry: member.account_industry || null,
                electricity_supplier: member.account_supplier || null,
                current_rate: member.account_current_rate || null,
                contract_end_date: member.account_contract_end_date || null,
                contract_end_year: Number.isFinite(contractEndYear) ? contractEndYear : null,
                city: accountCity || contactCity || null,
                state: accountState || contactState || null,
                location,
                address: member.account_address || null,
                service_addresses: member.account_service_addresses || null,
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
                source_label: sourceLabel,
                sender_email: senderEmail,
                sender_domain: senderDomain,
                sender_first_name: member.owner_first_name || null
            }
        })
    })

    if (!response.ok) throw new Error(`AI generation failed (${response.status})`);

    const result = await response.json()
    let body = extractGeneratedBody(result)
    const subject = result.subject || metadata?.subject || metadata?.aiSubject || 'Message from Nodal Point'

    if (!body) {
        body = buildContextualFallbackBody(member, replyStage, location, utilityTerritory);
    }

    const bodyWithFooter = appendPreviewUnsubscribeFooter(body, member.contact_email);
    const metadataPatch = senderEmail
        ? { body: bodyWithFooter, subject, from: senderEmail, senderEmail, senderDomain }
        : { body: bodyWithFooter, subject };

    return metadataPatch;
}

async function handleSend(execution, job) {
    const metadata = normalizeMetadata(execution.metadata);

    const [member] = await sql`
    SELECT m.id, c.id as contact_id, c."accountId" as account_id, c.email as target_email, c."firstName", c."lastName",
           a.name as company_name, a.city as account_city, a.state as account_state, a.industry as account_industry,
           s."ownerId" as owner_uuid, u.email as primary_owner_email,
           u.first_name as owner_first_name,
           COALESCE(
             s.bgvector->'settings'->>'senderEmail',
             s.metadata->>'sender_email',
             u.email
           ) as sequence_sender_email
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    LEFT JOIN accounts a ON c."accountId" = a.id
    JOIN sequences s ON m."sequenceId" = s.id
    LEFT JOIN users u ON (s."ownerId" = u.id OR s."ownerId" = u.email)
    WHERE m.id = ${execution.member_id}
    LIMIT 1
  `

    const targetEmail = String(member?.target_email || '').trim();
    if (!targetEmail) {
        await sql`
      UPDATE sequence_executions
      SET status = 'skipped',
          error_message = 'Missing target email',
          updated_at = NOW()
      WHERE id = ${execution.id}
    `;
        return;
    }

    // Suppression pre-check: skip send if contact has unsubscribed or paused.
    // spike_only contacts are NOT in suppressions (handled via contact metadata only),
    // so they will still receive emails from the sequence engine.
    if (member?.target_email) {
        const [suppression] = await sql`
      SELECT id, reason FROM suppressions WHERE id = LOWER(${member.target_email}) LIMIT 1
    `
        if (suppression) {
            console.log(`[DEBUG] Suppressed contact, skipping send: ${member.target_email} (reason: ${suppression.reason})`);
            await sql`
        UPDATE sequence_executions
        SET status = 'skipped',
            error_message = ${'Suppressed: ' + suppression.reason},
            updated_at = NOW()
        WHERE id = ${execution.id}
      `
            return;
        }
    }

    const preferredSender = String(metadata?.senderEmail || metadata?.from || member.sequence_sender_email || '').trim();
    let fromEmail = preferredSender || member.primary_owner_email;
    if (preferredSender) {
        const preferredConnection = await sql`
      SELECT email
      FROM zoho_connections
      WHERE user_id = ${member.owner_uuid}
        AND LOWER(email) = LOWER(${preferredSender})
      LIMIT 1
    `;
        if (preferredConnection[0]?.email) {
            fromEmail = preferredConnection[0].email;
        }
    }
    if (!fromEmail) {
        const fallbackConnection = await sql`
      SELECT email
      FROM zoho_connections
      WHERE user_id = ${member.owner_uuid}
      ORDER BY CASE WHEN email LIKE '%@getnodalpoint.com' THEN 0 ELSE 1 END, email
      LIMIT 1
    `;
        fromEmail = fallbackConnection[0]?.email || member.primary_owner_email;
    }
    fromEmail = String(fromEmail || '').trim();
    if (!fromEmail) {
        await sql`
      UPDATE sequence_executions
      SET status = 'failed',
          error_message = 'Missing sender email',
          updated_at = NOW()
      WHERE id = ${execution.id}
    `;
        return;
    }

    const emailRecordId = metadata?.emailRecordId || `seq_exec_${execution.id}`;
    const replyStage = normalizeReplyStage(
        metadata?.replyStage ||
        metadata?.sequenceStage ||
        detectReplyStage(metadata?.prompt || metadata?.label || metadata?.name || '', metadata?.body || metadata?.aiBody || '')
    );
    const htmlBody = String(metadata?.body || metadata?.aiBody || '').trim() ||
        buildContextualFallbackBody(member, replyStage, member.account_city || null, utilityTerritory);

    const response = await fetch(`${API_BASE_URL}/api/email/zoho-send-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SupabaseEdgeFunction/1.0' },
        body: JSON.stringify({
            to: { email: targetEmail, name: `${member.firstName} ${member.lastName}` },
            from: { email: fromEmail, name: member.owner_first_name ? `${member.owner_first_name} \u2022 Nodal Point` : 'Nodal Point' },
            subject: metadata?.subject || metadata?.aiSubject || 'Message from Nodal Point',
            html: htmlBody,
            email_id: emailRecordId,
            contactId: member.contact_id || undefined,
            metadata: { execution_id: execution.id, member_id: member.id }
        })
    })

    if (response.ok) {
        const result = await response.json();

        // Determine wait window for interaction (default 3 days if not specified)
        const delayVal = parseInt(metadata?.delay || metadata?.interval || '3');
        const delayUnit = metadata?.delayUnit || 'days';

        // Update to 'waiting' state
        await sql`
       UPDATE sequence_executions 
       SET status = 'waiting', 
           wait_until = NOW() + (${delayVal} || ' ' || ${delayUnit})::INTERVAL,
           metadata = util.normalize_execution_metadata(metadata) || ${JSON.stringify({
            messageId: result.messageId,
            sentAt: new Date().toISOString(),
            from: fromEmail
        })}::jsonb 
       WHERE id = ${execution.id}
    `
    } else {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Email API failed (${response.status}): ${errorText.slice(0, 400)}`)
    }
}

async function handleLinkedInTask(execution, job) {
    const metadata = normalizeMetadata(execution.metadata);

    const [member] = await sql`
    SELECT m.id,
           c.id as contact_id,
           c."accountId" as account_id,
           c."firstName",
           c."lastName",
           s."ownerId" as owner_id,
           u.email as owner_email
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    LEFT JOIN sequences s ON s.id = m."sequenceId"
    LEFT JOIN users u ON (u.id = s."ownerId" OR u.email = s."ownerId")
    WHERE m.id = ${execution.member_id}
    LIMIT 1
  `;

    if (!member?.contact_id) {
        throw new Error(`LinkedIn task requires a valid contact for member ${execution.member_id}`);
    }

    const existingTasks = await sql`
    SELECT id, status
    FROM tasks
    WHERE metadata->>'sequenceExecutionId' = ${execution.id}
       OR metadata->>'execution_id' = ${execution.id}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

    let taskId = existingTasks?.[0]?.id || null;

    if (!taskId) {
        const firstName = (member.firstName || '').trim();
        const lastName = (member.lastName || '').trim();
        const contactName = `${firstName} ${lastName}`.trim() || 'Contact';
        const label = (metadata?.label || 'LinkedIn Step').trim();
        const prompt = (metadata?.prompt || metadata?.aiBody || 'Complete LinkedIn outreach step for this contact.').trim();
        const ownerEmail = member.owner_email || (String(member.owner_id || '').includes('@') ? member.owner_id : null);
        const ownerId = member.owner_id && !String(member.owner_id).includes('@') ? String(member.owner_id) : null;

        const inserted = await sql`
      INSERT INTO tasks (
        id,
        title,
        description,
        status,
        priority,
        "dueDate",
        "contactId",
        "accountId",
        "ownerId",
        "createdAt",
        "updatedAt",
        metadata
      ) VALUES (
        gen_random_uuid()::text,
        ${`LinkedIn - ${label} (${contactName})`},
        ${prompt},
        'Pending',
        'Protocol',
        NOW(),
        ${member.contact_id},
        ${member.account_id},
        ${ownerId},
        NOW(),
        NOW(),
        jsonb_build_object(
          'taskType', 'LinkedIn',
          'source', 'sequence',
          'sequenceExecutionId', ${String(execution.id)}::text,
          'sequenceId', ${String(execution.sequence_id)}::text,
          'memberId', ${String(execution.member_id)}::text,
          'stepType', ${String(execution.step_type || 'protocolNode')}::text,
          'execution_id', ${String(execution.id)}::text,
          'member_id', ${String(execution.member_id)}::text
        )
      )
      RETURNING id
    `;

        taskId = inserted?.[0]?.id || null;
    }

    const executionPatch: Record<string, any> = { manualGate: true };
    if (taskId) executionPatch.taskId = taskId;

    await sql`
    UPDATE sequence_executions
    SET status = 'waiting',
        wait_until = NULL,
        metadata = util.normalize_execution_metadata(metadata) || ${JSON.stringify(executionPatch)}::jsonb,
        updated_at = NOW()
    WHERE id = ${execution.id}
  `;
}

async function skipNode(execution, job) {
    await sql`SELECT util.advance_sequence_member(${execution.member_id})`
}
