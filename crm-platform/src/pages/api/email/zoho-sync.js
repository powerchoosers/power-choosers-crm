import { cors } from '../_cors.js';
import { supabaseAdmin } from '../_supabase.js';
import { ZohoMailService } from './zoho-service.js';
import { getValidAccessTokenForUser } from './zoho-token-manager.js';
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

        // Debug info fetching
        const { accessToken, accountId } = await getValidAccessTokenForUser(userEmail).catch(e => ({ error: e.message }));

        // 1. Fetch recent messages from Zoho inbox
        const messages = await zohoService.listMessages(userEmail, { limit: 20 });

        if (!messages || messages.length === 0) {
            logger.info(`[Zoho Sync] No messages found for ${userEmail}`, 'zoho-sync');

            // Resolve folder for debug info
            const folders = await zohoService.listFolders(userEmail, accessToken, accountId).catch(() => []);
            const inbox = folders.find(f => f.name.toLowerCase() === 'inbox' || f.path === '/Inbox' || f.path === '/');

            res.status(200).json({
                success: true,
                count: 0,
                debug: {
                    message: "No messages returned from Zoho API",
                    user: userEmail,
                    accountId: accountId,
                    hasToken: !!accessToken,
                    folderCount: folders.length,
                    inboxFolder: inbox ? { id: inbox.folderId, name: inbox.name, path: inbox.path } : "Not Found"
                }
            });
            return;
        }

        let syncedCount = 0;
        let skippedCount = 0;

        for (const msgSummary of messages) {
            // Zoho messageId is a 19-digit number as a string
            const messageId = String(msgSummary.messageId || msgSummary.message_id);

            // 2. Check for duplicates in Supabase using the primary 'id' column
            const { data: existing } = await supabaseAdmin
                .from('emails')
                .select('id')
                .eq('id', messageId)
                .maybeSingle();

            if (existing) {
                skippedCount++;
                continue;
            }

            // 3. Fetch full content
            const fullContent = await zohoService.getMessageContent(userEmail, messageId);

            // 4. Parse 
            const emailDoc = parseZohoMessage(msgSummary, fullContent, userEmail);

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
    const zohoId = String(summary.messageId);

    // Zoho summary usually contains sender, subject, etc.
    const emailData = {
        id: zohoId, // Use Zoho Message ID as primary key
        from: summary.sender,
        to: [ownerEmail], // Store as array to match DB jsonb 'to' column
        subject: summary.subject,
        text: content.content || '',
        html: content.content || '', // Zoho content API might return HTML directly
        timestamp: new Date(parseInt(receivedTime)).toISOString(),
        type: 'received',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'received',
        is_read: !!summary.isRead,
        is_starred: !!summary.isStarred,
        contactId: null,
        accountId: null,
        metadata: {
            provider: 'zoho',
            ownerId: ownerEmail,
            assignedTo: ownerEmail,
            createdBy: ownerEmail,
            zohoId: zohoId,
            zohoMessageId: zohoId,
            zohoFolder: summary.folderName || 'inbox',
            sentTime: summary.sentTime,
            hasAttachments: summary.hasAttachments,
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
        const normalizeSubject = (s) => (s || '').replace(/^\s*(re|fw|fwd)\s*:\s*/i, '').trim().toLowerCase();
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
