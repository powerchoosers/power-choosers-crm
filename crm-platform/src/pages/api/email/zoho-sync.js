import { cors } from '../_cors.js';
import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from './zoho-service.js';
import { getValidAccessTokenForUser } from './zoho-token-manager.js';
import logger from '../_logger.js';
import crypto from 'crypto';

const MAX_AUTO_INGEST_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB safety cap
const AUTO_INGEST_INBOUND_ATTACHMENTS = process.env.AUTO_INGEST_INBOUND_ATTACHMENTS !== 'false';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nodalpoint.io';

function stripHtml(value) {
    if (!value) return '';
    return String(value)
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function toArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    if (typeof value === 'object') {
        return Object.values(value);
    }
    return [];
}

function extractZohoAttachments(summary, content, messageId) {
    const candidates = []
        .concat(toArray(summary?.attachments))
        .concat(toArray(summary?.attachmentInfo))
        .concat(toArray(summary?.attachmentDetails))
        .concat(toArray(summary?.attachInfo))
        .concat(toArray(content?.attachments))
        .concat(toArray(content?.attachmentInfo))
        .concat(toArray(content?.attachmentDetails))
        .concat(toArray(content?.attachInfo))
        .concat(toArray(content?.data?.attachments))
        .concat(toArray(content?.data?.attachmentInfo))
        .concat(toArray(content?.data?.attachmentDetails));

    if (candidates.length === 0) return [];

    const normalized = candidates.map((att, idx) => {
        const attachmentId =
            att?.attachmentId ||
            att?.attachment_id ||
            att?.attachmentID ||
            att?.id ||
            att?.aid ||
            att?.fileId ||
            att?.file_id ||
            att?.partId ||
            att?.storeName ||
            att?.resourceId ||
            null;
        return {
            filename: att?.attachmentName || att?.fileName || att?.name || `Attachment-${idx + 1}`,
            mimeType: att?.contentType || att?.mimeType || att?.type || 'application/octet-stream',
            size: typeof att?.size === 'number' ? att.size : Number(att?.size || att?.attachmentSize || 0),
            attachmentId,
            messageId: String(messageId),
            provider: 'zoho',
            downloadUnavailable: !attachmentId,
        };
    });

    // Deduplicate when Zoho returns the same attachment in multiple blocks.
    const seen = new Set();
    return normalized.filter((att) => {
        const key = `${att.attachmentId || 'none'}::${att.filename}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function hasAttachmentsInPayload(summary, content, attachmentMeta) {
    if (Array.isArray(attachmentMeta) && attachmentMeta.length > 0) return true;
    const summaryCount = Number(summary?.attachmentCount || summary?.attachmentsCount || 0);
    const contentCount = Number(content?.attachmentCount || content?.attachmentsCount || content?.data?.attachmentCount || 0);
    return (
        summary?.hasAttachments === true ||
        summary?.hasAttachment === "1" ||
        summary?.hasAttachment === true ||
        content?.hasAttachments === true ||
        content?.hasAttachment === "1" ||
        content?.hasAttachment === true ||
        summaryCount > 0 ||
        contentCount > 0
    );
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function extractEmailAddress(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const angle = raw.match(/<\s*([^>]+)\s*>/);
    const email = angle?.[1] || raw;
    return email.trim().toLowerCase();
}

function extractEmailFromUnknown(value, depth = 0) {
    if (depth > 4 || value == null) return '';

    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return '';
        const direct = extractEmailAddress(raw);
        if (isLikelyEmail(direct)) return direct;
        const inline = raw.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/i)?.[0] || '';
        return isLikelyEmail(inline) ? inline.toLowerCase() : '';
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = extractEmailFromUnknown(item, depth + 1);
            if (found) return found;
        }
        return '';
    }

    if (typeof value === 'object') {
        const keys = [
            'email',
            'emailAddress',
            'address',
            'mailAddress',
            'fromAddress',
            'senderAddress',
            'replyTo',
            'replyToAddress',
            'from',
            'sender',
            'value',
        ];
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const found = extractEmailFromUnknown(value[key], depth + 1);
                if (found) return found;
            }
        }
        for (const nested of Object.values(value)) {
            const found = extractEmailFromUnknown(nested, depth + 1);
            if (found) return found;
        }
    }

    return '';
}

function extractDisplayName(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
        return value.replace(/<\s*[^>]+\s*>/g, '').trim();
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = extractDisplayName(item);
            if (found) return found;
        }
        return '';
    }
    if (typeof value === 'object') {
        const keys = ['name', 'displayName', 'fullName', 'personal', 'label', 'fromName', 'sender'];
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const found = extractDisplayName(value[key]);
                if (found) return found;
            }
        }
    }
    return '';
}

function normalizeLookupText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function parseSenderLabel(value) {
    const raw = String(value || '').trim();
    const email = extractEmailAddress(raw);
    const display = raw.replace(/<\s*[^>]+\s*>/, '').trim();
    return {
        raw,
        email: isLikelyEmail(email) ? email : '',
        display: display || raw,
        normalizedDisplay: normalizeLookupText(display || raw),
        normalizedEmail: normalizeLookupText(email),
    };
}

function isLikelyEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function sanitizeFileName(name) {
    return String(name || 'attachment.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function resolveContactAndAccount(ownerEmail, senderEmail) {
    if (!ownerEmail || !senderEmail) return { contactId: null, accountId: null };

    const ownedQuery = await supabaseAdmin
        .from('contacts')
        .select('id, accountId, ownerId')
        .ilike('email', senderEmail)
        .eq('ownerId', ownerEmail)
        .limit(1)
        .maybeSingle();

    if (ownedQuery.error) {
        logger.warn('[Zoho Sync] Contact/account resolution (owned) failed:', ownedQuery.error.message || ownedQuery.error, 'zoho-sync');
        return { contactId: null, accountId: null };
    }

    if (ownedQuery.data?.id) {
        return {
            contactId: ownedQuery.data.id || null,
            accountId: ownedQuery.data.accountId || null,
        };
    }

    const sharedQuery = await supabaseAdmin
        .from('contacts')
        .select('id, accountId, ownerId')
        .ilike('email', senderEmail)
        .is('ownerId', null)
        .limit(1)
        .maybeSingle();

    if (sharedQuery.error) {
        logger.warn('[Zoho Sync] Contact/account resolution (shared) failed:', sharedQuery.error.message || sharedQuery.error, 'zoho-sync');
        return { contactId: null, accountId: null };
    }

    return {
        contactId: sharedQuery.data?.id || null,
        accountId: sharedQuery.data?.accountId || null,
    };
}

async function resolveContactAndAccountFromThread(ownerEmail, threadId) {
    if (!ownerEmail || !threadId) return { contactId: null, accountId: null };

    const { data: relatedSent } = await supabaseAdmin
        .from('emails')
        .select('contactId, accountId, to')
        .eq('threadId', threadId)
        .in('type', ['sent', 'uplink_out'])
        .eq('metadata->>ownerId', ownerEmail)
        .order('timestamp', { ascending: false, nullsFirst: false })
        .limit(10);

    const directContacts = Array.from(new Map(
        (relatedSent || [])
            .filter((row) => row?.contactId)
            .map((row) => [row.contactId, { contactId: row.contactId, accountId: row.accountId || null }])
    ).values());

    if (directContacts.length === 1) {
        return directContacts[0];
    }
    if (directContacts.length > 1) {
        return { contactId: null, accountId: null };
    }

    const recipientEmails = Array.from(new Set(
        (relatedSent || [])
            .flatMap((row) => (Array.isArray(row?.to) ? row.to : [row?.to]))
            .map((addr) => extractEmailAddress(addr))
            .filter((addr) => isLikelyEmail(addr))
    ));

    if (!recipientEmails.length) return { contactId: null, accountId: null };

    const ownedQuery = await supabaseAdmin
        .from('contacts')
        .select('id, accountId, email')
        .eq('ownerId', ownerEmail)
        .in('email', recipientEmails)
        .limit(10);

    const ownedMatches = Array.isArray(ownedQuery.data) ? ownedQuery.data : [];
    if (ownedMatches.length === 1) {
        return { contactId: ownedMatches[0].id || null, accountId: ownedMatches[0].accountId || null };
    }
    if (ownedMatches.length > 1) {
        return { contactId: null, accountId: null };
    }

    const sharedQuery = await supabaseAdmin
        .from('contacts')
        .select('id, accountId, email')
        .is('ownerId', null)
        .in('email', recipientEmails)
        .limit(10);

    const sharedMatches = Array.isArray(sharedQuery.data) ? sharedQuery.data : [];
    if (sharedMatches.length === 1) {
        return { contactId: sharedMatches[0].id || null, accountId: sharedMatches[0].accountId || null };
    }
    return { contactId: null, accountId: null };
}

async function resolveContactAndAccountBySenderName(ownerEmail, senderLabel) {
    const sender = parseSenderLabel(senderLabel);
    if (!sender.display && !sender.email) return { contactId: null, accountId: null };

    if (sender.email) {
        const byEmail = await resolveContactAndAccount(ownerEmail, sender.email);
        if (byEmail.contactId) return byEmail;
    }

    const queryParts = [];
    if (sender.email) {
        queryParts.push(`email.ilike.%${sender.email}%`);
        queryParts.push(`email.ilike.%${sender.normalizedEmail}%`);
    }
    if (sender.display) {
        queryParts.push(`name.ilike.%${sender.display}%`);
        queryParts.push(`firstName.ilike.%${sender.display}%`);
        queryParts.push(`lastName.ilike.%${sender.display}%`);
    }

    const { data: contacts, error } = await supabaseAdmin
        .from('contacts')
        .select('id, accountId, ownerId, email, name, firstName, lastName')
        .or(Array.from(new Set(queryParts)).join(','));

    if (error) {
        logger.warn('[Zoho Sync] Sender-name contact lookup failed:', error.message || error, 'zoho-sync');
        return { contactId: null, accountId: null };
    }

    const rows = Array.isArray(contacts) ? contacts : [];
    if (!rows.length) return { contactId: null, accountId: null };

    const ownerKey = String(ownerEmail || '').toLowerCase().trim();
    const scoreRow = (row) => {
        const rowEmail = normalizeLookupText(row.email);
        const rowName = normalizeLookupText(row.name);
        const rowFullName = normalizeLookupText([row.firstName, row.lastName].filter(Boolean).join(' '));
        const rowPriority = String(row.ownerId || '').toLowerCase().trim() === ownerKey ? 2 : (row.ownerId ? 1 : 0);

        let score = 0;
        if (sender.normalizedEmail && sender.normalizedEmail === rowEmail) score = 100;
        else if (sender.normalizedDisplay && sender.normalizedDisplay === rowName) score = 90;
        else if (sender.normalizedDisplay && sender.normalizedDisplay === rowFullName) score = 85;

        return { row, score, rowPriority };
    };

    const scored = rows
        .map(scoreRow)
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
            if (b.rowPriority !== a.rowPriority) return b.rowPriority - a.rowPriority;
            if (b.score !== a.score) return b.score - a.score;
            return String(a.row.name || '').localeCompare(String(b.row.name || ''));
        });

    if (!scored.length) return { contactId: null, accountId: null };

    const best = scored[0];
    const sameRank = scored.filter((entry) => entry.score === best.score && entry.rowPriority === best.rowPriority);
    if (sameRank.length > 1) return { contactId: null, accountId: null };

    return {
        contactId: best.row.id || null,
        accountId: best.row.accountId || null
    };
}

async function autoIngestInboundAttachments({
    zohoService,
    ownerEmail,
    messageId,
    accountId,
    attachments,
    folderId,
}) {
    if (!AUTO_INGEST_INBOUND_ATTACHMENTS) return { saved: 0, skipped: 0 };
    if (!accountId || !Array.isArray(attachments) || attachments.length === 0) return { saved: 0, skipped: 0 };

    let saved = 0;
    let skipped = 0;

    for (const attachment of attachments) {
        try {
            if (!attachment?.attachmentId || attachment?.downloadUnavailable) {
                skipped++;
                continue;
            }

            if (typeof attachment.size === 'number' && attachment.size > MAX_AUTO_INGEST_ATTACHMENT_BYTES) {
                logger.info(`[Zoho Sync] Skipping large attachment ${attachment.filename} (${attachment.size} bytes)`, 'zoho-sync');
                skipped++;
                continue;
            }

            const safeFileName = sanitizeFileName(attachment.filename || 'attachment.bin');
            const storagePath = `accounts/${accountId}/email_attachments/${messageId}_${attachment.attachmentId}_${safeFileName}`;

            const { data: existingDoc } = await supabaseAdmin
                .from('documents')
                .select('id')
                .eq('storage_path', storagePath)
                .maybeSingle();

            if (existingDoc?.id) {
                skipped++;
                continue;
            }

            const { fileBuffer, contentType } = await zohoService.downloadAttachment(
                String(ownerEmail),
                String(messageId),
                String(attachment.attachmentId),
                folderId || 'inbox'
            );

            const { error: uploadError } = await supabaseAdmin.storage
                .from('vault')
                .upload(storagePath, fileBuffer, {
                    contentType: contentType || attachment.mimeType || 'application/octet-stream',
                    upsert: true,
                });

            if (uploadError) {
                logger.warn(`[Zoho Sync] Attachment upload failed (${safeFileName}): ${uploadError.message}`, 'zoho-sync');
                skipped++;
                continue;
            }

            const { error: insertError } = await supabaseAdmin
                .from('documents')
                .insert({
                    account_id: accountId,
                    name: attachment.filename || safeFileName,
                    size: formatBytes(fileBuffer.length),
                    type: contentType || attachment.mimeType || 'application/octet-stream',
                    storage_path: storagePath,
                    url: '',
                    document_type: 'PROPOSAL',
                });

            if (insertError) {
                logger.warn(`[Zoho Sync] Attachment document insert failed (${safeFileName}): ${insertError.message}`, 'zoho-sync');
                skipped++;
                continue;
            }

            await triggerDocumentAnalysis(accountId, storagePath, attachment.filename || safeFileName);

            saved++;
        } catch (ingestError) {
            logger.warn(`[Zoho Sync] Attachment ingest error for message ${messageId}: ${ingestError?.message || ingestError}`, 'zoho-sync');
            skipped++;
        }
    }

    return { saved, skipped };
}

function normalizeSyncSource(value) {
    const source = String(value || '').toLowerCase().trim();
    if (source === 'webhook') return 'webhook';
    if (source === 'manual') return 'manual';
    if (source === 'background') return 'background';
    if (source === 'cron') return 'cron';
    return 'manual';
}

function formatSourceLabel(value) {
    const source = normalizeSyncSource(value);
    if (source === 'webhook') return 'Webhook';
    if (source === 'manual') return 'Manual sync';
    if (source === 'background') return 'Background sync';
    if (source === 'cron') return 'Cron sync';
    return '';
}

async function createInboxNotification({ emailDoc, ownerEmail, messageId, source = 'manual' }) {
    if (!emailDoc?.contactId || !ownerEmail || !messageId) return null;

    const { data: contactRow } = await supabaseAdmin
        .from('contacts')
        .select('id, email, name, firstName, lastName, accountId, accounts(name)')
        .eq('id', emailDoc.contactId)
        .maybeSingle();

    let accountName = null;
    const relatedAccount = Array.isArray(contactRow?.accounts) ? contactRow.accounts[0] : contactRow?.accounts;
    if (!relatedAccount?.name && (contactRow?.accountId || emailDoc.accountId)) {
        const { data: accountRow } = await supabaseAdmin
            .from('accounts')
            .select('id, name')
            .eq('id', contactRow?.accountId || emailDoc.accountId)
            .maybeSingle();
        accountName = accountRow?.name || null;
    }
    const contactName = (
        contactRow?.name ||
        [contactRow?.firstName, contactRow?.lastName].filter(Boolean).join(' ').trim() ||
        extractDisplayName(emailDoc.from) ||
        extractEmailAddress(emailDoc.from) ||
        'New contact'
    );
    const companyName = relatedAccount?.name || accountName || 'Unknown company';
    const snippet = emailDoc.text?.slice(0, 140) || 'New message received';
    const syncSource = normalizeSyncSource(source);
    const sourceLabel = formatSourceLabel(syncSource);

    const notification = {
        id: `email-notif-${messageId}`,
        ownerId: ownerEmail,
        userId: null,
        title: `New email from ${contactName}`,
        message: emailDoc.subject || snippet,
        type: 'email',
        read: false,
        link: `/network/emails/${messageId}`,
        data: {
            emailId: messageId,
            contactId: emailDoc.contactId,
            accountId: emailDoc.accountId || contactRow?.accountId || null,
            contactName,
            company: companyName,
            subject: emailDoc.subject || '',
            snippet,
            from: emailDoc.from || '',
            hasAttachments: !!emailDoc.metadata?.hasAttachments,
            source: syncSource,
            sourceLabel,
        },
        metadata: {
            ownerId: ownerEmail,
            emailId: messageId,
            contactId: emailDoc.contactId,
            accountId: emailDoc.accountId || contactRow?.accountId || null,
            source: syncSource,
            sourceLabel,
        },
    };

    const { error } = await supabaseAdmin
        .from('notifications')
        .upsert(notification, { onConflict: 'id' });

    if (error) {
        logger.warn(`[Zoho Sync] Notification insert failed for ${messageId}: ${error.message}`, 'zoho-sync');
        return null;
    }

    return notification;
}

async function triggerDocumentAnalysis(accountId, filePath, fileName) {
    if (!accountId || !filePath) return false;
    try {
        const response = await fetch(`${APP_URL}/api/analyze-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, filePath, fileName })
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            logger.warn(`[Zoho Sync] analyze-document failed for ${fileName || filePath}: ${response.status} ${body}`, 'zoho-sync');
            return false;
        }
        return true;
    } catch (error) {
        logger.warn(`[Zoho Sync] analyze-document request error for ${fileName || filePath}: ${error?.message || error}`, 'zoho-sync');
        return false;
    }
}

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { userEmail } = req.body;
    const syncSource = normalizeSyncSource(req.body?.source || 'manual');

    if (!userEmail) {
        res.status(400).json({ error: 'Missing userEmail' });
        return;
    }

    try {
        const zohoService = new ZohoMailService();
        logger.info(`[Zoho Sync] Starting sync for ${userEmail}`, 'zoho-sync');

        // Debug info fetching
        const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail).catch(e => ({ error: e.message }));

        // 1. Fetch recent messages from Zoho inbox
        const messages = await zohoService.listMessages(userEmail, { limit: 20 });

        if (!messages || messages.length === 0) {
            logger.info(`[Zoho Sync] No messages found for ${userEmail}`, 'zoho-sync');

            // Resolve folder for debug info
            const folders = await zohoService.listFolders(userEmail, accessToken, accountId).catch(() => []);
            const inbox = zohoService.findInboxFolder(folders);

            res.status(200).json({
                success: true,
                count: 0,
                debug: {
                    message: "No messages returned from Zoho API",
                    user: userEmail,
                    accountId: accountId,
                    hasToken: !!accessToken,
                    folderCount: folders.length,
                    inboxFolder: inbox ? { id: inbox.folderId, name: inbox.folderName, path: inbox.path, type: inbox.folderType } : "Not Found"
                }
            });
            return;
        }

        let syncedCount = 0;
        let skippedCount = 0;
        let ingestedAttachmentCount = 0;
        const notifications = [];

        for (const msgSummary of messages) {
            // Zoho messageId is a 19-digit number as a string
            const messageId = String(msgSummary.messageId || msgSummary.message_id);

            // 2. Check for duplicates in Supabase using the primary 'id' column
            const { data: existing } = await supabaseAdmin
                .from('emails')
                .select('id, from, metadata, contactId, accountId, threadId, subject')
                .eq('id', messageId)
                .maybeSingle();

            if (existing) {
                // Backfill attachments and sender email for previously-synced rows.
                const existingAttachments = Array.isArray(existing?.metadata?.attachments) ? existing.metadata.attachments : [];
                const hasExistingAttachments = existingAttachments.length > 0;

                // Check if from field is missing an email address (just a display name)
                const existingFrom = existing?.from || '';
                const existingFromEmail = extractEmailAddress(existingFrom);
                const summaryEmail = extractEmailAddress(msgSummary?.senderAddress || '');
                const needsFromBackfill = !isLikelyEmail(existingFromEmail) && isLikelyEmail(summaryEmail);

                if (!hasExistingAttachments || needsFromBackfill) {
                    try {
                        const backfillUpdate = { ...(existing?.metadata || {}) };

                        // Fix from field with actual email if available from summary
                        if (needsFromBackfill && summaryEmail) {
                            const displayName = msgSummary?.sender || '';
                            const fixedFrom = displayName ? `${displayName} <${summaryEmail}>` : summaryEmail;
                            backfillUpdate.fromAddress = summaryEmail;
                            await supabaseAdmin
                                .from('emails')
                                .update({ from: fixedFrom, metadata: { ...backfillUpdate }, updatedAt: new Date().toISOString() })
                                .eq('id', messageId);
                        }

                        // Fetch real attachment metadata via dedicated API call
                        if (!hasExistingAttachments) {
                            const attList = await zohoService.getMessageAttachments(
                                userEmail, messageId, msgSummary?.folderId || msgSummary?.folderName || 'inbox'
                            );
                            if (attList.length > 0) {
                                const normalizedAttachments = attList.map((att, idx) => ({
                                    filename: att.attachmentName || att.fileName || att.name || `Attachment-${idx + 1}`,
                                    mimeType: att.contentType || att.mimeType || 'application/octet-stream',
                                    size: typeof att.size === 'number' ? att.size : Number(att.size || att.attachmentSize || 0),
                                    attachmentId: att.attachmentId || att.storeName || null,
                                    messageId: String(messageId),
                                    provider: 'zoho',
                                    downloadUnavailable: false,
                                }));
                                await supabaseAdmin
                                    .from('emails')
                                    .update({
                                        updatedAt: new Date().toISOString(),
                                        metadata: {
                                            ...(existing?.metadata || {}),
                                            hasAttachments: true,
                                            attachments: normalizedAttachments
                                        }
                                    })
                                    .eq('id', messageId);
                            }
                        }
                    } catch (backfillError) {
                        logger.warn(`[Zoho Sync] Backfill failed for existing message ${messageId}: ${backfillError?.message || backfillError}`, 'zoho-sync');
                    }
                }

                if (!existing?.contactId) {
                    try {
                        const fallbackThreadId = existing?.threadId || determineThreadId({ subject: msgSummary?.subject || existing?.subject || '', ownerId: userEmail });
                        const byName = await resolveContactAndAccountBySenderName(userEmail, msgSummary?.sender || existing?.metadata?.fromAddress || '');
                        const fallbackIdentity = byName?.contactId ? byName : await resolveContactAndAccountFromThread(userEmail, fallbackThreadId);
                        if (fallbackIdentity?.contactId) {
                            await supabaseAdmin
                                .from('emails')
                                .update({
                                    contactId: fallbackIdentity.contactId,
                                    accountId: fallbackIdentity.accountId,
                                    updatedAt: new Date().toISOString()
                                })
                                .eq('id', messageId);
                        }
                    } catch (identityBackfillError) {
                        logger.warn(`[Zoho Sync] Contact backfill failed for existing message ${messageId}: ${identityBackfillError?.message || identityBackfillError}`, 'zoho-sync');
                    }
                }
                skippedCount++;
                continue;
            }

            // 3. Fetch full content
            const fullContent = await zohoService.getMessageContent(userEmail, messageId);

            // 4. Parse
            const emailDoc = parseZohoMessage(msgSummary, fullContent, userEmail);

            // 4b. Fetch actual attachment metadata if needed (Zoho doesn't include it in content/summary)
            if (emailDoc.metadata.hasAttachments && emailDoc.metadata.attachments.length === 0) {
                try {
                    const attList = await zohoService.getMessageAttachments(
                        userEmail, messageId, msgSummary?.folderId || msgSummary?.folderName || 'inbox'
                    );
                    if (attList.length > 0) {
                        emailDoc.metadata.attachments = attList.map((att, idx) => ({
                            filename: att.attachmentName || att.fileName || att.name || `Attachment-${idx + 1}`,
                            mimeType: att.contentType || att.mimeType || 'application/octet-stream',
                            size: typeof att.size === 'number' ? att.size : Number(att.size || att.attachmentSize || 0),
                            attachmentId: att.attachmentId || att.storeName || null,
                            messageId: String(messageId),
                            provider: 'zoho',
                            downloadUnavailable: false,
                        }));
                    }
                } catch (attErr) {
                    logger.warn(`[Zoho Sync] Attachment fetch failed for ${messageId}: ${attErr?.message || attErr}`, 'zoho-sync');
                }
            }

            // Use the email from the already-resolved emailDoc.from (which has the proper "Name <email>" format)
            const senderRaw = emailDoc.from || fullContent?.fromAddress || msgSummary?.senderAddress || msgSummary?.sender || '';
            const senderEmail = extractEmailAddress(senderRaw);
            const byEmail = isLikelyEmail(senderEmail) ? await resolveContactAndAccount(userEmail, senderEmail) : { contactId: null, accountId: null };
            if (byEmail.contactId) {
                emailDoc.contactId = byEmail.contactId;
                emailDoc.accountId = byEmail.accountId;
            } else {
                const byName = await resolveContactAndAccountBySenderName(userEmail, msgSummary?.sender || senderRaw);
                const fallbackIdentity = byName?.contactId ? byName : await resolveContactAndAccountFromThread(userEmail, emailDoc.threadId);
                emailDoc.contactId = fallbackIdentity.contactId;
                emailDoc.accountId = fallbackIdentity.accountId;
            }

            // 5. Ensure thread exists (Must be before email insert due to FK constraint)
            await updateThread(emailDoc);

            // 6. Save email
            const { error: insertError } = await supabaseAdmin
                .from('emails')
                .insert(emailDoc);

            if (insertError) {
                logger.error(`[Zoho Sync] Failed to save message ${messageId}:`, insertError, 'zoho-sync');
            } else {
                syncedCount++;
                if (emailDoc.type === 'received' && emailDoc.contactId) {
                    const notification = await createInboxNotification({
                        emailDoc,
                        ownerEmail: userEmail,
                        messageId,
                        source: syncSource,
                    });
                    if (notification) {
                        notifications.push(notification);
                    }
                }
                if (emailDoc.type === 'received' && emailDoc.accountId && Array.isArray(emailDoc.metadata?.attachments) && emailDoc.metadata.attachments.length > 0) {
                    const ingest = await autoIngestInboundAttachments({
                        zohoService,
                        ownerEmail: userEmail,
                        messageId,
                        accountId: emailDoc.accountId,
                        attachments: emailDoc.metadata.attachments,
                        folderId: msgSummary?.folderId || msgSummary?.folderName || 'inbox',
                    });
                    ingestedAttachmentCount += ingest.saved;
                }
            }
        }

        logger.info(`[Zoho Sync] Sync complete for ${userEmail}: ${syncedCount} new, ${skippedCount} skipped, ${ingestedAttachmentCount} attachments ingested`, 'zoho-sync');
        res.status(200).json({ success: true, count: syncedCount, ingestedAttachments: ingestedAttachmentCount, notifications });

    } catch (error) {
        logger.error(`[Zoho Sync] Global error for ${userEmail}:`, error, 'zoho-sync');
        res.status(500).json({ error: error.message });
    }
}

function parseZohoMessage(summary, content, ownerEmail) {
    const receivedTime = summary.receivedTime || Date.now();
    const zohoId = String(summary.messageId);
    const attachmentMeta = extractZohoAttachments(summary, content, zohoId);
    const rawHtml = content.content || '';
    const rawText = content.summary || content.textContent || content.plainText || '';
    const plainText = rawText || stripHtml(rawHtml);

    // Build a proper "Display Name <email@domain.com>" from string.
    // Zoho sometimes returns only a display name in content.fromAddress for alias-sent emails,
    // so we check summary.senderAddress (which reliably has the email) and combine both.
    const senderDisplayName =
        extractDisplayName(summary?.sender)
        || extractDisplayName(content?.fromAddress)
        || extractDisplayName(summary?.senderAddress)
        || '';
    const emailFromContent = extractEmailFromUnknown(content?.fromAddress || content?.from || content?.sender || null);
    const emailFromSummary = extractEmailFromUnknown(summary?.senderAddress || summary?.fromAddress || summary?.from || null);
    // Also check raw senderAddress in case extractEmailAddress misses a bare email
    const rawSenderAddress = summary?.senderAddress || summary?.fromAddress || '';
    const actualSenderEmail = (isLikelyEmail(emailFromContent) ? emailFromContent : null)
        || (isLikelyEmail(emailFromSummary) ? emailFromSummary : null)
        || (isLikelyEmail(extractEmailAddress(rawSenderAddress)) ? extractEmailAddress(rawSenderAddress) : null)
        || '';
    // Fallback: if display name matches a known Nodal Point sender, use the known alias address
    const knownNodalSender = !actualSenderEmail && (
        senderDisplayName === 'Nodal Point Compliance' ||
        senderDisplayName === 'Nodal Point' ||
        senderDisplayName === 'Nodal Point Secure Vault'
    ) ? 'signal@nodalpoint.io' : '';
    const resolvedSenderEmail = actualSenderEmail || knownNodalSender;
    const fromAddress = resolvedSenderEmail
        ? (senderDisplayName ? `${senderDisplayName} <${resolvedSenderEmail}>` : resolvedSenderEmail)
        : (
            extractDisplayName(content?.fromAddress)
            || extractDisplayName(summary?.senderAddress)
            || extractDisplayName(summary?.sender)
            || content?.fromAddress
            || summary?.senderAddress
            || summary?.sender
            || ''
        );

    const replyToAddress = extractEmailFromUnknown(content?.replyToAddress || content?.replyTo || summary?.replyToAddress || summary?.replyTo || null) || null;
    const hasAttachments = hasAttachmentsInPayload(summary, content, attachmentMeta);

    // Prefer concrete email addresses from message content when available.
    const emailData = {
        id: zohoId, // Use Zoho Message ID as primary key
        from: fromAddress,
        to: [ownerEmail], // Store as array to match DB jsonb 'to' column
        subject: summary.subject,
        text: plainText,
        html: rawHtml, // Zoho content API might return HTML directly
        timestamp: new Date(parseInt(receivedTime)).toISOString(),
        type: 'received',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'received',
        is_read: !!summary.isRead,
        is_starred: !!summary.isStarred,
        contactId: null,
        accountId: null,
        ownerId: ownerEmail,
        metadata: {
            provider: 'zoho',
            ownerId: ownerEmail,
            assignedTo: ownerEmail,
            createdBy: ownerEmail,
            zohoId: zohoId,
            zohoMessageId: zohoId,
            zohoFolder: summary.folderName || 'inbox',
            sentTime: summary.sentTime,
            hasAttachments,
            fromAddress: actualSenderEmail || fromAddress,
            replyToAddress,
            attachments: attachmentMeta,
            emailType: 'received'
        }
    };

    // Determine threadId (Simplified for now, similar to inbound-email.js logic)
    emailData.threadId = determineThreadId(emailData);

    return emailData;
}

function determineThreadId(emailData) {
    // Zoho doesn't provide a clean threadId in summary, we might need to derive it
    // Using subject + participants hash as fallback if no references
    const normalizeSubject = (s) => String(s || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
        .trim()
        .toLowerCase();
    const subjectNorm = normalizeSubject(emailData.subject);
    const hash = crypto.createHash('sha1').update(subjectNorm + '|' + emailData.ownerId, 'utf8').digest('hex');
    return `thr_${hash}`;
}

async function updateThread(emailDoc) {
    const threadId = emailDoc.threadId;
    const { data: existingThread } = await supabaseAdmin
        .from('threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();

    const snippet = emailDoc.text?.slice(0, 140) || '';
    const recipients = Array.isArray(emailDoc.to) ? emailDoc.to : [emailDoc.to];

    if (existingThread) {
        const currentParticipants = Array.isArray(existingThread.participants) ? existingThread.participants : [];
        const mergedParticipants = Array.from(new Set([...currentParticipants, emailDoc.from, ...recipients]));

        await supabaseAdmin
            .from('threads')
            .update({
                lastMessageAt: emailDoc.timestamp,
                lastSnippet: snippet,
                lastFrom: emailDoc.from,
                participants: mergedParticipants,
                messageCount: (existingThread.messageCount || 0) + 1,
                updatedAt: new Date().toISOString()
            })
            .eq('id', threadId);
    } else {
        const normalizeSubject = (s) => String(s || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
            .trim()
            .toLowerCase();
        const subjectNorm = normalizeSubject(emailDoc.subject);

        await supabaseAdmin
            .from('threads')
            .insert({
                id: threadId,
                subjectNormalized: subjectNorm,
                participants: Array.from(new Set([emailDoc.from, ...recipients])),
                lastMessageAt: emailDoc.timestamp,
                lastSnippet: snippet,
                lastFrom: emailDoc.from,
                messageCount: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
    }
}
