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
        const fromEmail = typeof from === 'object' ? from.email : from;
        let fromName = typeof from === 'object' ? (from.name || 'Nodal Point') : 'Nodal Point';

        logger.info(`[Zoho Sequence] Sending email: to=${toEmail}, from=${fromEmail}, subject=${subject}`, 'zoho-send-sequence');

        // Generate tracking ID
        const trackingId = `zoho_seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Prepare HTML content with tracking if enabled
        let htmlContent = html || '';

        // Forensic Signature Injection for Sequences
        // Rules: 
        // 1. Only injection if it's not a Foundry template (detected by full-width table or specific marker)
        // 2. Only if content isn't already a full HTML document
        const strippedFooter = stripExistingUnsubscribeFooter(htmlContent);
        htmlContent = strippedFooter.html || '';
        const hadExistingFooter = strippedFooter.hadFooter;

        const isFoundry = htmlContent.includes('<!-- FOUNDRY_TEMPLATE -->') || htmlContent.includes('data-foundry');
        const hasSignature = htmlContent.includes('NODAL_FORENSIC_SIGNATURE') || htmlContent.includes('nodal-signature');

        if (!isFoundry && !hasSignature && htmlContent) {
            try {
                // Normalize fromEmail for lookups (handle cold-outreach burner domain)
                let lookupEmail = fromEmail;
                if (fromEmail.endsWith('@getnodalpoint.com')) {
                    lookupEmail = fromEmail.replace('@getnodalpoint.com', '@nodalpoint.io');
                    logger.info(`[Zoho Sequence] Burner domain detected. Mapping ${fromEmail} -> ${lookupEmail} for profile lookup.`, 'zoho-send-sequence');
                }

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

        // Prepare text content (use provided text or convert HTML)
        let textContent = text || '';
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
            subject,
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
                    subject,
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
                        generatedBody: String(generatedBody || htmlContent || '').trim() || null,
                        generatedSubject: String(generatedSubject || subject || '').trim() || null
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
                    subject,
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
                        generatedBody: String(generatedBody || htmlContent || '').trim() || null,
                        generatedSubject: String(generatedSubject || subject || '').trim() || null
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
                    subject,
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
                        generatedBody: String(generatedBody || htmlContent || '').trim() || null,
                        generatedSubject: String(generatedSubject || subject || '').trim() || null,
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
            subject
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
