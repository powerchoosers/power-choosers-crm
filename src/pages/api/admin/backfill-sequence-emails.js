/**
 * One-time admin backfill endpoint.
 * Fetches sent email content from Zoho for every seq_exec_* record
 * that has a zohoMessageId but empty html, and patches the CRM record.
 *
 * POST /api/admin/backfill-sequence-emails
 * Body: { secret: "..." }   (matches ADMIN_SECRET env var)
 */

import { supabaseAdmin as supabase } from '@/lib/supabase';
import { ZohoMailService } from '../email/zoho-service.js';
import { getValidAccessTokenForUser } from '../email/zoho-token-manager.js';

export const config = {
    api: { bodyParser: { sizeLimit: '1mb' } },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simple secret guard so this can't be called publicly
    const { secret } = req.body || {};
    const adminSecret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 16);
    if (!secret || secret !== adminSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // 1. Fetch all seq_exec records that need backfill
        const { data: rows, error: fetchError } = await supabase
            .from('emails')
            .select('id, subject, "from", "to", metadata')
            .like('id', 'seq_exec_%')
            .or('html.is.null,html.eq.')
            .not('metadata->>zohoMessageId', 'is', null);

        if (fetchError) throw fetchError;
        if (!rows || rows.length === 0) {
            return res.status(200).json({ message: 'No emails need backfill', patched: 0 });
        }

        console.log(`[Backfill] Found ${rows.length} seq_exec emails to patch`);

        // 2. Also fetch tracking records to get real subjects
        const trackingIds = rows
            .map(r => r.metadata?.trackingId)
            .filter(Boolean);

        let subjectByTrackingId = {};
        if (trackingIds.length > 0) {
            const { data: trackingRows } = await supabase
                .from('emails')
                .select('id, subject')
                .in('id', trackingIds);
            if (trackingRows) {
                for (const t of trackingRows) {
                    subjectByTrackingId[t.id] = t.subject;
                }
            }
        }

        // 3. Initialize Zoho service — all sequence emails are from the same sender
        const senderEmail = 'l.patterson@nodalpoint.io';
        const zohoService = new ZohoMailService();

        // Pre-resolve the sent folder ID once
        const { accessToken, accountId } = await getValidAccessTokenForUser(senderEmail);
        let sentFolderId = null;
        try {
            const folders = await zohoService.listFolders(senderEmail, accessToken, accountId);
            const sentFolder = folders
                .map(f => ({
                    ...f,
                    folderType: String(f.folderType || f.type || '').toLowerCase(),
                    folderName: String(f.folderName || f.name || '').toLowerCase(),
                }))
                .find(f => f.folderType === 'sent' || f.folderName === 'sent');
            sentFolderId = sentFolder?.folderId ? String(sentFolder.folderId) : null;
            console.log(`[Backfill] Resolved sent folder ID: ${sentFolderId}`);
        } catch (e) {
            console.warn('[Backfill] Could not resolve sent folder:', e.message);
        }

        // 4. Process each record
        const results = { patched: 0, skipped: 0, failed: 0, details: [] };

        for (const row of rows) {
            const zohoMessageId = row.metadata?.zohoMessageId;
            const trackingId = row.metadata?.trackingId;
            const realSubject = subjectByTrackingId[trackingId] || null;

            if (!zohoMessageId) {
                results.skipped++;
                results.details.push({ id: row.id, status: 'skipped', reason: 'no zohoMessageId' });
                continue;
            }

            try {
                // Fetch from Zoho sent folder
                let content = null;

                // Try sent folder first, then fallback to no-folder endpoint
                const urlCandidates = sentFolderId
                    ? [
                        `${zohoService.baseUrl}/accounts/${accountId}/folders/${sentFolderId}/messages/${zohoMessageId}/content`,
                        `${zohoService.baseUrl}/accounts/${accountId}/messages/${zohoMessageId}/content`,
                    ]
                    : [
                        `${zohoService.baseUrl}/accounts/${accountId}/messages/${zohoMessageId}/content`,
                    ];

                for (const url of urlCandidates) {
                    const resp = await fetch(url, {
                        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                    });
                    if (resp.ok) {
                        const json = await resp.json();
                        content = json.data;
                        break;
                    }
                }

                if (!content) {
                    results.failed++;
                    results.details.push({ id: row.id, status: 'failed', reason: 'Zoho fetch returned no content' });
                    continue;
                }

                // Extract HTML and text from Zoho content object
                const htmlBody = content.htmlBody || content.content || content.body || '';
                const textBody = content.textBody || content.summary || htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                const resolvedSubject = realSubject || content.subject || row.subject;

                if (!htmlBody && !textBody) {
                    results.skipped++;
                    results.details.push({ id: row.id, status: 'skipped', reason: 'Zoho returned empty body' });
                    continue;
                }

                // Patch the CRM record
                const { error: updateError } = await supabase
                    .from('emails')
                    .update({
                        html: htmlBody,
                        text: textBody,
                        subject: resolvedSubject,
                    })
                    .eq('id', row.id);

                if (updateError) {
                    results.failed++;
                    results.details.push({ id: row.id, status: 'failed', reason: updateError.message });
                } else {
                    results.patched++;
                    results.details.push({
                        id: row.id,
                        status: 'patched',
                        subject: resolvedSubject,
                        htmlLength: htmlBody.length
                    });
                    console.log(`[Backfill] Patched ${row.id} — subject: "${resolvedSubject}", html: ${htmlBody.length} chars`);
                }

                // Small delay to avoid Zoho rate limiting
                await new Promise(r => setTimeout(r, 250));

            } catch (err) {
                results.failed++;
                results.details.push({ id: row.id, status: 'error', reason: err.message });
                console.error(`[Backfill] Error for ${row.id}:`, err.message);
            }
        }

        return res.status(200).json({
            message: `Backfill complete`,
            total: rows.length,
            patched: results.patched,
            skipped: results.skipped,
            failed: results.failed,
            details: results.details,
        });

    } catch (error) {
        console.error('[Backfill] Fatal error:', error);
        return res.status(500).json({ error: error.message });
    }
}
