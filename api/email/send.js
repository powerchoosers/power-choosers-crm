// Vercel API endpoint for email tracking (sending handled by Gmail API)
import { cors } from '../_cors';

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

    // Email sending is now handled by Gmail API in the frontend
    // This endpoint is kept for compatibility with email tracking
    console.log('[Email] Email record stored for tracking:', { to, subject, trackingId });
    
    return res.status(200).json({ 
      success: true, 
      trackingId,
      message: 'Email record stored (sending handled by Gmail API)'
    });

  } catch (error) {
    console.error('[Email] Send error:', error);
    return res.status(500).json({ error: 'Failed to send email', message: error.message });
  }
}
