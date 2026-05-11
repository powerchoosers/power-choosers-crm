/**
 * Cron: poll-calendar-replies
 * Scans each Zoho-connected user's inbox for native calendar reply emails
 * (METHOD:REPLY iCalendars generated when a prospect clicks Accept/Decline in
 * Outlook, Gmail, or Apple Calendar) and writes the result back to Supabase
 * as a task rsvpStatus update + notification — identical to the HTML button flow.
 *
 * Vercel cron schedule: every 5 minutes ("*\/5 * * * *")
 * Also accepts GET for manual trigger with Authorization: Bearer <CRON_SECRET>.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { ZohoMailService } from '../email/zoho-service.js';

const NODAL_UID_SUFFIX = '@nodalpoint.io';
const DEFAULT_CRON_SECRET = 'nodal-cron-2026';

function getCronSecrets() {
    return [process.env.CRON_SECRET, DEFAULT_CRON_SECRET].filter(Boolean);
}

/**
 * Parse UID and PARTSTAT from an iCalendar METHOD:REPLY string.
 * Returns { uid, partstat } or null if not parseable.
 */
function parseCalendarReply(icsText) {
    if (!icsText || !icsText.includes('METHOD:REPLY')) return null;

    const uidMatch = icsText.match(/^UID:(.+)$/m);
    const partstatMatch = icsText.match(/PARTSTAT=(\w+)/i);
    const attendeeMatch = icsText.match(/ATTENDEE[^:]*:MAILTO:([^\s\r\n]+)/i);

    if (!uidMatch || !partstatMatch) return null;

    const rawUid = uidMatch[1].trim();
    // Strip our nodalpoint.io suffix to get bare task ID
    const taskId = rawUid.endsWith(NODAL_UID_SUFFIX)
        ? rawUid.slice(0, -NODAL_UID_SUFFIX.length)
        : rawUid;

    const partstat = partstatMatch[1].toUpperCase();
    const attendeeEmail = attendeeMatch ? attendeeMatch[1].toLowerCase() : null;

    return { taskId, partstat, attendeeEmail };
}

/**
 * Determine rsvpStatus from PARTSTAT.
 * ACCEPTED → 'ACCEPTED', DECLINED → 'DECLINED', anything else → null (ignore).
 */
function rsvpStatusFromPartstat(partstat) {
    if (partstat === 'ACCEPTED') return 'ACCEPTED';
    if (partstat === 'DECLINED') return 'DECLINED';
    return null;
}

/**
 * Process one user's inbox. Returns count of tasks updated.
 */
async function processUserInbox(userEmail, zohoService) {
    let updated = 0;

    // Fetch last 30 inbox messages
    let messages;
    try {
        messages = await zohoService.listMessages(userEmail, { folderId: 'inbox', limit: 30 });
    } catch (err) {
        console.warn(`[CalendarReplyPoll] Could not list inbox for ${userEmail}: ${err.message}`);
        return 0;
    }

    if (!Array.isArray(messages) || messages.length === 0) return 0;

    // Filter to likely calendar replies by subject prefix
    const replyMessages = messages.filter((m) => {
        const subject = String(m.subject || '').toLowerCase();
        return (
            (subject.startsWith('accepted:') || subject.startsWith('declined:') || subject.startsWith('tentative:')) &&
            subject.includes('energy briefing')
        );
    });

    for (const msg of replyMessages) {
        try {
            const messageId = msg.messageId || msg.id;
            if (!messageId) continue;

            // Try to get the ICS content from attachments first
            let icsText = null;

            const attachments = await zohoService.getMessageAttachments(userEmail, messageId);
            const icsAttachment = (attachments || []).find(
                (a) => String(a.attachmentName || a.name || '').toLowerCase().endsWith('.ics')
            );

            if (icsAttachment) {
                // Download the attachment
                const attachmentId = icsAttachment.attachmentId || icsAttachment.id;
                if (attachmentId) {
                    try {
                        const blob = await zohoService.downloadAttachment(userEmail, messageId, attachmentId);
                        if (blob) {
                            icsText = typeof blob === 'string' ? blob : await blob.text?.();
                        }
                    } catch {
                        // Fall through to body parse
                    }
                }
            }

            // Fallback: try message body for inline calendar content
            if (!icsText) {
                try {
                    const content = await zohoService.getMessageContent(userEmail, messageId);
                    const bodyStr = content?.body?.content || content?.content || '';
                    if (bodyStr.includes('BEGIN:VCALENDAR') && bodyStr.includes('METHOD:REPLY')) {
                        icsText = bodyStr;
                    }
                } catch {
                    // skip
                }
            }

            if (!icsText) continue;

            const parsed = parseCalendarReply(icsText);
            if (!parsed) continue;

            const rsvpStatus = rsvpStatusFromPartstat(parsed.partstat);
            if (!rsvpStatus) continue;

            // Look up the task
            const { data: task, error: taskErr } = await supabaseAdmin
                .from('tasks')
                .select('id, ownerId, metadata, title')
                .eq('id', parsed.taskId)
                .single();

            if (taskErr || !task) {
                console.warn(`[CalendarReplyPoll] Task ${parsed.taskId} not found for UID in reply`);
                continue;
            }

            // Skip if already set to this status (idempotent)
            if (task.metadata?.rsvpStatus === rsvpStatus) continue;

            // Update task metadata
            const updatedMetadata = { ...(task.metadata || {}), rsvpStatus };
            const { error: updateErr } = await supabaseAdmin
                .from('tasks')
                .update({ metadata: updatedMetadata })
                .eq('id', task.id);

            if (updateErr) {
                console.error(`[CalendarReplyPoll] Failed to update task ${task.id}: ${updateErr.message}`);
                continue;
            }

            // Insert notification (same shape as the HTML button flow)
            const notifTitle = rsvpStatus === 'ACCEPTED' ? 'Session Confirmed' : 'Session Declined';
            const attendeeDisplay = parsed.attendeeEmail || 'Contact';
            const notifMessage = `${attendeeDisplay} has ${rsvpStatus === 'ACCEPTED' ? 'accepted' : 'declined'} the calendar invite (via native calendar).`;

            await supabaseAdmin.from('notifications').insert({
                id: crypto.randomUUID(),
                ownerId: task.ownerId,
                title: notifTitle,
                message: notifMessage,
                type: 'rsvp',
                read: false,
                data: {
                    contactName: attendeeDisplay.split('@')[0],
                    subject: task.title || 'Unknown Event',
                    status: rsvpStatus,
                    taskId: task.id,
                    source: 'native_calendar'
                }
            });

            console.log(`[CalendarReplyPoll] Recorded ${rsvpStatus} for task ${task.id} from ${attendeeDisplay}`);
            updated++;
        } catch (msgErr) {
            console.warn(`[CalendarReplyPoll] Error processing message ${msg.messageId}: ${msgErr.message}`);
        }
    }

    return updated;
}

export default async function handler(req, res) {
    const auth = req.headers?.authorization || '';
    const token = String(req.headers?.['x-cron-secret'] || auth.replace(/^Bearer\s+/i, '')).trim();
    const validSecrets = new Set(getCronSecrets());

    if (!token || !validSecrets.has(token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        // Get all primary users with Zoho connected
        const { data: primaryUsers } = await supabaseAdmin
            .from('users')
            .select('email')
            .not('zoho_refresh_token', 'is', null);

        // Get all secondary Zoho connections
        const { data: secondaryConnections } = await supabaseAdmin
            .from('zoho_connections')
            .select('email');

        const emailSet = new Set();
        (primaryUsers || []).forEach((u) => u.email && emailSet.add(u.email.toLowerCase()));
        (secondaryConnections || []).forEach((c) => c.email && emailSet.add(c.email.toLowerCase()));

        const connectedEmails = [...emailSet];
        if (connectedEmails.length === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ processed: 0, updated: 0, notice: 'No Zoho-connected users found' }));
            return;
        }

        const zohoService = new ZohoMailService();
        let totalUpdated = 0;

        for (const email of connectedEmails) {
            const count = await processUserInbox(email, zohoService);
            totalUpdated += count;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ processed: connectedEmails.length, updated: totalUpdated }));
    } catch (e) {
        console.error('[CalendarReplyPoll] Fatal error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    }
}
