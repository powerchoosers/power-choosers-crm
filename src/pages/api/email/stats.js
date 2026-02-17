// Vercel API endpoint for email statistics
import { cors } from '../_cors.js';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { trackingId, _deliverability } = req.query;

    if (!trackingId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing trackingId parameter' }));
      return;
    }

    // Get deliverability settings (default to enabled if not provided)
    const deliverabilitySettings = _deliverability ? JSON.parse(_deliverability) : {
      enableTracking: true,
      includeBulkHeaders: false,
      includeListUnsubscribe: false,
      includePriorityHeaders: false,
      forceGmailOnly: true,
      useBrandedHtmlTemplate: false,
      signatureImageEnabled: true
    };

    // If tracking is disabled, return empty stats
    if (!deliverabilitySettings.enableTracking) {
      logger.log('[Email] Tracking disabled by settings, returning empty stats:', trackingId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        trackingId,
        openCount: 0,
        replyCount: 0,
        lastOpened: null,
        lastReplied: null,
        opens: [],
        replies: [],
        trackingDisabled: true
      }));
    }

    // Fetch email stats from Supabase if available
    let stats = {
      trackingId,
      openCount: 0,
      replyCount: 0,
      lastOpened: null,
      lastReplied: null,
      opens: [],
      replies: []
    };

    if (supabaseAdmin) {
      try {
        const { data: emailData, error: fetchError } = await supabaseAdmin
          .from('emails')
          .select('*')
          .eq('id', trackingId)
          .single();

        if (!fetchError && emailData) {
          stats = {
            trackingId,
            openCount: emailData.openCount || 0,
            replyCount: emailData.replyCount || 0,
            lastOpened: emailData.metadata?.lastOpened || emailData.lastOpened || null,
            lastReplied: emailData.metadata?.lastReplied || emailData.lastReplied || null,
            opens: emailData.opens || [],
            replies: emailData.replies || [],
            status: emailData.status || 'unknown',
            sentAt: emailData.metadata?.sentAt || emailData.sentAt || null,
            subject: emailData.subject || '',
            to: emailData.to || []
          };
        } else {
          logger.log('[Email] Email document not found:', trackingId);
        }
      } catch (dbError) {
        logger.error('[Email] Supabase fetch error:', dbError);
        // Return default stats if DB fails
      }
    } else {
      logger.warn('[Email] Supabase not available, returning default stats');
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;

  } catch (error) {
    logger.error('[Email] Stats error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch email stats', message: error.message }));
    return;
  }
}
