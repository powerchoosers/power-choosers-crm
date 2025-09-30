// SendGrid email service for automated email sending
import sgMail from '@sendgrid/mail';
import { admin, db } from '../_firebase';

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export class SendGridService {
  constructor() {
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@powerchoosers.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'Power Choosers CRM';
  }

  /**
   * Send a single email via SendGrid
   */
  async sendEmail(emailData) {
    try {
      const { to, subject, content, from, trackingId, _deliverability } = emailData;
      
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

      // Prepare email message
      const msg = {
        to: Array.isArray(to) ? to : [to],
        from: {
          email: from || this.fromEmail,
          name: this.fromName
        },
        subject: subject,
        html: content,
        text: this.stripHtml(content),
        trackingSettings: {
          clickTracking: { enable: deliverabilitySettings.enableTracking },
          openTracking: { enable: deliverabilitySettings.enableTracking }
        }
      };

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
        await this.storeEmailRecord(emailData, response[0].headers['x-message-id']);
      }

      return {
        success: true,
        messageId: response[0].headers['x-message-id'],
        trackingId: trackingId
      };

    } catch (error) {
      console.error('[SendGrid] Email send error:', error);
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
        opens: [],
        replies: [],
        openCount: 0,
        replyCount: 0,
        status: 'sent',
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
