// Gmail API service for server-side sending (replaces SendGrid)
import { google } from 'googleapis';
import { supabaseAdmin } from '../_supabase.js';
import logger from '../_logger.js';

export class GmailService {
    constructor() {
        this.gmail = null;
        this.lastInitializedEmail = null; // Cache to avoid re-initializing for same user
        this.fromEmail = process.env.GMAIL_SENDER_EMAIL || '';
        this.fromName = process.env.GMAIL_SENDER_NAME || 'Nodal Point CRM';
    }

    sanitizeHeaderValue(value) {
        return String(value || '').replace(/[\r\n]+/g, ' ').trim();
    }

    encodeDisplayName(name) {
        const safe = this.sanitizeHeaderValue(name);
        if (!safe) return '';

        const hasNonAscii = /[^\x00-\x7F]/.test(safe);
        if (hasNonAscii) {
            return `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`;
        }

        const needsQuotes = /[()<>@,;:\\".\[\]\s]/.test(safe);
        if (needsQuotes) {
            const escaped = safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `"${escaped}"`;
        }

        return safe;
    }

    formatFromHeader(name, email) {
        const safeEmail = this.sanitizeHeaderValue(email);
        const display = this.encodeDisplayName(name);
        return display ? `${display} <${safeEmail}>` : `<${safeEmail}>`;
    }
    
    /**
     * Look up user profile from Supabase to get sender name and email
     * @param {string} userEmail - User's email address (from ownerId, userEmail, etc.)
     * @returns {Promise<{email: string, name: string}>}
     */
    async lookupUserProfile(userEmail) {
        if (!userEmail || !supabaseAdmin) {
            return {
                email: this.fromEmail,
                name: this.fromName
            };
        }
        
        try {
            const emailLower = String(userEmail).toLowerCase().trim();
            
            const { data: userData, error } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', emailLower)
                .maybeSingle();
            
            if (error) {
                logger.error('[Gmail] Error looking up user profile in Supabase:', error);
                throw error;
            }
            
            if (userData) {
                const firstName = typeof userData.first_name === 'string' ? userData.first_name.trim() : '';
                
                // Format sender name as "First Name | Nodal Point" (or just "Nodal Point" if no first name)
                let finalName = 'Nodal Point';
                if (firstName) {
                    finalName = `${firstName} | Nodal Point`;
                } else {
                    // Fallback: try to infer first name from email or use other name fields
                    const lastName = typeof userData.last_name === 'string' ? userData.last_name.trim() : '';
                    const derivedFullName = firstName ? `${firstName} ${lastName}`.trim() : '';
                    const alternativeName = derivedFullName || userData.name || (userData.settings && userData.settings.displayName);
                    
                    if (alternativeName) {
                        // Extract first name from full name if available
                        const firstPart = alternativeName.split(' ')[0].trim();
                        if (firstPart) {
                            finalName = `${firstPart} | Nodal Point`;
                        }
                    } else {
                        // Last resort: infer from email
                        const emailPrefix = emailLower.split('@')[0];
                        if (emailPrefix.includes('.')) {
                            const inferredFirst = emailPrefix.split('.')[0];
                            finalName = `${inferredFirst.charAt(0).toUpperCase() + inferredFirst.slice(1)} | Nodal Point`;
                        } else {
                            finalName = `${emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)} | Nodal Point`;
                        }
                        logger.info(`[Gmail] Inferred name '${finalName}' for user '${emailLower}' (missing first_name in Supabase)`);
                    }
                }

                return {
                    email: emailLower,
                    name: finalName
                };
            }
            
            // Fallback: try to parse first name from email and format as "First Name | Nodal Point"
            const emailPrefix = emailLower.split('@')[0];
            let firstName = emailPrefix;
            if (emailPrefix.includes('.')) {
                // Format: first.last -> use first part
                firstName = emailPrefix.split('.')[0];
            }
            firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
            
            return {
                email: emailLower,
                name: `${firstName} | Nodal Point`
            };
        } catch (err) {
            logger.error(`[Gmail] Error looking up user profile: ${err.message}`);
            // Fallback: infer first name from email and format as "First Name | Nodal Point"
            const emailPrefix = String(userEmail).split('@')[0];
            let firstName = emailPrefix;
            if (emailPrefix.includes('.')) {
                firstName = emailPrefix.split('.')[0];
            }
            firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
            return {
                email: String(userEmail).toLowerCase().trim(),
                name: `${firstName} | Nodal Point`
            };
        }
    }
    
    async initialize(impersonateEmail = null) {
        try {
            // Decode service account key from base64
            const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
            const keyValue = typeof rawKey === 'string' ? rawKey.trim() : '';
            if (!keyValue) {
                throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set');
            }

            const unquoted = keyValue.startsWith('"') && keyValue.endsWith('"') ? keyValue.slice(1, -1) : keyValue;
            const keyJson = unquoted.startsWith('{') ? unquoted : Buffer.from(unquoted, 'base64').toString('utf8');
            const key = JSON.parse(keyJson);
            
            // Create JWT auth with domain-wide delegation
            const auth = new google.auth.JWT({
                email: key.client_email,
                key: key.private_key,
                scopes: [
                    'https://www.googleapis.com/auth/gmail.send',
                    'https://www.googleapis.com/auth/gmail.settings.basic'
                ],
                subject: impersonateEmail || this.fromEmail // Impersonate this user
            });
            
            this.gmail = google.gmail({ version: 'v1', auth });
            logger.debug('[Gmail] Service initialized for:', impersonateEmail || this.fromEmail);
            
        } catch (error) {
            logger.error('[Gmail] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Updates the "Send mail as" display name for the user in Gmail settings
     * @param {string} userEmail 
     * @param {string} displayName 
     */
    async updateSendAsDisplayName(userEmail, displayName) {
        if (!this.gmail) {
            await this.initialize(userEmail);
        }

        try {
            // First, find the alias that matches the userEmail (usually the primary one)
            const response = await this.gmail.users.settings.sendAs.list({
                userId: userEmail,
            });

            const aliases = response.data.sendAs || [];
            const targetAlias = aliases.find(a => a.sendAsEmail.toLowerCase() === userEmail.toLowerCase()) || aliases[0];

            if (!targetAlias) {
                logger.warn(`[Gmail] No SendAs alias found for ${userEmail}`);
                return null;
            }

            // Only update if it's different
            if (targetAlias.displayName === displayName) {
                logger.debug(`[Gmail] Display name for ${userEmail} is already correct: "${displayName}"`);
                return targetAlias;
            }

            logger.info(`[Gmail] Updating display name for ${userEmail} from "${targetAlias.displayName}" to "${displayName}"`);

            const updateResponse = await this.gmail.users.settings.sendAs.patch({
                userId: userEmail,
                sendAsEmail: targetAlias.sendAsEmail,
                requestBody: {
                    displayName: displayName,
                },
            });

            return updateResponse.data;
        } catch (error) {
            logger.error(`[Gmail] Failed to update SendAs display name for ${userEmail}:`, error);
            // Don't throw, just return null so we don't break the flow
            return null;
        }
    }

    /**
     * Helper to ensure display name is correct (wrapper around updateSendAsDisplayName)
     */
    async ensureCorrectDisplayName(userEmail, displayName) {
        return this.updateSendAsDisplayName(userEmail, displayName);
    }
    
    /**
     * Send email via Gmail API
     */
    async sendEmail(emailData) {
        const { to, subject, html, text, from, fromName, inReplyTo, references, threadId, userEmail, ownerId, attachments } = emailData;
        
        // Look up sender info from user profile (if userEmail or ownerId provided)
        const lookupEmail = userEmail || ownerId;
        let senderInfo = { email: this.fromEmail, name: this.fromName };
        
        if (lookupEmail) {
            senderInfo = await this.lookupUserProfile(lookupEmail);
        }
        
        // Use provided from/fromName if explicitly set, otherwise use looked-up info
        // lookupUserProfile now returns "First Name | Nodal Point" format, so this will default correctly
        const senderName = fromName || senderInfo.name;
        const senderEmail = from || senderInfo.email;
        
        // Initialize Gmail service with the sender's email (for domain-wide delegation)
        if (!this.gmail || this.lastInitializedEmail !== senderEmail) {
            await this.initialize(senderEmail);
            this.lastInitializedEmail = senderEmail; // Cache to avoid re-initializing
        }

        // AUTO-FIX: Check if the current Gmail "Send mail as" display name matches our desired name
        // If not, update it. This ensures future emails (even outside this app) use the correct name.
        if (senderName && senderName !== senderEmail) {
            try {
                // We don't await this to avoid slowing down the email send
                this.ensureCorrectDisplayName(senderEmail, senderName).catch(err => {
                    logger.warn('[Gmail] Background display name update failed:', err.message);
                });
            } catch (e) {
                // Ignore sync errors
            }
        }
        
        try {
            // Build MIME message
            const hasAttachments = attachments && Array.isArray(attachments) && attachments.length > 0;
            const mixedBoundary = '----=_Part_Mixed_' + Date.now().toString(36);
            const altBoundary = '----=_Part_Alt_' + Date.now().toString(36);
            
            let mimeMessage = [
                `From: ${this.formatFromHeader(senderName, senderEmail)}`,
                `To: ${this.sanitizeHeaderValue(to)}`,
                `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
                'MIME-Version: 1.0',
            ];
            
            // Use multipart/mixed if there are attachments, otherwise multipart/alternative
            if (hasAttachments) {
                mimeMessage.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
            } else {
                mimeMessage.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
            }
            
            // Add threading headers if present
            if (inReplyTo) {
                mimeMessage.push(`In-Reply-To: ${inReplyTo}`);
            }
            if (references && references.length) {
                mimeMessage.push(`References: ${Array.isArray(references) ? references.join(' ') : references}`);
            }
            
            mimeMessage.push(''); // Empty line before body
            
            if (hasAttachments) {
                // Start with alternative part (text + HTML)
                mimeMessage.push(`--${mixedBoundary}`);
                mimeMessage.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
                mimeMessage.push('');
            }
            
            // Plain text part
            if (text) {
                mimeMessage.push(`--${altBoundary}`);
                mimeMessage.push('Content-Type: text/plain; charset=UTF-8');
                mimeMessage.push('Content-Transfer-Encoding: base64');
                mimeMessage.push('');
                mimeMessage.push(Buffer.from(text).toString('base64'));
            }
            
            // HTML part
            if (html) {
                mimeMessage.push(`--${altBoundary}`);
                mimeMessage.push('Content-Type: text/html; charset=UTF-8');
                mimeMessage.push('Content-Transfer-Encoding: base64');
                mimeMessage.push('');
                mimeMessage.push(Buffer.from(html).toString('base64'));
            }
            
            mimeMessage.push(`--${altBoundary}--`);
            
            // Add attachments if present
            if (hasAttachments) {
                for (const attachment of attachments) {
                    mimeMessage.push(`--${mixedBoundary}`);
                    mimeMessage.push(`Content-Type: ${attachment.type || 'application/octet-stream'}; name="${attachment.filename}"`);
                    mimeMessage.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
                    mimeMessage.push('Content-Transfer-Encoding: base64');
                    mimeMessage.push('');
                    mimeMessage.push(attachment.content);
                }
                mimeMessage.push(`--${mixedBoundary}--`);
            }
            
            // Base64url encode the entire message
            const rawMessage = Buffer.from(mimeMessage.join('\r\n'))
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
            
            // Send via Gmail API
            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: rawMessage,
                    threadId: threadId || undefined
                }
            });
            
            logger.debug('[Gmail] Email sent successfully:', {
                to,
                subject,
                messageId: response.data.id,
                threadId: response.data.threadId,
                attachments: hasAttachments ? attachments.length : 0
            });
            
            return {
                success: true,
                messageId: response.data.id,
                threadId: response.data.threadId
            };
            
        } catch (error) {
            logger.error('[Gmail] Send error:', error);
            throw error;
        }
    }
}

export default GmailService;
