import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import sgMail from '@sendgrid/mail';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    console.log('[SendScheduledEmails] Starting send process');
    
    const now = Date.now();
    
    // Query for approved emails that are ready to send
    // Note: This runs server-side with Firebase Admin SDK, which bypasses Firestore rules
    // The ownership fields were added during email creation to ensure client-side queries work
    const readyToSendQuery = db.collection('emails')
      .where('type', '==', 'scheduled')
      .where('status', '==', 'approved')
      .where('scheduledSendTime', '<=', now);
    
    const readyToSendSnapshot = await readyToSendQuery.get();
    
    if (readyToSendSnapshot.empty) {
      console.log('[SendScheduledEmails] No emails ready to send');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'No emails ready to send' 
      }));
      return;
    }
    
    console.log('[SendScheduledEmails] Found', readyToSendSnapshot.size, 'emails ready to send');
    
    let sentCount = 0;
    const errors = [];
    
    // Process each email
    for (const emailDoc of readyToSendSnapshot.docs) {
      try {
        const emailData = emailDoc.data();
        console.log('[SendScheduledEmails] Sending email:', emailDoc.id);
        
        // Prepare SendGrid message
        const msg = {
          to: emailData.to,
          from: {
            email: process.env.SENDGRID_FROM_EMAIL || 'noreply@powerchoosers.com',
            name: process.env.SENDGRID_FROM_NAME || 'Power Choosers'
          },
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          // Add tracking
          trackingSettings: {
            openTracking: {
              enable: true,
              substitutionTag: '%open-track%'
            },
            clickTracking: {
              enable: true,
              enableText: true
            }
          },
          // Add custom args for tracking
          customArgs: {
            emailId: emailDoc.id,
            sequenceId: emailData.sequenceId || '',
            contactId: emailData.contactId || '',
            stepIndex: emailData.stepIndex || 0
          }
        };
        
        // Send email via SendGrid
        const sendResult = await sgMail.send(msg);
        console.log('[SendScheduledEmails] Email sent successfully:', emailDoc.id, sendResult[0].statusCode);
        
        // Update email record
        await emailDoc.ref.update({
          type: 'sent',
          status: 'sent',
          sentAt: Date.now(),
          sendgridMessageId: sendResult[0].headers['x-message-id'],
          sentBy: 'scheduled_job'
        });
        
        sentCount++;
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error('[SendScheduledEmails] Failed to send email:', emailDoc.id, error);
        errors.push({
          emailId: emailDoc.id,
          error: error.message,
          statusCode: error.code
        });
        
        // Update email status to error
        try {
          await emailDoc.ref.update({
            status: 'error',
            errorMessage: error.message,
            errorCode: error.code,
            lastAttemptAt: Date.now()
          });
        } catch (updateError) {
          console.error('[SendScheduledEmails] Failed to update error status:', updateError);
        }
      }
    }
    
    console.log('[SendScheduledEmails] Send process complete. Sent:', sentCount, 'Errors:', errors.length);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: sentCount,
      errors: errors.length,
      errorDetails: errors
    }));
    
  } catch (error) {
    console.error('[SendScheduledEmails] Fatal error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}
