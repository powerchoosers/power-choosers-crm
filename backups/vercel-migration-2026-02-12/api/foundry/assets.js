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

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
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

    // GET: fetch single asset by id (bypasses RLS via supabaseAdmin)
    if (req.method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
      const id = (url.searchParams.get('id') || '').trim();
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing id' }));
        return;
      }
      const { data, error } = await supabaseAdmin
        .from('transmission_assets')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        logger.error('[Foundry Assets] GET Supabase error', 'Server', { message: error.message });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', details: error.message }));
        return;
      }
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Asset not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ asset: data }));
      return;
    }

    const body = req.body || {};
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const compiled_html = typeof body.compiled_html === 'string' ? body.compiled_html : '';
    const variables = Array.isArray(body.variables) ? body.variables.filter((v) => typeof v === 'string') : [];

    if (!name || !type) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields' }));
      return;
    }

    const content_json_raw = isPlainObject(body.content_json) ? body.content_json : {};
    const content_json = {
      ...content_json_raw,
      meta: {
        ...(isPlainObject(content_json_raw.meta) ? content_json_raw.meta : {}),
        updatedByEmail: email,
        updatedAt: new Date().toISOString(),
      },
    };

    const payload = {
      name,
      type,
      content_json,
      compiled_html,
      variables,
      updated_at: new Date().toISOString(),
    };

    const query = id
      ? supabaseAdmin.from('transmission_assets').update(payload).eq('id', id).select('*').single()
      : supabaseAdmin.from('transmission_assets').insert([payload]).select('*').single();

    const { data, error } = await query;

    if (error) {
      logger.error('[Foundry Assets] Supabase error', 'Server', { message: error.message });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error', details: error.message }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ asset: data }));
  } catch (error) {
    logger.error('[Foundry Assets] Error', 'Server', { message: error?.message });
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', details: error?.message }));
    }
  }
}

