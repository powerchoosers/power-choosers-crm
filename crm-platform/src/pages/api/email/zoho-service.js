
// Zoho Mail service for sending and syncing emails via Zoho Mail API
import { getValidAccessTokenForUser, clearTokenCache } from './zoho-token-manager.js';
import logger from '../_logger.js';

export class ZohoMailService {
    constructor() {
        // Ensure the URL ends with /v1
        let url = process.env.ZOHO_BASE_URL || 'https://mail.zoho.com/api/v1';
        if (url.endsWith('/api')) {
            url += '/v1';
        }
        this.baseUrl = url;
        logger.debug(`[Zoho Mail] Service initialized with baseUrl: ${this.baseUrl}`, 'zoho-service');
    }

    /**
     * Send an email via Zoho Mail API
     */
    async sendEmail(emailData) {
        const { to, subject, html, text, from, fromName, attachments, userEmail } = emailData;

        if (!userEmail) {
            throw new Error('userEmail is required for Zoho sending');
        }

        // Retry logic for token expiration
        let lastError = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                // Get valid access token for this specific user
                const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);

                logger.info(`[Zoho Mail] Sending email from ${userEmail} to: ${to} (attempt ${attempt})`, 'zoho-service');

                const senderEmail = from || userEmail;
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

                if (attachments && attachments.length > 0) {
                    payload.attachments = attachments.map(att => ({
                        attachmentName: att.filename,
                        content: att.content,
                    }));
                }

                const response = await fetch(`${this.baseUrl}/accounts/${accountId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    if (response.status === 401 && attempt === 1) {
                        clearTokenCache(userEmail);
                        continue;
                    }
                    throw new Error(`Zoho API error: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                return {
                    messageId: result.data?.messageId || result.data?.message_id || 'unknown',
                    success: true,
                };
            } catch (error) {
                lastError = error;
                if (attempt === 2) throw error;
            }
        }
    }

    /**
     * List messages from a Zoho folder
     */
    async listMessages(userEmail, options = {}) {
        const { folderId = 'inbox', limit = 50 } = options;

        try {
            const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);

            // Build query params
            const params = new URLSearchParams({
                folderId,
                limit: limit.toString()
            });

            logger.info(`[Zoho Mail] Fetching messages for ${userEmail} (folder: ${folderId})...`, 'zoho-service');

            const response = await fetch(`${this.baseUrl}/accounts/${accountId}/messages/view?${params.toString()}`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    clearTokenCache(userEmail);
                    // Single retry logic could be added here similar to sendEmail
                }
                throw new Error(`Zoho List API error: ${response.status}`);
            }

            const result = await response.json();
            return result.data || []; // Array of message summaries
        } catch (error) {
            logger.error(`[Zoho Mail] List error for ${userEmail}:`, error, 'zoho-service');
            throw error;
        }
    }

    /**
     * Get full content for a Zoho message
     */
    async getMessageContent(userEmail, messageId, folderId = 'inbox') {
        try {
            const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);

            logger.debug(`[Zoho Mail] Fetching content for message ${messageId}...`, 'zoho-service');

            const response = await fetch(`${this.baseUrl}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });

            if (!response.ok) throw new Error(`Zoho Content API error: ${response.status}`);

            const result = await response.json();
            return result.data; // Full content object
        } catch (error) {
            logger.error(`[Zoho Mail] Content error for ${messageId}:`, error, 'zoho-service');
            throw error;
        }
    }

    async initialize(userEmail) {
        // Now actually useful for pre-checking tokens
        try {
            await getValidAccessTokenForUser(userEmail);
            return true;
        } catch {
            return false;
        }
    }
}
