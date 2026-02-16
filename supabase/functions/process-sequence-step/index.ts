/**
 * Process Sequence Step Edge Function
 * 
 * This function processes sequence steps from the queue, handling AI generation,
 * email sending via Zoho, task creation for manual steps, and sequential advancement.
 */

// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// Initialize Postgres client
const sql = postgres(
  Deno.env.get('SUPABASE_DB_URL')!
)

// Job schema from queue
const jobSchema = z.object({
  jobId: z.number(),
  execution_id: z.string(),
  sequence_id: z.string(),
  member_id: z.string(),
  step_type: z.string(),
  metadata: z.any().optional()
})

const failedJobSchema = jobSchema.extend({
  error: z.string()
})

type Job = z.infer<typeof jobSchema>
type FailedJob = z.infer<typeof failedJobSchema>

const QUEUE_NAME = 'sequence_jobs'
const API_BASE_URL = Deno.env.get('API_BASE_URL') || 'https://nodalpoint.io'

// Listen for HTTP requests
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('expected POST request', { status: 405 })
    }

    if (req.headers.get('content-type') !== 'application/json') {
      return new Response('expected json body', { status: 400 })
    }

    const body = await req.json()
    const parseResult = z.array(jobSchema).safeParse(body)
    if (parseResult.error) {
      return new Response(`invalid request body: ${parseResult.error.message}`, {
        status: 400
      })
    }

    const pendingJobs = parseResult.data
    const completedJobs: Job[] = []
    const failedJobs: FailedJob[] = []

    async function processJobs() {
      let currentJob: Job | undefined
      while ((currentJob = pendingJobs.shift()) !== undefined) {
        try {
          await processJob(currentJob)
          completedJobs.push(currentJob)
        } catch (error) {
          failedJobs.push({
            ...currentJob,
            error: error instanceof Error ? error.message : JSON.stringify(error)
          })
        }
      }
    }

    try {
      await Promise.race([processJobs(), catchUnload()])
    } catch (error) {
      failedJobs.push(
        ...pendingJobs.map((job) => ({
          ...job,
          error: error instanceof Error ? error.message : JSON.stringify(error)
        }))
      )
    }

    console.log('finished processing sequence steps:', {
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length
    })

    return new Response(
      JSON.stringify({ completedJobs, failedJobs }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (topError) {
    const msg = topError instanceof Error ? topError.message : String(topError)
    console.error('[process-sequence-step] top-level error:', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
})

/**
 * Processes a sequence step job
 */
async function processJob(job: Job) {
  const { jobId, execution_id } = job

  console.log('[ProcessJob] Starting:', execution_id)

  // Fetch execution details
  const [execution]: any[] = await sql`
    SELECT id, sequence_id, member_id, step_type, status, metadata, scheduled_at
    FROM sequence_executions
    WHERE id = ${execution_id}
  `
  if (!execution) {
    throw new Error(`Execution not found: ${execution_id}`)
  }

  // Fetch member/contact details
  const [memberRow]: any[] = await sql`
    SELECT m.id, m."targetId", m."targetType", m.current_node_id, 
           c.email as contact_email, c."firstName", c."lastName", c."accountId",
           a.name as company_name,
           u.email as owner_email, u.first_name as owner_first_name
    FROM sequence_members m
    JOIN contacts c ON m."targetId" = c.id
    LEFT JOIN accounts a ON c."accountId" = a.id
    JOIN sequences s ON m."sequenceId" = s.id
    JOIN users u ON s."ownerId" = u.email
    WHERE m.id = ${execution.member_id}
  `
  if (!memberRow) {
    throw new Error(`Sequence member/contact not found: ${execution.member_id}`)
  }

  const context = {
    execution,
    member: memberRow,
    contact: {
      id: memberRow.targetId,
      email: memberRow.contact_email,
      firstName: memberRow.firstName,
      lastName: memberRow.lastName,
      companyName: memberRow.company_name
    },
    owner: {
      email: memberRow.owner_email,
      name: `${memberRow.owner_first_name || 'Nodal Point'} | Nodal Point`
    }
  }

  // Handle Multi-Stage Progression
  try {
    switch (execution.status) {
      case 'awaiting_generation':
        await handleGeneration(context)
        break
      case 'pending':
      case 'pending_send':
        await handleExecution(context)
        break
      case 'processing':
        console.log('[ProcessJob] Step already processing:', execution_id)
        break
      case 'waiting':
        console.log('[ProcessJob] Step waiting for engagement/timeout:', execution_id)
        break
      default:
        console.warn('[ProcessJob] Unknown status:', execution.status)
    }

    // Delete from queue if successfully handled or skipped
    await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`

  } catch (error) {
    console.error('[ProcessJob] Error:', error)
    // Update status to failed for retries
    await sql`
      UPDATE sequence_executions
      SET status = 'failed', error_message = ${error.message}, updated_at = NOW()
      WHERE id = ${execution_id}
    `
    throw error
  }
}

/**
 * Stage 1: AI Email Generation
 */
async function handleGeneration(ctx: any) {
  const { execution, contact, owner } = ctx
  console.log('[HandleGeneration] Drafting email for:', contact.email)

  // Call AI optimization API
  const endpoint = `${API_BASE_URL}/api/ai/optimize`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: execution.metadata?.prompt || 'Draft a personalized follow-up',
      mode: 'generate_email',
      contact: {
        name: `${contact.firstName} ${contact.lastName}`,
        company: contact.companyName,
        email: contact.email
      }
    })
  })

  if (!response.ok) {
    throw new Error(`AI generation failed: ${response.statusText}`)
  }

  const result = await response.json()
  const generatedBody = result.optimizedContent || result.content
  const subject = result.subject || execution.metadata?.subject || 'Message from Nodal Point'

  // Insert into CRM 'emails' table for visibility in "Uplink Out"
  const emailId = crypto.randomUUID()
  await sql`
    INSERT INTO emails (
      id, "contactId", "accountId", "from", "to", subject, html, status, type, "ownerId", metadata
    ) VALUES (
      ${emailId},
      ${contact.id},
      ${ctx.member.accountId || null},
      ${owner.email},
      ${JSON.stringify({ email: contact.email, name: `${contact.firstName} ${contact.lastName}` })},
      ${subject},
      ${generatedBody},
      'pending',
      'scheduled',
      ${owner.email},
      ${JSON.stringify({
    execution_id: execution.id,
    member_id: ctx.member.id,
    sequence_id: execution.sequence_id,
    is_uplink_out: true
  })}
    )
  `

  // Update execution with generated content and the email record ID
  await sql`
    UPDATE sequence_executions
    SET 
      metadata = metadata || ${JSON.stringify({
    body: generatedBody,
    subject: subject,
    crm_email_id: emailId
  })},
      status = 'pending_send',
      updated_at = NOW()
    WHERE id = ${execution.id}
  `
}

/**
 * Stage 2: Execution (Sending Email or Creating Task)
 */
async function handleExecution(ctx: any) {
  const { execution, contact, owner } = ctx
  const { step_type } = execution

  // Check if scheduled_at is in the past
  if (new Date(execution.scheduled_at) > new Date()) {
    console.log('[HandleExecution] Step scheduled for future:', execution.scheduled_at)
    return
  }

  // Update status to processing
  await sql`UPDATE sequence_executions SET status = 'processing', updated_at = NOW() WHERE id = ${execution.id}`

  if (step_type === 'email') {
    await sendEmail(ctx)
  } else if (['call', 'linkedin', 'recon'].includes(step_type)) {
    await createTask(ctx)
  } else {
    // Other types (delay, trigger) - advance immediately
    await sql`SELECT util.advance_sequence_member(${ctx.member.id})`
  }
}

async function sendEmail(ctx: any) {
  const { execution, contact, owner } = ctx
  console.log('[SendEmail] Delivering via Zoho to:', contact.email)

  const payload = {
    to: { email: contact.email, name: `${contact.firstName} ${contact.lastName}` },
    from: { email: owner.email, name: owner.name },
    subject: execution.metadata?.subject || 'Message from Nodal Point',
    html: execution.metadata?.body || '',
    trackClicks: true,
    trackOpens: true,
    email_id: execution.metadata?.crm_email_id, // Pass existing CRM record ID
    metadata: { execution_id: execution.id, member_id: ctx.member.id }
  }

  const endpoint = `${API_BASE_URL}/api/email/zoho-send-sequence`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`Email sending failed: ${await response.text()}`)
  }

  const result = await response.json()

  // Calculate wait_until for no-reply branch (default 3 days if not specified)
  const waitDays = execution.metadata?.wait_days || 3
  const waitUntil = new Date()
  waitUntil.setDate(waitUntil.getDate() + waitDays)

  // Move to waiting state
  await sql`
    UPDATE sequence_executions
    SET 
      status = 'waiting',
      metadata = metadata || ${JSON.stringify({ messageId: result.messageId, sentAt: new Date().toISOString() })},
      wait_until = ${waitUntil.toISOString()},
      updated_at = NOW()
    WHERE id = ${execution.id}
  `
}

async function createTask(ctx: any) {
  const { execution, contact, owner } = ctx
  console.log('[CreateTask] Creating manual step:', execution.step_type)

  const titleMap: any = {
    call: `📞 Call: ${contact.firstName} (${contact.companyName || 'Unknown'})`,
    linkedin: `🔗 LinkedIn: ${contact.firstName} ${contact.lastName}`,
    recon: `🔍 Recon: ${contact.companyName || 'Research target'}`
  }

  const taskId = crypto.randomUUID()

  await sql`
    INSERT INTO tasks (
      id, title, description, status, priority, "contactId", "accountId", "ownerId", metadata
    ) VALUES (
      ${taskId},
      ${titleMap[execution.step_type] || 'Sequence Task'},
      ${execution.metadata?.prompt || 'Manual follow-up required'},
      'pending',
      'high',
      ${contact.id},
      ${ctx.member.accountId || null},
      ${owner.email},
      ${JSON.stringify({ execution_id: execution.id, member_id: ctx.member.id, sequence_id: execution.sequence_id })}
    )
  `

  // We leave the execution in 'processing' status. 
  // A trigger or separate sync should call util.advance_sequence_member when taskId is completed.
}

function catchUnload() {
  return new Promise((reject) => {
    addEventListener('beforeunload', (ev: any) => {
      reject(new Error(ev.detail?.reason))
    })
  })
}
