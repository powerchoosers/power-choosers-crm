import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.method === 'GET' ? req.query.token : req.body.token;
    const action = req.method === 'GET' ? req.query.action : req.body.action;

    if (!token || !action) {
        if (req.method === 'GET') return res.status(400).send('Missing token or action');
        return res.status(400).json({ error: 'Missing required parameters: token, action' });
    }

    try {
        // 1. Get the signature request by token
        const { data: request, error: fetchError } = await supabaseAdmin
            .from('signature_requests')
            .select('id, status')
            .eq('access_token', token)
            .single();

        if (fetchError || !request) {
            return res.status(404).json({ error: 'Invalid or expired secure token' });
        }

        // 2. Rate limit — max 10 telemetry events per token per 60 seconds
        // This prevents audit trail flooding by anyone holding a signing link
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const { count: recentCount, error: countError } = await supabaseAdmin
            .from('signature_telemetry')
            .select('*', { count: 'exact', head: true })
            .eq('request_id', request.id)
            .gte('created_at', oneMinuteAgo);

        if (!countError && recentCount !== null && recentCount >= 10) {
            if (req.method === 'GET') return res.status(429).send('Too many requests');
            return res.status(429).json({ error: 'Rate limit exceeded. Too many telemetry events for this token.' });
        }

        // 3. Extract telemetry data from headers
        const forwardedFor = req.headers['x-forwarded-for'];
        const ipAddress = Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || req.socket.remoteAddress || 'Unknown IP');
        const userAgent = req.headers['user-agent'] || 'Unknown Device';

        // 4. Log the telemetry event
        const { error: insertError } = await supabaseAdmin
            .from('signature_telemetry')
            .insert({
                request_id: request.id,
                action: action, // e.g., 'viewed'
                ip_address: ipAddress,
                user_agent: userAgent
            });

        if (insertError) {
            console.error('[Signature Telemetry API] Error logging telemetry:', insertError);
            // We don't want to fail the generic request just because telemetry failed, but log it internally
        }

        // 5. Update the request status
        // Transition: pending -> opened -> viewed
        if (request.status === 'pending' && action === 'opened') {
            await supabaseAdmin
                .from('signature_requests')
                .update({ status: 'opened', updated_at: new Date().toISOString() })
                .eq('id', request.id);
        } else if ((request.status === 'pending' || request.status === 'opened') && action === 'viewed') {
            await supabaseAdmin
                .from('signature_requests')
                .update({ status: 'viewed', updated_at: new Date().toISOString() })
                .eq('id', request.id);
        }

        if (req.method === 'GET') {
            // If a redirect path is supplied (must be relative, starting with '/') use it
            // as a reliable click-through tracker instead of returning a pixel GIF.
            const redirectPath = typeof req.query.redirect === 'string' ? req.query.redirect : null;
            if (redirectPath && redirectPath.startsWith('/')) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                return res.redirect(302, redirectPath);
            }

            const transparentGif = Buffer.from(
                'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                'base64'
            );
            res.setHeader('Content-Type', 'image/gif');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            return res.status(200).send(transparentGif);
        }

        return res.status(200).json({ success: true, logged: true });
    } catch (error: any) {
        console.error('[Signature Telemetry API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
