// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

/**
 * Nodal Point Embedding Engine (OpenRouter Version)
 * Decoupled from Google SDK to use standard OpenAI-compatible completions/embeddings
 */

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set in Supabase Secrets')
}
const DB_URL = Deno.env.get('SUPABASE_DB_URL')

const sql = postgres(DB_URL!)

const jobSchema = z.object({
    jobId: z.number(),
    id: z.string(),
    schema: z.string(),
    table: z.string(),
    contentFunction: z.string(),
    embeddingColumn: z.string(),
})

const QUEUE_NAME = 'embedding_jobs'

Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    let body;
    try {
        body = await req.json()
    } catch (e) {
        return new Response('Invalid JSON', { status: 400 })
    }

    const parseResult = z.array(jobSchema).safeParse(body)
    if (!parseResult.success) {
        return new Response(JSON.stringify({ error: 'Invalid job schema', details: parseResult.error }), { status: 400 })
    }

    const jobs = parseResult.data
    const completed = []
    const failed = []

    for (const job of jobs) {
        try {
            await processJob(job)
            completed.push(job)
        } catch (e) {
            console.error(`Job ${job.jobId} failed:`, e)
            failed.push({ ...job, error: e.message })
        }
    }

    return new Response(JSON.stringify({ completed, failed }), {
        headers: { 'Content-Type': 'application/json' }
    })
})

async function processJob(job: z.infer<typeof jobSchema>) {
    const { jobId, id, schema, table, contentFunction, embeddingColumn } = job

    // 1. Get content
    const [row] = await sql`
    SELECT ${sql(contentFunction)}(t) as content 
    FROM ${sql(schema)}.${sql(table)} t 
    WHERE id = ${id}
  `

    if (!row || !row.content) {
        console.warn(`No content found for ${schema}.${table}/${id}`)
        await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`
        return
    }

    // 2. Clear content if it's too long (OpenRouter/OpenAI limit)
    const text = (row.content as string).slice(0, 8000)

    // 3. Get Embedding from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'openai/text-embedding-3-small',
            input: text
        })
    })

    if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`OpenRouter API Error: ${response.status} - ${errorBody}`)
    }

    const result = await response.json()

    if (!result.data || !result.data[0] || !result.data[0].embedding) {
        throw new Error(`Unexpected OpenRouter response format: ${JSON.stringify(result)}`)
    }

    const embedding = result.data[0].embedding

    // 4. Update DB
    await sql`
    UPDATE ${sql(schema)}.${sql(table)}
    SET ${sql(embeddingColumn)} = ${JSON.stringify(embedding)}
    WHERE id = ${id}
  `

    // 5. Cleanup Queue
    await sql`SELECT pgmq.delete(${QUEUE_NAME}, ${jobId}::bigint)`
}
