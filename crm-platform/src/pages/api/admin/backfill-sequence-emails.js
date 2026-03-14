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
            .or('html.is.null,html.eq.,html.ilike.%energy-forensics snapshot idea%,html.ilike.%quick 2-3 point forensic snapshot%')
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

        // Initialize Zoho service
        const zohoService = new ZohoMailService();

        // 4. Process each record
        const results = { patched: 0, skipped: 0, failed: 0, details: [] };
        
        // Cache tokens and folders for ALL known connections of this user
        const senderCache = {};
        const { data: allConnRows } = await supabase.from('zoho_connections').select('email');
        if (allConnRows) {
            for (const c of allConnRows) {
                try {
                    const { accessToken, accountId } = await getValidAccessTokenForUser(c.email);
                    const folders = await zohoService.listFolders(c.email, accessToken, accountId);
                    const sentFolder = folders
                        .map(f => ({
                            ...f,
                            folderType: String(f.folderType || f.type || '').toLowerCase(),
                            folderName: String(f.folderName || f.name || '').toLowerCase(),
                        }))
                        .find(f => f.folderType === 'sent' || f.folderName === 'sent');
                    
                    senderCache[c.email.trim().toLowerCase()] = {
                        accessToken,
                        accountId,
                        sentFolderId: sentFolder?.folderId ? String(sentFolder.folderId) : null
                    };
                    console.log(`[Backfill] Pre-loaded sender: ${c.email}`);
                } catch (e) {
                    console.warn(`[Backfill] Skip pre-load for ${c.email}: ${e.message}`);
                }
            }
        }

        for (const row of rows) {
            const zohoMessageId = row.metadata?.zohoMessageId;
            const trackingId = row.metadata?.trackingId;
            const realSubject = subjectByTrackingId[trackingId] || null;
            const rowFromEmail = (row.from || row.metadata?.senderEmail || row.metadata?.from || 'l.patterson@nodalpoint.io').trim();

            if (!zohoMessageId) {
                results.skipped++;
                results.details.push({ id: row.id, status: 'skipped', reason: 'no zohoMessageId' });
                continue;
            }

            try {
                const connInfo = senderCache[rowFromEmail.toLowerCase()] || Object.values(senderCache)[0];
                if (!connInfo) {
                    results.skipped++;
                    results.details.push({ id: row.id, status: 'skipped', reason: 'no zoho connection found' });
                    continue;
                }

                const allConnectionsByPriority = [
                    senderCache[rowFromEmail.toLowerCase()],
                    ...Object.values(senderCache).filter(c => c !== senderCache[rowFromEmail.toLowerCase()])
                ].filter(Boolean);

                // 1. Try primary messageId lookup across all accounts
                for (const conn of allConnectionsByPriority) {
                    const { accessToken, accountId, sentFolderId } = conn;
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
                            if (json.data) {
                                content = json.data;
                                break;
                            }
                        }
                    }
                    if (content) break;
                }
                
                // 2. If messageId lookup failed, try search across all accounts
                if (!content) {
                    let toEmail = Array.isArray(row.to) ? row.to[0] : row.to;
                    if (toEmail && typeof toEmail === 'object') toEmail = toEmail.email;
                    
                    if (toEmail && typeof toEmail === 'string') {
                        toEmail = toEmail.trim();
                        console.log(`[Backfill] MessageId fetch failed. Searching for ${toEmail} across all Zoho accounts...`);
                        
                        for (const conn of allConnectionsByPriority) {
                            const { accessToken, accountId, sentFolderId } = conn;
                            const searchRes = await fetch(`${zohoService.baseUrl}/accounts/${accountId}/messages/search?searchReq={toAddress:${toEmail}}`, {
                                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                            });
                            
                            if (searchRes.ok) {
                                const searchData = await searchRes.json();
                                const msgs = searchData.data || [];
                                // Filter by sent folder if possible, otherwise take first
                                const match = sentFolderId ? msgs.find(m => m.folderId === sentFolderId) || msgs[0] : msgs[0];
                                
                                if (match) {
                                    console.log(`[Backfill] Found match in search for ${toEmail} (Account: ${accountId})`);
                                    const folderPathSegment = match.folderId ? `/folders/${match.folderId}` : '';
                                    const contentRes = await fetch(`${zohoService.baseUrl}/accounts/${accountId}${folderPathSegment}/messages/${match.messageId}/content`, {
                                        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                                    });
                                    if (contentRes.ok) {
                                        const cData = await contentRes.json();
                                        content = cData.data;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                let htmlBody = '';
                let textBody = '';
                const resolvedSubject = realSubject || row.subject;

                if (!content) {
                    // Zoho failed - reconstruct fallback body
                    htmlBody = 'Hi there,<br><br>If you share your latest electricity statement, I can reply with a quick 2-3 point forensic snapshot.<br><br>Interested?';
                    textBody = 'Hi there,\n\nIf you share your latest electricity statement, I can reply with a quick 2-3 point forensic snapshot.\n\nInterested?';
                    
                    // Attempt to fetch specific contact firstName and companyName to make it accurate
                    try {
                        let toEmail = Array.isArray(row.to) ? row.to[0] : row.to;
                        if (toEmail && typeof toEmail === 'object') toEmail = toEmail.email;
                        
                        if (toEmail && typeof toEmail === 'string') {
                            const { data: cData } = await supabase
                                .from('contacts')
                                .select('firstName, accountId')
                                .eq('email', toEmail)
                                .limit(1)
                                .maybeSingle();
                                
                            if (cData) {
                                let companyName = 'your team';
                                if (cData.accountId) {
                                    const { data: aData } = await supabase
                                        .from('accounts')
                                        .select('name')
                                        .eq('id', cData.accountId)
                                        .limit(1)
                                        .maybeSingle();
                                    if (aData && aData.name) companyName = aData.name;
                                }
                                
                                const firstName = (cData.firstName || '').trim();
                                const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
                                
                                htmlBody = `${greeting}<br><br>I wanted to share a quick energy-forensics snapshot idea for ${companyName}. If you send your most recent electricity bill, I can reply with 2-3 specific observations worth checking.<br><br>Interested?`;
                                textBody = `${greeting}\n\nI wanted to share a quick energy-forensics snapshot idea for ${companyName}. If you send your most recent electricity bill, I can reply with 2-3 specific observations worth checking.\n\nInterested?`;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to reconstruct personalized fallback for', row.id, e);
                    }
                } else {
                    htmlBody = content.htmlBody || content.content || content.body || '';
                    textBody = content.textBody || content.summary || htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                }

                if (!htmlBody && !textBody) {
                    results.skipped++;
                    results.details.push({ id: row.id, status: 'skipped', reason: 'Zoho returned empty body and fallback failed' });
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
                        htmlLength: htmlBody.length,
                        source: content ? 'zoho' : 'reconstructed_fallback',
                        searched: !!content && !urlCandidates.find(u => u.includes(zohoMessageId)) // mark if we found via search
                    });
                    console.log(`[Backfill] Patched ${row.id} — subject: "${resolvedSubject}", html: ${htmlBody.length} chars (source: ${content ? 'zoho msg' : 'fallback'})`);
                }

                // Small delay to avoid Zoho rate limiting
                await new Promise(r => setTimeout(r, 100));

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
