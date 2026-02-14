
import { cors } from '../_cors.js';
import { supabaseAdmin } from '../_supabase.js';
import { ZohoMailService } from './zoho-service.js';
import logger from '../_logger.js';
import crypto from 'crypto';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { userEmail } = req.body;

    if (!userEmail) {
        res.status(400).json({ error: 'Missing userEmail' });
        return;
    }

    try {
        const zohoService = new ZohoMailService();
        logger.info(`[Zoho Sync] Starting sync for ${userEmail}`, 'zoho-sync');

        // 1. Fetch recent messages from Zoho inbox
        // Using a limit of 20 for background sync to keep it fast
        const messages = await zohoService.listMessages(userEmail, { limit: 20 });

        if (!messages || messages.length === 0) {
            logger.info(`[Zoho Sync] No messages found for ${userEmail}`, 'zoho-sync');
            res.status(200).json({ success: true, count: 0 });
            return;
        }

        let syncedCount = 0;
        let skippedCount = 0;

        for (const msgSummary of messages) {
            const messageId = msgSummary.messageId || msgSummary.message_id;

            // 2. Check for duplicates in Supabase
            const { data: existing } = await supabaseAdmin
                .from('emails')
                .select('id')
                .eq('messageId', messageId)
                .maybeSingle();

            if (existing) {
                skippedCount++;
                continue;
            }

            // 3. Fetch full content
            const fullContent = await zohoService.getMessageContent(userEmail, messageId);

            // 4. Parse and Save
            const emailDoc = parseZohoMessage(msgSummary, fullContent, userEmail);

            const { error: insertError } = await supabaseAdmin
                .from('emails')
                .insert(emailDoc);

            if (insertError) {
                logger.error(`[Zoho Sync] Failed to save message ${messageId}:`, insertError, 'zoho-sync');
            } else {
                syncedCount++;
                // Handle thread updates (simplified helper)
                await updateThread(emailDoc);
            }
        }

        logger.info(`[Zoho Sync] Sync complete for ${userEmail}: ${syncedCount} new, ${skippedCount} skipped`, 'zoho-sync');
        res.status(200).json({ success: true, count: syncedCount });

    } catch (error) {
        logger.error(`[Zoho Sync] Global error for ${userEmail}:`, error, 'zoho-sync');
        res.status(500).json({ error: error.message });
    }
}

function parseZohoMessage(summary, content, ownerEmail) {
    const receivedTime = summary.receivedTime || Date.now();

    // Zoho summary usually contains sender, subject, etc.
    const emailData = {
        messageId: summary.messageId,
        from: summary.sender,
        to: ownerEmail, // Primarily fetching for the owner
        subject: summary.subject,
        text: content.content || '',
        html: content.content || '', // Zoho content API might return HTML directly
        timestamp: new Date(parseInt(receivedTime)).toISOString(),
        type: 'received',
        emailType: 'received',
        provider: 'zoho',
        ownerId: ownerEmail,
        assignedTo: ownerEmail,
        createdBy: ownerEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
            zohoFolder: summary.folderName || 'inbox',
            sentTime: summary.sentTime,
            hasAttachments: summary.hasAttachments
        }
    };

    // Determine threadId (Simplified for now, similar to inbound-email.js logic)
    emailData.threadId = determineThreadId(emailData);

    return emailData;
}

function determineThreadId(emailData) {
    // Zoho doesn't provide a clean threadId in summary, we might need to derive it
    // Using subject + participants hash as fallback if no references
    const normalizeSubject = (s) => (s || '').replace(/^\s*(re|fw|fwd)\s*:\s*/i, '').trim().toLowerCase();
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

    if (existingThread) {
        await supabaseAdmin
            .from('threads')
            .update({
                lastMessageAt: emailDoc.timestamp,
                lastSnippet: snippet,
                lastFrom: emailDoc.from,
                messageCount: (existingThread.messageCount || 0) + 1,
                updatedAt: new Date().toISOString()
            })
            .eq('id', threadId);
    } else {
        await supabaseAdmin
            .from('threads')
            .insert({
                id: threadId,
                subjectNormalized: emailDoc.subject,
                participants: [emailDoc.from, emailDoc.to],
                lastMessageAt: emailDoc.timestamp,
                lastSnippet: snippet,
                lastFrom: emailDoc.from,
                messageCount: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
    }
}
