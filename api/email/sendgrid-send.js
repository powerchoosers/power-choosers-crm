// API endpoint for sending emails via SendGrid (replaces Gmail API)
import { cors } from '../_cors.js';
import SendGridService from './sendgrid-service.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // API Key validation
  if (!process.env.SENDGRID_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing SendGrid API key' }));
    return;
  }

          try {
            const { to, subject, content, from, fromName, _deliverability, threadId, inReplyTo, references, isHtmlEmail, userEmail } = req.body;

    if (!to || !subject || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
      return;
    }

    // Generate unique tracking ID (prefix with sendgrid_ for consistency)
    const trackingId = `sendgrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare email data
            const emailData = {
      to,
      subject,
      content,
      from: from || process.env.SENDGRID_FROM_EMAIL || 'l.patterson@powerchoosers.com',
      fromName: fromName || process.env.SENDGRID_FROM_NAME || 'Lewis Patterson',
      trackingId,
              threadId: threadId || undefined,
              inReplyTo: inReplyTo || undefined,
              references: Array.isArray(references) ? references : (references ? [references] : undefined),
              isHtmlEmail: isHtmlEmail || false,
      userEmail: userEmail || null,
      _deliverability: _deliverability || {
        enableTracking: true,
        includeBulkHeaders: false,
        includeListUnsubscribe: false,
        includePriorityHeaders: false,
        forceGmailOnly: false,
        useBrandedHtmlTemplate: false,
        signatureImageEnabled: true
      }
    };

    console.log('[SendGrid] Sending email:', { to, subject, trackingId });

    const sendGridService = new SendGridService();
    const result = await sendGridService.sendEmail(emailData);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      trackingId: result.trackingId,
      messageId: result.messageId,
      message: 'Email sent successfully via SendGrid'
    }));

  } catch (error) {
    console.error('[SendGrid] Send error:', error);
    
    // Extract more detailed error information (per Twilio recommendations)
    let errorMessage = error.message || 'Failed to send email';
    let errorDetails = null;
    let statusCode = 500;
    
    // If it's a SendGrid API error, extract details (per Twilio recommendation)
    if (error.response && error.response.body) {
      statusCode = error.response.statusCode || 500;
      
      // Extract detailed error messages from SendGrid response
      if (error.response.body.errors && Array.isArray(error.response.body.errors)) {
        errorDetails = error.response.body.errors.map(e => ({
          message: e.message || e,
          field: e.field || null,
          help: e.help || null
        }));
        errorMessage = errorDetails.map(e => e.message).join('; ');
        console.error('[SendGrid] SendGrid API Error Details:', errorDetails);
      } else if (error.response.body.message) {
        errorMessage = error.response.body.message;
      }
      
      // Provide specific guidance based on status code
      if (statusCode === 413) {
        errorMessage = 'Payload Too Large: Email content exceeds SendGrid size limits. ' + errorMessage;
      } else if (statusCode === 400) {
        errorMessage = 'Bad Request: Check email payload structure and headers. ' + errorMessage;
      } else if (statusCode === 401) {
        errorMessage = 'Unauthorized: Check SendGrid API key permissions. ' + errorMessage;
      } else if (statusCode === 403) {
        errorMessage = 'Forbidden: API key does not have Mail Send permissions. ' + errorMessage;
      }
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
