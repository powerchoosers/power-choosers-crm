import admin from 'firebase-admin';
import { db } from './_firebase.js';
import { GmailService } from './email/gmail-service.js';
import { injectTracking, hasTrackingPixel } from './email/tracking-helper.js';
import logger from './_logger.js';

// Initialize Gmail service
const gmailService = new GmailService();

/**
 * Pre-send validation: Detect malformed AI generations that should not be sent
 * Returns { isValid: boolean, reason: string }
 */
function validateEmailBeforeSending(html, text, subject) {
  const content = (html || '') + ' ' + (text || '') + ' ' + (subject || '');
  
  // Patterns that indicate the AI returned a "meta" response instead of actual email
  const badPatterns = [
    { pattern: /i appreciate the detailed personalization/i, reason: 'AI asked for more information' },
    { pattern: /i need to clarify/i, reason: 'AI asked for clarification' },
    { pattern: /what i need to proceed/i, reason: 'AI requested more details' },
    { pattern: /please share the recipient/i, reason: 'AI requested recipient info' },
    { pattern: /once you provide these details/i, reason: 'AI waiting for details' },
    { pattern: /to write this email following your/i, reason: 'AI explaining what it needs' },
    { pattern: /\*\*the issue:\*\*/i, reason: 'AI meta-response with issue header' },
    { pattern: /\*\*what i need:\*\*/i, reason: 'AI meta-response with needs header' },
    { pattern: /\[contact_first_name\]/i, reason: 'Unfilled placeholder' },
    { pattern: /\[contact_company\]/i, reason: 'Unfilled placeholder' },
    { pattern: /\[contact_job_title\]/i, reason: 'Unfilled placeholder' },
    { pattern: /personalization instructions/i, reason: 'AI referencing instructions' },
    { pattern: /i'll write the email immediately/i, reason: 'AI promising to write later' },
    // Raw JSON artifacts
    { pattern: /"subject"\s*:\s*"/i, reason: 'Raw JSON content detected' },
    { pattern: /"greeting"\s*:\s*"/i, reason: 'Raw JSON content detected' },
    { pattern: /\{\s*"subject"\s*:/i, reason: 'Raw JSON content detected' }
  ];
  
  for (const { pattern, reason } of badPatterns) {
    if (pattern.test(content)) {
      return { isValid: false, reason };
    }
  }
  
  // Check for suspiciously short content
  const textOnly = (text || '').replace(/<[^>]+>/g, '').trim();
  if (textOnly.length < 30) {
    return { isValid: false, reason: 'Content too short' };
  }
  
  return { isValid: true, reason: null };
}

/**
 * Fetch and build signature HTML for a user
 * @param {string} ownerId - User email to fetch signature for
 * @returns {Object} { signatureHtml, signatureText } or empty strings if not available
 */
async function getUserSignature(ownerId) {
  if (!ownerId) {
    logger.warn('[SendScheduledEmails] getUserSignature called without ownerId');
    return { signatureHtml: '', signatureText: '' };
  }

  // Normalize ownerId to lowercase for consistent matching
  const normalizedOwnerId = String(ownerId).toLowerCase().trim();

  try {
    // Fetch user settings from Firestore
    // Settings are saved with doc ID like 'user-settings' (admin) or 'user-settings-{email}' (employee)
    // IMPORTANT: Try direct doc lookup FIRST to avoid matching call-scripts documents
    let settingsDoc = null;
    
    // Priority 1: Try direct document lookup by email-based ID (most reliable)
    const docId = `user-settings-${normalizedOwnerId}`;
    const directDoc = await db.collection('settings').doc(docId).get();
    if (directDoc.exists) {
      const data = directDoc.data();
      // Validate it's actually a settings doc (has emailSignature or general)
      if (data.emailSignature || data.general) {
        settingsDoc = directDoc;
      }
    }

    // Priority 2: Try legacy admin settings doc
    if (!settingsDoc) {
      const adminDoc = await db.collection('settings').doc('user-settings').get();
      if (adminDoc.exists) {
        const data = adminDoc.data();
        if (data.emailSignature || data.general) {
          settingsDoc = adminDoc;
        }
      }
    }

    // Priority 3: Fallback to ownerId query (but filter out call-scripts docs)
    if (!settingsDoc) {
      const querySnap = await db.collection('settings')
        .where('ownerId', '==', normalizedOwnerId)
        .get();
      
      // Filter to find actual settings documents (not call-scripts)
      for (const doc of querySnap.docs) {
        const data = doc.data();
        // Skip call-scripts documents (they don't have emailSignature)
        if (doc.id.startsWith('call-scripts-')) {
          continue;
        }
        // Check if it has the expected structure
        if (data.emailSignature || data.general) {
          settingsDoc = doc;
          break;
        }
      }
    }

    if (!settingsDoc) {
      logger.warn('[SendScheduledEmails] No settings found for user after all lookup attempts:', ownerId);
      return { signatureHtml: '', signatureText: '' };
    }

    const data = settingsDoc.data();
    const signature = data.emailSignature || {};
    const general = data.general || {};
    const sigText = signature.text || '';
    const sigImage = signature.image || '';
    const imageSize = signature.imageSize || { width: 200, height: 100 };
    const signatureImageEnabled = data.emailDeliverability?.signatureImageEnabled !== false;
    
    // Check if custom HTML signature is enabled
    const useCustomHtml = signature.useCustomHtml === true || signature.customHtmlEnabled === true;

    // If custom HTML signature is enabled, build premium signature
    if (useCustomHtml) {
      const customSignature = buildCustomHtmlSignature(general);
      const customSignatureText = buildCustomSignatureText(general);
      return { signatureHtml: customSignature, signatureText: customSignatureText };
    }

    if (!sigText && !sigImage) {
      return { signatureHtml: '', signatureText: '' };
    }

    // Build HTML signature (use email-safe inline styles, NO non-standard attributes)
    // Avoid contenteditable and data-* attributes as they may be stripped by email clients
    let signatureHtml = '<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #cccccc;">';
    
    if (sigText) {
      // Use explicit font-family for email compatibility
      const textHtml = sigText.replace(/\n/g, '<br>');
      signatureHtml += `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333333; line-height: 1.5;">${textHtml}</div>`;
    }
    
    // Include image if enabled
    if (sigImage && signatureImageEnabled) {
      const width = imageSize.width || 200;
      const height = imageSize.height || 100;
      signatureHtml += `<div style="margin-top: 12px;"><img src="${sigImage}" alt="Signature" width="${width}" height="${height}" style="max-width: ${width}px; max-height: ${height}px; border-radius: 4px; display: block;" /></div>`;
    }
    
    signatureHtml += '</div>';

    // Build plain text signature
    let signatureText = '\n\n---\n' + sigText;

    return { signatureHtml, signatureText };
  } catch (error) {
    logger.error('[SendScheduledEmails] Failed to fetch user signature:', error);
    return { signatureHtml: '', signatureText: '' };
  }
}

/**
 * Build custom HTML signature (premium style) using profile data
 * Email-client compatible: table-based layout, inline styles, no CSS classes
 */
function buildCustomHtmlSignature(general) {
  const g = general || {};
  
  // Get profile data with fallbacks
  const firstName = g.firstName || '';
  const lastName = g.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || 'Your Name';
  const title = g.jobTitle || 'Energy Strategist';
  const company = g.companyName || 'Power Choosers';
  const phone = g.phone || '+1 (817) 809-3367';
  const email = g.email || '';
  const location = g.location || 'Fort Worth, TX';
  const linkedIn = g.linkedIn || 'https://www.linkedin.com/company/power-choosers';
  const avatar = g.hostedPhotoURL || g.photoURL || '';
  
  // Clean phone for tel: link
  const phoneClean = phone.replace(/[^\d+]/g, '');
  
  // Build initials fallback
  const initials = `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
  
  // Build email-compatible HTML signature (table-based for maximum compatibility)
  // Reduced spacing: margin-top 8px + padding-top 8px = 16px total (was 36px)
  return `
<div style="margin-top: 8px; padding-top: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <!-- Orange gradient divider -->
    <div style="height: 2px; background: linear-gradient(to right, #f59e0b 0%, #f59e0b 40%, transparent 100%); margin-bottom: 24px;"></div>
    
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr>
            <!-- Avatar -->
            <td style="vertical-align: top; padding-right: 20px;">
                ${avatar ? `
                <img src="${avatar}" 
                     alt="${name}" 
                     width="72" 
                     height="72" 
                     style="border-radius: 50%; border: 2px solid #f59e0b; display: block; object-fit: cover;">
                ` : `
                <div style="width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); text-align: center; line-height: 72px; color: white; font-size: 24px; font-weight: 600;">
                    ${initials}
                </div>
                `}
            </td>
            
            <!-- Info -->
            <td style="vertical-align: top;">
                <!-- Name -->
                <div style="font-size: 16px; font-weight: 600; color: #0b1b45; margin-bottom: 2px; letter-spacing: -0.3px;">
                    ${name}
                </div>
                
                <!-- Title -->
                <div style="font-size: 13px; font-weight: 500; color: #f59e0b; margin-bottom: 8px; letter-spacing: 0.3px;">
                    ${title}
                </div>
                
                <!-- Company -->
                <div style="font-size: 12px; font-weight: 500; color: #1e3a8a; letter-spacing: 0.5px; margin-bottom: 14px;">
                    ${company}
                </div>
                
                <!-- Contact Details -->
                <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12px; color: #64748b;">
                    <!-- Phone -->
                    <tr>
                        <td style="padding: 3px 12px 3px 0; color: #94a3b8; font-weight: 500; min-width: 50px;">Phone</td>
                        <td style="padding: 3px 0;">
                            <a href="tel:${phoneClean}" style="color: #64748b; text-decoration: none;">${phone}</a>
                        </td>
                    </tr>
                    <!-- Email -->
                    <tr>
                        <td style="padding: 3px 12px 3px 0; color: #94a3b8; font-weight: 500;">Email</td>
                        <td style="padding: 3px 0;">
                            <a href="mailto:${email}" style="color: #64748b; text-decoration: none;">${email}</a>
                        </td>
                    </tr>
                    <!-- Location -->
                    <tr>
                        <td style="padding: 3px 12px 3px 0; color: #94a3b8; font-weight: 500;">Location</td>
                        <td style="padding: 3px 0; color: #64748b;">${location}</td>
                    </tr>
                </table>
                
                <!-- Social Links -->
                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                        <tr>
                            <!-- LinkedIn -->
                            <td style="padding-right: 16px;">
                                <a href="${linkedIn}" target="_blank" style="font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; display: inline-block;">
                                    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                            <td style="vertical-align: middle; padding-right: 8px;">
                                                <img src="https://img.icons8.com/ios-filled/16/64748b/linkedin.png" width="14" height="14" alt="" style="display: block;">
                                            </td>
                                            <td style="vertical-align: middle; line-height: 14px; color: #64748b;">LinkedIn</td>
                                        </tr>
                                    </table>
                                </a>
                            </td>
                            <!-- Website -->
                            <td style="padding-right: 16px;">
                                <a href="https://powerchoosers.com" target="_blank" style="font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; display: inline-block;">
                                    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                            <td style="vertical-align: middle; padding-right: 8px;">
                                                <img src="https://img.icons8.com/ios-filled/16/64748b/domain.png" width="14" height="14" alt="" style="display: block;">
                                            </td>
                                            <td style="vertical-align: middle; line-height: 14px; color: #64748b;">Website</td>
                                        </tr>
                                    </table>
                                </a>
                            </td>
                            <!-- Schedule -->
                            <td>
                                <a href="https://powerchoosers.com/schedule" target="_blank" style="font-size: 12px; font-weight: 500; color: #64748b; text-decoration: none; display: inline-block;">
                                    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse: collapse;">
                                        <tr>
                                            <td style="vertical-align: middle; padding-right: 8px;">
                                                <img src="https://img.icons8.com/ios-filled/16/64748b/calendar--v1.png" width="14" height="14" alt="" style="display: block;">
                                            </td>
                                            <td style="vertical-align: middle; line-height: 14px; color: #64748b;">Schedule</td>
                                        </tr>
                                    </table>
                                </a>
                            </td>
                        </tr>
                    </table>
                </div>
            </td>
        </tr>
    </table>
    
    <!-- Tagline -->
    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #a0aec0; font-weight: 500; letter-spacing: 0.3px;">
        Power Choosers — Choose Wisely. Power Your Savings. 
        <a href="https://powerchoosers.com" target="_blank" style="color: #f59e0b; text-decoration: none; font-weight: 600;">powerchoosers.com</a>
    </div>
</div>`;
}

/**
 * Build plain text version of custom signature
 */
function buildCustomSignatureText(general) {
  const g = general || {};
  const name = `${g.firstName || ''} ${g.lastName || ''}`.trim();
  const title = g.jobTitle || 'Energy Strategist';
  const company = g.companyName || 'Power Choosers';
  const phone = g.phone || '';
  const email = g.email || '';
  const location = g.location || 'Fort Worth, TX';
  
  let text = '\n\n---\n';
  text += `${name}\n`;
  text += `${title}\n`;
  text += `${company}\n\n`;
  if (phone) text += `Phone: ${phone}\n`;
  if (email) text += `Email: ${email}\n`;
  if (location) text += `Location: ${location}\n`;
  text += '\nChoose Wisely. Power Your Savings.\npowerchoosers.com';
  return text;
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
    logger.debug('[SendScheduledEmails] Starting send process');

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
      logger.debug('[SendScheduledEmails] Immediate send requested for email:', emailId);
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

      logger.debug('[SendScheduledEmails] Processing immediate send for email:', emailId);
    } else {
    // Query for emails that are ready to send.
    // IMPORTANT: We now treat both 'approved' and 'pending_approval' as sendable
    // once their scheduledSendTime has passed. This allows sequences to continue
    // even if the user doesn't manually approve every email.
    // Note: This runs server-side with Firebase Admin SDK, which bypasses Firestore rules
    // The ownership fields were added during email creation to ensure client-side queries work
    // Limit to 50 emails per run (Gmail API has very high quota: 1 billion quota units/day)
    const readyToSendQuery = db.collection('emails')
      .where('type', '==', 'scheduled')
      .where('status', 'in', ['approved', 'pending_approval'])
      .where('scheduledSendTime', '<=', now)
      .limit(50);

      readyToSendSnapshot = await readyToSendQuery.get();
    }

    if (readyToSendSnapshot.empty) {
      logger.debug('[SendScheduledEmails] No emails ready to send');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: 0,
        message: 'No emails ready to send'
      }));
      return;
    }

    logger.debug('[SendScheduledEmails] Found', readyToSendSnapshot.size, 'emails ready to send');

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
            logger.debug('[SendScheduledEmails] Email', emailDoc.id, 'already claimed or sent');
          }
          continue;
        }

        logger.debug('[SendScheduledEmails] Sending email:', emailDoc.id);

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

              logger.debug('[SendScheduledEmails] Resolved email settings:', emailSettings);
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

        // CRITICAL: Pre-send validation - block malformed AI generations
        const preSendValidation = validateEmailBeforeSending(
          emailData.html,
          emailData.text,
          emailData.subject
        );
        
        if (!preSendValidation.isValid) {
          logger.error(`[SendScheduledEmails] ⚠️ BLOCKED BAD EMAIL ${emailDoc.id}: ${preSendValidation.reason}`);
          
          // Mark as needs_regeneration and reset status
          await emailDoc.ref.update({
            status: 'not_generated', // Reset to trigger regeneration
            blockedFromSending: true,
            blockedReason: preSendValidation.reason,
            blockedAt: Date.now(),
            generationAttempts: (emailData.generationAttempts || 0) + 1,
            // Preserve ownership
            ownerId: emailData.ownerId,
            assignedTo: emailData.assignedTo || emailData.ownerId,
            createdBy: emailData.createdBy || emailData.ownerId
          });
          
          errors.push({
            emailId: emailDoc.id,
            error: `Blocked: ${preSendValidation.reason}`,
            willRetry: true
          });
          
          continue; // Skip this email
        }

        // Prepare email content with signature if enabled
        let finalHtml = emailData.html || '';
        let finalText = emailData.text || '';

        // Log signature settings for debugging
        logger.debug('[SendScheduledEmails] Signature settings:', {
          emailId: emailDoc.id,
          includeSignature: emailSettings.content.includeSignature,
          ownerId: emailData.ownerId,
          htmlLength: finalHtml.length
        });

        // Add signature if enabled in settings
        if (emailSettings.content.includeSignature) {
          // Check if this is a full HTML template (has DOCTYPE or full HTML structure)
          const isHtmlTemplate = finalHtml.includes('<!DOCTYPE html>') || 
                                 (finalHtml.includes('<html') && finalHtml.includes('</html>'));
          
          logger.debug('[SendScheduledEmails] HTML template check:', {
            emailId: emailDoc.id,
            isHtmlTemplate,
            hasDoctype: finalHtml.includes('<!DOCTYPE html>'),
            hasHtmlTags: finalHtml.includes('<html') && finalHtml.includes('</html>')
          });
          
          if (isHtmlTemplate) {
            // HTML template emails: Keep hardcoded signature (don't modify)
            // HTML templates already have their own signature built into the template
            // This matches the behavior in email-compose-global.js
          } else {
            // Standard email (HTML fragment): Append signature from settings
            const { signatureHtml, signatureText } = await getUserSignature(emailData.ownerId);
            
            if (signatureHtml) {
              // Append signature to end of HTML fragment
              finalHtml = finalHtml + signatureHtml;
            }
            
            if (signatureText) {
              // Append plain text signature
              finalText = finalText + signatureText;
            }
          }
        }

        // Inject custom tracking pixel and click tracking
        // Use email document ID as tracking ID (already exists in Firestore)
        const trackingId = emailDoc.id;
        if (!hasTrackingPixel(finalHtml)) {
          const enableOpenTracking = emailSettings?.deliverability?.openTracking !== false;
          const enableClickTracking = emailSettings?.deliverability?.clickTracking !== false;
          
          finalHtml = injectTracking(finalHtml, trackingId, {
            enableOpenTracking,
            enableClickTracking
          });
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
        
        logger.debug('[SendScheduledEmails] Email sent successfully via Gmail:', emailDoc.id, sendResult.messageId);

        // Update email record with FINAL HTML that includes signature
        // CRITICAL: Save the actual sent content so CRM display matches what recipient received
        // CRITICAL: Initialize tracking fields to match manual emails structure
        // This ensures tracking pixels display correctly in emails-redesigned.js sent tab
        // CRITICAL: Preserve ownership fields for Firestore rules compliance
        await emailDoc.ref.update({
          type: 'sent',
          status: 'sent',
          emailType: 'sent',           // Required for emails-redesigned.js filter
          isSentEmail: true,           // Required for emails-redesigned.js filter
          // Save the FINAL HTML/text that was actually sent (includes signature)
          html: finalHtml,
          text: finalText,
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
          updatedAt: new Date().toISOString(),
          // Preserve ownership fields (required for Firestore rules - ownerId must not change on update)
          ownerId: emailData.ownerId,
          assignedTo: emailData.assignedTo || emailData.ownerId,
          createdBy: emailData.createdBy || emailData.ownerId
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
                    // CRITICAL: Set ownership fields for Firestore rules compliance
                    // Fallback to admin if emailData.ownerId not provided
                    ownerId: (emailData.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                    assignedTo: (emailData.assignedTo || emailData.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                    createdBy: (emailData.createdBy || emailData.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                  });

                  logger.debug(`[SendScheduledEmails] Created next step email (step ${nextStepIndex}) for contact ${emailData.contactId}`);
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
                    // CRITICAL: Set ownership fields for Firestore rules compliance
                    // Fallback to admin if emailData.ownerId not provided
                    ownerId: (emailData.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                    assignedTo: (emailData.assignedTo || emailData.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                    createdBy: (emailData.createdBy || emailData.ownerId || 'l.patterson@powerchoosers.com').toLowerCase().trim(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                  });

                  logger.debug(`[SendScheduledEmails] Created next step task (step ${nextStepIndex}, type: ${taskType}) for contact ${emailData.contactId}`);
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
        // Preserve ownership fields for Firestore rules compliance
        try {
          await emailDoc.ref.update({
            status: 'error',
            errorMessage: error.message,
            errorCode: error.code,
            lastAttemptAt: Date.now(),
            // Preserve ownership fields (required for Firestore rules)
            ownerId: emailData.ownerId,
            assignedTo: emailData.assignedTo || emailData.ownerId,
            createdBy: emailData.createdBy || emailData.ownerId
          });
        } catch (updateError) {
          logger.error('[SendScheduledEmails] Failed to update error status:', updateError);
        }
      }
    }

    logger.debug('[SendScheduledEmails] Send process complete. Sent:', sentCount, 'Errors:', errors.length);

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
