// Vercel API endpoint for sending emails with tracking
import { cors } from '../_cors';
import sgMail from '@sendgrid/mail';

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, content, from } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, content' });
    }

    // Generate unique tracking ID
    const trackingId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create tracking pixel URL for Vercel deployment
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : req.headers.origin || 'http://localhost:3000';
    const trackingPixelUrl = `${baseUrl}/api/email/track/${trackingId}`;
    
    // Inject tracking pixel into email content
    const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
    const emailContent = content + trackingPixel;

    // Store email record in database (you'll need to implement this with your database)
    const emailRecord = {
      id: trackingId,
      to: Array.isArray(to) ? to : [to],
      subject,
      content: emailContent,
      originalContent: content,
      from: from || 'noreply@powerchoosers.com',
      sentAt: new Date().toISOString(),
      opens: [],
      replies: [],
      openCount: 0,
      replyCount: 0,
      status: 'sent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // TODO: Save to Firebase or your database
    console.log('[Email] Storing email record:', emailRecord);

    // Send the actual email via SendGrid
    if (process.env.SENDGRID_API_KEY) {
      try {
        const msg = {
          to: Array.isArray(to) ? to : [to],
          from: from || 'noreply@powerchoosers.com',
          subject: subject,
          html: emailContent,
          text: content.replace(/<[^>]*>/g, ''), // Strip HTML for text version
          trackingSettings: {
            clickTracking: {
              enable: true,
              enableText: false
            },
            openTracking: {
              enable: true
            }
          }
        };

        console.log('[Email] Sending via SendGrid:', { to, subject, trackingId });
        await sgMail.send(msg);
        console.log('[Email] Email sent successfully via SendGrid');

        return res.status(200).json({ 
          success: true, 
          trackingId,
          message: 'Email sent successfully via SendGrid'
        });
      } catch (sendError) {
        console.error('[Email] SendGrid error:', sendError);
        return res.status(500).json({ 
          error: 'Failed to send email', 
          message: sendError.message 
        });
      }
    } else {
      // Fallback: simulate sending the email
      console.log('[Email] Simulating email send (no SendGrid API key):', { to, subject, trackingId });
      
      return res.status(200).json({ 
        success: true, 
        trackingId,
        message: 'Email simulated (no SendGrid API key configured)'
      });
    }

  } catch (error) {
    console.error('[Email] Send error:', error);
    return res.status(500).json({ error: 'Failed to send email', message: error.message });
  }
}
