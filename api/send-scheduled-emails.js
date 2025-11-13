import admin from 'firebase-admin';
import { db } from './_firebase.js';
import sgMail from '@sendgrid/mail';

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

  const isProduction = process.env.NODE_ENV === 'production';

  try {
    // Ensure Firebase Admin is initialized with credentials
    if (!db) {
      console.error('[SendScheduledEmails] Firestore not initialized. Missing Firebase service account env vars.');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Firebase Admin not initialized. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY on localhost.'
      }));
      return;
    }
    if (!isProduction) {
    console.log('[SendScheduledEmails] Starting send process');
    }
    
    const now = Date.now();
    
    // Query for approved emails that are ready to send
    // Note: This runs server-side with Firebase Admin SDK, which bypasses Firestore rules
    // The ownership fields were added during email creation to ensure client-side queries work
    // Limit to 50 emails per run to stay well under SendGrid's 100/sec rate limit
    const readyToSendQuery = db.collection('emails')
      .where('type', '==', 'scheduled')
      .where('status', '==', 'approved')
      .where('scheduledSendTime', '<=', now)
      .limit(50);
    
    const readyToSendSnapshot = await readyToSendQuery.get();
    
    if (readyToSendSnapshot.empty) {
      if (!isProduction) {
      console.log('[SendScheduledEmails] No emails ready to send');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'No emails ready to send' 
      }));
      return;
    }
    
    if (!isProduction) {
    console.log('[SendScheduledEmails] Found', readyToSendSnapshot.size, 'emails ready to send');
    }
    
    let sentCount = 0;
    const errors = [];
    
    // Process each email
    for (const emailDoc of readyToSendSnapshot.docs) {
      try {
        const emailData = emailDoc.data();
        
        // Use transaction to claim the email (idempotency)
        let shouldSend = false;
        await db.runTransaction(async (transaction) => {
          const freshDoc = await transaction.get(emailDoc.ref);
          if (!freshDoc.exists) {
            return;
          }
          
          const currentStatus = freshDoc.data().status;
          
          // Only proceed if status is still 'approved'
          if (currentStatus === 'approved') {
            transaction.update(emailDoc.ref, {
              status: 'sending',
              sendingStartedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            shouldSend = true;
          }
        });
        
        if (!shouldSend) {
          if (!isProduction) {
            console.log('[SendScheduledEmails] Email', emailDoc.id, 'already claimed or sent');
          }
          continue;
        }
        
        if (!isProduction) {
        console.log('[SendScheduledEmails] Sending email:', emailDoc.id);
        }
        
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
        if (!isProduction) {
        console.log('[SendScheduledEmails] Email sent successfully:', emailDoc.id, sendResult[0].statusCode);
        }
        
        // Update email record
        await emailDoc.ref.update({
          type: 'sent',
          status: 'sent',
          sentAt: Date.now(),
          sendgridMessageId: sendResult[0].headers['x-message-id'],
          sentBy: 'scheduled_job'
        });
        
        sentCount++;
        
        // If this email is part of a sequence, create the next step's email
        if (emailData.sequenceId && typeof emailData.stepIndex === 'number') {
          try {
            // Get sequence details
            const sequenceDoc = await db.collection('sequences').doc(emailData.sequenceId).get();
            if (sequenceDoc.exists) {
              const sequence = sequenceDoc.data();
              
              // Find the next auto-email step after current step
              let nextAutoEmailStep = null;
              let nextStepIndex = -1;
              
              for (let i = emailData.stepIndex + 1; i < (sequence.steps?.length || 0); i++) {
                if (sequence.steps[i].type === 'auto-email') {
                  nextAutoEmailStep = sequence.steps[i];
                  nextStepIndex = i;
                  break;
                }
              }
              
              // If there's a next step, create the email for it
              if (nextAutoEmailStep) {
                const delayMs = (nextAutoEmailStep.delayMinutes || 0) * 60 * 1000;
                const nextScheduledSendTime = Date.now() + delayMs;
                
                const nextEmailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                await db.collection('emails').doc(nextEmailId).set({
                  type: 'scheduled',
                  status: 'not_generated',
                  scheduledSendTime: nextScheduledSendTime,
                  contactId: emailData.contactId,
                  contactName: emailData.contactName,
                  contactCompany: emailData.contactCompany,
                  to: emailData.to,
                  sequenceId: emailData.sequenceId,
                  sequenceName: emailData.sequenceName,
                  stepIndex: nextStepIndex,
                  totalSteps: sequence.steps?.length || 1,
                  activationId: emailData.activationId,
                  aiPrompt: nextAutoEmailStep.emailSettings?.aiPrompt || nextAutoEmailStep.data?.aiPrompt || nextAutoEmailStep.aiPrompt || nextAutoEmailStep.content || 'Write a professional email',
                  ownerId: emailData.ownerId,
                  assignedTo: emailData.assignedTo,
                  createdBy: emailData.createdBy,
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                if (!isProduction) {
                  console.log(`[SendScheduledEmails] Created next step email (step ${nextStepIndex}) for contact ${emailData.contactId}`);
                }
              }
            }
          } catch (error) {
            console.error('[SendScheduledEmails] Failed to create next step email:', error);
            // Don't fail the whole process if next step creation fails
          }
        }
        
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
    
    if (!isProduction) {
    console.log('[SendScheduledEmails] Send process complete. Sent:', sentCount, 'Errors:', errors.length);
    }
    
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
