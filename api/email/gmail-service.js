// Gmail API service for server-side sending (replaces SendGrid)
import { google } from 'googleapis';
import { db } from '../_firebase.js';
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
     * Look up user profile from Firestore to get sender name and email
     * @param {string} userEmail - User's email address (from ownerId, userEmail, etc.)
     * @returns {Promise<{email: string, name: string}>}
     */
    async lookupUserProfile(userEmail) {
        if (!userEmail || !db) {
            return {
                email: this.fromEmail,
                name: this.fromName
            };
        }
        
        try {
            const emailLower = String(userEmail).toLowerCase().trim();
            const userDoc = await db.collection('users').doc(emailLower).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();

                const firstName = typeof userData.firstName === 'string' ? userData.firstName.trim() : '';
                const lastName = typeof userData.lastName === 'string' ? userData.lastName.trim() : '';
                const derivedFullName = firstName ? `${firstName} ${lastName}`.trim() : '';

                return {
                    email: emailLower,
                    name: derivedFullName || userData.name || userData.displayName || emailLower.split('@')[0]
                };
            }
            
            // Fallback: try to parse name from email
            const emailPrefix = emailLower.split('@')[0];
            let name = emailPrefix;
            if (emailPrefix.includes('.')) {
                // Format: first.last -> "First Last"
                const parts = emailPrefix.split('.');
                name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
            } else {
                // Single word: capitalize first letter
                name = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
            }
            
            return {
                email: emailLower,
                name: name
            };
            
        } catch (error) {
            logger.warn('[Gmail] Failed to lookup user profile:', error);
            return {
                email: this.fromEmail,
                name: this.fromName
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
                scopes: ['https://www.googleapis.com/auth/gmail.send'],
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
     * Send email via Gmail API
     */
    async sendEmail(emailData) {
        const { to, subject, html, text, from, fromName, inReplyTo, references, threadId, userEmail, ownerId } = emailData;
        
        // Look up sender info from user profile (if userEmail or ownerId provided)
        const lookupEmail = userEmail || ownerId;
        let senderInfo = { email: this.fromEmail, name: this.fromName };
        
        if (lookupEmail) {
            senderInfo = await this.lookupUserProfile(lookupEmail);
        }
        
        // Use provided from/fromName if explicitly set, otherwise use looked-up info
        const senderName = fromName || senderInfo.name;
        const senderEmail = from || senderInfo.email;
        
        // Initialize Gmail service with the sender's email (for domain-wide delegation)
        if (!this.gmail || this.lastInitializedEmail !== senderEmail) {
            await this.initialize(senderEmail);
            this.lastInitializedEmail = senderEmail; // Cache to avoid re-initializing
        }
        
        try {
            // Build MIME message
            const boundary = '----=_Part_' + Date.now().toString(36);
            
            let mimeMessage = [
                `From: ${this.formatFromHeader(senderName, senderEmail)}`,
                `To: ${this.sanitizeHeaderValue(to)}`,
                `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
                'MIME-Version: 1.0',
                `Content-Type: multipart/alternative; boundary="${boundary}"`,
            ];
            
            // Add threading headers if present
            if (inReplyTo) {
                mimeMessage.push(`In-Reply-To: ${inReplyTo}`);
            }
            if (references && references.length) {
                mimeMessage.push(`References: ${Array.isArray(references) ? references.join(' ') : references}`);
            }
            
            mimeMessage.push(''); // Empty line before body
            
            // Plain text part
            if (text) {
                mimeMessage.push(`--${boundary}`);
                mimeMessage.push('Content-Type: text/plain; charset=UTF-8');
                mimeMessage.push('Content-Transfer-Encoding: base64');
                mimeMessage.push('');
                mimeMessage.push(Buffer.from(text).toString('base64'));
            }
            
            // HTML part
            if (html) {
                mimeMessage.push(`--${boundary}`);
                mimeMessage.push('Content-Type: text/html; charset=UTF-8');
                mimeMessage.push('Content-Transfer-Encoding: base64');
                mimeMessage.push('');
                mimeMessage.push(Buffer.from(html).toString('base64'));
            }
            
            mimeMessage.push(`--${boundary}--`);
            
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
                threadId: response.data.threadId
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
