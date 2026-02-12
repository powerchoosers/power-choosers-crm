/**
 * Gmail API endpoint for sequence emails
 * Matches MailerSend interface for easy migration
 */
import { cors } from '../_cors.js';
import { GmailService } from './gmail-service.js';
import { injectTracking, hasTrackingPixel } from './tracking-helper.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  logger.info(`[Gmail Sequence] Incoming request: ${req.method} ${req.url}`, 'gmail-send-sequence');
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    logger.warn(`[Gmail Sequence] Method not allowed: ${req.method}`, 'gmail-send-sequence');
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Gmail service account validation
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!String(serviceAccountKey || '').trim()) {
    logger.error('[Gmail Sequence] Missing GOOGLE_SERVICE_ACCOUNT_KEY', 'gmail-send-sequence');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing Gmail service account key' }));
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};

    const {
      to,
      from,
      subject,
      html,
      text,
      replyTo,
      personalization,
      tags,
      trackClicks = true,
      trackOpens = true
    } = body;

    // Validate required fields (allow object or string for to/from)
    const hasTo = to && (typeof to === 'object' ? to.email : to);
    const hasFrom = from && (typeof from === 'object' ? from.email : from);
    const hasContent = html || text;
    if (!hasTo || !hasFrom || !subject || !hasContent) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Missing required fields',
        required: ['to', 'from', 'subject', 'html or text']
      }));
      return;
    }

    // Extract email addresses and names
    const toEmail = typeof to === 'object' ? to.email : to;
    const toName = typeof to === 'object' ? (to.name || '') : '';
    const fromEmail = typeof from === 'object' ? from.email : from;
    const fromName = typeof from === 'object' ? (from.name || 'Nodal Point') : 'Nodal Point';

    logger.info(`[Gmail Sequence] Sending email: to=${toEmail}, from=${fromEmail}, subject=${subject}`, 'gmail-send-sequence');

    // Generate tracking ID
    const trackingId = `gmail_seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare HTML content with tracking if enabled
    let htmlContent = html || '';
    if (htmlContent && trackOpens && !hasTrackingPixel(htmlContent)) {
      htmlContent = injectTracking(htmlContent, trackingId, {
        enableOpenTracking: trackOpens,
        enableClickTracking: trackClicks
      });
      logger.debug('[Gmail Sequence] Injected tracking into email', { trackingId });
    }

    // Prepare text content (use provided text or convert HTML)
    let textContent = text || '';
    if (!textContent && htmlContent) {
      textContent = htmlContent
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Initialize Gmail service with the sender's email (for domain-wide delegation)
    const gmailService = new GmailService();
    await gmailService.initialize(fromEmail);

    // Send email via Gmail API
    const result = await gmailService.sendEmail({
      to: toEmail,
      subject,
      html: htmlContent || undefined,
      text: textContent || undefined,
      userEmail: fromEmail,
      ownerId: fromEmail,
      from: fromEmail,
      fromName: fromName,
      replyTo: replyTo ? (typeof replyTo === 'object' ? replyTo.email : replyTo) : undefined
    });

    logger.info(`[Gmail Sequence] Email sent successfully: messageId=${result.messageId}`, 'gmail-send-sequence');

    // Return response matching MailerSend format
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
      to: toEmail,
      subject
    }));

  } catch (error) {
    logger.error('[Gmail Sequence] Error sending email:', error, 'gmail-send-sequence');
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to send email',
      message: error.message,
      details: error.details || null
    }));
  }
}
