/**
 * Process Sequence Step Edge Function
 * 
 * This function processes sequence steps from the queue, sending emails via MailerSend
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

// Job schema from queue
const jobSchema = z.object({
  jobId: z.number(),
  execution_id: z.string(),
  sequence_id: z.string(),
  member_id: z.string(),
  step_index: z.number(),
  step_type: z.string(),
  metadata: z.record(z.any()).optional()
})

const failedJobSchema = jobSchema.extend({
  error: z.string()
})

type Job = z.infer<typeof jobSchema>
type FailedJob = z.infer<typeof failedJobSchema>

const QUEUE_NAME = 'sequence_jobs'
const API_BASE_URL = Deno.env.get('API_BASE_URL') || 'https://nodal-point-network-792458658491.us-central1.run.app'

// Listen for HTTP requests
Deno.serve(async (req) => {
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
})

/**
 * Processes a sequence step job
 */
async function processJob(job: Job) {
  const { jobId, execution_id, sequence_id, member_id, step_type, metadata } = job
  
  console.log('[ProcessJob] Starting:', { execution_id, step_type })
  
  // Fetch execution details
  const [execution]: any[] = await sql`
    SELECT
      se.id,
      se.sequence_id,
      se.member_id,
      se.step_index,
      se.step_type,
      se.status,
      se.metadata,
      se.retry_count,
      sm."targetId" as contact_id,
      sm."targetType" as target_type
    FROM sequence_executions se
    JOIN sequence_members sm ON sm.id = se.member_id
    WHERE se.id = ${execution_id}
  `
  
  if (!execution) {
    throw new Error(`Execution not found: ${execution_id}`)
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
 * Process email step - send email via MailerSend
 */
async function processEmailStep(execution: any) {
  const { id, contact_id, metadata } = execution
  
  console.log('[ProcessEmail] Fetching contact:', { contact_id })
  
  // Fetch contact details
  const [contact]: any[] = await sql`
    SELECT 
      id, 
      email,
      "firstName",
      "lastName",
      "companyName"
    FROM contacts
    WHERE id = ${contact_id}
  `
  
  if (!contact || !contact.email) {
    throw new Error(`Contact not found or has no email: ${contact_id}`)
  }
  
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
  
  console.log('[ProcessEmail] Sending email:', {
    to: contact.email,
    subject,
    bodyLength: htmlBody.length
  })
  
  // Send email via MailerSend API through our backend
  const response = await fetch(`${API_BASE_URL}/api/mailersend/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: {
        email: contact.email,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      },
      from: {
        email: 'hello@nodalpoint.io',
        name: 'Nodal Point'
      },
      subject,
      html: htmlBody,
      tags: ['sequence', `sequence_${execution.sequence_id}`],
      trackClicks: true,
      trackOpens: true
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`MailerSend API error: ${response.status} - ${errorText}`)
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
