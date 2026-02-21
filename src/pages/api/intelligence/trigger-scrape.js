import { supabaseAdmin } from '@/lib/supabase';
import { cors } from '../_cors.js';

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        if (!supabaseAdmin) {
            res.status(500).json({ error: 'Supabase admin not configured' });
            return;
        }

        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const functionUrl = `${supabaseUrl}/functions/v1/scrape-intelligence`;

        const scrapeRes = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                // If the edge function verify_jwt is false, we technically don't need this, 
                // but we pass the service role just in case.
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!scrapeRes.ok) {
            const errText = await scrapeRes.text();
            throw new Error(`Edge function failed with status ${scrapeRes.status}: ${errText}`);
        }

        const data = await scrapeRes.json();

        res.status(200).json({ success: true, count: data.count || 0 });

    } catch (err) {
        console.error('[trigger-scrape] Error:', err);
        res.status(500).json({ error: err.message });
    }
}
