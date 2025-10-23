// SendGrid email service for automated email sending
import sgMail from '@sendgrid/mail';
import { admin, db } from '../_firebase.js';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.')) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.log('[SendGrid] Invalid or missing API key - SendGrid functionality disabled');
}

export class SendGridService {
  constructor() {
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@powerchoosers.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'Power Choosers CRM';
  }

  /**
   * Check if email should be suppressed
   */
  async checkSuppression(email) {
    try {
      if (!db) {
        return { suppressed: false };
      }
      
      const suppressionDoc = await db.collection('suppressions').doc(email).get();
      
      if (suppressionDoc.exists) {
        const data = suppressionDoc.data();
        console.log(`[SendGrid] Email suppressed: ${email} - ${data.reason}`);
        return { suppressed: true, reason: data.reason };
      }
      
      return { suppressed: false };
    } catch (error) {
      console.error(`[SendGrid] Error checking suppression for ${email}:`, error);
      return { suppressed: false };
    }
  }

  /**
   * Send a single email via SendGrid
   */
          async sendEmail(emailData) {
    try {
              const { to, subject, content, from, trackingId, _deliverability, inReplyTo, references, threadId } = emailData;
      
      // Check if any recipients are suppressed
      const recipients = Array.isArray(to) ? to : [to];
      const suppressedEmails = [];
      
      for (const email of recipients) {
        const suppression = await this.checkSuppression(email);
        if (suppression.suppressed) {
          suppressedEmails.push({ email, reason: suppression.reason });
        }
      }
      
      // If all recipients are suppressed, don't send
      if (suppressedEmails.length === recipients.length) {
        console.log(`[SendGrid] All recipients suppressed, skipping send`);
        return {
          success: false,
          message: 'All recipients suppressed',
          suppressed: suppressedEmails
        };
      }
      
      // Filter out suppressed emails
      const allowedRecipients = recipients.filter(email => 
        !suppressedEmails.some(s => s.email === email)
      );
      
      if (allowedRecipients.length === 0) {
        console.log(`[SendGrid] No valid recipients after filtering suppressed emails`);
        return {
          success: false,
          message: 'No valid recipients',
          suppressed: suppressedEmails
        };
      }
      
      // Get deliverability settings
      const deliverabilitySettings = _deliverability || {
        enableTracking: true,
        includeBulkHeaders: false,
        includeListUnsubscribe: false,
        includePriorityHeaders: false,
        forceGmailOnly: false,
        useBrandedHtmlTemplate: false,
        signatureImageEnabled: true
      };

      // Prepare email message with filtered recipients
      // Generate both HTML and text versions for maximum compatibility
      const htmlContent = content;
      const textContent = this.stripHtml(content);
      
              const msg = {
        to: allowedRecipients,
        from: {
          email: from || this.fromEmail,
          name: this.fromName
        },
        subject: subject,
        html: htmlContent,
        text: textContent,
        trackingSettings: {
          clickTracking: { enable: deliverabilitySettings.enableTracking },
          openTracking: { enable: deliverabilitySettings.enableTracking }
        }
      };

              // Threading headers
              if (inReplyTo) {
                msg.headers = { ...(msg.headers || {}), 'In-Reply-To': inReplyTo };
              }
              if (references && references.length) {
                msg.headers = { ...(msg.headers || {}), 'References': references.join(' ') };
              }

      // Add custom headers based on deliverability settings
      if (deliverabilitySettings.includePriorityHeaders) {
        msg.headers = {
          ...msg.headers,
          'X-Priority': '3',
          'X-MSMail-Priority': 'Normal',
          'Importance': 'Normal'
        };
      }

      if (deliverabilitySettings.includeListUnsubscribe) {
        msg.headers = {
          ...msg.headers,
          'List-Unsubscribe': '<mailto:unsubscribe@powerchoosers.com>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        };
      }

      if (deliverabilitySettings.includeBulkHeaders) {
        msg.headers = {
          ...msg.headers,
          'Precedence': 'bulk'
        };
      }

      // Attach custom args so webhooks can resolve trackingId directly
      if (trackingId) {
        msg.customArgs = { trackingId };
      }

      // Send email via SendGrid
      const response = await sgMail.send(msg);
      
      console.log('[SendGrid] Email sent successfully:', {
        to: to,
        subject: subject,
        messageId: response[0].headers['x-message-id'],
        trackingId: trackingId
      });

      // Store email record in Firebase if tracking is enabled
              if (deliverabilitySettings.enableTracking && trackingId && db) {
                await this.storeEmailRecord({ ...emailData, threadId }, response[0].headers['x-message-id']);
      }

      return {
        success: true,
        messageId: response[0].headers['x-message-id'],
        trackingId: trackingId
      };

    } catch (error) {
      // Enhanced error logging as recommended by Twilio AI
      console.error('[SendGrid] Email send error:', error);
      
      // Log detailed SendGrid API error information
      if (error.response && error.response.body && error.response.body.errors) {
        console.error('[SendGrid] API Error Details:', error.response.body.errors);
        console.error('[SendGrid] Status Code:', error.response.status);
        console.error('[SendGrid] Response Headers:', error.response.headers);
      } else {
        console.error('[SendGrid] Full Error Object:', JSON.stringify(error, null, 2));
      }
      
      // Log the email data that failed (without sensitive content)
      console.error('[SendGrid] Failed Email Data:', {
        to: emailData.to,
        subject: emailData.subject,
        from: emailData.from,
        trackingId: emailData.trackingId,
        contentLength: emailData.content ? emailData.content.length : 0
      });
      
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send multiple emails (for sequences)
   */
  async sendBulkEmails(emails) {
    try {
      const results = [];
      
      for (const emailData of emails) {
        try {
          const result = await this.sendEmail(emailData);
          results.push({ success: true, ...result });
        } catch (error) {
          results.push({ 
            success: false, 
            error: error.message,
            email: emailData.to 
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[SendGrid] Bulk email error:', error);
      throw error;
    }
  }

  /**
   * Store email record in Firebase for tracking
   */
  async storeEmailRecord(emailData, messageId) {
    try {
      const emailRecord = {
        id: emailData.trackingId,
        to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
        subject: emailData.subject,
        content: emailData.content,
        from: emailData.from || this.fromEmail,
        sentAt: new Date().toISOString(),
        messageId: messageId,
                threadId: emailData.threadId || null,
                inReplyTo: emailData.inReplyTo || null,
                references: emailData.references || [],
        opens: [],
        replies: [],
        clicks: [],
        openCount: 0,
        clickCount: 0,
        status: 'sent',
        type: 'sent',              // Required for email filtering in emails.js
        emailType: 'sent',         // Alternative field for filtering
        isSentEmail: true,         // Additional flag for filtering
        provider: 'sendgrid',      // Identify the email provider
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.collection('emails').doc(emailData.trackingId).set(emailRecord);
      console.log('[SendGrid] Email record stored in Firebase:', emailData.trackingId);
    } catch (error) {
      console.error('[SendGrid] Firebase storage error:', error);
      // Don't throw - email was sent successfully
    }
  }

  /**
   * Strip HTML tags for text version
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Validate email address
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get email statistics
   */
  async getEmailStats(trackingId) {
    try {
      if (!db) return null;
      
      const emailDoc = await db.collection('emails').doc(trackingId).get();
      if (!emailDoc.exists) return null;

      const emailData = emailDoc.data();
      return {
        trackingId,
        openCount: emailData.openCount || 0,
        replyCount: emailData.replyCount || 0,
        lastOpened: emailData.lastOpened || null,
        lastReplied: emailData.lastReplied || null,
        status: emailData.status || 'unknown',
        sentAt: emailData.sentAt || null
      };
    } catch (error) {
      console.error('[SendGrid] Stats error:', error);
      return null;
    }
  }
}

export default SendGridService;
