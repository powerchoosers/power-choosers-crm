// Zoho Mail service for sending emails via Zoho Mail API
import { getValidAccessToken } from './zoho-token-manager.js';
import logger from '../_logger.js';

export class ZohoMailService {
    constructor() {
        this.baseUrl = process.env.ZOHO_BASE_URL || 'https://mail.zoho.com/api';
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

        try {
            // Get valid access token (will auto-refresh if needed)
            const accessToken = await getValidAccessToken();

            logger.info(`[Zoho Mail] Sending email to: ${to}`, 'zoho-service');

            // Prepare email payload according to Zoho API spec
            const payload = {
                fromAddress: from || `lewis@nodalpoint.io`,
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
                logger.error(`[Zoho Mail] API error: ${response.status} ${errorText}`, 'zoho-service');

                // If token expired (401), the token manager should have refreshed it
                // This is a fallback error
                if (response.status === 401) {
                    throw new Error('Zoho authentication failed - token may be invalid');
                }

                throw new Error(`Zoho API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            logger.info(`[Zoho Mail] Email sent successfully`, 'zoho-service');

            // Zoho returns the message data in the response
            return {
                messageId: result.data?.messageId || result.data?.message_id || 'unknown',
                success: true,
            };
        } catch (error) {
            logger.error('[Zoho Mail] Send error:', error, 'zoho-service');
            throw error;
        }
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
