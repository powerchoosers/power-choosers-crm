import admin from 'firebase-admin';
import { db } from './_firebase.js';
import { GmailService } from './email/gmail-service.js';
import logger from './_logger.js';

// Initialize Gmail service
const gmailService = new GmailService();

/**
 * Fetch and build signature HTML for a user
 * @param {string} ownerId - User email to fetch signature for
 * @returns {Object} { signatureHtml, signatureText } or empty strings if not available
 */
async function getUserSignature(ownerId) {
  if (!ownerId) return { signatureHtml: '', signatureText: '' };

  try {
    // Fetch user settings from Firestore
    const settingsSnap = await db.collection('crm-settings')
      .where('ownerId', '==', ownerId)
      .limit(1)
      .get();

    if (settingsSnap.empty) {
      return { signatureHtml: '', signatureText: '' };
    }

    const data = settingsSnap.docs[0].data();
    const signature = data.emailSignature || {};
    const sigText = signature.text || '';
    const sigImage = signature.image || '';
    const imageSize = signature.imageSize || { width: 200, height: 100 };
    const signatureImageEnabled = data.emailDeliverability?.signatureImageEnabled !== false;

    if (!sigText && !sigImage) {
      return { signatureHtml: '', signatureText: '' };
    }

    // Build HTML signature
    let signatureHtml = '<div contenteditable="false" data-signature="true" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">';
    
    if (sigText) {
      const textHtml = sigText.replace(/\n/g, '<br>');
      signatureHtml += `<div style="font-family: inherit; font-size: 14px; color: #333; line-height: 1.4;">${textHtml}</div>`;
    }
    
    // Include image if enabled
    if (sigImage && signatureImageEnabled) {
      const width = imageSize.width || 200;
      const height = imageSize.height || 100;
      signatureHtml += `<div style="margin-top: 10px;"><img src="${sigImage}" alt="Signature" style="max-width: ${width}px; max-height: ${height}px; border-radius: 4px;" /></div>`;
    }
    
    signatureHtml += '</div>';

    // Build plain text signature
    let signatureText = '\n\n---\n' + sigText;

    return { signatureHtml, signatureText };
  } catch (error) {
    logger.warn('[SendScheduledEmails] Failed to fetch user signature:', error);
    return { signatureHtml: '', signatureText: '' };
  }
}

/**
 * Resolve email settings with proper priority:
 * 1. Step-level emailSettings (highest priority)
 * 2. Global user settings (medium priority)
 * 3. Hardcoded defaults (lowest priority)
 */
function resolveEmailSettings(stepEmailSettings, globalSettings) {
  const defaults = {
    content: {
      includeSignature: true,
      signatureImage: true,
      aiGeneration: false,
      personalizationLevel: 'advanced'
    },
    deliverability: {
      priorityHeaders: false,
      listUnsubscribe: true,
      bulkHeaders: false,
      openTracking: true,
      clickTracking: true
    },
    automation: {
      sendTimeOptimization: false,
      timezoneAware: false,
      weekendSending: 'business-days',
      autoPauseOnReply: false,
      maxFollowups: 5
    },
    compliance: {
      unsubscribeLink: true,
      physicalAddress: false,
      gdprCompliant: false,
      spamScoreCheck: false
    }
  };

  // Merge with priority: step > global > defaults
  const resolved = {
    content: {
      ...defaults.content,
      ...(globalSettings?.content || {}),
      ...(stepEmailSettings?.content || {})
    },
    deliverability: {
      ...defaults.deliverability,
      ...(globalSettings?.deliverability || {}),
      ...(stepEmailSettings?.deliverability || {})
    },
    automation: {
      ...defaults.automation,
      ...(globalSettings?.automation || {}),
      ...(stepEmailSettings?.automation || {})
    },
    compliance: {
      ...defaults.compliance,
      ...(globalSettings?.compliance || {}),
      ...(stepEmailSettings?.compliance || {})
    }
  };

  return resolved;
}

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
      logger.error('[SendScheduledEmails] Firestore not initialized. Missing Firebase service account env vars.');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Firebase Admin not initialized. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY on localhost.'
      }));
      return;
    }
    if (!isProduction) {
      logger.log('[SendScheduledEmails] Starting send process');
    }

    const now = Date.now();

    // Parse request body for immediate send of specific email
    let requestBody = {};
    try {
      if (typeof req.body === 'string') {
        requestBody = JSON.parse(req.body);
      } else if (req.body) {
        requestBody = req.body;
      }
    } catch (e) {
      // Ignore parse errors, use defaults
    }

    const { immediate, emailId } = requestBody;
    let readyToSendSnapshot;

    // If immediate send of specific email is requested
    if (immediate && emailId) {
      logger.log('[SendScheduledEmails] Immediate send requested for email:', emailId);
      const emailDoc = await db.collection('emails').doc(emailId).get();
      
      if (!emailDoc.exists) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Email not found'
        }));
        return;
      }

      const emailData = emailDoc.data();
      
      // Validate the email can be sent
      if (emailData.type !== 'scheduled') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Email is not a scheduled email'
        }));
        return;
      }

      if (emailData.status !== 'approved' && emailData.status !== 'pending_approval') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: `Email status is '${emailData.status}', expected 'approved' or 'pending_approval'`
        }));
        return;
      }

      // Create a mock snapshot with just this email
      readyToSendSnapshot = {
        empty: false,
        size: 1,
        docs: [emailDoc]
      };

      logger.log('[SendScheduledEmails] Processing immediate send for email:', emailId);
    } else {
      // Query for emails that are ready to send.
      // IMPORTANT: We now treat both 'approved' and 'pending_approval' as sendable
      // once their scheduledSendTime has passed. This allows sequences to continue
      // even if the user doesn't manually approve every email.
      // Note: This runs server-side with Firebase Admin SDK, which bypasses Firestore rules
      // The ownership fields were added during email creation to ensure client-side queries work
      // Limit to 50 emails per run to stay well under SendGrid's 100/sec rate limit
      const readyToSendQuery = db.collection('emails')
        .where('type', '==', 'scheduled')
        .where('status', 'in', ['approved', 'pending_approval'])
        .where('scheduledSendTime', '<=', now)
        .limit(50);

      readyToSendSnapshot = await readyToSendQuery.get();
    }

    if (readyToSendSnapshot.empty) {
      if (!isProduction) {
        logger.log('[SendScheduledEmails] No emails ready to send');
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
      logger.log('[SendScheduledEmails] Found', readyToSendSnapshot.size, 'emails ready to send');
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

          // Only proceed if status is still 'approved' or 'pending_approval'
          if (currentStatus === 'approved' || currentStatus === 'pending_approval') {
            transaction.update(emailDoc.ref, {
              status: 'sending',
              sendingStartedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            shouldSend = true;
          }
        });

        if (!shouldSend) {
          if (!isProduction) {
            logger.log('[SendScheduledEmails] Email', emailDoc.id, 'already claimed or sent');
          }
          continue;
        }

        if (!isProduction) {
          logger.log('[SendScheduledEmails] Sending email:', emailDoc.id);
        }

        // Fetch sequence and step settings if this is a sequence email
        let emailSettings = null;
        let sequence = null;
        let currentStep = null;

        if (emailData.sequenceId && typeof emailData.stepIndex === 'number') {
          try {
            const sequenceDoc = await db.collection('sequences').doc(emailData.sequenceId).get();
            if (sequenceDoc.exists) {
              sequence = sequenceDoc.data();
              currentStep = sequence.steps?.[emailData.stepIndex];

              // Get step-level email settings
              const stepEmailSettings = currentStep?.emailSettings;

              // Fetch global user settings from settings collection
              let globalSettings = null;
              if (emailData.ownerId) {
                try {
                  const settingsSnap = await db.collection('settings')
                    .where('ownerId', '==', emailData.ownerId)
                    .limit(1)
                    .get();

                  if (!settingsSnap.empty) {
                    // Map the flat settings doc to the nested structure expected by resolveEmailSettings
                    const data = settingsSnap.docs[0].data();
                    if (data.emailDeliverability) {
                      globalSettings = {
                        deliverability: {
                          openTracking: data.emailDeliverability.enableTracking,
                          clickTracking: data.emailDeliverability.enableClickTracking,
                          priorityHeaders: data.emailDeliverability.includePriorityHeaders,
                          listUnsubscribe: data.emailDeliverability.includeListUnsubscribe,
                          bulkHeaders: data.emailDeliverability.includeBulkHeaders
                        },
                        content: {
                          includeSignature: true, // Default to true if not in global settings
                          signatureImage: data.emailDeliverability.signatureImageEnabled
                        }
                      };
                    }
                  }
                } catch (err) {
                  logger.warn('[SendScheduledEmails] Failed to fetch global settings:', err);
                }
              }

              // Resolve settings: Step > Global > Defaults
              emailSettings = resolveEmailSettings(stepEmailSettings, globalSettings);

              if (!isProduction) {
                logger.log('[SendScheduledEmails] Resolved email settings:', emailSettings);
              }
            }
          } catch (error) {
            logger.error('[SendScheduledEmails] Failed to fetch sequence settings:', error);
            // Continue with defaults if settings fetch fails
            emailSettings = resolveEmailSettings(null, null);
          }
        } else {
          // Non-sequence email: use defaults
          emailSettings = resolveEmailSettings(null, null);
        }

        // Prepare email content with signature if enabled
        let finalHtml = emailData.html || '';
        let finalText = emailData.text || '';

        // Add signature if enabled in settings
        if (emailSettings.content.includeSignature) {
          const { signatureHtml, signatureText } = await getUserSignature(emailData.ownerId);
          
          if (signatureHtml) {
            // Append signature HTML to email body
            finalHtml = finalHtml + signatureHtml;
          }
          
          if (signatureText) {
            // Append plain text signature
            finalText = finalText + signatureText;
          }
          
          if (!isProduction && (signatureHtml || signatureText)) {
            logger.log('[SendScheduledEmails] Added signature to email');
          }
        }

        // Prepare Gmail message
        // The Gmail service will automatically look up sender info from user profile
        // using ownerId, so each agent's emails send from their own address
        const sendResult = await gmailService.sendEmail({
          to: emailData.to,
          subject: emailData.subject,
          html: finalHtml,
          text: finalText,
          ownerId: emailData.ownerId, // Used to look up sender name/email from Firestore
          userEmail: emailData.ownerId, // Alias for compatibility
          threadId: emailData.threadId || undefined,
          inReplyTo: emailData.inReplyTo || undefined,
          references: emailData.references || undefined
        });
        
        if (!isProduction) {
          logger.log('[SendScheduledEmails] Email sent successfully via Gmail:', emailDoc.id, sendResult.messageId);
        }

        // Update email record (preserve subject, html, text fields)
        // CRITICAL: Initialize tracking fields to match manual emails structure
        // This ensures tracking pixels display correctly in emails-redesigned.js sent tab
        await emailDoc.ref.update({
          type: 'sent',
          status: 'sent',
          emailType: 'sent',           // Required for emails-redesigned.js filter
          isSentEmail: true,           // Required for emails-redesigned.js filter
          sentAt: Date.now(),
          date: new Date().toISOString(),      // Required for emails page sorting
          timestamp: new Date().toISOString(), // Required for emails page fallback
          gmailMessageId: sendResult.messageId,
          messageId: sendResult.messageId, // Alias for consistency
          threadId: sendResult.threadId || emailData.threadId || null,
          sentBy: 'scheduled_job',
          provider: 'gmail',           // Mark as Gmail provider
          // Initialize tracking arrays (Gmail doesn't have webhook tracking like SendGrid)
          opens: emailData.opens || [],
          clicks: emailData.clicks || [],
          replies: emailData.replies || [],
          openCount: emailData.openCount || 0,
          clickCount: emailData.clickCount || 0,
          updatedAt: new Date().toISOString()
          // Note: subject, html, text are preserved automatically by Firestore update()
        });

        sentCount++;

        // If this email is part of a sequence, create the next step (email or task)
        // IMPORTANT: This is PROGRESSIVE - only creates ONE step at a time, not all future steps
        // This keeps the tasks/emails list clean, showing only what's due next
        if (emailData.sequenceId && typeof emailData.stepIndex === 'number') {
          try {
            // Get sequence details
            const sequenceDoc = await db.collection('sequences').doc(emailData.sequenceId).get();
            if (sequenceDoc.exists) {
              const sequence = sequenceDoc.data();

              // Find the next non-paused step after current step
              // PROGRESSIVE: Only finds and creates the IMMEDIATELY NEXT step, not all future steps
              let nextStep = null;
              let nextStepIndex = -1;

              // Find next non-paused step (only ONE step - progressive creation)
              for (let i = emailData.stepIndex + 1; i < (sequence.steps?.length || 0); i++) {
                if (!sequence.steps[i].paused) {
                  nextStep = sequence.steps[i];
                  nextStepIndex = i;
                  break; // CRITICAL: Only create the NEXT step, not all future steps
                }
              }

              if (nextStep) {
                // Calculate delay from NOW (when email was sent), not from sequence start
                const delayMs = (nextStep.delayMinutes || 0) * 60 * 1000;
                const scheduledTime = Date.now() + delayMs;

                // If next step is an email, create email document
                if (nextStep.type === 'auto-email') {
                  const nextScheduledSendTime = scheduledTime;

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
                    aiPrompt: nextStep.emailSettings?.aiPrompt || nextStep.data?.aiPrompt || nextStep.aiPrompt || nextStep.content || 'Write a professional email',
                    aiMode: nextStep.data?.aiMode || nextStep.emailSettings?.aiMode || 'standard',
                    ownerId: emailData.ownerId,
                    assignedTo: emailData.assignedTo,
                    createdBy: emailData.createdBy,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                  });

                  if (!isProduction) {
                    logger.log(`[SendScheduledEmails] Created next step email (step ${nextStepIndex}) for contact ${emailData.contactId}`);
                  }
                }
                // If next step is a task, create task document
                else if (['phone-call', 'li-connect', 'li-message', 'li-view-profile', 'li-interact-post', 'task'].includes(nextStep.type)) {
                  // Load contact data to get name and company
                  let contactName = emailData.contactName || '';
                  let contactCompany = emailData.contactCompany || '';

                  try {
                    const contactDoc = await db.collection('people').doc(emailData.contactId).get();
                    if (contactDoc.exists) {
                      const contactData = contactDoc.data();
                      contactName = contactName || (contactData.firstName ? `${contactData.firstName} ${contactData.lastName || ''}`.trim() : contactData.name || '');
                      contactCompany = contactCompany || contactData.company || contactData.companyName || '';
                    }
                  } catch (contactError) {
                    logger.warn('[SendScheduledEmails] Failed to load contact data:', contactError);
                  }

                  const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  const dueDate = new Date(scheduledTime);

                  // Determine task type and title
                  let taskType = nextStep.type;
                  let taskTitle = nextStep.data?.note || nextStep.name || nextStep.label || '';

                  if (nextStep.type === 'phone-call') {
                    taskType = 'phone-call';
                    taskTitle = taskTitle || 'Call contact';
                  } else if (nextStep.type === 'li-connect') {
                    taskType = 'linkedin-connect';
                    taskTitle = taskTitle || 'Connect on LinkedIn';
                  } else if (nextStep.type === 'li-message') {
                    taskType = 'linkedin-message';
                    taskTitle = taskTitle || 'Send LinkedIn message';
                  } else if (nextStep.type === 'li-view-profile') {
                    taskType = 'linkedin-view';
                    taskTitle = taskTitle || 'View LinkedIn profile';
                  } else if (nextStep.type === 'li-interact-post') {
                    taskType = 'linkedin-interact';
                    taskTitle = taskTitle || 'Interact with LinkedIn post';
                  } else {
                    taskType = 'task';
                    taskTitle = taskTitle || 'Complete task';
                  }

                  await db.collection('tasks').doc(taskId).set({
                    id: taskId,
                    title: taskTitle,
                    contact: contactName,
                    contactId: emailData.contactId,
                    account: contactCompany,
                    type: taskType,
                    priority: nextStep.data?.priority || 'normal',
                    dueDate: dueDate.toLocaleDateString(),
                    dueTime: dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                    dueTimestamp: scheduledTime,
                    status: 'pending',
                    sequenceId: emailData.sequenceId,
                    sequenceName: emailData.sequenceName,
                    stepId: nextStep.id,
                    stepIndex: nextStepIndex,
                    isSequenceTask: true,
                    notes: nextStep.data?.note || '',
                    ownerId: emailData.ownerId,
                    assignedTo: emailData.assignedTo || emailData.ownerId,
                    createdBy: emailData.createdBy || emailData.ownerId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                  });

                  if (!isProduction) {
                    logger.log(`[SendScheduledEmails] Created next step task (step ${nextStepIndex}, type: ${taskType}) for contact ${emailData.contactId}`);
                  }
                }
              }
            }
          } catch (error) {
            logger.error('[SendScheduledEmails] Failed to create next step:', error);
            // Don't fail the whole process if next step creation fails
          }
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        logger.error('[SendScheduledEmails] Failed to send email:', emailDoc.id, error);
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
          logger.error('[SendScheduledEmails] Failed to update error status:', updateError);
        }
      }
    }

    if (!isProduction) {
      logger.log('[SendScheduledEmails] Send process complete. Sent:', sentCount, 'Errors:', errors.length);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: sentCount,
      errors: errors.length,
      errorDetails: errors
    }));

  } catch (error) {
    logger.error('[SendScheduledEmails] Fatal error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}
