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

    const effectiveType = execution.step_type === 'protocolNode'
        ? (execution.metadata?.type || 'delay')
        : execution.step_type;

    if (effectiveType === 'email') {
        const hasBody = !!(execution.metadata?.body || execution.metadata?.aiBody);
        if (!hasBody) {
            await handleGeneration(execution, job)
        } else {
            await handleSend(execution, job)
        }
    } else {
        // Delay node or other passive node
        console.log('[DEBUG] Processing passive node:', effectiveType);
        await skipNode(execution, job)
    }

    await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`
}

async function handleGeneration(execution, job) {
    const [member] = await sql`
    SELECT m.id, c.email as contact_email, c."firstName", c."lastName", a.name as company_name
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    LEFT JOIN accounts a ON c."accountId" = a.id
    WHERE m.id = ${execution.member_id}
  `

    const response = await fetch(`${API_BASE_URL}/api/ai/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SupabaseEdgeFunction/1.0' },
        body: JSON.stringify({
            prompt: execution.metadata?.prompt || 'Draft a personalized follow-up',
            mode: 'generate_email',
            contact: { name: `${member.firstName} ${member.lastName}`, email: member.contact_email, company: member.company_name }
        })
    })

    if (!response.ok) throw new Error(`AI generation failed (${response.status})`);

    const result = await response.json()
    const body = result.optimizedContent || result.content
    const subject = result.subject || execution.metadata?.subject || 'Message from Nodal Point'

    await sql`
    UPDATE sequence_executions 
    SET metadata = metadata || ${JSON.stringify({ body, subject })}, status = 'pending_send'
    WHERE id = ${execution.id}
  `
}

async function handleSend(execution, job) {
    const [member] = await sql`
    SELECT m.id, c.email as target_email, c."firstName", c."lastName", 
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

    const response = await fetch(`${API_BASE_URL}/api/email/zoho-send-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SupabaseEdgeFunction/1.0' },
        body: JSON.stringify({
            to: { email: member.target_email, name: `${member.firstName} ${member.lastName}` },
            from: { email: fromEmail, name: 'Lewis Patterson' },
            subject: execution.metadata?.subject || execution.metadata?.aiSubject || 'Message from Nodal Point',
            html: execution.metadata?.body || execution.metadata?.aiBody,
            metadata: { execution_id: execution.id, member_id: member.id }
        })
    })

    if (response.ok) {
        const result = await response.json();

        // Determine wait window for interaction (default 3 days if not specified)
        const delayVal = parseInt(execution.metadata?.delay || execution.metadata?.interval || '3');
        const delayUnit = execution.metadata?.delayUnit || 'days';

        // Update to 'waiting' state
        await sql`
       UPDATE sequence_executions 
       SET status = 'waiting', 
           wait_until = NOW() + (${delayVal} || ' ' || ${delayUnit})::INTERVAL,
           metadata = metadata || ${JSON.stringify({
            messageId: result.messageId,
            sentAt: new Date().toISOString(),
            from: fromEmail
        })} 
       WHERE id = ${execution.id}
    `
    } else {
        throw new Error(`Email API failed (${response.status})`)
    }
}

async function skipNode(execution, job) {
    await sql`SELECT util.advance_sequence_member(${execution.member_id})`
}
