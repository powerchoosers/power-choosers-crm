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
            const { to, subject, content, from, _deliverability, threadId, inReplyTo, references, isHtmlEmail } = req.body;

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
      from: from || process.env.SENDGRID_FROM_EMAIL || 'noreply@powerchoosers.com',
      trackingId,
              threadId: threadId || undefined,
              inReplyTo: inReplyTo || undefined,
              references: Array.isArray(references) ? references : (references ? [references] : undefined),
              isHtmlEmail: isHtmlEmail || false,
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
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to send email', 
      message: error.message 
    }));
    return;
  }
}
