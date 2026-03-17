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
    } else if (effectiveType === 'call') {
        // Call steps are manual gates: create a task and wait for user to make the call.
        await handleCallTask(execution, job)
    } else {
        // Delay node or other truly passive node (condition, end, input, etc.)
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
        ? 'SOURCE_TRUTH: LinkedIn available. You may reference LinkedIn once if natural.'
        : website
            ? 'SOURCE_TRUTH: LinkedIn not available. Do NOT mention LinkedIn. You may reference company website/public company info.'
            : 'SOURCE_TRUTH: LinkedIn and website not available. Do NOT mention LinkedIn or website; use generic public company research wording.';
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
        const firstName = String(member.firstName || '').trim();
        const companyName = String(member.company_name || 'your team').trim();
        body = `Hi${firstName ? ` ${firstName}` : ''},\n\nI wanted to share a quick energy-forensics snapshot idea for ${companyName}. If you send your most recent electricity bill, I can reply with 2-3 specific observations worth checking.\n\nInterested?`;
    }

    const bodyWithFooter = appendPreviewUnsubscribeFooter(body, member.contact_email);
    const metadataPatch = senderEmail
        ? { body: bodyWithFooter, subject, from: senderEmail, senderEmail, senderDomain }
        : { body: bodyWithFooter, subject };

    return metadataPatch;
}

async function handleSend(execution, job) {
    const metadata = normalizeMetadata(execution.metadata);

    // Fix 3 — Idempotency: re-check DB status right before sending to prevent duplicate
    // sends when two PGMQ messages for the same execution are processed concurrently.
    const [freshExecSend] = await sql`SELECT status FROM sequence_executions WHERE id = ${execution.id}`;
    if (freshExecSend?.status === 'waiting' || freshExecSend?.status === 'completed') {
        console.log(`[DEBUG] handleSend: execution ${execution.id} already ${freshExecSend.status} — skipping duplicate send`);
        return;
    }

    const [member] = await sql`
    SELECT m.id, c.id as contact_id, c."accountId" as account_id, c.email as target_email, c."firstName", c."lastName",
           s."ownerId" as owner_uuid, u.email as primary_owner_email,
           u.first_name as owner_first_name,
           COALESCE(
             s.bgvector->'settings'->>'senderEmail',
             s.metadata->>'sender_email',
             u.email
           ) as sequence_sender_email
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    JOIN sequences s ON m."sequenceId" = s.id
    LEFT JOIN users u ON (s."ownerId" = u.id OR s."ownerId" = u.email)
    WHERE m.id = ${execution.member_id}
    LIMIT 1
  `

    const targetEmail = String(member?.target_email || '').trim();
    if (!targetEmail) {
        // No email on file — skip this step and advance to the next node so the
        // sequence continues (e.g. to the voicemail drop) rather than stalling here.
        await skipNode(execution, job);
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
            // Advance past this email node so the member doesn't get permanently
            // stuck at current_node_id with no pending execution. The next step
            // (Day 2 call) is a human gate — the rep can decide what to do.
            await skipNode(execution, job);
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
    const [existingEmailRecord] = await sql`
      SELECT id, status, metadata, "from"
      FROM emails
      WHERE id = ${String(emailRecordId)}
      LIMIT 1
    `;
    const alreadySentForExecution = existingEmailRecord
        && (
            String(existingEmailRecord.status || '').toLowerCase() === 'sent'
            || !!existingEmailRecord?.metadata?.messageId
            || !!existingEmailRecord?.metadata?.zohoMessageId
            || !!existingEmailRecord?.metadata?.sentAt
        );
    if (alreadySentForExecution) {
        console.log(`[DEBUG] handleSend: email already sent for execution ${execution.id}; skipping duplicate send`);
        const delayVal = parseInt(metadata?.delay || metadata?.interval || '3');
        const delayUnit = metadata?.delayUnit || 'days';
        await sql`
          UPDATE sequence_executions
          SET status = 'waiting',
              wait_until = COALESCE(wait_until, NOW() + (${delayVal} || ' ' || ${delayUnit})::INTERVAL),
              metadata = util.normalize_execution_metadata(metadata) || ${JSON.stringify({
            messageId: existingEmailRecord?.metadata?.messageId || existingEmailRecord?.metadata?.zohoMessageId || null,
            sentAt: existingEmailRecord?.metadata?.sentAt || new Date().toISOString(),
            from: existingEmailRecord?.from || fromEmail
        })}::jsonb,
              updated_at = NOW()
          WHERE id = ${execution.id}
            AND status NOT IN ('waiting', 'completed')
        `;
        return;
    }

    const htmlBody = String(metadata?.body || metadata?.aiBody || '').trim() ||
        'Hi there,\n\nIf you share your latest electricity statement, I can reply with a quick 2-3 point forensic snapshot.\n\nInterested?';

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

        // Increment total_emails_sent on the sequence member now that the send succeeded
        await sql`
       UPDATE sequence_members
       SET total_emails_sent = COALESCE(total_emails_sent, 0) + 1,
           "updatedAt" = NOW()
       WHERE id = ${execution.member_id}
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
           c."linkedinUrl" as contact_linkedin_url,
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

    const hasLinkedIn = Boolean(String(member.contact_linkedin_url || '').trim());


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
        let prompt = (metadata?.prompt || metadata?.aiBody || 'Complete LinkedIn outreach step for this contact.').trim();
        if (!hasLinkedIn) {
            prompt = `[MANUAL SEARCH REQUIRED] No LinkedIn URL found in dossier. Please search for and connect with this contact.\n\n${prompt}`;
        }
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

async function handleCallTask(execution, job) {
    const metadata = normalizeMetadata(execution.metadata);

    // Fix 2 — Idempotency: re-check DB status before creating the call task to prevent
    // duplicate task creation when two PGMQ messages race for the same execution.
    const [freshExecCall] = await sql`SELECT status FROM sequence_executions WHERE id = ${execution.id}`;
    if (freshExecCall?.status === 'waiting' || freshExecCall?.status === 'completed') {
        console.log(`[DEBUG] handleCallTask: execution ${execution.id} already ${freshExecCall.status} — skipping duplicate task creation`);
        return;
    }

    // Fix 2 (strict): if another waiting call execution already exists for this member
    // at this call node, mark this execution as deduplicated and skip creating any task.
    const currentNodeId = String(metadata?.nodeId || metadata?.id || '').trim();
    const siblingWaitingCall = currentNodeId
        ? (await sql`
      SELECT id
      FROM sequence_executions
      WHERE member_id = ${execution.member_id}
        AND id <> ${execution.id}
        AND status = 'waiting'
        AND lower(coalesce(metadata->>'type', CASE WHEN step_type = 'protocolNode' THEN NULL ELSE step_type END, '')) = 'call'
        AND coalesce(metadata->>'nodeId', metadata->>'id', '') = ${currentNodeId}
      LIMIT 1
    `)?.[0]
        : (await sql`
      SELECT id
      FROM sequence_executions
      WHERE member_id = ${execution.member_id}
        AND id <> ${execution.id}
        AND status = 'waiting'
        AND lower(coalesce(metadata->>'type', CASE WHEN step_type = 'protocolNode' THEN NULL ELSE step_type END, '')) = 'call'
      LIMIT 1
    `)?.[0];
    if (siblingWaitingCall?.id) {
        await sql`
      UPDATE sequence_executions
      SET status = 'completed',
          outcome = 'deduplicated',
          completed_at = NOW(),
          error_message = ${`Deduplicated: waiting call execution ${siblingWaitingCall.id} already exists for this member/node`},
          updated_at = NOW()
      WHERE id = ${execution.id}
        AND status NOT IN ('waiting', 'completed')
    `;
        console.log(`[DEBUG] handleCallTask: deduplicated execution ${execution.id}; waiting execution ${siblingWaitingCall.id} already exists`);
        return;
    }

    const [member] = await sql`
    SELECT m.id,
           c.id as contact_id,
           c."accountId" as account_id,
           c."firstName",
           c."lastName",
           c.phone as contact_phone,
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
        throw new Error(`Call task requires a valid contact for member ${execution.member_id}`);
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
        const label = (metadata?.label || 'Call Step').trim();
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
        ${`Call - ${label} (${contactName})`},
        ${'Drop a voicemail for this contact as part of the outreach sequence.'},
        'Pending',
        'Protocol',
        NOW(),
        ${member.contact_id},
        ${member.account_id},
        ${ownerEmail},
        NOW(),
        NOW(),
        jsonb_build_object(
          'taskType', 'Call',
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
