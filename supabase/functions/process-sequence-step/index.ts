/**
 * Process Sequence Step Edge Function
 * 
 * This function processes sequence steps from the queue, sending emails via Gmail API
 * and handling delays, retries, and step completion tracking.
 */

// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// Initialize Postgres client
const sql = postgres(
  Deno.env.get('SUPABASE_DB_URL')!
)

// Job schema from queue (permissive metadata for pgmq payload)
const jobSchema = z.object({
  jobId: z.number(),
  execution_id: z.string(),
  sequence_id: z.string(),
  member_id: z.string(),
  step_index: z.number(),
  step_type: z.string(),
  metadata: z.any().optional()
})

const failedJobSchema = jobSchema.extend({
  error: z.string()
})

type Job = z.infer<typeof jobSchema>
type FailedJob = z.infer<typeof failedJobSchema>

const QUEUE_NAME = 'sequence_jobs'
const API_BASE_URL = Deno.env.get('API_BASE_URL') || 'https://nodal-point-network.vercel.app'
/** Burner domain for cold/sequence emails (e.g. getnodalpoint.com). From address = localPart@BURNER_DOMAIN. */
const BURNER_DOMAIN = Deno.env.get('BURNER_DOMAIN') || 'getnodalpoint.com'

/** Derive burner from address from owner email: l.patterson@nodalpoint.io -> l.patterson@getnodalpoint.com */
function burnerFromAddress(ownerEmail: string | null | undefined): string {
  if (!ownerEmail || typeof ownerEmail !== 'string') return `hello@${BURNER_DOMAIN}`
  const at = ownerEmail.indexOf('@')
  const localPart = at > 0 ? ownerEmail.slice(0, at).trim() : 'hello'
  return `${localPart}@${BURNER_DOMAIN}`
}

// Listen for HTTP requests
Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('expected POST request', { status: 405 })
    }

    if (req.headers.get('content-type') !== 'application/json') {
      return new Response('expected json body', { status: 400 })
    }

    // Use Zod to parse and validate the request body
    const parseResult = z.array(jobSchema).safeParse(await req.json())
    if (parseResult.error) {
      return new Response(`invalid request body: ${parseResult.error.message}`, {
        status: 400
      })
    }

    const pendingJobs = parseResult.data

    // Track jobs that completed successfully
    const completedJobs: Job[] = []
    // Track jobs that failed due to an error
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
      // Process jobs while listening for worker termination
      await Promise.race([processJobs(), catchUnload()])
    } catch (error) {
      // If the worker is terminating, add pending jobs to fail list
      failedJobs.push(
        ...pendingJobs.map((job) => ({
          ...job,
          error: error instanceof Error ? error.message : JSON.stringify(error)
        }))
      )
    }

    // Log completed and failed jobs
    console.log('finished processing sequence steps:', {
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length
    })

    return new Response(
      JSON.stringify({
        completedJobs,
        failedJobs
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-completed-jobs': completedJobs.length.toString(),
          'x-failed-jobs': failedJobs.length.toString()
        }
      }
    )
  } catch (topError) {
    const msg = topError instanceof Error ? topError.message : String(topError)
    const stack = topError instanceof Error ? topError.stack : ''
    console.error('[process-sequence-step] top-level error:', msg, stack)
    return new Response(
      JSON.stringify({ error: msg, stack: stack?.slice(0, 500) }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
})

/**
 * Processes a sequence step job
 */
async function processJob(job: Job) {
  const { jobId, execution_id, sequence_id, member_id, step_type, metadata } = job

  console.log('[ProcessJob] Starting:', { execution_id, step_type })

  // Fetch execution details
  const [execRow]: any[] = await sql`
    SELECT id, sequence_id, member_id, step_index, step_type, status, metadata, retry_count
    FROM sequence_executions
    WHERE id = ${execution_id}
  `
  if (!execRow) {
    throw new Error(`Execution not found: ${execution_id}`)
  }
  const [memberRow]: any[] = await sql`
    SELECT "targetId", "targetType" FROM sequence_members WHERE id = ${execRow.member_id}
  `
  if (!memberRow) {
    throw new Error(`Sequence member not found: ${execRow.member_id}`)
  }
  const execution = {
    ...execRow,
    contact_id: (memberRow as any).targetId ?? (memberRow as any).targetid,
    target_type: (memberRow as any).targetType ?? (memberRow as any).targettype
  }

  // Update execution status to processing
  await sql`
    UPDATE sequence_executions
    SET 
      status = 'processing',
      executed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${execution_id}
  `

  try {
    // Process based on step type
    switch (step_type) {
      case 'email':
        await processEmailStep(execution)
        break
      case 'delay':
        await processDelayStep(execution)
        break
      case 'call':
      case 'linkedin':
      case 'recon':
      case 'trigger':
        // These types are not automated yet - mark as skipped
        await sql`
          UPDATE sequence_executions
          SET 
            status = 'skipped',
            completed_at = NOW(),
            updated_at = NOW(),
            error_message = 'Step type not automated yet'
          WHERE id = ${execution_id}
        `
        break
      default:
        throw new Error(`Unknown step type: ${step_type}`)
    }

    // Mark as completed
    await sql`
      UPDATE sequence_executions
      SET 
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${execution_id}
    `

    // Delete from queue
    await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`

    console.log('[ProcessJob] Completed:', { execution_id, step_type })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
    const retryCount = (execution.retry_count || 0) + 1
    const maxRetries = 3

    console.error('[ProcessJob] Failed:', { execution_id, error: errorMessage, retryCount })

    // Update execution with error
    await sql`
      UPDATE sequence_executions
      SET 
        status = ${retryCount >= maxRetries ? 'failed' : 'pending'},
        error_message = ${errorMessage},
        retry_count = ${retryCount},
        updated_at = NOW()
      WHERE id = ${execution_id}
    `

    // If max retries reached, delete from queue
    if (retryCount >= maxRetries) {
      await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`
    }

    throw error
  }
}

/**
 * Process email step - send email via Gmail API
 */
async function processEmailStep(execution: any) {
  const { id, contact_id, metadata, sequence_id } = execution

  // Resolve sender: sequence owner email -> actual user email + display name (e.g. Lewis | Nodal Point)
  // Also fetch bgvector to check for explicit sender identity
  const [seqRow]: any[] = await sql`
    SELECT "ownerId", bgvector FROM sequences WHERE id = ${sequence_id}
  `
  const ownerEmail = seqRow?.ownerId ?? (seqRow as any)?.ownerid
  const bgvector = seqRow?.bgvector ?? (seqRow as any)?.bgvector ?? {}

  // 1. explicit sender from protocol settings
  // 2. owner email
  // 3. fallback
  const settingsSender = bgvector?.settings?.senderEmail
  const fromEmail = settingsSender || ownerEmail || 'noreply@nodalpoint.io'

  let fromName = 'Nodal Point'
  if (fromEmail) {
    // Try to find user by the sending email to get their name
    const [userRow]: any[] = await sql`
      SELECT first_name, last_name FROM users WHERE email = ${fromEmail}
    `
    const firstName = (userRow as any)?.first_name
    const lastName = (userRow as any)?.last_name

    if (firstName && String(firstName).trim()) {
      fromName = `${String(firstName).trim()} | Nodal Point`
    }
  }

  console.log('[ProcessEmail] Fetching contact:', { contact_id, fromEmail, fromName, usingSettings: !!settingsSender })

  // Fetch contact details
  const [contactRow]: any[] = await sql`
    SELECT id, email, "firstName", "lastName", "accountId"
    FROM contacts
    WHERE id = ${contact_id}
  `
  if (!contactRow || !contactRow.email) {
    throw new Error(`Contact not found or has no email: ${contact_id}`)
  }
  let companyName = ''
  if (contactRow.accountId) {
    const accountRows: any[] = await sql`
      SELECT name FROM accounts WHERE id = ${contactRow.accountId}
    `
    companyName = accountRows[0]?.name ?? ''
  }
  const contact = { ...contactRow, companyName }

  // Extract email details from metadata
  const subject = metadata?.subject || 'Message from Nodal Point'
  const body = metadata?.body || metadata?.html || ''
  const prompt = metadata?.prompt || ''

  // If we have a prompt, we should generate the email body using AI
  // For now, we'll use the body directly
  let htmlBody = body

  // Replace variables in the email body
  htmlBody = htmlBody
    .replace(/\{\{first_name\}\}/g, contact.firstName || '')
    .replace(/\{\{last_name\}\}/g, contact.lastName || '')
    .replace(/\{\{company_name\}\}/g, contact.companyName || '')
  const textBody = htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  console.log('[ProcessEmail] Sending email:', {
    to: contact.email,
    from: fromEmail,
    subject,
    bodyLength: htmlBody.length
  })

  // Prepare payload for Zoho Sequence API
  // Note: zoho-send-sequence expects 'from' to be the userEmail/sender, 
  // and it will derive the 'userEmail' from field for token lookup.
  const payload = {
    to: {
      email: contact.email,
      name: `${(contact.firstName || '').trim()} ${(contact.lastName || '').trim()}`.trim() || contact.email
    },
    from: {
      email: fromEmail,
      name: fromName
    },
    subject: subject || 'Message from Nodal Point',
    html: htmlBody || undefined,
    text: textBody || htmlBody || 'No content',
    tags: ['sequence', `sequence_${execution.sequence_id}`],
    trackClicks: true,
    trackOpens: true
  }

  // Send email via Zoho API through our backend
  // Switched from gmail-send-sequence to zoho-send-sequence
  const endpoint = `${API_BASE_URL}/api/email/zoho-send-sequence`
  console.log('[ProcessEmail] Posting to:', endpoint)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Email API error (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  console.log('[ProcessEmail] Email sent:', result)

  // Update execution metadata with send result
  await sql`
    UPDATE sequence_executions
    SET 
      metadata = metadata || ${JSON.stringify({
    messageId: result.messageId,
    sentAt: new Date().toISOString()
  })},
      updated_at = NOW()
    WHERE id = ${id}
  `
}

/**
 * Process delay step - these are just markers, nothing to do
 */
async function processDelayStep(execution: any) {
  console.log('[ProcessDelay] Delay step completed:', { execution_id: execution.id })
  // Delay steps don't require any action - they just mark time
  // The scheduling is handled by the scheduled_at timestamp
}

/**
 * Returns a promise that rejects if the worker is terminating
 */
function catchUnload() {
  return new Promise((reject) => {
    addEventListener('beforeunload', (ev: any) => {
      reject(new Error(ev.detail?.reason))
    })
  })
}
