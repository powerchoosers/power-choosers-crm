import { supabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    try {
        const { signal, accountId, domainKey } = req.body;

        if (!signal || !accountId || !supabaseAdmin) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameters or supabaseAdmin' }));
            return;
        }

        const now = new Date().toISOString();

        // 1. Persist the signal to the Apollo News Vector
        if (domainKey) {
            const { error: upsertError } = await supabaseAdmin.from('apollo_news_articles').upsert({
                domain: domainKey,
                apollo_article_id: signal.id,
                title: signal.headline || '',
                url: signal.source_url || null,
                source_domain: signal.entity_domain || domainKey,
                snippet: signal.summary || null,
                published_at: signal.created_at || now,
                event_categories: signal.signal_type ? [signal.signal_type] : [],
                updated_at: now
            }, { onConflict: 'domain,apollo_article_id' });

            if (upsertError) {
                console.error('Error upserting apollo_news_articles:', upsertError);
            }
        }

        // 2. Update the intelligence signal with the crm_account_id
        if (signal.id) {
            const { error: updateError } = await supabaseAdmin.from('market_intelligence').update({
                crm_account_id: accountId,
                crm_match_type: 'exact_domain'
            }).eq('id', signal.id);

            if (updateError) {
                console.error('Error updating market_intelligence:', updateError);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    } catch (e) {
        console.error('[link-signal] Error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
    }
}
