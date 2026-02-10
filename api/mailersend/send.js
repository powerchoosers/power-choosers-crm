/**
 * MailerSend Email API
 * Sends transactional emails via MailerSend for sequence automation
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
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

    const apiKey = process.env.MAILERSEND_API_KEY;
    if (!apiKey) {
      console.error('[MailerSend] MAILERSEND_API_KEY not configured');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'MailerSend API key not configured' }));
      return;
    }

    // Construct MailerSend request body
    const mailersendBody = {
      from: {
        email: from.email || from,
        name: from.name || 'Nodal Point'
      },
      to: Array.isArray(to) ? to.map(t => ({
        email: t.email || t,
        name: t.name || ''
      })) : [{
        email: to.email || to,
        name: to.name || ''
      }],
      subject,
      settings: {
        track_clicks: trackClicks,
        track_opens: trackOpens
      }
    };

    // Add HTML and/or text content
    if (html) mailersendBody.html = html;
    if (text) mailersendBody.text = text;

    // Add reply-to if provided
    if (replyTo) {
      mailersendBody.reply_to = {
        email: replyTo.email || replyTo,
        name: replyTo.name || ''
      };
    }

    // Add personalization if provided
    if (personalization && Array.isArray(personalization)) {
      mailersendBody.personalization = personalization;
    }

    // Add tags if provided
    if (tags && Array.isArray(tags)) {
      mailersendBody.tags = tags.slice(0, 5); // MailerSend max 5 tags
    }

    console.log('[MailerSend] Sending email:', {
      to: mailersendBody.to.map(t => t.email),
      subject,
      trackClicks,
      trackOpens
    });

    // Send request to MailerSend API
    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(mailersendBody)
    });

    const responseText = await response.text();
    
    // MailerSend returns 202 Accepted for queued emails
    if (response.status === 202) {
      // Extract x-message-id from headers for tracking
      const messageId = response.headers.get('x-message-id');
      const sendPaused = response.headers.get('x-send-paused') === 'true';

      console.log('[MailerSend] Email queued successfully:', {
        messageId,
        sendPaused,
        to: mailersendBody.to.map(t => t.email)
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        messageId,
        status: sendPaused ? 'paused' : 'queued',
        to: mailersendBody.to.map(t => t.email),
        subject
      }));
      return;
    }

    // Handle validation errors (422)
    if (response.status === 422) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (_) {
        errorData = { message: responseText };
      }

      console.error('[MailerSend] Validation error:', errorData);
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Validation error',
        details: errorData.errors || errorData.message || responseText
      }));
      return;
    }

    // Handle other errors
    console.error('[MailerSend] API error:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'MailerSend API error',
      status: response.status,
      message: responseText
    }));

  } catch (error) {
    console.error('[MailerSend] Error sending email:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to send email',
      message: error.message
    }));
  }
}
