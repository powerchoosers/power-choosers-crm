// @ts-nocheck
/**
 * Process Sequence Step Edge Function
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
const API_BASE_URL = Deno.env.get('API_BASE_URL') || 'https://nodalpoint.io'

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
                // Record failure in DB
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
            console.log('[DEBUG] Routing to handleGeneration');
            await handleGeneration(execution, job)
        } else {
            console.log('[DEBUG] Routing to handleSend');
            await handleSend(execution, job)
        }
    } else {
        console.log('[DEBUG] Routing to skipNode (other node type)');
        await skipNode(execution, job)
    }

    // Delete from queue only if we didn't throw an error
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

    const endpoint = `${API_BASE_URL}/api/ai/optimize`
    console.log('[DEBUG] Calling AI endpoint:', endpoint);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: execution.metadata?.prompt || 'Draft a personalized follow-up',
            mode: 'generate_email',
            contact: {
                name: `${member.firstName} ${member.lastName}`,
                email: member.contact_email,
                company: member.company_name
            }
        })
    })

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI generation API failed (${response.status}): ${text.substring(0, 200)}`);
    }

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
    // Logic to find burner email: 
    // 1. Get user UUID from sequence owner
    // 2. Look for any connection with @getnodalpoint.com
    // 3. Fallback to primary email

    const [member] = await sql`
    SELECT m.id, c.email as target_email, c."firstName", c."lastName", 
           s."ownerId" as owner_uuid, 
           u.email as primary_owner_email
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    JOIN sequences s ON m."sequenceId" = s.id
    LEFT JOIN users u ON (s."ownerId" = u.id OR s."ownerId" = u.email)
    WHERE m.id = ${execution.member_id}
    LIMIT 1
  `

    if (!member) throw new Error(`Could not find member details for ${execution.member_id}`);

    // Fetch burner email from zoho_connections if it exists for this user
    const connections = await sql`
    SELECT email FROM zoho_connections 
    WHERE user_id = ${member.owner_uuid} 
    AND email LIKE '%@getnodalpoint.com'
    LIMIT 1
  `

    const burnerEmail = connections[0]?.email;
    const fromEmail = burnerEmail || member.primary_owner_email;

    console.log('[DEBUG] Resolved sender:', fromEmail, burnerEmail ? '(Burner found)' : '(Using primary)');

    const payload = {
        to: { email: member.target_email, name: `${member.firstName} ${member.lastName}` },
        from: { email: fromEmail, name: 'Lewis Patterson' },
        subject: execution.metadata?.subject || execution.metadata?.aiSubject || 'Message from Nodal Point',
        html: execution.metadata?.body || execution.metadata?.aiBody,
        email_id: execution.metadata?.crm_email_id,
        metadata: { execution_id: execution.id, member_id: member.id }
    }

    const endpoint = `${API_BASE_URL}/api/email/zoho-send-sequence`
    console.log('[DEBUG] Calling Send Email endpoint:', endpoint);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })

    if (response.ok) {
        const result = await response.json();
        await sql`
       UPDATE sequence_executions 
       SET status = 'waiting', 
           wait_until = NOW() + INTERVAL '3 days',
           metadata = metadata || ${JSON.stringify({
            messageId: result.messageId,
            sentAt: new Date().toISOString(),
            from: fromEmail
        })} 
       WHERE id = ${execution.id}
    `
    } else {
        const errorText = await response.text();
        throw new Error(`Email server responded with ${response.status}: ${errorText.substring(0, 200)}`)
    }
}

async function skipNode(execution, job) {
    await sql`SELECT util.advance_sequence_member(${execution.member_id})`
}
