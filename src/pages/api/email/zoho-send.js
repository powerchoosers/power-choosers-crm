// API endpoint for sending emails via Zoho Mail API
// Increase body size limit to handle HTML email content + base64 attachments
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

import { cors } from '../_cors.js';
import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from './zoho-service.js';
import { injectTracking, sanitizeExistingTracking } from './tracking-helper.js';
import { generateNodalSignature } from '@/lib/signature';
import logger from '../_logger.js';

function extractValidEmail(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const angle = raw.match(/<\s*([^>]+)\s*>/);
    const candidate = (angle?.[1] || raw).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : '';
}

function normalizeLookupText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function parseRecipientIdentity(value) {
    const raw = String(value || '').trim();
    const email = extractValidEmail(raw);
    const display = email
        ? raw.replace(/<\s*[^>]+\s*>/, '').trim()
        : raw;
    const normalizedDisplay = normalizeLookupText(display);
    const normalizedEmail = normalizeLookupText(email);
    const emailParts = email ? email.split('@') : ['', ''];
    const localPart = emailParts[0] || '';
    const domainPart = emailParts[1] || '';

    return {
        raw,
        email,
        display,
        normalizedDisplay,
        normalizedEmail,
        localPart,
        domainPart,
        localCompact: normalizeLookupText(localPart),
    };
}

function normalizeRecipientList(raw) {
    const values = Array.isArray(raw) ? raw : [raw];
    const normalized = values
        .flatMap((value) => String(value || '').split(','))
        .map((value) => extractValidEmail(value))
        .filter(Boolean);
    return Array.from(new Set(normalized));
}

function normalizeOwnerKey(value) {
    return String(value || '').trim().toLowerCase();
}

function buildContactName(contact) {
    return (
        contact?.name
        || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim()
        || null
    );
}

function buildContactCompany(contact) {
    const metadata = contact?.metadata && typeof contact.metadata === 'object' ? contact.metadata : {};
    const account = Array.isArray(contact?.accounts) ? contact.accounts[0] : contact?.accounts;
    return (
        metadata?.company
        || metadata?.companyName
        || metadata?.general?.company
        || metadata?.general?.companyName
        || account?.name
        || null
    );
}

async function resolveProvidedContact(contactId) {
    const normalizedId = String(contactId || '').trim();
    if (!normalizedId) return null;

    const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('id, accountId, ownerId, email, name, firstName, lastName, metadata, accounts(name)')
        .eq('id', normalizedId)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    return data;
}

async function resolveRecipientContact(ownerEmail, recipientEmail) {
    const recipient = parseRecipientIdentity(recipientEmail);
    if (!ownerEmail || (!recipient.email && !recipient.display)) {
        return { contactId: null, accountId: null, contactName: null, contactCompany: null };
    }

    let ownerUserId = null;
    try {
        const { data: ownerUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', ownerEmail)
            .maybeSingle();

        ownerUserId = ownerUser?.id || null;
    } catch {
        // Best effort only.
    }

    const queryParts = [];
    if (recipient.email) {
        queryParts.push(`email.ilike.%${recipient.email}%`);
        queryParts.push(`email.ilike.%${recipient.localPart}%`);
        if (recipient.domainPart) {
            queryParts.push(`email.ilike.%@${recipient.domainPart}%`);
        }
    }
    if (recipient.display && recipient.display !== recipient.email) {
        queryParts.push(`name.ilike.%${recipient.display}%`);
        queryParts.push(`firstName.ilike.%${recipient.display}%`);
        queryParts.push(`lastName.ilike.%${recipient.display}%`);
    }

    const contactQuery = supabaseAdmin
        .from('contacts')
        .select('id, accountId, ownerId, email, name, firstName, lastName, metadata, accounts(name)')
        .or(Array.from(new Set(queryParts)).join(','));

    const { data: contacts, error } = await contactQuery;

    if (error) {
        logger.warn('[Zoho] Contact resolution failed:', error.message || error, 'zoho-send');
        return { contactId: null, accountId: null, contactName: null, contactCompany: null };
    }

    const rows = Array.isArray(contacts) ? contacts : [];
    if (!rows.length) {
        return { contactId: null, accountId: null, contactName: null, contactCompany: null };
    }

    const ownerKey = normalizeOwnerKey(ownerEmail);
    const scored = rows
        .map((row) => {
            const rowEmail = normalizeLookupText(row.email);
            const rowName = normalizeLookupText(row.name);
            const rowFullName = normalizeLookupText([row.firstName, row.lastName].filter(Boolean).join(' '));
            const rowLocalPart = normalizeLookupText(String(row.email || '').split('@')[0] || '');
            const rowDomainPart = String(row.email || '').split('@')[1] || '';

            let score = 0;
            if (recipient.normalizedEmail && recipient.normalizedEmail === rowEmail) score = 100;
            else if (recipient.normalizedDisplay && recipient.normalizedDisplay === rowName) score = 95;
            else if (recipient.normalizedDisplay && recipient.normalizedDisplay === rowFullName) score = 90;
            else if (recipient.domainPart && recipient.domainPart === rowDomainPart && recipient.localCompact === rowLocalPart) score = 80;
            else if (recipient.domainPart && recipient.domainPart === rowDomainPart && recipient.localCompact.length > 1 && recipient.localCompact.slice(1) === rowLocalPart) score = 70;

            return { row, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => {
            const ownerPriority = (row) => {
                if (ownerUserId && normalizeOwnerKey(row.ownerId) === normalizeOwnerKey(ownerUserId)) return 3;
                if (normalizeOwnerKey(row.ownerId) === ownerKey) return 2;
                if (!row.ownerId) return 1;
                return 0;
            };

            const ownerDiff = ownerPriority(b.row) - ownerPriority(a.row);
            if (ownerDiff !== 0) return ownerDiff;
            if (b.score !== a.score) return b.score - a.score;
            return String(a.row.name || '').localeCompare(String(b.row.name || ''));
        });

    const chosen =
        scored[0]?.row
        || (ownerUserId ? rows.find((row) => normalizeOwnerKey(row.ownerId) === normalizeOwnerKey(ownerUserId)) : null)
        || rows.find((row) => normalizeOwnerKey(row.ownerId) === ownerKey)
        || rows.find((row) => !row.ownerId)
        || (rows.length === 1 ? rows[0] : null);

    if (!chosen) {
        return { contactId: null, accountId: null, contactName: null, contactCompany: null };
    }

    return {
        contactId: chosen.id || null,
        accountId: chosen.accountId || null,
        contactName: buildContactName(chosen),
        contactCompany: buildContactCompany(chosen)
    };
}

function normalizeComposerAttachments(attachments, uploadedAttachments = []) {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];

    return attachments.map((att, idx) => {
        const uploaded = uploadedAttachments[idx] || {};
        return {
            filename: att?.filename || uploaded?.attachmentName || 'Attachment',
            mimeType: att?.type || 'application/octet-stream',
            size: typeof att?.size === 'number' ? att.size : 0,
            provider: 'zoho',
            attachmentId: uploaded?.attachmentPath || uploaded?.storeName || null,
            attachmentPath: uploaded?.attachmentPath || null,
            messageId: null,
            downloadUnavailable: true
        };
    });
}

export default async function handler(req, res) {
    logger.info(`[Zoho] Incoming request: ${req.method} ${req.url}`, 'zoho-send');
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        logger.warn(`[Zoho] Method not allowed: ${req.method}`, 'zoho-send');
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    // Consolidate owner email resolution from request body
    const { userEmail, from } = req.body;
    const ownerEmail = (userEmail && typeof userEmail === 'string' && userEmail.trim())
        ? userEmail.toLowerCase().trim()
        : (from && typeof from === 'string' && from.includes('@'))
            ? from.toLowerCase().trim()
            : (req.body.userEmail || req.body.from || '').toLowerCase().trim();

    if (!ownerEmail) {
        logger.error('[Zoho] Missing user identity (userEmail or from address)', 'zoho-send');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing user identity' }));
        return;
    }

    try {
        const { to, cc, subject, content, plainTextContent, from, fromName, _deliverability, threadId, inReplyTo, references, isHtmlEmail, userEmail, emailSettings, contactId, contactName, contactCompany, dryRun, attachments, hasSignature } = req.body;
        const toRecipients = normalizeRecipientList(to);
        const ccRecipients = normalizeRecipientList(cc);
        logger.info(`[Zoho] Attempting to send email to: ${toRecipients.join(',') || 'none'}, cc: ${ccRecipients.join(',') || 'none'}, subject: ${subject}, user: ${userEmail}, attachments: ${attachments?.length || 0}`, 'zoho-send');

        if (!subject || !content) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
            return;
        }
        if (!toRecipients.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing or invalid recipient email address' }));
            return;
        }

        const requestedThreadId = String(threadId || '').trim() || null;

        // Generate unique tracking ID
        const trackingId = `zoho_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Explicit boolean conversion
        const isHtmlEmailBoolean = Boolean(isHtmlEmail);

        // Detect self-send or internal testing to strengthen deliverability
        const toAddress = toRecipients[0];
        const isSelfSend = toAddress?.toLowerCase().trim() === ownerEmail.toLowerCase().trim();
        const isInternalTest = toAddress?.toLowerCase().endsWith('@nodalpoint.io') || toAddress?.toLowerCase().endsWith('@getnodalpoint.com');

        // Merge emailSettings with _deliverability
        const deliverability = {
            enableTracking: !isSelfSend, // Disable by default for self-tests
            enableClickTracking: !isSelfSend,
            includeBulkHeaders: false,
            includeListUnsubscribe: false,
            includePriorityHeaders: false,
            forceGmailOnly: false,
            useBrandedHtmlTemplate: false,
            signatureImageEnabled: true,
            ...(_deliverability || {}),
            ...(emailSettings?.deliverability ? {
                enableTracking: emailSettings.deliverability.openTracking !== undefined ? emailSettings.deliverability.openTracking : true,
                enableClickTracking: emailSettings.deliverability.clickTracking !== undefined ? emailSettings.deliverability.clickTracking : true,
                includeBulkHeaders: emailSettings.deliverability.bulkHeaders || false,
                includeListUnsubscribe: emailSettings.deliverability.listUnsubscribe !== undefined ? emailSettings.deliverability.listUnsubscribe : true,
                includePriorityHeaders: emailSettings.deliverability.priorityHeaders || false
            } : {})
        };

        if (isSelfSend || isInternalTest) {
            logger.info(`[Zoho] Internal/Self-send detected. Adjusting deliverability settings: tracking=${deliverability.enableTracking}`, 'zoho-send');
        }

        // Restore signature injection for direct compose sends.
        // ComposeModal no longer posts signature HTML and relies on backend injection.
        let trackedContent = content;
        if (isHtmlEmailBoolean && trackedContent) {
            const isFoundry = trackedContent.includes('<!-- FOUNDRY_TEMPLATE -->') || trackedContent.includes('data-foundry');
            // hasSignature=true in the request body means the caller already embedded the
            // correct signature (e.g. the reply composer in the email detail page).
            // Falling back to substring detection catches older callers (ComposeModal, sequences)
            // that don't send the flag but do embed a marker comment.
            const signatureAlreadyPresent =
                hasSignature === true ||
                trackedContent.includes('NODAL_FORENSIC_SIGNATURE') ||
                trackedContent.includes('NODAL_COMPOSE_SIGNATURE') ||
                trackedContent.includes('nodal-signature');

            if (!isFoundry && !signatureAlreadyPresent) {
                try {
                    let lookupEmail = ownerEmail;
                    if (lookupEmail.endsWith('@getnodalpoint.com')) {
                        lookupEmail = lookupEmail.replace('@getnodalpoint.com', '@nodalpoint.io');
                    }

                    const { data: userData, error: userError } = await supabaseAdmin
                        .from('users')
                        .select('email, first_name, last_name, name, job_title, linkedin_url, hosted_photo_url, settings')
                        .eq('email', lookupEmail)
                        .maybeSingle();

                    if (userData && !userError) {
                        const settings = userData.settings && typeof userData.settings === 'object' ? userData.settings : {};
                        const composeSig = generateNodalSignature({
                            email: userData.email || ownerEmail,
                            name: userData.name || null,
                            firstName: userData.first_name,
                            lastName: userData.last_name,
                            jobTitle: userData.job_title,
                            linkedinUrl: userData.linkedin_url || null,
                            city: settings.city ?? null,
                            state: settings.state ?? null,
                            hostedPhotoUrl: userData.hosted_photo_url,
                            twilioNumbers: settings.twilioNumbers || [],
                            selectedPhoneNumber: settings.selectedPhoneNumber || null,
                            bio: null,
                            bridgeToMobile: settings.bridgeToMobile || false
                        }, { email: ownerEmail }, false);

                        if (composeSig) {
                            trackedContent = `${trackedContent}${composeSig}`;
                            logger.info(`[Zoho] Injected Compose Signature for ${ownerEmail} (via ${lookupEmail})`, 'zoho-send');
                        }
                    } else {
                        logger.warn(`[Zoho] No profile found for ${lookupEmail}. Signature injection skipped.`, 'zoho-send');
                    }
                } catch (sigError) {
                    logger.error('[Zoho] Failed to inject signature:', sigError, 'zoho-send');
                }
            }
        }

        // Ensure each send gets a fresh tracking ID (especially replies that quote previously tracked content).
        trackedContent = sanitizeExistingTracking(trackedContent);
        trackedContent = injectTracking(trackedContent, trackingId, {
            enableOpenTracking: deliverability.enableTracking,
            enableClickTracking: deliverability.enableClickTracking
        });
        logger.debug('[Zoho] Injected tracking into email:', { trackingId, enableTracking: deliverability.enableTracking });

        // Generate plain text version from HTML if needed
        let textContent = '';
        if (plainTextContent) {
            textContent = plainTextContent;
        } else if (isHtmlEmailBoolean) {
            textContent = content
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        } else {
            textContent = content
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        // Owner email is already determined at the top of the handler
        if (!ownerEmail) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing user identity (userEmail or from address)' }));
            return;
        }

        if (dryRun) {
            const zohoService = new ZohoMailService();
            await zohoService.initialize(ownerEmail);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                dryRun: true,
                message: 'Zoho service initialized'
            }));
            return;
        }

        const normalizedAttachments = normalizeComposerAttachments(attachments);
        const resolvedRecipient = supabaseAdmin
            ? await resolveRecipientContact(ownerEmail, toRecipients[0])
            : { contactId: null, accountId: null, contactName: null, contactCompany: null };
        const providedContact = (supabaseAdmin && contactId)
            ? await resolveProvidedContact(contactId)
            : null;

        if (contactId && !providedContact) {
            logger.warn(`[Zoho] Provided contactId '${contactId}' was not found. Falling back to recipient resolution.`, 'zoho-send');
        }

        const persistedContactId = providedContact?.id || resolvedRecipient.contactId || null;
        const persistedAccountId = providedContact?.accountId || resolvedRecipient.accountId || null;
        const persistedContactName =
            buildContactName(providedContact)
            || resolvedRecipient.contactName
            || contactName
            || null;
        const persistedContactCompany =
            buildContactCompany(providedContact)
            || resolvedRecipient.contactCompany
            || contactCompany
            || null;

        // Persist the email record before sending so Sent/Scheduled lists always have a row.
        // Tracking remains optional; it only affects injected pixels/links and tracking metadata.
        if (supabaseAdmin) {
            const emailRecord = {
                id: trackingId,
                to: toRecipients,
                subject,
                threadId: requestedThreadId || trackingId,
                html: trackedContent,
                text: textContent,
                from: from || ownerEmail || 'noreply@nodalpoint.io',
                type: 'sent',
                status: 'sending',
                contactId: persistedContactId,
                accountId: persistedAccountId,
                opens: [],
                clicks: [],
                openCount: 0,
                clickCount: 0,
                timestamp: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                ownerId: ownerEmail,
                metadata: {
                    fromName: fromName || null,
                    emailType: 'sent',
                    isSentEmail: true,
                    provider: 'zoho',
                    contactName: persistedContactName,
                    contactCompany: persistedContactCompany,
                    contactId: persistedContactId,
                    accountId: persistedAccountId,
                    ownerId: ownerEmail,
                    assignedTo: ownerEmail,
                    createdBy: ownerEmail,
                    zohoFolder: 'sent',
                    threadId: requestedThreadId || trackingId,
                    attachments: normalizedAttachments,
                    replies: []
                }
            };

            try {
                const { error } = await supabaseAdmin
                    .from('emails')
                    .insert(emailRecord);

                if (error) throw error;
                logger.debug('[Zoho] Created email record for tracking in Supabase:', { trackingId });
            } catch (dbError) {
                logger.warn('[Zoho] Failed to create pre-send email record. Retrying with null contact linkage:', dbError.message);
                try {
                    const fallbackRecord = {
                        ...emailRecord,
                        contactId: null,
                        accountId: null,
                        metadata: {
                            ...emailRecord.metadata,
                            contactId: null,
                            accountId: null
                        }
                    };
                    const { error: fallbackError } = await supabaseAdmin
                        .from('emails')
                        .upsert(fallbackRecord, { onConflict: 'id' });
                    if (fallbackError) throw fallbackError;
                    logger.warn('[Zoho] Pre-send fallback insert succeeded without contact/account linkage.', 'zoho-send');
                } catch (fallbackErr) {
                    logger.error('[Zoho] Pre-send fallback insert failed:', fallbackErr?.message || fallbackErr, 'zoho-send');
                }
            }
        }

        // Prepare email data for Zoho
        const zohoService = new ZohoMailService();

        // Upload raw base64 attachments to Zoho file store first, then pass references
        let uploadedAttachments = [];
        if (attachments && attachments.length > 0) {
            for (const att of attachments) {
                try {
                    const buffer = Buffer.from(att.content, 'base64');
                    const zohoAtt = await zohoService.uploadAttachment(ownerEmail, buffer, att.filename);
                    if (zohoAtt) uploadedAttachments.push(zohoAtt);
                } catch (attErr) {
                    logger.warn(`[Zoho] Failed to upload attachment '${att.filename}':`, attErr.message);
                }
            }
        }

        logger.debug('[Zoho] Sending email:', { to, subject, trackingId, userEmail, attachments: attachments?.length || 0, uploaded: uploadedAttachments.length });

        const result = await zohoService.sendEmail({
            to: toRecipients,
            cc: ccRecipients.length ? ccRecipients : undefined,
            subject,
            html: trackedContent,
            text: textContent || undefined,
            from: from,
            fromName: fromName,
            uploadedAttachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
            userEmail: ownerEmail
        });

        // Update the persisted row with final send status and Zoho message ID.
        // If the pre-send insert failed, create the row here so sent email is never swallowed.
        if (supabaseAdmin) {
            try {
                const finalThreadId = requestedThreadId || result.messageId || trackingId;
                const attachmentsWithMessageId = normalizedAttachments.map((att, idx) => ({
                    ...att,
                    messageId: result.messageId || null,
                    attachmentId: att.attachmentId || uploadedAttachments[idx]?.attachmentPath || uploadedAttachments[idx]?.storeName || null,
                    attachmentPath: att.attachmentPath || uploadedAttachments[idx]?.attachmentPath || null,
                    downloadUnavailable: !((att.attachmentId || uploadedAttachments[idx]?.attachmentPath || uploadedAttachments[idx]?.storeName) && result.messageId)
                }));

                const { data: existingRow, error: existingRowError } = await supabaseAdmin
                    .from('emails')
                    .select('id, metadata')
                    .eq('id', trackingId)
                    .maybeSingle();

                if (existingRowError) {
                    logger.warn('[Zoho] Failed to fetch existing sent row before update:', existingRowError.message, 'zoho-send');
                }

                const mergedMetadata = {
                    ...(existingRow?.metadata && typeof existingRow.metadata === 'object' ? existingRow.metadata : {}),
                    sentAt: new Date().toISOString(),
                    zohoMessageId: result.messageId,
                    messageId: result.messageId,
                    zohoFolder: 'sent',
                    threadId: finalThreadId,
                    contactName: persistedContactName,
                    contactCompany: persistedContactCompany,
                    contactId: persistedContactId,
                    accountId: persistedAccountId,
                    attachments: attachmentsWithMessageId
                };

                if (existingRow?.id) {
                    const { error } = await supabaseAdmin
                        .from('emails')
                        .update({
                            status: 'sent',
                            threadId: finalThreadId,
                            contactId: persistedContactId,
                            accountId: persistedAccountId,
                            updatedAt: new Date().toISOString(),
                            metadata: mergedMetadata
                        })
                        .eq('id', trackingId);
                    if (error) throw error;
                    logger.debug('[Zoho] Updated email record with sent status in Supabase:', { trackingId, messageId: result.messageId });
                } else {
                    const sentRecord = {
                        id: trackingId,
                        to: toRecipients,
                        subject,
                        threadId: finalThreadId,
                        html: trackedContent,
                        text: textContent,
                        from: from || ownerEmail || 'noreply@nodalpoint.io',
                        type: 'sent',
                        status: 'sent',
                        contactId: persistedContactId,
                        accountId: persistedAccountId,
                        opens: [],
                        clicks: [],
                        openCount: 0,
                        clickCount: 0,
                        timestamp: new Date().toISOString(),
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        ownerId: ownerEmail,
                        metadata: mergedMetadata
                    };

                    const { error: insertAfterSendError } = await supabaseAdmin
                        .from('emails')
                        .insert(sentRecord);
                    if (insertAfterSendError) throw insertAfterSendError;
                    logger.warn('[Zoho] Created sent email row after send because pre-send row was missing.', 'zoho-send');
                }
            } catch (dbError) {
                logger.warn('[Zoho] Failed to update email record in Supabase:', dbError.message);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            messageId: result.messageId,
            trackingId
        }));

    } catch (error) {
        logger.error('[Zoho] Global error in zoho-send:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            status: error.status
        }, 'zoho-send');

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: error.message || 'Failed to send email',
            details: error.message,
            type: error.name
        }));
    }
}
