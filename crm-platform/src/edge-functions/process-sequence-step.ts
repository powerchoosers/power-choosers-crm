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
const API_BASE_URL = 'https://nodal-point-network.vercel.app';

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
                await processJob(job)
                results.push({ jobId: job.jobId, status: 'success' });
            } catch (err) {
                console.error('[DEBUG] Job failed:', job.jobId, err.message);
                await sql`
          UPDATE sequence_executions 
          SET status = 'failed', error_message = ${err.message}, updated_at = NOW()
          WHERE id = ${job.execution_id}
        `.catch(() => { });
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
        const hasBody = !!(execution.metadata?.body || execution.metadata?.aiBody);
        if (!hasBody) {
            await handleGeneration(execution, job)
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
           a.contract_end_date as account_contract_end_date
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    LEFT JOIN accounts a ON c."accountId" = a.id
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
        ? 'SOURCE_TRUTH: LinkedIn available. You may reference LinkedIn once if natural.'
        : website
            ? 'SOURCE_TRUTH: LinkedIn not available. Do NOT mention LinkedIn. You may reference company website/public company info.'
            : 'SOURCE_TRUTH: LinkedIn and website not available. Do NOT mention LinkedIn or website; use generic public company research wording.';
    const contractEndYear = member.account_contract_end_date
        ? new Date(member.account_contract_end_date).getUTCFullYear()
        : null;

    const response = await fetch(`${API_BASE_URL}/api/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SupabaseEdgeFunction/1.0' },
        body: JSON.stringify({
            prompt: `${metadata?.prompt || 'Draft a personalized follow-up'}\n\n${sourceTruthLine}`,
            provider: 'openrouter',
            type: 'email',
            vectors: Array.isArray(metadata?.vectors) ? metadata.vectors : [],
            mode: 'generate_email',
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
                source_label: sourceLabel
            }
        })
    })

    if (!response.ok) throw new Error(`AI generation failed (${response.status})`);

    const result = await response.json()
    const body = result.optimized || result.optimizedContent || result.content || ''
    const subject = result.subject || metadata?.subject || metadata?.aiSubject || 'Message from Nodal Point'

    if (!String(body).trim()) {
        throw new Error('AI generation returned empty body');
    }

    await sql`
    UPDATE sequence_executions 
    SET metadata = util.normalize_execution_metadata(metadata) || ${JSON.stringify({ body, subject })}::jsonb, status = 'pending_send'
    WHERE id = ${execution.id}
  `
}

async function handleSend(execution, job) {
    const metadata = normalizeMetadata(execution.metadata);

    const [member] = await sql`
    SELECT m.id, c.id as contact_id, c."accountId" as account_id, c.email as target_email, c."firstName", c."lastName", 
           s."ownerId" as owner_uuid, u.email as primary_owner_email
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    JOIN sequences s ON m."sequenceId" = s.id
    LEFT JOIN users u ON (s."ownerId" = u.id OR s."ownerId" = u.email)
    WHERE m.id = ${execution.member_id}
    LIMIT 1
  `

    const connections = await sql`SELECT email FROM zoho_connections WHERE user_id = ${member.owner_uuid} AND email LIKE '%@getnodalpoint.com' LIMIT 1`
    const fromEmail = connections[0]?.email || member.primary_owner_email;

    const emailRecordId = metadata?.emailRecordId || `seq_exec_${execution.id}`;

    const response = await fetch(`${API_BASE_URL}/api/email/zoho-send-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SupabaseEdgeFunction/1.0' },
        body: JSON.stringify({
            to: { email: member.target_email, name: `${member.firstName} ${member.lastName}` },
            from: { email: fromEmail, name: 'Lewis Patterson' },
            subject: metadata?.subject || metadata?.aiSubject || 'Message from Nodal Point',
            html: metadata?.body || metadata?.aiBody,
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
        throw new Error(`Email API failed (${response.status})`)
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
        ${ownerEmail},
        NOW(),
        NOW(),
        jsonb_build_object(
          'taskType', 'LinkedIn',
          'source', 'sequence',
          'sequenceExecutionId', ${execution.id},
          'sequenceId', ${execution.sequence_id},
          'memberId', ${execution.member_id},
          'stepType', COALESCE(${execution.step_type}, 'protocolNode'),
          'execution_id', ${execution.id},
          'member_id', ${execution.member_id}
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
