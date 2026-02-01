// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'npm:zod'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// Initialize Gemini client
const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('FREE_GEMINI_KEY')
if (!apiKey) {
  console.warn('GEMINI_API_KEY not set')
}
const genAI = new GoogleGenerativeAI(apiKey || '')
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })

// Initialize Postgres client
const connectionString = Deno.env.get('SUPABASE_DB_URL')!
const sql = postgres(connectionString)

const jobSchema = z.object({
  jobId: z.number(),
  id: z.string(), // Changed to string to match Nodal Point CRM schema (Firebase IDs)
  schema: z.string(),
  table: z.string(),
  contentFunction: z.string(),
  embeddingColumn: z.string(),
})

const failedJobSchema = jobSchema.extend({
  error: z.string(),
})

type Job = z.infer<typeof jobSchema>
type FailedJob = z.infer<typeof failedJobSchema>
type Row = {
  id: string
  content: unknown
}

const QUEUE_NAME = 'embedding_jobs'

Deno.serve(async (req) => {
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
      status: 400,
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
        console.error(`Job ${currentJob.jobId} failed:`, error)
        failedJobs.push({
          ...currentJob,
          error: error instanceof Error ? error.message : JSON.stringify(error),
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
        error: error instanceof Error ? error.message : JSON.stringify(error),
      }))
    )
  }

  console.log('finished processing jobs:', {
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
  })

  return new Response(
    JSON.stringify({
      completedJobs,
      failedJobs,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-completed-jobs': completedJobs.length.toString(),
        'x-failed-jobs': failedJobs.length.toString(),
      },
    }
  )
})

async function generateEmbedding(text: string) {
  if (!text) return null
  // Clean and truncate text if necessary (Gemini has a large window but good to be safe)
  const cleanText = text.trim().slice(0, 9000)
  
  try {
    const result = await model.embedContent(cleanText)
    return result.embedding.values
  } catch (e) {
    throw new Error(`Gemini Embedding Error: ${e.message}`)
  }
}

async function processJob(job: Job) {
  const { jobId, id, schema, table, contentFunction, embeddingColumn } = job

  // Fetch content
  const [row] = await sql`
    select
      id,
      ${sql(contentFunction)}(t) as content
    from
      ${sql(schema)}.${sql(table)} t
    where
      id = ${id}
  `

  if (!row) {
    // Row might have been deleted before job processing
    console.warn(`Row not found: ${schema}.${table}/${id}, removing job`)
    await sql`select pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`
    return
  }

  if (typeof row.content !== 'string') {
    throw new Error(`invalid content - expected string: ${schema}.${table}/${id}`)
  }

  const embedding = await generateEmbedding(row.content)

  // Update table
  await sql`
    update
      ${sql(schema)}.${sql(table)}
    set
      ${sql(embeddingColumn)} = ${JSON.stringify(embedding)}
    where
      id = ${id}
  `

  // Delete job from queue
  await sql`
    select pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)
  `
}

function catchUnload() {
  return new Promise((reject) => {
    addEventListener('beforeunload', (ev: any) => {
      reject(new Error(ev.detail?.reason))
    })
  })
}
