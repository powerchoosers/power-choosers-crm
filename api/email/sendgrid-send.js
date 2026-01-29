// API endpoint for sending emails via Gmail API
import { cors } from '../_cors.js';
import { supabaseAdmin } from '../_supabase.js';
import { GmailService } from './gmail-service.js';
import { injectTracking, hasTrackingPixel } from './tracking-helper.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  logger.info(`[Gmail] Incoming request: ${req.method} ${req.url}`, 'sendgrid-send');
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    logger.warn(`[Gmail] Method not allowed: ${req.method}`, 'sendgrid-send');
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Gmail service account validation
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!String(serviceAccountKey || '').trim()) {
    logger.error('[Gmail] Missing GOOGLE_SERVICE_ACCOUNT_KEY', 'sendgrid-send');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing Gmail service account key' }));
    return;
  }

  try {
    const { to, subject, content, plainTextContent, from, fromName, _deliverability, threadId, inReplyTo, references, isHtmlEmail, userEmail, emailSettings, contactId, contactName, contactCompany, dryRun } = req.body;
    logger.info(`[Gmail] Attempting to send email to: ${to}, subject: ${subject}, user: ${userEmail}`, 'sendgrid-send');

    if (!to || !subject || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
      return;
    }

    // Generate unique tracking ID (this will be the Supabase record ID)
    const trackingId = `gmail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Explicit boolean conversion - ensure it's always a boolean, never undefined
    const isHtmlEmailBoolean = Boolean(isHtmlEmail);

    // Merge emailSettings with _deliverability (emailSettings takes priority)
    const deliverability = {
      enableTracking: true,
      enableClickTracking: true,
      includeBulkHeaders: false,
      includeListUnsubscribe: false,
      includePriorityHeaders: false,
      forceGmailOnly: false,
      useBrandedHtmlTemplate: false,
      signatureImageEnabled: true,
      // Override with _deliverability if provided
      ...(_deliverability || {}),
      // Override with emailSettings if provided (highest priority)
      ...(emailSettings?.deliverability ? {
        enableTracking: emailSettings.deliverability.openTracking !== undefined ? emailSettings.deliverability.openTracking : true,
        enableClickTracking: emailSettings.deliverability.clickTracking !== undefined ? emailSettings.deliverability.clickTracking : true,
        includeBulkHeaders: emailSettings.deliverability.bulkHeaders || false,
        includeListUnsubscribe: emailSettings.deliverability.listUnsubscribe !== undefined ? emailSettings.deliverability.listUnsubscribe : true,
        includePriorityHeaders: emailSettings.deliverability.priorityHeaders || false
      } : {})
    };

    // Inject tracking pixel and wrap links for click tracking
    let trackedContent = content;
    if (!hasTrackingPixel(content)) {
      trackedContent = injectTracking(content, trackingId, {
        enableOpenTracking: deliverability.enableTracking,
        enableClickTracking: deliverability.enableClickTracking
      });
      logger.debug('[Gmail] Injected tracking into email:', { trackingId, enableTracking: deliverability.enableTracking });
    }

    // Generate plain text version from HTML if needed
    let textContent = '';
    if (plainTextContent) {
      // Use provided plain text content (pre-generated on client)
      textContent = plainTextContent;
    } else if (isHtmlEmailBoolean) {
      // HTML email: Convert HTML to plain text for the text part
      textContent = content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      // Standard email: Content is HTML, convert to plain text
      textContent = content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Determine owner email (required for Supabase filtering)
    // Use userEmail if provided, otherwise fallback to from address
    const ownerEmail = (userEmail && typeof userEmail === 'string' && userEmail.trim()) 
      ? userEmail.toLowerCase().trim() 
      : (from && typeof from === 'string' && from.includes('@'))
        ? from.toLowerCase().trim()
        : null;

    if (!ownerEmail) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing user identity (userEmail or from address)' }));
      return;
    }

    if (dryRun) {
      const gmailService = new GmailService();
      await gmailService.initialize(ownerEmail);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        dryRun: true,
        message: 'Gmail service initialized'
      }));
      return;
    }

    // Create email record in Supabase BEFORE sending (for tracking)
    if (supabaseAdmin && deliverability.enableTracking) {
      try {
        const emailRecord = {
          id: trackingId,
          to: Array.isArray(to) ? to : [to],
          subject,
          html: trackedContent,
          text: textContent,
          from: from || ownerEmail || 'noreply@nodalpoint.io',
          type: 'sent',
          status: 'sending',
          contactId: contactId || null,
          opens: [],
          clicks: [],
          openCount: 0,
          clickCount: 0,
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: {
            fromName: fromName || null,
            emailType: 'sent',
            isSentEmail: true,
            provider: 'gmail',
            contactName: contactName || null,
            contactCompany: contactCompany || null,
            ownerId: ownerEmail,
            assignedTo: ownerEmail,
            createdBy: ownerEmail,
            replies: []
          }
        };

        const { error } = await supabaseAdmin
          .from('emails')
          .insert(emailRecord);

        if (error) throw error;
        logger.debug('[Gmail] Created email record for tracking in Supabase:', { trackingId });
      } catch (dbError) {
        logger.warn('[Gmail] Failed to create email record in Supabase (tracking may not work):', dbError.message);
      }
    }

    // Prepare email data for Gmail
    // The Gmail service will automatically look up sender info from user profile
    const gmailService = new GmailService();

    logger.debug('[Gmail] Sending email:', { to, subject, trackingId, userEmail });

    const result = await gmailService.sendEmail({
      to,
      subject,
      html: trackedContent, // Send HTML with tracking pixel
      text: textContent, // Plain text fallback
      userEmail: ownerEmail, // Used to look up sender name/email from Supabase
      ownerId: ownerEmail, // Alias for compatibility
      from: from, // Optional override
      fromName: fromName, // Optional override
      threadId: threadId || undefined,
      inReplyTo: inReplyTo || undefined,
      references: Array.isArray(references) ? references : (references ? [references] : undefined)
    });

    // Update email record with sent status and Gmail message ID
    if (supabaseAdmin && deliverability.enableTracking) {
      try {
        const { error } = await supabaseAdmin
          .from('emails')
          .update({
            status: 'sent',
            updatedAt: new Date().toISOString(),
            metadata: {
              // Get existing metadata and merge
              ...(await supabaseAdmin.from('emails').select('metadata').eq('id', trackingId).single().then(res => res.data?.metadata || {})),
              sentAt: new Date().toISOString(),
              gmailMessageId: result.messageId,
              messageId: result.messageId,
              threadId: result.threadId || threadId || null
            }
          })
          .eq('id', trackingId);

        if (error) throw error;
        logger.debug('[Gmail] Updated email record with sent status in Supabase:', { trackingId, messageId: result.messageId });
      } catch (dbError) {
        logger.warn('[Gmail] Failed to update email record in Supabase:', dbError.message);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
      trackingId
    }));

  } catch (error) {
    logger.error('[Gmail] Global error:', error, 'sendgrid-send');
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error.message || 'Internal server error',
      details: error.details || null
    }));
  }
}
