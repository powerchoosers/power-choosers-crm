// Temporary Debug Health Endpoint
// Path: /api/debug/health

import { cors } from '../_cors.js';
import { supabaseAdmin } from '../_supabase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return; // handle OPTIONS
  if (req.method !== 'GET') {
    res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const env = process.env || {};
    const has = (k) => Boolean(env[k]);

    const envFlags = {
      FIREBASE_PROJECT_ID: has('FIREBASE_PROJECT_ID'),
      SUPABASE_URL: has('SUPABASE_URL') || has('NEXT_PUBLIC_SUPABASE_URL'),
      NEXT_PUBLIC_SUPABASE_URL: has('NEXT_PUBLIC_SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY'),
      GEMINI_API_KEY: has('GEMINI_API_KEY'),
      FREE_GEMINI_KEY: has('FREE_GEMINI_KEY'),
      TWILIO_ACCOUNT_SID: has('TWILIO_ACCOUNT_SID'),
      TWILIO_AUTH_TOKEN: has('TWILIO_AUTH_TOKEN'),
      TWILIO_PHONE_NUMBER: has('TWILIO_PHONE_NUMBER'),
      GOOGLE_SERVICE_ACCOUNT_KEY: has('GOOGLE_SERVICE_ACCOUNT_KEY'),
      GOOGLE_MAPS_API: has('GOOGLE_MAPS_API'),
      SENDGRID_API_KEY: has('SENDGRID_API_KEY'),
      GMAIL_SENDER_EMAIL: has('GMAIL_SENDER_EMAIL'),
      VERCEL_URL: has('VERCEL_URL'),
      SUPABASE_URL: has('SUPABASE_URL') || has('NEXT_PUBLIC_SUPABASE_URL'),
      NEXT_PUBLIC_SUPABASE_URL: has('NEXT_PUBLIC_SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY')
    };

    let database = { enabled: false, lastCalls: [], error: null };
    try {
      if (supabaseAdmin) {
        database.enabled = true;
        const { data: snapshot, error: dbError } = await supabaseAdmin
          .from('calls')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(5);

        if (dbError) throw dbError;

        database.lastCalls = (snapshot || []).map((d) => {
          return {
            id: d.id,
            status: d.status || null,
            duration: d.duration || 0,
            hasRecording: Boolean(d.recordingUrl),
            transcriptLen: (d.transcript || '').length,
            updated: d.timestamp || null
          };
        });
      }
    } catch (e) {
      database.error = e?.message || String(e);
    }

    const out = {
      ok: true,
      serverTime: new Date().toISOString(),
      vercelUrl: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null,
      envFlags,
      database,
      notes: [
        'GET /api/twilio/status will return 405 by design; Twilio POSTs to that endpoint.',
        'Recording webhook: /api/twilio/recording should be invoked by Twilio with RecordingSid/CallSid.',
        'If lastCalls is empty, either webhooks are not arriving or the database is not initialized.'
      ]
    };

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (error) {
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  }
}
