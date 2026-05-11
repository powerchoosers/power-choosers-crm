export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

import crypto from 'crypto'
import { cors } from '../_cors.js'
import { supabaseAdmin } from '@/lib/supabase'
import logger from '../_logger.js'
import { requireUser } from '@/lib/supabase'

function normalizeList(value) {
  const arr = Array.isArray(value) ? value : String(value || '').split(',')
  return arr.map((item) => String(item || '').trim()).filter(Boolean)
}

export default async function handler(req, res) {
  if (cors(req, res)) return
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const auth = await requireUser(req)
  if (!auth?.user?.email) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const {
      id: bodyId = null,
      to,
      cc,
      bcc,
      subject,
      content,
      html,
      plainTextContent,
      from,
      fromName,
      contactId = null,
      accountId = null,
      contactName = null,
      contactCompany = null,
      scheduledSendTime,
      attachments = [],
      metadata = {},
    } = body
    const headerEditId = req.headers['x-email-id']
    const editId = String(bodyId || headerEditId || '').trim() || null

    const sendAt = new Date(String(scheduledSendTime || '')).toISOString()
    if (!to || !subject || !(content || html)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing required fields' }))
      return
    }

    const id = editId || crypto.randomUUID()
    const nowIso = new Date().toISOString()
    const payload = {
      id,
      to: normalizeList(to),
      cc: normalizeList(cc),
      bcc: normalizeList(bcc),
      subject,
      html: html || content,
      text: plainTextContent || String(content || html || ''),
      from: from || auth.user.email,
      status: 'scheduled',
      type: 'scheduled',
      is_read: true,
      is_starred: false,
      is_deleted: false,
      scheduledSendTime: sendAt,
      timestamp: sendAt,
      sentAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      contactId,
      accountId,
      ownerId: auth.user.email,
      metadata: {
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        source: 'manual_schedule',
        scheduler: 'supabase_cron',
        scheduledBy: auth.user.email,
        contactName,
        contactCompany,
        fromName: fromName || null,
        attachments,
      }
    }

    const { data, error } = await supabaseAdmin.from('emails').upsert(payload, { onConflict: 'id' }).select().single()
    if (error) throw error

    logger.info(`[Schedule Email] Scheduled ${subject} for ${sendAt}`, 'schedule-send')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, email: data }))
  } catch (error) {
    logger.error('[Schedule Email] Error:', error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: error.message || 'Failed to schedule email' }))
  }
}
