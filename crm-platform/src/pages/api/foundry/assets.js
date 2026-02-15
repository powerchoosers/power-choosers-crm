import { cors } from '../_cors.js';
import logger from '../_logger.js';
import { supabaseAdmin, requireUser } from '../_supabase.js';
import formidable from 'formidable';

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
    const { email } = await requireUser(req);
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

