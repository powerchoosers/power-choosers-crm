// Vercel API endpoint for email tracking (sending handled by Gmail API)
import { cors } from '../_cors.js';
import { admin, db } from '../_firebase';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, content, from, _deliverability } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, content' });
    }

    // Generate unique tracking ID
    const trackingId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Use original content without custom tracking pixel (SendGrid native tracking will handle this)
    const emailContent = content;

    // Store email record in database
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
      status: 'queued',  // Start as 'queued' instead of 'sent'
      type: 'sent',              // Required for email filtering in emails.js
      emailType: 'sent',         // Alternative field for filtering
      isSentEmail: true,         // Additional flag for filtering
      provider: 'sendgrid',      // Identify the email provider
      sendgridMessageId: null,   // Will be updated when SendGrid responds
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to Firebase
    if (db) {
      try {
        await db.collection('emails').doc(trackingId).set(emailRecord);
        console.log('[Email] Successfully stored email record in Firebase');
      } catch (firebaseError) {
        console.error('[Email] Firebase save error:', firebaseError);
        // Continue even if Firebase fails
      }
    } else {
      console.warn('[Email] Firebase not available, email record not saved');
    }

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
