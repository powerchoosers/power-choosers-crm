import type { NextApiRequest, NextApiResponse } from 'next'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { BILL_MAX_BYTES } from '@/lib/portal/server'
import { tokenFromRecipient } from '@/lib/portal/intake'
import { discardBill, ingestBill, BillRejected } from '@/lib/portal/bills'

/**
 * Resend inbound webhook for automatic bill intake.
 *
 * A client (or their supplier's e-bill system) emails a bill to the account's own
 * address, bills-<token>@BILL_INBOUND_DOMAIN. Resend calls this route; we verify the
 * signature, find the account by the token, fetch the attachments from Resend, and
 * file each PDF or image that turns out to be an electricity bill.
 *
 * Needs: BILL_INBOUND_DOMAIN, BILL_INBOUND_WEBHOOK_SECRET (whsec_...), RESEND_API_KEY
 * (full access; a send-only key cannot read received mail).
 * This Resend account is shared with other products, so mail for other domains is ignored.
 */

export const config = { api: { bodyParser: false }, maxDuration: 60 }

const MAX_BODY_BYTES = 256 * 1024
const MAX_ATTACHMENTS = 5
const ATTACHMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'])
const DOWNLOAD_HOSTS = new Set(['inbound-cdn.resend.com', 'cdn.resend.com', 'cdn.resend.app'])

interface InboundEvent {
  type?: string
  data?: {
    email_id?: string
    from?: string
    to?: string[]
    cc?: string[]
    received_for?: string[]
  }
}

interface ReceivedEmail {
  id: string
  from: string
  to: string[]
  attachments?: Array<{ id: string; filename?: string; content_type?: string; content_disposition?: string; size?: number }>
}

async function rawBody(req: NextApiRequest): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
    size += part.length
    if (size > MAX_BODY_BYTES) return null
    chunks.push(part)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Svix signing protocol: HMAC-SHA256 over "id.timestamp.payload", 5 minute tolerance. */
function verifySignature(payload: string, req: NextApiRequest, secret: string): boolean {
  const id = String(req.headers['svix-id'] || '')
  const timestamp = String(req.headers['svix-timestamp'] || '')
  const signatures = String(req.headers['svix-signature'] || '')
  if (!id || !/^\d+$/.test(timestamp) || !secret.startsWith('whsec_')) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const key = Buffer.from(secret.slice(6), 'base64')
  if (!key.length) return false
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest()
  return signatures.split(/\s+/).some((signature) => {
    const [version, value] = signature.split(',')
    if (version !== 'v1' || !value) return false
    const actual = Buffer.from(value, 'base64')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

async function resendApi<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Resend API ${response.status}`)
  return (await response.json()) as T
}

/** Only fetch download links that Resend's own API returned, from Resend's own hosts. */
async function downloadAttachment(urlValue: string): Promise<Uint8Array> {
  const url = new URL(urlValue)
  if (url.protocol !== 'https:' || url.username || url.password || !DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error('Unsupported attachment host')
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25_000) })
  if (!response.ok) throw new Error('Attachment download failed')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > BILL_MAX_BYTES) throw new BillRejected('Attachment too large')
  return bytes
}

function senderAddress(from: string): string {
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(from) || /([^\s<>]+@[^\s<>]+)/.exec(from)
  return (match?.[1] || '').toLowerCase().slice(0, 200)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.BILL_INBOUND_WEBHOOK_SECRET || ''
  if (!secret || !process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Bill intake is not configured' })

  const payload = await rawBody(req)
  if (payload === null) return res.status(413).json({ error: 'Payload too large' })
  if (!verifySignature(payload, req, secret)) return res.status(401).json({ error: 'Invalid signature' })

  let event: InboundEvent
  try { event = JSON.parse(payload) } catch { return res.status(400).json({ error: 'Invalid JSON' }) }
  if (event.type !== 'email.received' || !event.data?.email_id) return res.status(200).json({ ignored: 'not an inbound email' })

  const recipients = [...(event.data.to || []), ...(event.data.cc || []), ...(event.data.received_for || [])]
  const token = recipients.map(tokenFromRecipient).find(Boolean)
  if (!token) return res.status(200).json({ ignored: 'not a bill intake address' })

  const { data: intakeRows } = await supabaseAdmin
    .from('client_bill_intake')
    .select('account_id, status')
    .eq('address_token', token)
    .limit(1)
  const intake = intakeRows?.[0]
  if (!intake || intake.status !== 'active') return res.status(200).json({ ignored: 'address is not active' })

  // Claim the delivery. A repeat of a finished delivery is acknowledged and skipped.
  const eventId = String(req.headers['svix-id'])
  const { error: claimError } = await supabaseAdmin.from('client_bill_inbound_events').insert({ event_id: eventId, result: 'processing' })
  if (claimError) {
    if (claimError.code !== '23505') return res.status(500).json({ error: 'Could not record delivery' })
    const { data: prior } = await supabaseAdmin.from('client_bill_inbound_events').select('result').eq('event_id', eventId).limit(1)
    if (prior?.[0]?.result !== 'failed') return res.status(200).json({ duplicate: true })
  }

  let filed = 0
  let skipped = 0
  try {
    const email = await resendApi<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(event.data.email_id)}`)
    const sender = senderAddress(email.from || event.data.from || '')
    const attachments = (email.attachments || [])
      .filter((item) => item.content_disposition !== 'inline' && ATTACHMENT_TYPES.has(String(item.content_type || '').toLowerCase().split(';')[0]))
      .slice(0, MAX_ATTACHMENTS)

    for (const attachment of attachments) {
      try {
        const detail = await resendApi<{ download_url: string }>(
          `/emails/receiving/${encodeURIComponent(email.id)}/attachments/${encodeURIComponent(attachment.id)}`
        )
        const bytes = await downloadAttachment(detail.download_url)
        const result = await ingestBill({
          accountId: intake.account_id,
          source: 'email',
          bytes,
          fileName: attachment.filename || 'bill',
          sourceSender: sender,
        })
        if (result.duplicate) { skipped += 1; continue }
        // Anyone can email this address. Keep only what reads as an electricity bill.
        const { data: rows } = await supabaseAdmin.from('client_bills').select('extracted').eq('id', result.billId).limit(1)
        const facts = (rows?.[0]?.extracted as { facts?: { isElectricityBill?: boolean } } | null)?.facts
        if (facts && facts.isElectricityBill === false) {
          await discardBill(result.billId)
          skipped += 1
        } else {
          filed += 1
        }
      } catch (err) {
        if (err instanceof BillRejected) { skipped += 1; continue }
        throw err
      }
    }

    if (filed > 0) {
      await supabaseAdmin
        .from('client_bill_intake')
        .update({ last_received_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('account_id', intake.account_id)
    }
    await supabaseAdmin.from('client_bill_inbound_events').update({ result: `filed:${filed} skipped:${skipped}` }).eq('event_id', eventId)
    return res.status(200).json({ filed, skipped })
  } catch (err) {
    console.error('[Bill Inbound] Failed:', err instanceof Error ? err.message : err)
    await supabaseAdmin.from('client_bill_inbound_events').update({ result: 'failed' }).eq('event_id', eventId)
    // A non-2xx answer makes Resend deliver again; the same files are deduplicated by hash.
    return res.status(500).json({ error: 'Intake failed' })
  }
}
