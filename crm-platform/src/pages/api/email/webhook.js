// Vercel API endpoint for email webhooks
import { cors } from '../_cors.js';
import { supabaseAdmin } from '../_supabase.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { event, trackingId, data, _deliverability } = req.body;

    logger.log('[Email] Webhook received:', { event, trackingId, data });

    // Get deliverability settings (default to enabled if not provided)
    const deliverabilitySettings = _deliverability || {
      enableTracking: true,
      includeBulkHeaders: false,
      includeListUnsubscribe: false,
      includePriorityHeaders: false,
      forceGmailOnly: true,
      useBrandedHtmlTemplate: false,
      signatureImageEnabled: true
    };

    // If tracking is disabled, don't process webhook events
    if (!deliverabilitySettings.enableTracking) {
      logger.log('[Email] Tracking disabled by settings, ignoring webhook:', trackingId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Tracking disabled' }));
      return;
    }

    if (!supabaseAdmin) {
      logger.error('[Email] Supabase client not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return;
    }

    // Fetch the email record first to get current data
    const { data: emailRecord, error: fetchError } = await supabaseAdmin
      .from('emails')
      .select('*')
      .eq('id', trackingId)
      .single();

    if (fetchError || !emailRecord) {
      logger.warn('[Email] Email record not found for webhook:', trackingId);
      // Return 200 to prevent webhook retries for missing records
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Record not found' }));
      return;
    }

    const currentMetadata = emailRecord.metadata || {};

    // Handle different webhook events
    switch (event) {
      case 'email_opened':
        logger.log('[Email] Email opened:', trackingId);
        
        const newOpen = {
          openedAt: new Date().toISOString(),
          userAgent: data?.userAgent || '',
          ip: data?.ip || '',
          referer: data?.referer || ''
        };

        const currentOpens = Array.isArray(emailRecord.opens) ? emailRecord.opens : [];
        
        await supabaseAdmin
          .from('emails')
          .update({
            opens: [...currentOpens, newOpen],
            openCount: (emailRecord.openCount || 0) + 1,
            updatedAt: new Date().toISOString(),
            metadata: {
              ...currentMetadata,
              lastOpened: new Date().toISOString()
            }
          })
          .eq('id', trackingId);
          
        logger.log('[Email] Successfully updated Supabase with open event');
        break;

      case 'email_replied':
        logger.log('[Email] Email replied:', trackingId);
        
        const newReply = {
          repliedAt: new Date().toISOString(),
          replyContent: data?.content || '',
          from: data?.from || ''
        };

        const currentReplies = Array.isArray(currentMetadata.replies) ? currentMetadata.replies : [];
        const currentReplyCount = typeof currentMetadata.replyCount === 'number' ? currentMetadata.replyCount : 0;

        await supabaseAdmin
          .from('emails')
          .update({
            updatedAt: new Date().toISOString(),
            metadata: {
              ...currentMetadata,
              replies: [...currentReplies, newReply],
              replyCount: currentReplyCount + 1,
              lastReplied: new Date().toISOString()
            }
          })
          .eq('id', trackingId);
          
        logger.log('[Email] Successfully updated Supabase with reply event');
        break;

      case 'email_bounced':
        logger.log('[Email] Email bounced:', trackingId);
        
        await supabaseAdmin
          .from('emails')
          .update({
            status: 'bounced',
            updatedAt: new Date().toISOString(),
            metadata: {
              ...currentMetadata,
              bounceReason: data?.reason || 'Unknown',
              bouncedAt: new Date().toISOString()
            }
          })
          .eq('id', trackingId);
          
        logger.log('[Email] Successfully updated Supabase with bounce event');
        break;

      default:
        logger.log('[Email] Unknown webhook event:', event);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;

  } catch (error) {
    logger.error('[Email] Webhook error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to process webhook', message: error.message }));
    return;
  }
}
