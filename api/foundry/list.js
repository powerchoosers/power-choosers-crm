import { cors } from '../_cors.js';
import logger from '../_logger.js';
import { supabaseAdmin } from '../_supabase.js';
import { admin } from '../_firebase.js';

async function requireFirebaseUser(req) {
    const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length).trim();
        if (token) {
            const decoded = await admin.auth().verifyIdToken(token);
            const email = decoded?.email ? String(decoded.email).toLowerCase() : null;
            return { email };
        }
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const cookie = typeof req.headers?.cookie === 'string' ? req.headers.cookie : '';
    if (isDev && cookie.includes('np_session=1')) {
        return { email: 'dev@nodalpoint.io' };
    }

    return { email: null };
}

export default async function handler(req, res) {
    if (cors(req, res)) return;

    if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }

    if (!supabaseAdmin) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database not available' }));
        return;
    }

    try {
        const { email } = await requireFirebaseUser(req);
        if (!email) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        // Fetch all foundry assets
        const { data, error } = await supabaseAdmin
            .from('transmission_assets')
            .select('id, name, type, updated_at')
            .order('updated_at', { ascending: false });

        if (error) {
            logger.error('[Foundry List] Supabase error', 'Server', { message: error.message });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database error', details: error.message }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ assets: data || [] }));
    } catch (error) {
        logger.error('[Foundry List] Error', 'Server', { message: error?.message });
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error', details: error?.message }));
        }
    }
}
