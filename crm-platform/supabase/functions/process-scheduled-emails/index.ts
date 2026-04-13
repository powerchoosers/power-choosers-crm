// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CRON_SECRET = Deno.env.get('SUPABASE_CRON_SECRET') || 'nodal-cron-2026'
const NEXT_BASE_URL = (
  Deno.env.get('PUBLIC_BASE_URL') ||
  Deno.env.get('NEXT_PUBLIC_BASE_URL') ||
  'https://www.nodalpoint.io'
).replace(/\/+$/, '')

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const headerSecret = req.headers.get('x-cron-secret') || ''
  if (headerSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const limit = Number((await req.json().catch(() => ({} as any)))?.limit || 25)

  const response = await fetch(`${NEXT_BASE_URL}/api/email/process-scheduled`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
    },
    body: JSON.stringify({ limit: Math.max(1, Math.min(limit, 100)) }),
  })

  const payload = await response.json().catch(() => ({}))
  return new Response(JSON.stringify(payload), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
