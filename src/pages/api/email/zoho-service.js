
// Zoho Mail service for sending and syncing emails via Zoho Mail API
import { getValidAccessTokenForUser, clearTokenCache } from './zoho-token-manager.js';
import logger from '../_logger.js';
import { FormData } from 'formdata-node'; // Ensure you have this or use native FormData in Node 18+

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
     * Upload an attachment to Zoho Mail File Store
     * @param {string} userEmail - The user sending the email
     * @param {Buffer|Blob} fileData - The file content
     * @param {string} fileName - The name of the file
     */
    async uploadAttachment(userEmail, fileData, fileName, isInline = false) {
        try {
            const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);

            logger.info(`[Zoho Mail] Uploading attachment '${fileName}' for ${userEmail}...`, 'zoho-service');

            const formData = new FormData();

            // Explicitly set MIME type for calendar invitations to trigger native UI
            const mimeType = fileName.endsWith('.ics') ? 'text/calendar; method=REQUEST' : undefined;
            const blob = mimeType ? new Blob([fileData], { type: mimeType }) : new Blob([fileData]);

            formData.append('attach', blob, fileName);

            let url = `${this.baseUrl}/accounts/${accountId}/messages/attachments?uploadType=multipart`;
            if (isInline) {
                url += '&isInline=true';
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    // Content-Type is set automatically by fetch with FormData
                },
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Zoho Upload API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            // Zoho returns data as an array for multipart uploads
            const attachmentData = Array.isArray(result.data) ? result.data[0] : result.data;

            if (!attachmentData) {
                throw new Error('No data returned from Zoho Upload API');
            }

            logger.info(`[Zoho Mail] Attachment uploaded successfully: ${attachmentData.attachmentName}`, 'zoho-service');

            return {
                storeName: attachmentData.storeName,
                attachmentPath: attachmentData.attachmentPath,
                attachmentName: attachmentData.attachmentName,
            };

        } catch (error) {
            logger.error(`[Zoho Mail] Upload failed for ${fileName}:`, error, 'zoho-service');
            throw error;
        }
    }

    /**
     * Send an email via Zoho Mail API
     */
    async sendEmail(emailData) {
        const { to, subject, html, text, from, fromName, attachments, uploadedAttachments, userEmail } = emailData;

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

                // Construct payload with ONLY supported keys
                const payload = {
                    fromAddress: fromAddress,
                    toAddress: Array.isArray(to) ? to.join(',') : to,
                    subject: subject,
                    content: html || text || '',
                    mailFormat: html ? 'html' : 'plaintext',
                };

                // Add optional fields only if they have values
                if (emailData.cc) {
                    payload.ccAddress = Array.isArray(emailData.cc) ? emailData.cc.join(',') : emailData.cc;
                }
                if (emailData.bcc) {
                    payload.bccAddress = Array.isArray(emailData.bcc) ? emailData.bcc.join(',') : emailData.bcc;
                }

                // Handle Pre-Uploaded Attachments (Standard Zoho Flow)
                if (uploadedAttachments && uploadedAttachments.length > 0) {
                    payload.attachments = uploadedAttachments.map(att => ({
                        storeName: att.storeName,
                        attachmentPath: att.attachmentPath || att.storeName,
                        attachmentName: att.attachmentName,
                    }));
                }

                logger.debug(`[Zoho Mail] Sending payload to ${this.baseUrl}/accounts/${accountId}/messages: ${JSON.stringify({ ...payload, content: '...' })}`, 'zoho-service');

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
     * List folders to find IDs
     */
    async listFolders(userEmail, accessToken, accountId) {
        const url = `${this.baseUrl}/accounts/${accountId}/folders`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`Zoho List Folders API error: ${response.status} - ${txt}`);
        }

        const result = await response.json();
        return result.data || [];
    }

    /**
     * Helper to resolve 'inbox' or other names to numeric ID
     */
    async resolveFolderId(userEmail, accessToken, accountId, folderNameOrId) {
        if (!folderNameOrId || folderNameOrId === 'inbox') {
            try {
                const folders = await this.listFolders(userEmail, accessToken, accountId);
                const inbox = folders.find(f => f.path === '/' || f.path === '/Inbox' || f.name.toLowerCase() === 'inbox');
                if (inbox) return inbox.folderId;
                logger.warn(`[Zoho Mail] Could not resolve 'inbox' folder ID for ${userEmail}`, 'zoho-service');
            } catch (e) {
                logger.error(`[Zoho Mail] Error resolving folder ID: ${e.message}`, 'zoho-service');
            }
            return 'inbox'; // Fallback if listing fails or not found (might fail API but worth a try)
        }
        return folderNameOrId;
    }

    /**
     * List messages from a Zoho folder
     */
    async listMessages(userEmail, options = {}) {
        const { folderId = 'inbox', limit = 50 } = options;

        try {
            const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);

            // Resolve folder ID if needed
            const resolvedFolderId = await this.resolveFolderId(userEmail, accessToken, accountId, folderId);

            // Build query params
            const params = new URLSearchParams({
                limit: limit.toString()
            });
            if (resolvedFolderId) params.append('folderId', resolvedFolderId);

            logger.info(`[Zoho Mail] Fetching messages for ${userEmail} (folder: ${resolvedFolderId})...`, 'zoho-service');

            const response = await fetch(`${this.baseUrl}/accounts/${accountId}/messages/view?${params.toString()}`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    clearTokenCache(userEmail);
                    // Retry logic would need function recursion or loop, simplifying here to throw
                }
                const txt = await response.text();
                throw new Error(`Zoho List API error: ${response.status} - ${txt}`);
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

            const resolvedFolderId = await this.resolveFolderId(userEmail, accessToken, accountId, folderId);

            logger.debug(`[Zoho Mail] Fetching content for message ${messageId}...`, 'zoho-service');

            const response = await fetch(`${this.baseUrl}/accounts/${accountId}/folders/${resolvedFolderId}/messages/${messageId}/content`, {
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
