
/**
 * Zoho Mail API endpoint for sequence emails
 * Matches MailerSend interface for easy migration
 * Adapted from gmail-send-sequence.js
 */
import { cors } from '../_cors.js';
import { ZohoMailService } from './zoho-service.js';
import { injectTracking, hasTrackingPixel } from './tracking-helper.js';
import { supabaseAdmin as supabase } from '../_supabase.js';
import logger from '../_logger.js';

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
            replyTo,
            personalization,
            tags,
            trackClicks = true,
            trackOpens = true,
            email_id // Existing record ID from Edge Function
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
        const fromName = typeof from === 'object' ? (from.name || 'Nodal Point') : 'Nodal Point';

        logger.info(`[Zoho Sequence] Sending email: to=${toEmail}, from=${fromEmail}, subject=${subject}`, 'zoho-send-sequence');

        // Generate tracking ID
        const trackingId = `zoho_seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Prepare HTML content with tracking if enabled
        let htmlContent = html || '';
        if (htmlContent && trackOpens && !hasTrackingPixel(htmlContent)) {
            htmlContent = injectTracking(htmlContent, trackingId, {
                enableOpenTracking: trackOpens,
                enableClickTracking: trackClicks
            });
            logger.debug('[Zoho Sequence] Injected tracking into email', { trackingId });
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

        // Logic for CRM Recording / Uplink Out Sync
        if (email_id) {
            const { error: updateError } = await supabase
                .from('emails')
                .update({
                    status: 'sent',
                    type: 'sent',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        ...body.metadata,
                        messageId: result.messageId,
                        sentAt: new Date().toISOString(),
                        zohoMessageId: result.messageId,
                        trackingId: trackingId
                    }
                })
                .eq('id', email_id);

            if (updateError) {
                logger.error('[Zoho Sequence] Failed to update CRM email record:', updateError);
            } else {
                logger.info(`[Zoho Sequence] Updated CRM email record: ${email_id}`);
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
        res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Failed to send email',
            message: error.message,
            title: error.name
        }));
    }
}
