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
     * Upload an attachment to Zoho Mail File Store
     * @param {string} userEmail - The user sending the email
     * @param {string|Buffer|Blob} fileData - The file content
     * @param {string} fileName - The name of the file
     */
    async uploadAttachment(userEmail, fileData, fileName, isInline = false) {
        try {
            const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);

            if (!accountId) {
                throw new Error(`Cloud sync error: No accountId found for ${userEmail}. Verify Zoho connection.`);
            }

            logger.info(`[Zoho Mail] Uploading attachment '${fileName}' for ${userEmail} (Account: ${accountId})...`, 'zoho-service');

            const formData = new FormData();

            // Trigger native RSVP bar by specifying method=REQUEST in the MIME type
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

                if (!accountId) {
                    throw new Error(`Cloud sync error: No accountId found for ${userEmail}. Verify Zoho connection.`);
                }

                logger.info(`[Zoho Mail] Sending email from ${userEmail} to: ${to} (Account: ${accountId}, attempt ${attempt})`, 'zoho-service');

                const senderEmail = from || userEmail;
                const fromAddress = fromName
                    ? `"${fromName.replace(/"/g, '')}" <${senderEmail}>`
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

    normalizeFolder(folder = {}) {
        return {
            ...folder,
            folderId: folder.folderId || folder.id || null,
            folderName: folder.folderName || folder.name || '',
            folderType: String(folder.folderType || folder.type || '').toLowerCase(),
            path: folder.path || '',
        };
    }

    findInboxFolder(folders = []) {
        return folders
            .map((folder) => this.normalizeFolder(folder))
            .find((folder) => {
                const folderName = String(folder.folderName || '').toLowerCase();
                const folderType = String(folder.folderType || '').toLowerCase();
                const path = String(folder.path || '').toLowerCase();

                return (
                    folderType === 'inbox' ||
                    folderName === 'inbox' ||
                    path === '/' ||
                    path === '/inbox'
                );
            }) || null;
    }

    isFolderIdLike(value) {
        return /^[0-9]+$/.test(String(value || '').trim());
    }

    /**
     * Helper to resolve 'inbox' or other names to numeric ID
     */
    async resolveFolderId(userEmail, accessToken, accountId, folderNameOrId) {
        const rawFolder = String(folderNameOrId || '').trim();

        if (!rawFolder || rawFolder.toLowerCase() === 'inbox') {
            try {
                const folders = await this.listFolders(userEmail, accessToken, accountId);
                const inbox = this.findInboxFolder(folders);
                if (inbox?.folderId) return String(inbox.folderId);
                logger.warn(`[Zoho Mail] Could not resolve 'inbox' folder ID for ${userEmail}`, 'zoho-service');
            } catch (e) {
                logger.error(`[Zoho Mail] Error resolving folder ID: ${e.message}`, 'zoho-service');
            }
            return null;
        }

        if (this.isFolderIdLike(rawFolder)) {
            return rawFolder;
        }

        try {
            const folders = await this.listFolders(userEmail, accessToken, accountId);
            const matchedFolder = folders
                .map((folder) => this.normalizeFolder(folder))
                .find((folder) => {
                    const folderName = String(folder.folderName || '').toLowerCase();
                    const folderPath = String(folder.path || '').toLowerCase();
                    const target = rawFolder.toLowerCase();
                    return folderName === target || folderPath === target;
                });

            if (matchedFolder?.folderId) {
                return String(matchedFolder.folderId);
            }
        } catch (e) {
            logger.error(`[Zoho Mail] Error resolving folder '${rawFolder}': ${e.message}`, 'zoho-service');
        }

        return null;
    }

    /**
     * List messages from a Zoho folder
     */
    async listMessages(userEmail, options = {}) {
        const { folderId = 'inbox', limit = 50 } = options;

        try {
            const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);

            // Resolve folder ID if possible. Some legacy tokens are missing folders scope.
            // In that case, fallback to listing without folderId so sync can still proceed.
            const resolvedFolderId = await this.resolveFolderId(userEmail, accessToken, accountId, folderId);

            // Build query params
            const params = new URLSearchParams({
                limit: limit.toString()
            });
            if (resolvedFolderId) {
                params.append('folderId', resolvedFolderId);
            } else {
                logger.warn(`[Zoho Mail] Proceeding without folderId for ${userEmail}; folder scope may be missing`, 'zoho-service');
            }

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

            const candidates = resolvedFolderId
                ? [
                    `${this.baseUrl}/accounts/${accountId}/folders/${resolvedFolderId}/messages/${messageId}/content`,
                    `${this.baseUrl}/accounts/${accountId}/messages/${messageId}/content`,
                ]
                : [
                    `${this.baseUrl}/accounts/${accountId}/messages/${messageId}/content`,
                ];

            let lastStatus = 0;
            for (const url of candidates) {
                const response = await fetch(url, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                });
                if (response.ok) {
                    const result = await response.json();
                    return result.data; // Full content object
                }
                lastStatus = response.status;
            }

            throw new Error(`Zoho Content API error: ${lastStatus}`);
        } catch (error) {
            logger.error(`[Zoho Mail] Content error for ${messageId}:`, error, 'zoho-service');
            throw error;
        }
    }

    /**
     * Download a message attachment from Zoho.
     */
    async downloadAttachment(userEmail, messageId, attachmentId, folderId = 'inbox', attachmentPath = '') {
        const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);
        const resolvedFolderId = await this.resolveFolderId(userEmail, accessToken, accountId, folderId);

        const tokenCandidates = Array.from(new Set(
            [attachmentId, attachmentPath]
                .map((v) => String(v || '').trim())
                .filter(Boolean)
                .flatMap((v) => [v, encodeURIComponent(v)])
        ));

        const candidates = tokenCandidates.flatMap((token) => {
            const urls = [
                `${this.baseUrl}/accounts/${accountId}/messages/${messageId}/attachments/${token}`,
                `${this.baseUrl}/accounts/${accountId}/messages/attachments/${token}`,
            ];
            if (resolvedFolderId) {
                urls.unshift(`${this.baseUrl}/accounts/${accountId}/folders/${resolvedFolderId}/messages/${messageId}/attachments/${token}`);
            }
            return urls;
        });

        let lastStatus = 0;
        let lastText = '';

        for (const url of candidates) {
            const response = await fetch(url, {
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
            if (response.ok) {
                const contentType = response.headers.get('content-type') || 'application/octet-stream';
                const fileBuffer = Buffer.from(await response.arrayBuffer());
                return { fileBuffer, contentType };
            }
            lastStatus = response.status;
            lastText = await response.text().catch(() => '');
        }

        throw new Error(`Zoho Attachment API error: ${lastStatus} - ${lastText}`);
    }

    /**
     * List attachments for a Zoho message.
     * Zoho does not include attachment metadata in the content/summary responses,
     * so this requires a separate API call to get filenames, IDs, sizes, etc.
     */
    async getMessageAttachments(userEmail, messageId, folderId = 'inbox') {
        try {
            const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail);
            const resolvedFolderId = await this.resolveFolderId(userEmail, accessToken, accountId, folderId);

            const candidates = resolvedFolderId ? [
                `${this.baseUrl}/accounts/${accountId}/folders/${resolvedFolderId}/messages/${messageId}/attachments`,
                `${this.baseUrl}/accounts/${accountId}/messages/${messageId}/attachments`,
            ] : [
                `${this.baseUrl}/accounts/${accountId}/messages/${messageId}/attachments`,
            ];

            for (const url of candidates) {
                const response = await fetch(url, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                });
                if (response.ok) {
                    const result = await response.json();
                    return Array.isArray(result.data) ? result.data : [];
                }
            }
            return [];
        } catch (error) {
            logger.warn(`[Zoho Mail] Attachment list error for ${messageId}:`, error, 'zoho-service');
            return [];
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
