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
        const allSentMessages = []; // List of all sent messages from all accounts

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
                    
                    const sentFolderId = sentFolder?.folderId ? String(sentFolder.folderId) : null;
                    
                    senderCache[c.email.trim().toLowerCase()] = { accessToken, accountId, sentFolderId };
                    
                    if (sentFolderId) {
                        console.log(`[Backfill] Fetching sent messages for ${c.email} (Folder: ${sentFolderId})`);
                        // Fetch 2 pages of sent messages (400 messages total)
                        for (let start = 1; start <= 201; start += 200) {
                            const params = new URLSearchParams({ start: String(start), limit: '200', folderId: sentFolderId });
                            const res = await fetch(`${zohoService.baseUrl}/accounts/${accountId}/messages/view?${params.toString()}`, {
                                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                            });
                            if (res.ok) {
                                const data = await res.json();
                                const msgs = data.data || [];
                                if (msgs.length === 0) break;
                                allSentMessages.push(...msgs.map(m => ({ ...m, senderAccount: c.email, accountId, accessToken })));
                            } else {
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[Backfill] Skip pre-load for ${c.email}: ${e.message}`);
                }
            }
        }

        console.log(`[Backfill] Total sent messages loaded from Zoho: ${allSentMessages.length}`);

        for (const row of rows) {
            const zohoMessageId = row.metadata?.zohoMessageId;
            const trackingId = row.metadata?.trackingId;
            const realSubject = subjectByTrackingId[trackingId] || null;
            const rowFromEmail = (row.from || row.metadata?.senderEmail || row.metadata?.from || 'l.patterson@nodalpoint.io').trim();

            try {
                let content = null;
                let usedMatch = null;

                // 1. Try to find the specific messageId in our loaded list
                let match = allSentMessages.find(m => m.messageId === zohoMessageId);
                
                // 2. If not found by ID, try to find by recipient address
                if (!match) {
                    let toEmail = Array.isArray(row.to) ? row.to[0] : row.to;
                    if (toEmail && typeof toEmail === 'object') toEmail = toEmail.email;
                    if (toEmail) {
                        const target = toEmail.toLowerCase().trim();
                        match = allSentMessages.find(m => m.toAddress && m.toAddress.toLowerCase().includes(target));
                    }
                }

                if (match) {
                    const { accountId, accessToken, messageId, folderId } = match;
                    const folderPathSegment = folderId ? `/folders/${folderId}` : '';
                    const contentRes = await fetch(`${zohoService.baseUrl}/accounts/${accountId}${folderPathSegment}/messages/${messageId}/content`, {
                        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                    });
                    if (contentRes.ok) {
                        const cData = await contentRes.json();
                        content = cData.data;
                        usedMatch = match;
                    }
                }

                let htmlBody = '';
                let textBody = '';
                const resolvedSubject = realSubject || (usedMatch ? usedMatch.subject : row.subject);

                if (!content) {
                    // Zoho failed - reconstruct fallback body (keep existing if already personalized)
                    const isGeneric = !row.html || row.html.includes('Hi there,') || row.html.length < 100;
                    if (!isGeneric) {
                        results.skipped++;
                        results.details.push({ id: row.id, status: 'skipped', reason: 'Zoho fetch failed but existing body looks personalized' });
                        continue;
                    }

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
                        sender: usedMatch ? usedMatch.senderAccount : 'unknown'
                    });
                    console.log(`[Backfill] Patched ${row.id} — subject: "${resolvedSubject}", html: ${htmlBody.length} chars (source: ${content ? 'zoho msg' : 'fallback'})`);
                }

                // Small delay
                await new Promise(r => setTimeout(r, 50));

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
