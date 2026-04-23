import { supabaseAdmin } from '@/lib/supabase'
import logger from '../_logger.js'
import { ZohoMailService } from './zoho-service.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const cronSecret = req.headers['x-cron-secret']
  if (cronSecret !== 'nodal-cron-2026') {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 25, 100))
    const nowIso = new Date().toISOString()

    const { data: dueRows, error } = await supabaseAdmin
      .from('emails')
      .select('*')
      .eq('type', 'scheduled')
      .eq('status', 'scheduled')
      .lte('scheduledSendTime', nowIso)
      .order('scheduledSendTime', { ascending: true })
      .limit(limit)

    if (error) throw error

    const rows = Array.isArray(dueRows) ? dueRows : []
    const results = []
    const zohoService = new ZohoMailService()

    for (const row of rows) {
      const to = Array.isArray(row.to) ? row.to : JSON.parse(JSON.stringify(row.to || []))
      const sendTo = Array.isArray(to) ? to.filter(Boolean) : [String(to || '')].filter(Boolean)
      if (!sendTo.length) {
        results.push({ id: row.id, status: 'skipped', reason: 'missing_recipient' })
        continue
      }

      try {
        const ownerEmail = row.from || row.ownerId || row.metadata?.scheduledBy || ''
        const rawHtml = row.html || row.content || ''
        const rawText = row.text || ''
        const sendResult = await zohoService.sendEmail({
          to: sendTo.join(','),
          subject: row.subject || 'Scheduled email',
          html: rawHtml || undefined,
          text: rawText || undefined,
          userEmail: ownerEmail,
          from: row.from || ownerEmail,
          fromName: row.metadata?.fromName || undefined,
        })

        const sentAt = new Date().toISOString()
        await supabaseAdmin.from('emails').update({
          status: 'sent',
          type: 'sent',
          sentAt,
          timestamp: sentAt,
          updatedAt: sentAt,
          metadata: {
            ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
            source: 'manual_schedule',
            scheduler: 'supabase_cron',
            sentAt,
            provider: 'zoho',
            messageId: sendResult?.messageId || null,
          },
        }).eq('id', row.id)

        results.push({ id: row.id, status: 'sent', messageId: sendResult?.messageId || null })
      } catch (sendError) {
        const failureAt = new Date().toISOString()
        await supabaseAdmin.from('emails').update({
          status: 'failed',
          updatedAt: failureAt,
          metadata: {
            ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
            source: 'manual_schedule',
            scheduler: 'supabase_cron',
            failedAt: failureAt,
            failureReason: sendError?.message || 'Failed to send scheduled email',
          },
        }).eq('id', row.id)

        results.push({ id: row.id, status: 'failed', error: sendError?.message || 'Failed to send' })
      }
    }

    logger.info(`[Process Scheduled Emails] processed=${results.length}`, 'process-scheduled-emails')
    res.status(200).json({ success: true, processed: results.length, results })
  } catch (error) {
    logger.error('[Process Scheduled Emails] Error:', error)
    res.status(500).json({ error: error.message || 'Failed to process scheduled emails' })
  }
}
