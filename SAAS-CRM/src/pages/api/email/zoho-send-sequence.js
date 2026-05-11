/**
 * Zoho Mail API endpoint for sequence emails
 * Matches MailerSend interface for easy migration
 * Adapted from gmail-send-sequence.js
 */

// Increase body size limit to handle HTML email content + base64 attachments
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

import { cors } from '../_cors.js';
import { ZohoMailService } from './zoho-service.js';
import { injectTracking, hasTrackingPixel } from './tracking-helper.js';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { generateForensicSignature } from '@/lib/signature';
import { appendHtmlFragment } from '@/lib/email-html';
import { buildSequenceTemplateVariables, renderSequenceTemplate } from '@/lib/sequence-template';
import { getBurnerFromEmail } from '@/lib/burner-email';
import logger from '../_logger.js';

function buildUnsubscribeFooter(unsubscribeUrl) {
    return (
        `<div data-nodal-unsubscribe-footer="1" style="margin-top:32px;padding-top:16px;border-top:1px solid #3f3f46;font-family:sans-serif;font-size:11px;color:#71717a;text-align:center;line-height:1.6;">` +
        `<p style="margin:0 0 4px 0;">Nodal Point &middot; Energy Intelligence &middot; Fort Worth, TX</p>` +
        `<p style="margin:0;">You received this because we identified a potential opportunity for your energy portfolio. ` +
        `<a href="${unsubscribeUrl}" style="color:#71717a;text-decoration:underline;">Unsubscribe or manage preferences</a></p>` +
        `</div>`
    );
}

function stripExistingUnsubscribeFooter(html) {
    if (!html || typeof html !== 'string') return { html, hadFooter: false };
    const markerPattern = /<div[^>]*data-nodal-unsubscribe-footer="1"[^>]*>[\s\S]*?<\/div>\s*$/i;
    const textPattern = /<div[^>]*>[\s\S]*?Unsubscribe or manage preferences[\s\S]*?<\/div>\s*$/i;
    if (markerPattern.test(html)) {
        return { html: html.replace(markerPattern, ''), hadFooter: true };
    }
    if (textPattern.test(html)) {
        return { html: html.replace(textPattern, ''), hadFooter: true };
    }
    return { html, hadFooter: false };
}

function hasUnresolvedTemplateVariables(value) {
  return /\{\{\s*[^}]+\s*\}\}/.test(String(value || ''));
}

function extractPrimarySiteDetails(account) {
    const direct = typeof account?.address === 'string' ? account.address.trim() : '';
    const city = typeof account?.city === 'string' ? account.city.trim() : '';
    const state = typeof account?.state === 'string' ? account.state.trim() : '';
    const serviceAddresses = Array.isArray(account?.service_addresses) ? account.service_addresses : [];

    if (serviceAddresses.length > 0) {
        const candidates = [];
        for (const item of serviceAddresses) {
            if (typeof item === 'string' && item.trim()) {
                candidates.push({ address: item.trim(), city: '', state: '', isPrimary: false });
                continue;
            }
            if (item && typeof item === 'object') {
                const normalized = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
                const serviceAddress = typeof item.address === 'string' ? item.address.trim() : '';
                const serviceCity = typeof item.city === 'string' ? item.city.trim() : '';
                const serviceState = typeof item.state === 'string' ? item.state.trim() : '';
                const flagText = [normalized.type, normalized.label, normalized.name, normalized.kind]
                    .filter((part) => typeof part === 'string')
                    .join(' ')
                    .toLowerCase();
                const isPrimary = [normalized.isPrimary, normalized.primary, normalized.is_primary, normalized.preferred, normalized.default]
                    .some((flag) => flag === true || flag === 'true' || flag === 1 || flag === '1')
                    || /\b(primary|headquarters|head office|hq|main|billing)\b/.test(flagText);
                candidates.push({
                    address: serviceAddress || [serviceCity, serviceState].filter(Boolean).join(', '),
                    city: serviceCity,
                    state: serviceState,
                    isPrimary,
                });
            }
        }

        if (candidates.length > 0) {
            return candidates.find((candidate) => candidate.isPrimary) || candidates[0];
        }
    }

    return {
        address: direct || [city, state].filter(Boolean).join(', '),
        city,
        state,
    };
}

async function buildSequenceTemplateVariablesForEmail(contactId, metadata) {
    const effectiveContactId = String(
        contactId || metadata?.contactId || metadata?.contact_id || metadata?.targetId || metadata?.target_id || ''
    ).trim();
    if (!effectiveContactId) return null;

    const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('id, email, notes, "firstName", "lastName", title, city, state, phone, mobile, "workPhone", "otherPhone", "companyPhone", "primaryPhoneField", "linkedinUrl", "accountId", metadata')
        .eq('id', effectiveContactId)
        .maybeSingle();

    if (contactError || !contact) return null;

    let account = null;
    if (contact.accountId) {
        const { data: acc } = await supabase
            .from('accounts')
            .select('id, name, domain, website, linkedin_url, industry, description, phone, annual_usage, current_rate, contract_end_date, revenue, employees, city, state, address, service_addresses, electricity_supplier, metadata')
            .eq('id', contact.accountId)
            .maybeSingle();
        account = acc || null;
    }

    const primarySite = extractPrimarySiteDetails(account || {});
    const siteCity = typeof primarySite.city === 'string' && primarySite.city.trim()
        ? primarySite.city.trim()
        : typeof account?.city === 'string' && account.city.trim()
            ? account.city.trim()
            : typeof contact.city === 'string' ? contact.city.trim() : '';
    const siteState = typeof primarySite.state === 'string' && primarySite.state.trim()
        ? primarySite.state.trim()
        : typeof account?.state === 'string' && account.state.trim()
            ? account.state.trim()
            : typeof contact.state === 'string' ? contact.state.trim() : '';

    return buildSequenceTemplateVariables({
        contact,
        account: account || {},
        site: {
            city: siteCity || null,
            state: siteState || null,
            address: primarySite.address || account?.address || contact.address || null,
            utilityTerritory: account?.metadata?.utility_territory || account?.metadata?.utilityTerritory || null,
            tdu: account?.tdu || null,
            marketContext: account?.metadata?.market_context || account?.metadata?.marketContext || null,
        },
    });
}

export default async function handler(req, res) {
    logger.info(`[Zoho Sequence] Incoming request: ${req.method} ${req.url}`, 'zoho-send-sequence');
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        logger.warn(`[Zoho Sequence] Method not allowed: ${req.method}`, 'zoho-send-sequence');
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (_) { body = {}; }
        }
        if (!body || typeof body !== 'object') body = {};

        const {
            to,
            from,
            subject,
            html,
            text,
            aiPrompt,
            generatedBody,
            generatedSubject,
            replyTo,
            personalization,
            tags,
            trackClicks = true,
            trackOpens = true,
            contactId,    // HOLE 2 FIX: contact UUID passed from edge function to link email to profile
            email_id      // Existing record ID from Edge Function
        } = body;

        // Validate required fields (allow object or string for to/from)
        const hasTo = to && (typeof to === 'object' ? to.email : to);
        const hasFrom = from && (typeof from === 'object' ? from.email : from);
        const hasContent = html || text;
        if (!hasTo || !hasFrom || !subject || !hasContent) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Missing required fields',
                required: ['to', 'from', 'subject', 'html or text']
            }));
            return;
        }

        // Extract email addresses and names
        const toEmail = typeof to === 'object' ? to.email : to;
        // const toName = typeof to === 'object' ? (to.name || '') : '';
        const fromEmail = getBurnerFromEmail(typeof from === 'object' ? from.email : from);
        let fromName = typeof from === 'object' ? (from.name || 'Nodal Point') : 'Nodal Point';

        logger.info(`[Zoho Sequence] Sending email: to=${toEmail}, from=${fromEmail}, subject=${subject}`, 'zoho-send-sequence');

        // Generate tracking ID
        const trackingId = `zoho_seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Prepare HTML content with tracking if enabled
        let htmlContent = html || '';
        let normalizedSubject = String(subject || '').trim();
        let textContent = text || '';

        // Forensic Signature Injection for Sequences
        // Rules: 
        // 1. Only injection if it's not a Foundry template (detected by full-width table or specific marker)
        // 2. Only if content isn't already a full HTML document
        const strippedFooter = stripExistingUnsubscribeFooter(htmlContent);
        htmlContent = strippedFooter.html || '';
        const hadExistingFooter = strippedFooter.hadFooter;

        const templateMarkersPresent = [normalizedSubject, htmlContent, textContent].some(hasUnresolvedTemplateVariables);
        if (templateMarkersPresent) {
            const templateVariables = await buildSequenceTemplateVariablesForEmail(contactId, body.metadata);
            if (!templateVariables) {
                throw new Error('Sequence template still contains unresolved variables and no contact context was available');
            }

            normalizedSubject = renderSequenceTemplate(normalizedSubject, templateVariables);
            htmlContent = renderSequenceTemplate(htmlContent, templateVariables);
            textContent = renderSequenceTemplate(textContent, templateVariables);
        }

        if (
            hasUnresolvedTemplateVariables(normalizedSubject) ||
            hasUnresolvedTemplateVariables(htmlContent) ||
            hasUnresolvedTemplateVariables(textContent)
        ) {
            throw new Error('Sequence template still contains unresolved variables after rendering');
        }

        const isFoundry = htmlContent.includes('<!-- FOUNDRY_TEMPLATE -->') || htmlContent.includes('data-foundry');
        const hasSignature = htmlContent.includes('NODAL_FORENSIC_SIGNATURE') || htmlContent.includes('nodal-signature');

        if (!isFoundry && !hasSignature && htmlContent) {
            try {
                // Normalize fromEmail for lookups (handle cold-outreach burner domain)
                const lookupEmail = fromEmail.replace('@getnodalpoint.com', '@nodalpoint.io');
                logger.info(`[Zoho Sequence] Burner domain detected. Mapping ${fromEmail} -> ${lookupEmail} for profile lookup.`, 'zoho-send-sequence');

                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('first_name, last_name, job_title, hosted_photo_url')
                    .eq('email', lookupEmail)
                    .maybeSingle();

                const profile = userData && !userError
                    ? {
                        firstName: userData.first_name,
                        lastName: userData.last_name,
                        jobTitle: userData.job_title,
                        hostedPhotoUrl: userData.hosted_photo_url
                    }
                    : {
                        firstName: 'Lewis',
                        lastName: 'Patterson',
                        jobTitle: 'Market Architect'
                    };

                // Always derive fromName from the actual user profile so it matches
                // the ComposeModal format: "FirstName • Nodal Point"
                fromName = profile.firstName ? `${profile.firstName} \u2022 Nodal Point` : fromName;

                const senderDomain = fromEmail.includes('@') ? fromEmail.split('@')[1] : null;
                const forensicSig = generateForensicSignature(profile, {
                    senderEmail: fromEmail,
                    websiteDomain: senderDomain
                });

                htmlContent = appendHtmlFragment(htmlContent, forensicSig);
                if (userData && !userError) {
                    logger.info(`[Zoho Sequence] Injected Forensic Signature for ${fromEmail} (via ${lookupEmail})`, 'zoho-send-sequence');
                } else {
                    logger.warn(`[Zoho Sequence] No profile found for ${lookupEmail}. Injected fallback signature for ${fromEmail}.`, 'zoho-send-sequence');
                }
            } catch (sigError) {
                logger.error('[Zoho Sequence] Failed to inject signature:', sigError);
            }
        }

        // Detect self-send or internal testing for sequences
        const isSelfSend = toEmail.toLowerCase().trim() === fromEmail.toLowerCase().trim();
        const isInternalTest = toEmail.toLowerCase().endsWith('@nodalpoint.io') || toEmail.toLowerCase().endsWith('@getnodalpoint.com');

        const finalTrackOpens = isSelfSend ? false : trackOpens;
        const finalTrackClicks = isSelfSend ? false : trackClicks;

        // Unsubscribe Footer Injection
        // Appended before tracking so the unsubscribe link is also click-tracked.
        if (htmlContent && !isSelfSend && !isInternalTest) {
            try {
                const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.nodalpoint.io').replace(/\/+$/, '');
                const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(toEmail)}`;
                const unsubscribeFooter = buildUnsubscribeFooter(unsubscribeUrl);
                htmlContent = appendHtmlFragment(htmlContent, unsubscribeFooter);
                logger.info(
                    `[Zoho Sequence] ${hadExistingFooter ? 'Repositioned' : 'Injected'} unsubscribe footer for ${toEmail}`,
                    'zoho-send-sequence'
                );
            } catch (footerError) {
                logger.error('[Zoho Sequence] Failed to inject unsubscribe footer:', footerError);
            }
        }

        if (htmlContent && finalTrackOpens && !hasTrackingPixel(htmlContent)) {
            htmlContent = injectTracking(htmlContent, trackingId, {
                enableOpenTracking: finalTrackOpens,
                enableClickTracking: finalTrackClicks
            });
            logger.debug('[Zoho Sequence] Injected tracking into email', { trackingId, finalTrackOpens });
        }

        if (isSelfSend || isInternalTest) {
            logger.info(`[Zoho Sequence] Internal/Self-send detected. Tracking: opens=${finalTrackOpens}, clicks=${finalTrackClicks}`, 'zoho-send-sequence');
        }

        if (!textContent && htmlContent) {
            textContent = htmlContent
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        // Initialize Zoho service
        const zohoService = new ZohoMailService();
        // Assuming 'fromEmail' corresponds to the user/account triggering the sequence
        const serviceInitialized = await zohoService.initialize(fromEmail);

        if (!serviceInitialized) {
            logger.error(`[Zoho Sequence] Failed to initialize/validate token for ${fromEmail}`);
            throw new Error(`Failed to initialize Zoho service for ${fromEmail}`);
        }

        // Send email via Zoho API
        const result = await zohoService.sendEmail({
            to: toEmail,
            subject: normalizedSubject,
            html: htmlContent || undefined,
            text: textContent || undefined,
            userEmail: fromEmail, // Critical for multi-tenant token selection
            from: fromEmail,
            fromName: fromName,
            // Zoho API doesn't always support reply-to cleanly in standard Send API without complexity, check service
            // Service supports 'replyTo' if added to payload? 
            // Checking zoho-service.js... it doesn't currently map `replyTo`. 
            // Implementation note: The existing zoho-service.js sendEmail function does NOT pass `replyTo` in payload.
            // We should probably update zoho-service.js if reply-to is needed, but for now we follow existing capabilities.
        });

        logger.info(`[Zoho Sequence] Email sent successfully: messageId=${result.messageId}`, 'zoho-send-sequence');
        const sentAt = new Date().toISOString();

        // Logic for CRM Recording / Uplink Out Sync
        // Map burner domain to primary for ownerId so emails appear under the correct profile
        const ownerEmail = fromEmail.endsWith('@getnodalpoint.com')
            ? fromEmail.replace('@getnodalpoint.com', '@nodalpoint.io')
            : fromEmail;

        if (email_id) {
            const { error: updateError } = await supabase
                .from('emails')
                .update({
                    status: 'sent',
                    type: 'sent',
                    subject: normalizedSubject,
                    html: htmlContent || '',
                    text: textContent || '',
                    aiPrompt: String(aiPrompt || body?.metadata?.aiPrompt || '').trim() || null,
                    timestamp: sentAt,
                    sentAt,
                    updatedAt: sentAt,
                    metadata: {
                        ...body.metadata,
                        messageId: result.messageId,
                        sentAt,
                        zohoMessageId: result.messageId,
                        trackingId: trackingId,
                        aiPrompt: String(aiPrompt || body?.metadata?.aiPrompt || '').trim() || null,
                        generatedBody: String(htmlContent || textContent || '').trim() || null,
                        generatedSubject: String(normalizedSubject || '').trim() || null
                    }
                })
                .eq('id', email_id);

            if (updateError) {
                logger.error('[Zoho Sequence] Failed to update CRM email record:', updateError);
            } else {
                logger.info(`[Zoho Sequence] Updated CRM email record: ${email_id}`);
            }

            // Insert a lightweight tracking record keyed by trackingId so that open/click
            // handlers (track/[id].js, click/[id].js) can look up member_id and call
            // advance_sequence_member with the correct signal outcome.
            // Without this, the pixel fires to zoho_seq_... but no record exists at that ID.
            const { error: trackInsertError } = await supabase
                .from('emails')
                .insert({
                    id: trackingId,
                    to: [toEmail],
                    subject: normalizedSubject,
                    from: fromEmail,
                    aiPrompt: String(aiPrompt || body?.metadata?.aiPrompt || '').trim() || null,
                    // Tracking-only record for pixel/click handlers. Keep out of outbound UI lists.
                    type: 'tracking',
                    status: 'sent',
                    openCount: 0,
                    clickCount: 0,
                    opens: [],
                    clicks: [],
                    timestamp: sentAt,
                    sentAt,
                    createdAt: sentAt,
                    updatedAt: sentAt,
                    ownerId: ownerEmail,
                    ...(contactId ? { contactId } : {}),
                    metadata: {
                        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
                        email_id,
                        trackingId,
                        messageId: result.messageId,
                        isTrackingOnly: true,
                        isSequenceEmail: true,
                        provider: 'zoho',
                        aiPrompt: String(aiPrompt || body?.metadata?.aiPrompt || '').trim() || null,
                        generatedBody: String(htmlContent || textContent || '').trim() || null,
                        generatedSubject: String(normalizedSubject || '').trim() || null
                    }
                });

            if (trackInsertError) {
                logger.warn('[Zoho Sequence] Failed to insert tracking record:', trackInsertError.message);
            } else {
                logger.info(`[Zoho Sequence] Inserted tracking record: ${trackingId}`);
            }
        } else {
            // No pre-existing record — create one so the email appears in uplink_out
            const { error: insertError } = await supabase
                .from('emails')
                .insert({
                    id: trackingId,
                    to: [toEmail],
                    subject: normalizedSubject,
                    html: htmlContent || '',
                    text: textContent || '',
                    from: fromEmail,
                    aiPrompt: String(aiPrompt || body?.metadata?.aiPrompt || '').trim() || null,
                    type: 'sent',
                    status: 'sent',
                    openCount: 0,
                    clickCount: 0,
                    opens: [],
                    clicks: [],
                    timestamp: sentAt,
                    sentAt,
                    createdAt: sentAt,
                    updatedAt: sentAt,
                    ownerId: ownerEmail,
                    ...(contactId ? { contactId } : {}),
                    metadata: {
                        provider: 'zoho',
                        ownerId: ownerEmail,
                        fromName,
                        emailType: 'sent',
                        isSentEmail: true,
                        isSequenceEmail: true,
                        messageId: result.messageId,
                        zohoMessageId: result.messageId,
                        sentAt,
                        trackingId,
                        aiPrompt: String(aiPrompt || body?.metadata?.aiPrompt || '').trim() || null,
                        generatedBody: String(htmlContent || textContent || '').trim() || null,
                        generatedSubject: String(normalizedSubject || '').trim() || null,
                        ...((body.metadata && typeof body.metadata === 'object') ? body.metadata : {})
                    }
                });

            if (insertError) {
                logger.error('[Zoho Sequence] Failed to create CRM email record:', insertError.message);
            } else {
                logger.info(`[Zoho Sequence] Created CRM email record for sequence send: ${trackingId}`);
            }
        }

        // Return response matching MailerSend format
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            messageId: result.messageId,
            to: toEmail,
            subject: normalizedSubject
        }));

    } catch (error) {
        logger.error('[Zoho Sequence] Error sending email:', error, 'zoho-send-sequence');
        if (email_id) {
            try {
                const failedAt = new Date().toISOString();
                const failureReason = String(error?.message || 'Failed to send sequence email').trim().slice(0, 500);
                const failureMetadata = {
                    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
                    provider: 'zoho',
                    zohoFolder: 'failed',
                    failureReason,
                    failedAt,
                    isSequenceEmail: true,
                };

                const { error: failureUpdateError } = await supabase
                    .from('emails')
                    .update({
                        status: 'failed',
                        type: 'scheduled',
                        updatedAt: failedAt,
                        metadata: failureMetadata
                    })
                    .eq('id', email_id);

                if (failureUpdateError) {
                    logger.error('[Zoho Sequence] Failed to mark email as failed:', failureUpdateError.message);
                }
            } catch (failurePersistError) {
                logger.error('[Zoho Sequence] Failed to persist send failure state:', failurePersistError?.message || failurePersistError);
            }
        }
        res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Failed to send email',
            message: error.message,
            title: error.name
        }));
    }
}
