// API endpoint for sending emails via Zoho Mail API
import { cors } from '../_cors.js';
import { supabaseAdmin } from '../_supabase.js';
import { ZohoMailService } from './zoho-service.js';
import { injectTracking, hasTrackingPixel } from './tracking-helper.js';
import logger from '../_logger.js';

export default async function handler(req, res) {
    logger.info(`[Zoho] Incoming request: ${req.method} ${req.url}`, 'zoho-send');
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        logger.warn(`[Zoho] Method not allowed: ${req.method}`, 'zoho-send');
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    // Validate Zoho credentials
    const accountId = process.env.ZOHO_ACCOUNT_ID;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

    if (!accountId || !refreshToken) {
        logger.error('[Zoho] Missing ZOHO_ACCOUNT_ID or ZOHO_REFRESH_TOKEN', 'zoho-send');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing Zoho credentials' }));
        return;
    }

    try {
        const { to, subject, content, plainTextContent, from, fromName, _deliverability, threadId, inReplyTo, references, isHtmlEmail, userEmail, emailSettings, contactId, contactName, contactCompany, dryRun, attachments } = req.body;
        logger.info(`[Zoho] Attempting to send email to: ${to}, subject: ${subject}, user: ${userEmail}, attachments: ${attachments?.length || 0}`, 'zoho-send');

        if (!to || !subject || !content) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields: to, subject, content' }));
            return;
        }

        // Generate unique tracking ID
        const trackingId = `zoho_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Explicit boolean conversion
        const isHtmlEmailBoolean = Boolean(isHtmlEmail);

        // Merge emailSettings with _deliverability
        const deliverability = {
            enableTracking: true,
            enableClickTracking: true,
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

        // Inject tracking pixel and wrap links for click tracking
        let trackedContent = content;
        if (!hasTrackingPixel(content)) {
            trackedContent = injectTracking(content, trackingId, {
                enableOpenTracking: deliverability.enableTracking,
                enableClickTracking: deliverability.enableClickTracking
            });
            logger.debug('[Zoho] Injected tracking into email:', { trackingId, enableTracking: deliverability.enableTracking });
        }

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

        // Determine owner email
        const ownerEmail = (userEmail && typeof userEmail === 'string' && userEmail.trim())
            ? userEmail.toLowerCase().trim()
            : (from && typeof from === 'string' && from.includes('@'))
                ? from.toLowerCase().trim()
                : null;

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

        // Create email record in Supabase BEFORE sending (for tracking)
        if (supabaseAdmin && deliverability.enableTracking) {
            try {
                const emailRecord = {
                    id: trackingId,
                    to: Array.isArray(to) ? to : [to],
                    subject,
                    html: trackedContent,
                    text: textContent,
                    from: from || ownerEmail || 'noreply@nodalpoint.io',
                    type: 'sent',
                    status: 'sending',
                    contactId: contactId || null,
                    opens: [],
                    clicks: [],
                    openCount: 0,
                    clickCount: 0,
                    timestamp: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    metadata: {
                        fromName: fromName || null,
                        emailType: 'sent',
                        isSentEmail: true,
                        provider: 'zoho',
                        contactName: contactName || null,
                        contactCompany: contactCompany || null,
                        ownerId: ownerEmail,
                        assignedTo: ownerEmail,
                        createdBy: ownerEmail,
                        replies: []
                    }
                };

                const { error } = await supabaseAdmin
                    .from('emails')
                    .insert(emailRecord);

                if (error) throw error;
                logger.debug('[Zoho] Created email record for tracking in Supabase:', { trackingId });
            } catch (dbError) {
                logger.warn('[Zoho] Failed to create email record in Supabase (tracking may not work):', dbError.message);
            }
        }

        // Prepare email data for Zoho
        const zohoService = new ZohoMailService();

        logger.debug('[Zoho] Sending email:', { to, subject, trackingId, userEmail, attachments: attachments?.length || 0 });

        const result = await zohoService.sendEmail({
            to,
            subject,
            html: trackedContent,
            text: textContent,
            from: from,
            fromName: fromName,
            attachments: attachments || undefined
        });

        // Update email record with sent status and Zoho message ID
        if (supabaseAdmin && deliverability.enableTracking) {
            try {
                const { error } = await supabaseAdmin
                    .from('emails')
                    .update({
                        status: 'sent',
                        updatedAt: new Date().toISOString(),
                        metadata: {
                            // Get existing metadata and merge
                            ...(await supabaseAdmin.from('emails').select('metadata').eq('id', trackingId).single().then(res => res.data?.metadata || {})),
                            sentAt: new Date().toISOString(),
                            zohoMessageId: result.messageId,
                            messageId: result.messageId,
                            threadId: threadId || null
                        }
                    })
                    .eq('id', trackingId);

                if (error) throw error;
                logger.debug('[Zoho] Updated email record with sent status in Supabase:', { trackingId, messageId: result.messageId });
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
        logger.error('[Zoho] Global error:', error, 'zoho-send');
        res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: error.message || 'Internal server error',
            details: error.details || null
        }));
    }
}
