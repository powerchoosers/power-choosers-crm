// Zoho Mail service for sending emails via Zoho Mail API
import { getValidAccessToken } from './zoho-token-manager.js';
import logger from '../_logger.js';

export class ZohoMailService {
    constructor() {
        // Default to v1 which is required for Mail API
        this.baseUrl = process.env.ZOHO_BASE_URL || 'https://mail.zoho.com/api/v1';
        this.accountId = process.env.ZOHO_ACCOUNT_ID;
    }

    /**
     * Send an email via Zoho Mail API
     * @param {Object} emailData - Email data
     * @param {string} emailData.to - Recipient email address
     * @param {string} emailData.subject - Email subject
     * @param {string} emailData.html - HTML content
     * @param {string} emailData.text - Plain text content
     * @param {string} emailData.from - Optional sender email override
     * @param {string} emailData.fromName - Optional sender name override
     * @param {Array} emailData.attachments - Optional attachments array
     * @returns {Promise<Object>} - Response with messageId
     */
    async sendEmail(emailData) {
        const { to, subject, html, text, from, fromName, attachments } = emailData;

        if (!this.accountId) {
            throw new Error('ZOHO_ACCOUNT_ID not configured');
        }

        // Retry logic for token expiration
        let lastError = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                // Get valid access token (will auto-refresh if needed)
                const accessToken = await getValidAccessToken();

                logger.info(`[Zoho Mail] Sending email to: ${to} (attempt ${attempt})`, 'zoho-service');

                // Prepare email payload according to Zoho API spec
                // Format: "Name <email>" for sender display name
                const senderEmail = from || `lewis@nodalpoint.io`;
                const fromAddress = fromName
                    ? `${fromName} <${senderEmail}>`
                    : senderEmail;

                const payload = {
                    fromAddress: fromAddress,
                    toAddress: to,
                    subject: subject,
                    content: html || text,
                    mailFormat: html ? 'html' : 'plaintext',
                };

                // Add attachments if provided
                if (attachments && attachments.length > 0) {
                    payload.attachments = attachments.map(att => ({
                        attachmentName: att.filename,
                        content: att.content, // base64 encoded
                    }));
                }

                // Send email via Zoho API
                const response = await fetch(`${this.baseUrl}/accounts/${this.accountId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`[Zoho Mail] API error (attempt ${attempt}): Status ${response.status} - ${errorText}`, 'zoho-service');

                    // Detailed error info for debugging
                    let errorInfo = errorText;
                    try {
                        const parsedError = JSON.parse(errorText);
                        if (parsedError.status && parsedError.status.description) {
                            errorInfo = parsedError.status.description;
                        }
                    } catch (e) {
                        // Not JSON, use raw text
                    }

                    // If token expired (401) on first attempt, clear cache and retry
                    if (response.status === 401 && attempt === 1) {
                        logger.warn('[Zoho Mail] Token expired (401), clearing cache and retrying...', 'zoho-service');
                        const { clearTokenCache } = await import('./zoho-token-manager.js');
                        clearTokenCache();
                        lastError = new Error(`Token expired (401): ${errorInfo}`);
                        continue; // Retry
                    }

                    throw new Error(`Zoho API error: ${response.status} - ${errorInfo}`);
                }

                const result = await response.json();

                logger.info(`[Zoho Mail] Email sent successfully on attempt ${attempt}`, 'zoho-service');

                // Zoho returns the message data in the response
                return {
                    messageId: result.data?.messageId || result.data?.message_id || 'unknown',
                    success: true,
                };
            } catch (error) {
                lastError = error;

                // If this is not a 401 or it's the last attempt, throw immediately
                if (attempt === 2 || !error.message?.includes('401')) {
                    logger.error(`[Zoho Mail] Send error (attempt ${attempt}):`, error, 'zoho-service');
                    throw error;
                }

                // Otherwise continue to retry
                logger.warn(`[Zoho Mail] Error on attempt ${attempt}, retrying...`, 'zoho-service');
            }
        }

        // Should never reach here, but just in case
        throw lastError || new Error('Failed to send email after retries');
    }

    /**
     * Initialize service (for compatibility with Gmail service pattern)
     * @param {string} userEmail - User email (not needed for Zoho, but kept for compat)
     */
    async initialize(userEmail) {
        // Zoho uses account-level auth, not per-user
        // This method is here for compatibility with GmailService pattern
        logger.debug(`[Zoho Mail] Service initialized for ${userEmail}`, 'zoho-service');
        return true;
    }
}
