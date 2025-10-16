// API endpoint for sending emails via SendGrid (replaces Gmail API)
import { cors } from '../_cors.js';
import SendGridService from './sendgrid-service.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // API Key validation
  if (!process.env.SENDGRID_API_KEY) {
    return res.status(500).json({ error: 'Missing SendGrid API key' });
  }

          try {
            const { to, subject, content, from, _deliverability, threadId, inReplyTo, references } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, content' });
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

    return res.status(200).json({ 
      success: true, 
      trackingId: result.trackingId,
      messageId: result.messageId,
      message: 'Email sent successfully via SendGrid'
    });

  } catch (error) {
    console.error('[SendGrid] Send error:', error);
    return res.status(500).json({ 
      error: 'Failed to send email', 
      message: error.message 
    });
  }
}
