import admin from 'firebase-admin';
import { db } from './_firebase.js';
import sgMail from '@sendgrid/mail';

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
            console.log('[SendScheduledEmails] Email', emailDoc.id, 'already claimed or sent');
          }
          continue;
        }

        if (!isProduction) {
          console.log('[SendScheduledEmails] Sending email:', emailDoc.id);
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
                  console.warn('[SendScheduledEmails] Failed to fetch global settings:', err);
                }
              }

              // Resolve settings: Step > Global > Defaults
              emailSettings = resolveEmailSettings(stepEmailSettings, globalSettings);

              if (!isProduction) {
                console.log('[SendScheduledEmails] Resolved email settings:', emailSettings);
              }
            }
          } catch (error) {
            console.error('[SendScheduledEmails] Failed to fetch sequence settings:', error);
            // Continue with defaults if settings fetch fails
            emailSettings = resolveEmailSettings(null, null);
          }
        } else {
          // Non-sequence email: use defaults
          emailSettings = resolveEmailSettings(null, null);
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
          // Apply tracking settings from resolved settings
          trackingSettings: {
            openTracking: {
              enable: emailSettings.deliverability.openTracking,
              substitutionTag: '%open-track%'
            },
            clickTracking: {
              enable: emailSettings.deliverability.clickTracking,
              enableText: emailSettings.deliverability.clickTracking
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

        // Apply compliance headers based on settings
        if (emailSettings.deliverability.priorityHeaders) {
          msg.headers = msg.headers || {};
          msg.headers['X-Priority'] = '1';
          msg.headers['Importance'] = 'high';
        }

        if (emailSettings.deliverability.listUnsubscribe || emailSettings.compliance.unsubscribeLink) {
          msg.headers = msg.headers || {};
          // Add list-unsubscribe header (improves deliverability)
          const unsubscribeUrl = `${process.env.APP_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app'}/unsubscribe?email=${encodeURIComponent(emailData.to)}&id=${emailDoc.id}`;
          msg.headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
          msg.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        }

        if (emailSettings.deliverability.bulkHeaders) {
          msg.headers = msg.headers || {};
          msg.headers['Precedence'] = 'bulk';
        }

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
