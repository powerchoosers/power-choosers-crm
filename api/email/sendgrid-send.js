// API endpoint for sending emails via Gmail API
import { cors } from '../_cors.js';
import { GmailService } from './gmail-service.js';
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
    const { to, subject, content, from, fromName, _deliverability, threadId, inReplyTo, references, isHtmlEmail, userEmail, emailSettings } = req.body;

    if (!to || !subject || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
      return;
    }

    // Generate unique tracking ID (prefix with gmail_ for consistency)
    const trackingId = `gmail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Explicit boolean conversion - ensure it's always a boolean, never undefined
    const isHtmlEmailBoolean = Boolean(isHtmlEmail);

    // Merge emailSettings with _deliverability (emailSettings takes priority)
    const deliverability = {
      enableTracking: true,
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

    // Generate plain text version from HTML if needed
    let textContent = '';
    if (isHtmlEmailBoolean) {
      // Simple HTML to text conversion
      textContent = content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      textContent = content;
    }

    // Prepare email data for Gmail
    // The Gmail service will automatically look up sender info from user profile
    const gmailService = new GmailService();

    logger.log('[Gmail] Sending email:', { to, subject, trackingId, userEmail });

    const result = await gmailService.sendEmail({
      to,
      subject,
      html: isHtmlEmailBoolean ? content : undefined,
      text: textContent,
      userEmail: userEmail, // Used to look up sender name/email from Firestore
      ownerId: userEmail, // Alias for compatibility
      from: from, // Optional override
      fromName: fromName, // Optional override
      threadId: threadId || undefined,
      inReplyTo: inReplyTo || undefined,
      references: Array.isArray(references) ? references : (references ? [references] : undefined)
    });

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
