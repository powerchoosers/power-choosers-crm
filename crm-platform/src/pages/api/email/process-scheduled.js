import { supabaseAdmin } from '@/lib/supabase'
import { getBurnerFromEmail } from '@/lib/burner-email'
import logger from '../_logger.js'
import { ZohoMailService } from './zoho-service.js'

function hasUnresolvedTemplateVariables(value) {
  return /\{\{\s*[^}]+\s*\}\}/.test(String(value || ''))
}

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
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 8, 25))
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
        const isSequenceEmail = row.metadata?.source === 'sequence' || row.metadata?.isSequenceEmail === true || String(row.id || '').startsWith('seq_exec_')
        const rawHtml = row.html || row.content || ''
        const rawText = row.text || ''
        const rawSubject = row.subject || 'Scheduled email'
        if (hasUnresolvedTemplateVariables(rawHtml) || hasUnresolvedTemplateVariables(rawText) || hasUnresolvedTemplateVariables(rawSubject)) {
          const failureAt = new Date().toISOString()
          await supabaseAdmin.from('emails').update({
            status: isSequenceEmail ? 'awaiting_generation' : 'failed',
            updatedAt: failureAt,
            metadata: {
              ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
              needsGeneration: isSequenceEmail,
              failedAt: failureAt,
              failureReason: 'Blocked scheduled send with unresolved template variables',
            },
          }).eq('id', row.id)
          results.push({ id: row.id, status: 'blocked', reason: 'unresolved_template_variables' })
          continue
        }

        const ownerEmail = row.from || row.ownerId || row.metadata?.scheduledBy || ''
        const sendFrom = isSequenceEmail ? getBurnerFromEmail(ownerEmail) : (row.from || ownerEmail)
        const sendResult = await zohoService.sendEmail({
          to: sendTo.join(','),
          subject: rawSubject,
          html: rawHtml || undefined,
          text: rawText || undefined,
          userEmail: sendFrom,
          from: sendFrom,
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
            source: isSequenceEmail ? 'sequence' : 'manual_schedule',
            scheduler: 'supabase_cron',
            isSequenceEmail,
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
