// SendGrid email service for automated email sending
import sgMail from '@sendgrid/mail';
import { admin, db } from '../_firebase.js';
import sanitizeHtml from 'sanitize-html';
import juice from 'juice';
import logger from '../_logger.js';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.')) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  logger.warn('[SendGrid] Invalid or missing API key - SendGrid functionality disabled');
}

export class SendGridService {
  constructor() {
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'l.patterson@powerchoosers.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'Lewis Patterson';
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
        logger.debug(`[SendGrid] Email suppressed: ${email} - ${data.reason}`);
        return { suppressed: true, reason: data.reason };
      }

      return { suppressed: false };
    } catch (error) {
      logger.error(`[SendGrid] Error checking suppression for ${email}:`, error);
      return { suppressed: false };
    }
  }

  /**
   * Look up contact name by email address (with Firebase fallback)
   * Returns formatted "FirstName LastName" or null if not found
   */
  async lookupContactName(emailAddress) {
    if (!emailAddress || typeof emailAddress !== 'string' || !emailAddress.includes('@')) {
      return null;
    }

    const normalizedEmail = emailAddress.toLowerCase().trim();

    try {
      if (!db) {
        return null;
      }

      // Try contacts collection first
      let snap = await db.collection('contacts')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      // Fallback to people collection
      if (!snap || snap.empty) {
        snap = await db.collection('people')
          .where('email', '==', normalizedEmail)
          .limit(1)
          .get();
      }

      if (snap && !snap.empty) {
        const doc = snap.docs[0];
        const contact = doc.data();

        // Build full name from contact
        const firstName = contact.firstName || '';
        const lastName = contact.lastName || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

        if (fullName) {
          return fullName;
        }

        // Fallback to contact name field
        if (contact.name) {
          return contact.name;
        }
      }
    } catch (error) {
      logger.warn(`[SendGrid] Error looking up contact name for ${emailAddress}:`, error);
    }

    return null;
  }

  /**
   * Format email username as "First Last" (e.g., aaron.rodriguez -> Aaron Rodriguez)
   */
  formatEmailAsName(emailUsername) {
    if (!emailUsername || typeof emailUsername !== 'string') {
      return null;
    }

    const cleaned = emailUsername.toLowerCase().trim();
    let parts = [];

    // Handle common separators
    if (cleaned.includes('.')) {
      parts = cleaned.split('.');
    } else if (cleaned.includes('_')) {
      parts = cleaned.split('_');
    } else if (cleaned.includes('-')) {
      parts = cleaned.split('-');
    } else {
      // Single word - just capitalize
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    // Capitalize each part and join
    parts = parts
      .filter(p => p.length > 0)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1));

    if (parts.length >= 2) {
      return parts.join(' ');
    } else if (parts.length === 1) {
      return parts[0];
    }

    return null;
  }

  /**
   * Send a single email via SendGrid
   */
  async sendEmail(emailData) {
    try {
      const { to, subject, content, from, fromName, trackingId, _deliverability, inReplyTo, references, threadId, isHtmlEmail } = emailData;

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
        logger.warn(`[SendGrid] All recipients suppressed, skipping send`);
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
        logger.warn(`[SendGrid] No valid recipients after filtering suppressed emails`);
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

      // STEP 1: Validate and sanitize HTML content (per Twilio recommendations)
      let htmlContent = content;

      // Validate UTF-8 encoding
      if (typeof htmlContent !== 'string') {
        throw new Error('Content must be a valid UTF-8 string');
      }

      // Check for UTF-8 validity
      try {
        // This will throw if content is not valid UTF-8
        Buffer.from(htmlContent, 'utf8');
      } catch (utf8Error) {
        throw new Error('Content must be valid UTF-8 encoded');
      }

      // Sanitize and inline CSS for HTML emails (per Twilio recommendations)
      if (isHtmlEmail) {
        // Step 1: Remove dangerous tags (script, iframe, etc.)
        htmlContent = htmlContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
          .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
          .replace(/javascript:/gi, '');

        // Step 2: Inline all CSS styles using juice
        try {
          htmlContent = juice(htmlContent, {
            removeStyleTags: true,
            preserveMediaQueries: true,
            preserveFontFaces: true,
            webResources: {
              images: false,
              svgs: false,
              scripts: false,
              links: false
            }
          });
        } catch (inlineError) {
          logger.error('[SendGrid] CSS inlining failed:', inlineError.message);
          // Fallback: remove <style> tags but keep the HTML structure
          htmlContent = htmlContent
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
          logger.warn('[SendGrid] CSS inlining failed, removed <style> tags as fallback');
        }
      }

      // STEP 2: Generate text version with robust error handling
      let textContent = '';

      try {
        textContent = isHtmlEmail ?
          this.generateTextFromHtml(htmlContent) :
          this.stripHtml(htmlContent);
      } catch (textGenError) {
        logger.error('[SendGrid] Error generating text content:', textGenError);
        // Fallback to basic HTML stripping
        textContent = this.stripHtml(htmlContent) || 'HTML email content';
      }

      // Ensure text content is always a valid non-empty string
      if (!textContent || typeof textContent !== 'string' || textContent.trim().length === 0) {
        logger.warn('[SendGrid] Text content is empty, using fallback');
        textContent = 'HTML email content - please view in HTML format';
      }

      // Validate both contents are valid strings before sending
      if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
        throw new Error('HTML content cannot be empty after sanitization');
      }

      if (!textContent || typeof textContent !== 'string' || textContent.trim().length === 0) {
        throw new Error('Text content cannot be empty');
      }

      logger.debug('[SendGrid] Email type:', isHtmlEmail ? 'HTML' : 'Standard', 'Content length:', content.length);
      logger.debug('[SendGrid] Text content length:', textContent.length);

      // Log sender details for debugging
      const finalFromEmail = from || this.fromEmail;
      const finalFromName = fromName || this.fromName;
      logger.debug('[SendGrid] Sending email with from:', {
        email: finalFromEmail,
        name: finalFromName
      });

      const msg = {
        to: allowedRecipients,
        from: {
          email: finalFromEmail,
          name: finalFromName
        },
        subject: subject,
        html: htmlContent,
        text: textContent,
        trackingSettings: {
          clickTracking: {
            enable: deliverabilitySettings.enableClickTracking !== undefined
              ? deliverabilitySettings.enableClickTracking
              : deliverabilitySettings.enableTracking
          },
          openTracking: {
            enable: deliverabilitySettings.enableOpenTracking !== undefined
              ? deliverabilitySettings.enableOpenTracking
              : deliverabilitySettings.enableTracking
          }
        },
        // Add personalizations with customArgs for webhook matching
        // Include recipient names if available
        personalizations: await Promise.all(
          allowedRecipients.map(async (recipient) => {
            // Look up contact name from CRM
            let recipientName = await this.lookupContactName(recipient);

            // If no contact found, format email username as name
            if (!recipientName) {
              const emailMatch = recipient.match(/^(.+)@/);
              if (emailMatch) {
                recipientName = this.formatEmailAsName(emailMatch[1]);
              }
            }

            // Build to array with name if available
            const toArray = recipientName
              ? [{ email: recipient, name: recipientName }]
              : [{ email: recipient }];

            return {
              to: toArray,
              customArgs: {
                trackingId: trackingId || ''
              }
            };
          })
        )
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

      // STEP 3: Final validation before sending (per Twilio recommendations)
      // Validate message structure
      if (!msg.html || typeof msg.html !== 'string') {
        throw new Error('Invalid HTML content type');
      }
      if (!msg.text || typeof msg.text !== 'string') {
        throw new Error('Invalid text content type');
      }

      // Check content size limits (Twilio recommends <1MB for content, 30MB total payload)
      const MAX_CONTENT_SIZE = 1048576; // 1MB (per Twilio recommendation for practical limits)
      const MAX_TOTAL_SIZE = 31457280; // 30MB total payload limit

      if (msg.html.length > MAX_CONTENT_SIZE) {
        throw new Error(`HTML content too large: ${msg.html.length} bytes (recommended max: ${MAX_CONTENT_SIZE} bytes / 1MB)`);
      }

      if (msg.text.length > MAX_CONTENT_SIZE) {
        throw new Error(`Text content too large: ${msg.text.length} bytes (recommended max: ${MAX_CONTENT_SIZE} bytes / 1MB)`);
      }

      const totalSize = msg.html.length + msg.text.length + (msg.subject?.length || 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        throw new Error(`Total payload too large: ${totalSize} bytes (max: ${MAX_TOTAL_SIZE} bytes / 30MB)`);
      }

      // Ensure all header values are strings (per Twilio recommendation)
      if (msg.headers) {
        for (const [key, value] of Object.entries(msg.headers)) {
          if (typeof value !== 'string') {
            logger.warn(`[SendGrid] Converting header ${key} to string`);
            msg.headers[key] = String(value);
          }
        }
      }

      // STEP 4: Send email via SendGrid with enhanced error logging
      let response;
      try {
        response = await sgMail.send(msg);
      } catch (sendError) {
        // Enhanced error logging per Twilio recommendations
        const errorDetails = {
          message: sendError.message,
          code: sendError.code,
          stack: sendError.stack
        };

        // Log SendGrid API error response details (per Twilio recommendation)
        if (sendError.response) {
          errorDetails.response = {
            statusCode: sendError.response.statusCode,
            status: sendError.response.status,
            body: sendError.response.body,
            headers: sendError.response.headers
          };

          // Extract detailed error messages from SendGrid response
          if (sendError.response.body && sendError.response.body.errors) {
            errorDetails.sendGridErrors = sendError.response.body.errors.map(err => ({
              message: err.message,
              field: err.field,
              help: err.help
            }));
            logger.error('[SendGrid] SendGrid API Error Details:', errorDetails.sendGridErrors);
          }

          // Log specific error codes
          if (sendError.response.statusCode === 413) {
            logger.error('[SendGrid] Payload Too Large - content exceeds SendGrid limits');
          } else if (sendError.response.statusCode === 400) {
            logger.error('[SendGrid] Bad Request - check payload structure and headers');
          }
        }

        // Log payload information for debugging
        errorDetails.payloadInfo = {
          htmlLength: msg.html.length,
          textLength: msg.text.length,
          subjectLength: msg.subject?.length || 0,
          recipientCount: msg.to?.length || 0,
          hasHeaders: !!msg.headers,
          headerCount: msg.headers ? Object.keys(msg.headers).length : 0
        };

        logger.error('[SendGrid] SendGrid API error (full details):', JSON.stringify(errorDetails, null, 2));
        throw sendError;
      }

      logger.debug('[SendGrid] Email sent successfully:', {
        to: to,
        subject: subject,
        messageId: response[0]?.headers?.['x-message-id'] || 'unknown',
        trackingId: trackingId
      });

      // Store email record in Firebase (always store regardless of tracking setting)
      if (trackingId && db) {
        const messageId = response[0]?.headers?.['x-message-id'] || null;
        if (messageId) {
          await this.storeEmailRecord({ ...emailData, threadId }, messageId);
        }
      }

      return {
        success: true,
        messageId: response[0]?.headers?.['x-message-id'] || null,
        trackingId: trackingId
      };

    } catch (error) {
      // Enhanced error logging as recommended by Twilio AI
      logger.error('[SendGrid] Email send error:', error);

      // Log detailed SendGrid API error information
      if (error.response && error.response.body && error.response.body.errors) {
        logger.error('[SendGrid] API Error Details:', error.response.body.errors);
        logger.error('[SendGrid] Status Code:', error.response.status);
        logger.error('[SendGrid] Response Headers:', error.response.headers);
      } else {
        logger.error('[SendGrid] Full Error Object:', JSON.stringify(error, null, 2));
      }

      // Log the email data that failed (without sensitive content)
      logger.error('[SendGrid] Failed Email Data:', {
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
      logger.error('[SendGrid] Bulk email error:', error);
      throw error;
    }
  }

  /**
   * Store email record in Firebase for tracking
   */
  async storeEmailRecord(emailData, messageId) {
    try {
      const now = new Date().toISOString();
      const emailRecord = {
        id: emailData.trackingId,
        to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
        subject: emailData.subject,
        content: emailData.content,
        from: emailData.from || this.fromEmail,
        sentAt: now,
        date: now,                  // Add date field for emails page sorting
        timestamp: now,             // Add timestamp field for emails page fallback
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
        ownerId: emailData.userEmail || null,     // Required for non-admin users
        assignedTo: emailData.userEmail || null,  // Required for non-admin users
        createdAt: now,
        updatedAt: now
      };

      await db.collection('emails').doc(emailData.trackingId).set(emailRecord);
      logger.debug('[SendGrid] Email record stored in Firebase:', emailData.trackingId);
    } catch (error) {
      logger.error('[SendGrid] Firebase storage error:', error);
      // Don't throw - email was sent successfully
    }
  }

  /**
   * Sanitize HTML content before sending (per Twilio recommendations)
   * Removes dangerous tags (script, iframe) while preserving email HTML structure
   */
  sanitizeHtmlForSending(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    try {
      // Use sanitize-html library to remove dangerous tags while preserving email structure
      const sanitized = sanitizeHtml(html, {
        // Include HTML document structure tags (email clients may strip them, but we preserve them)
        allowedTags: [
          'html', 'head', 'body', 'style', 'meta', 'title', // Document structure
          'p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sup', 'sub',
          'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
          'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
          'font', 'center', 'section', 'article', 'header', 'footer'
        ],
        // Disallow dangerous tags (per Twilio recommendations)
        disallowedTagsMode: 'discard',
        // Allow all attributes needed for email HTML
        allowedAttributes: {
          '*': ['style', 'class', 'id', 'dir', 'align', 'width', 'height', 'bgcolor', 'cellpadding', 'cellspacing', 'border', 'valign'],
          'html': ['lang'],
          'meta': ['charset', 'name', 'content', 'http-equiv'],
          'a': ['href', 'name', 'target', 'rel', 'title'],
          'img': ['src', 'alt', 'width', 'height', 'style', 'title', 'border'],
          'table': ['width', 'border', 'cellpadding', 'cellspacing', 'style', 'bgcolor', 'align'],
          'td': ['width', 'colspan', 'rowspan', 'style', 'align', 'valign', 'bgcolor'],
          'th': ['width', 'colspan', 'rowspan', 'style', 'align', 'valign', 'bgcolor'],
          'font': ['color', 'size', 'face']
        },
        // Allowed URL schemes
        allowedSchemes: ['http', 'https', 'mailto'],
        // Transform tags to remove dangerous content
        transformTags: {
          'a': (tagName, attribs) => {
            // Ensure href doesn't contain javascript:
            if (attribs.href && attribs.href.toLowerCase().startsWith('javascript:')) {
              attribs.href = '#';
            }
            // Remove target="_blank" without rel="noopener" for security
            if (attribs.target === '_blank' && !attribs.rel) {
              attribs.rel = 'noopener noreferrer';
            }
            return { tagName, attribs };
          },
          'img': (tagName, attribs) => {
            // Block data URLs that are too large (potential security issue)
            if (attribs.src && attribs.src.startsWith('data:') && attribs.src.length > 100000) {
              attribs.src = ''; // Remove very large inline images
            }
            return { tagName, attribs };
          }
        }
      });

      // Additional cleanup: Remove any remaining dangerous content (belt and suspenders)
      // This ensures we catch anything that sanitize-html might have missed
      let cleaned = sanitized
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // Remove iframe tags
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers (onclick, onload, etc.)
        .replace(/javascript:/gi, '') // Remove javascript: URLs
        .replace(/data:text\/html/gi, ''); // Remove data:text/html URLs

      return cleaned;
    } catch (error) {
      logger.error('[SendGrid] HTML sanitization error:', error);
      // Fallback: just remove dangerous tags, preserve everything else
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '');
    }
  }

  /**
   * Strip HTML tags for text version
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Generate proper text version from HTML email
   */
  generateTextFromHtml(html) {
    if (!html || typeof html !== 'string') {
      logger.warn('[SendGrid] Invalid HTML input for text generation');
      return 'HTML email content';
    }

    // Limit processing for very large HTML to prevent memory issues
    const MAX_HTML_LENGTH = 1000000; // 1MB limit
    if (html.length > MAX_HTML_LENGTH) {
      logger.warn('[SendGrid] HTML content too large, using simplified text extraction');
      return this.stripHtml(html.substring(0, MAX_HTML_LENGTH)) || 'HTML email content';
    }

    try {
      let text = String(html);

      // Remove script and style tags completely (handle nested tags)
      text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

      // Convert common HTML elements to text equivalents
      text = text.replace(/<br\s*\/?>/gi, '\n');
      text = text.replace(/<\/p>/gi, '\n\n');
      text = text.replace(/<\/div>/gi, '\n');
      text = text.replace(/<\/h[1-6]>/gi, '\n\n');
      text = text.replace(/<li>/gi, '• ');
      text = text.replace(/<\/li>/gi, '\n');
      text = text.replace(/<\/ul>/gi, '\n');
      text = text.replace(/<\/ol>/gi, '\n');

      // Replace links with text and URL (handle multiline links)
      text = text.replace(/<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, url, linkText) => {
        const cleanText = linkText.replace(/<[^>]*>/g, '').trim();
        return cleanText ? `${cleanText} (${url})` : url;
      });

      // Replace images with alt text
      text = text.replace(/<img[^>]*alt\s*=\s*["']([^"']+)["'][^>]*>/gi, '$1');
      text = text.replace(/<img[^>]*>/gi, '[Image]');

      // Remove all remaining HTML tags
      text = text.replace(/<[^>]*>/g, '');

      // Decode common HTML entities
      const entityMap = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'"
      };
      Object.entries(entityMap).forEach(([entity, char]) => {
        text = text.replace(new RegExp(entity, 'gi'), char);
      });

      // Decode numeric entities
      text = text.replace(/&#(\d+);/g, (match, dec) => {
        try {
          return String.fromCharCode(parseInt(dec, 10));
        } catch {
          return match;
        }
      });

      // Clean up whitespace
      text = text.replace(/\n\s*\n\s*\n+/g, '\n\n'); // Max 2 consecutive newlines
      text = text.replace(/[ \t]+/g, ' '); // Multiple spaces to single space
      text = text.replace(/\n /g, '\n'); // Remove leading spaces on new lines
      text = text.replace(/ \n/g, '\n'); // Remove trailing spaces before newlines

      const result = text.trim();

      // Ensure we always return non-empty content
      if (!result || result.length === 0) {
        logger.warn('[SendGrid] Generated text is empty after processing, using basic strip');
        const basicStrip = this.stripHtml(html);
        return basicStrip && basicStrip.length > 0 ? basicStrip : 'HTML email content - please view in HTML format';
      }

      // Limit text length to prevent SendGrid issues
      const MAX_TEXT_LENGTH = 100000;
      if (result.length > MAX_TEXT_LENGTH) {
        logger.warn('[SendGrid] Text content too long, truncating');
        return result.substring(0, MAX_TEXT_LENGTH) + '... [content truncated]';
      }

      return result;
    } catch (e) {
      logger.error('[SendGrid] Failed to generate text from HTML:', e);
      // Multiple fallback strategies
      try {
        const basicStrip = this.stripHtml(html);
        if (basicStrip && basicStrip.length > 0) {
          return basicStrip;
        }
      } catch (stripError) {
        logger.error('[SendGrid] Even basic strip failed:', stripError);
      }

      // Final fallback
      return 'HTML email content - please view in HTML format';
    }
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
      logger.error('[SendGrid] Stats error:', error);
      return null;
    }
  }
}

export default SendGridService;
