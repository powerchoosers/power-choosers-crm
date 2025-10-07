// API endpoint for sending emails via SendGrid (replaces Gmail API)
// Use default import because ../_cors exports CommonJS (module.exports = cors)
import cors from '../_cors';
import SendGridService from './sendgrid-service.js';

export default async function handler(req, res) {
  console.log('[SendGrid-Send] Function started');
  
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    console.log('[SendGrid-Send] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // API Key validation
  if (!process.env.SENDGRID_API_KEY) {
    console.error('[SendGrid-Send] SENDGRID_API_KEY is missing!');
    return res.status(500).json({ error: 'Missing SendGrid API key' });
  }
  console.log('[SendGrid-Send] API key validation passed');

  try {
    const { to, subject, content, from, _deliverability } = req.body;
    console.log('[SendGrid-Send] Request body received:', { to, subject, from, contentLength: content ? content.length : 0 });

    if (!to || !subject || !content) {
      console.log('[SendGrid-Send] Missing required fields:', { to: !!to, subject: !!subject, content: !!content });
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

    console.log('[SendGrid-Send] Sending email:', { to, subject, trackingId });

    console.log('[SendGrid-Send] Creating SendGridService instance');
    const sendGridService = new SendGridService();
    console.log('[SendGrid-Send] SendGridService created successfully');

    console.log('[SendGrid-Send] Calling sendGridService.sendEmail()');
    const result = await sendGridService.sendEmail(emailData);
    console.log('[SendGrid-Send] SendGrid service returned:', result);

    console.log('[SendGrid-Send] Returning success response');
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
