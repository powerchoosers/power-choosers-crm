// Vercel API endpoint for email tracking (sending handled by Gmail API)
import { cors } from '../_cors.js';
import { admin, db } from '../_firebase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { to, subject, content, from, _deliverability } = req.body;

    if (!to || !subject || !content) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
      return;
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
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      trackingId,
      message: 'Email record stored (sending handled by Gmail API)'
    }));
    return;

  } catch (error) {
    console.error('[Email] Send error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to send email', message: error.message }));
    return;
  }
}
