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

    const cleaned = raw
        .replace(/\s+d\/b\/a\s+.+$/i, '')
        .replace(/\s+dba\s+.+$/i, '')
        .replace(/\s+a\/k\/a\s+.+$/i, '')
        .replace(/\s+aka\s+.+$/i, '')
        .replace(/,\s*(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|company|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '')
        .replace(/\s+(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|co|company|lp|l\.p\.|llp|l\.l\.p\.)\.?$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return cleaned || raw;
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
            '- Pick one primary value lane based on the role: controller/CFO = budget variance or renewal timing; facilities/operations = demand spikes or delivery charges; owner/GM = leverage or timing. Use one lane only.',
            '- Start with one concrete company, role, city, or operating fact.',
            '- Make the payoff explicit: they get a marked-up statement showing where the leak is most likely coming from and what to check first.',
            '- Use one direct statement CTA. Prefer "Send the latest statement and I\'ll tell you where the leak is most likely coming from."',
            '- Subject line: 1-4 words, plain, specific, and value-led.',
            '- Never mention LinkedIn, a profile, or how you found them.',
        ].join('\n'),
        follow_up: [
            '- FOLLOW-UP: 50-80 words, 2-3 short paragraphs.',
            '- Add one new fact or angle. Reference prior contact by topic only, never opens or clicks.',
            '- Reinforce the concrete output: the bill lines worth checking and the likely leak area.',
            '- Use one direct statement CTA. Prefer an affirmative sentence over a question, and keep the payoff concrete.',
            '- Subject line: 1-4 words, specific and plain.',
        ].join('\n'),
        no_reply: [
            '- NO REPLY: 35-55 words, maximum 2 sentences.',
            '- Assume you already reached the right person. Do not ask who owns electricity review.',
            '- Sentence 1 should state the value in plain English and name one likely leak area.',
            '- Sentence 2 should offer to mark up the latest statement and call out the lines worth checking first.',
            '- Subject line: 1-4 words, direct and sharp.',
        ].join('\n'),
        general: [
            '- Keep the note short, but never vague. Give one real observation and one concrete reason to reply.',
            '- Make the value explicit: the recipient should know exactly what you will tell them back and why it matters.',
            '- Use a plain subject line with 1-5 words.',
            '- One CTA only. Prefer a statement first; use a simple yes/no only if it still names the payoff.',
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

    if (/(facility|facilities|operations|plant|maintenance|logistics|warehouse|production|engineering|supply chain|operations manager|plant manager)/.test(title) || /(manufacturing|logistics|warehouse|distribution|food|cold storage|hospitality|retail|industrial)/.test(industry)) {
        return 'demand spikes or delivery charges';
    }

    if (/(owner|ceo|president|principal|founder|general manager|gm|managing director)/.test(title)) {
        return 'timing or leverage before renewal';
    }

    return 'delivery charges';
}

function buildContextualFallbackBody(member: any, replyStage: string, location?: string | null): string {
    const stage = normalizeReplyStage(replyStage);
    const firstName = String(member?.firstName || '').trim();
    const companyName = cleanCompanyName(member?.company_name || member?.company || member?.account_name || 'your company');
    const companyPhrase = location ? `${companyName} in ${location}` : companyName;
    const opener = firstName ? `${firstName},\n\n` : '';
    const valueLane = pickValueLane(member);

    if (stage === 'no_reply') {
        return `${opener}I'm probably sending this to the right person already, and the useful question is whether the leak sits in ${valueLane}.\n\nSend the latest statement and I'll mark up the lines worth checking first.`;
    }

    if (stage === 'follow_up') {
        return `${opener}I was looking back at ${companyPhrase} and the useful question is whether the drift is coming from ${valueLane}.\n\nSend the latest statement and I'll mark up the lines worth checking first.`;
    }

    if (stage === 'first_touch') {
        return `${opener}I was looking at ${companyPhrase} and the useful question is whether the bill leak sits in ${valueLane}.\n\nSend your latest electricity statement and I'll mark up the lines worth checking first.`;
    }

    return `${opener}I was looking at ${companyPhrase} and the useful question is whether the bill is leaking through ${valueLane}.\n\nSend your latest electricity statement and I'll mark up the lines worth checking first.`;
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
           a.industry as account_industry,
           a.city as account_city,
           a.state as account_state,
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
    const location = accountCity
        ? `${accountCity}${accountState ? `, ${accountState}` : ''}`
        : contactCity
            ? `${contactCity}${contactState ? `, ${contactState}` : ''}`
            : null;
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
                title: member.contact_title || null,
                industry: member.account_industry || null,
                electricity_supplier: member.account_supplier || null,
                current_rate: member.account_current_rate || null,
                contract_end_date: member.account_contract_end_date || null,
                contract_end_year: Number.isFinite(contractEndYear) ? contractEndYear : null,
                city: accountCity || contactCity || null,
                state: accountState || contactState || null,
                location,
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
        body = buildContextualFallbackBody(member, replyStage, location);
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
        buildContextualFallbackBody(member, replyStage, member.account_city || null);

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
