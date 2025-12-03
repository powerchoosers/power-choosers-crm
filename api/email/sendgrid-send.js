// API endpoint for sending emails via Gmail API
import { cors } from '../_cors.js';
import { db } from '../_firebase.js';
import { GmailService } from './gmail-service.js';
import { injectTracking, hasTrackingPixel } from './tracking-helper.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Gmail service account validation
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing Gmail service account key' }));
    return;
  }

  try {
    const { to, subject, content, plainTextContent, from, fromName, _deliverability, threadId, inReplyTo, references, isHtmlEmail, userEmail, emailSettings, contactId, contactName, contactCompany } = req.body;

    if (!to || !subject || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
      return;
    }

    // Generate unique tracking ID (this will be the Firestore document ID)
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

    // Determine owner email (required for Firestore rules compliance)
    // Use userEmail if provided, otherwise fallback to from address or default
    const ownerEmail = (userEmail && typeof userEmail === 'string' && userEmail.trim()) 
      ? userEmail.toLowerCase().trim() 
      : (from && typeof from === 'string' && from.includes('@'))
        ? from.toLowerCase().trim()
        : 'l.patterson@powerchoosers.com'; // Admin fallback

    // Create email record in Firestore BEFORE sending (for tracking)
    if (db && deliverability.enableTracking) {
      try {
        await db.collection('emails').doc(trackingId).set({
          id: trackingId,
          to: Array.isArray(to) ? to : [to],
          subject,
          html: trackedContent,
          text: textContent,
          from: from || userEmail || 'noreply@powerchoosers.com',
          type: 'sent',
          emailType: 'sent',
          isSentEmail: true,
          status: 'sending',
          provider: 'gmail',
          contactId: contactId || null,
          contactName: contactName || null,
          contactCompany: contactCompany || null,
          opens: [],
          clicks: [],
          replies: [],
          openCount: 0,
          clickCount: 0,
          // CRITICAL: Set ownership fields for Firestore rules compliance
          // ownerId must match authenticated user's email for non-admin access
          ownerId: ownerEmail,
          assignedTo: ownerEmail,
          createdBy: ownerEmail,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        logger.debug('[Gmail] Created email record for tracking:', { trackingId });
      } catch (dbError) {
        logger.warn('[Gmail] Failed to create email record (tracking may not work):', dbError.message);
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
      userEmail: ownerEmail, // Used to look up sender name/email from Firestore
      ownerId: ownerEmail, // Alias for compatibility
      from: from, // Optional override
      fromName: fromName, // Optional override
      threadId: threadId || undefined,
      inReplyTo: inReplyTo || undefined,
      references: Array.isArray(references) ? references : (references ? [references] : undefined)
    });

    // Update email record with sent status and Gmail message ID
    if (db && deliverability.enableTracking) {
      try {
        await db.collection('emails').doc(trackingId).update({
          status: 'sent',
          sentAt: new Date().toISOString(),
          date: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          gmailMessageId: result.messageId,
          messageId: result.messageId,
          threadId: result.threadId || threadId || null,
          updatedAt: new Date().toISOString()
        });
        logger.debug('[Gmail] Updated email record with sent status:', { trackingId, messageId: result.messageId });
      } catch (dbError) {
        logger.warn('[Gmail] Failed to update email record:', dbError.message);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      trackingId: trackingId,
      messageId: result.messageId,
      threadId: result.threadId,
      message: 'Email sent successfully via Gmail'
    }));

  } catch (error) {
    logger.error('[Gmail] Send error:', error);

    // Extract more detailed error information
    let errorMessage = error.message || 'Failed to send email via Gmail';
    let errorDetails = null;
    let statusCode = 500;

    // If it's a Gmail API error, extract details
    if (error.response && error.response.data) {
      statusCode = error.response.status || 500;
      errorDetails = error.response.data.error || null;
      if (errorDetails && errorDetails.message) {
        errorMessage = errorDetails.message;
      }
      }

      // Provide specific guidance based on status code
      if (statusCode === 413) {
      errorMessage = 'Payload Too Large: Email content exceeds Gmail size limits. ' + errorMessage;
      } else if (statusCode === 400) {
      errorMessage = 'Bad Request: Check email payload structure. ' + errorMessage;
      } else if (statusCode === 401) {
      errorMessage = 'Unauthorized: Check Gmail service account permissions. ' + errorMessage;
      } else if (statusCode === 403) {
      errorMessage = 'Forbidden: Service account does not have Gmail send permissions. ' + errorMessage;
    }

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to send email',
      message: errorMessage,
      details: errorDetails || null,
      statusCode: statusCode
    }));
    return;
  }
}
