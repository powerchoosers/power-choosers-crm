import { cors, fetchWithRetry, getApiKey, LUSHA_BASE_URL } from './_utils.js';

export default async function handler(req, res) {
  cors(req, res);
  if (req.method !== 'GET') { return res.writeHead(405, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Method not allowed' }));
return; }

  try {
    const LUSHA_API_KEY = getApiKey();
    const resp = await fetchWithRetry(`${LUSHA_BASE_URL}/account/usage`, {
      method: 'GET',
      headers: { 'api_key': LUSHA_API_KEY }
    });

    // Note: This endpoint is rate-limited to ~5 requests/min (per docs). Handle non-200s gracefully.
    if (!resp.ok) {
      const text = await resp.text();
      return res.writeHead(resp.status, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Lusha usage error', details: text }));
return;
    }

    const raw = await resp.json();

    // Flatten response: handle both { usage: { used,total,remaining } } and { used,total,remaining }
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    let usage = raw && typeof raw === 'object' ? (raw.usage || raw) : {};
    if (usage && typeof usage === 'object') {
      // Coerce fields to numbers when possible
      if (usage.used != null) usage.used = toNum(usage.used);
      if (usage.total != null) usage.total = toNum(usage.total);
      if (usage.remaining != null) usage.remaining = toNum(usage.remaining);
    }

    // Also surface common rate/usage headers when present
    const headers = {
      dailyLimit: resp.headers.get('x-rate-limit-daily') || null,
      dailyRemaining: resp.headers.get('x-daily-requests-left') || null,
      dailyUsage: resp.headers.get('x-daily-usage') || null,
      hourlyLimit: resp.headers.get('x-rate-limit-hourly') || null,
      hourlyRemaining: resp.headers.get('x-hourly-requests-left') || null,
      hourlyUsage: resp.headers.get('x-hourly-usage') || null,
      minuteLimit: resp.headers.get('x-rate-limit-minute') || null,
      minuteRemaining: resp.headers.get('x-minute-requests-left') || null,
      minuteUsage: resp.headers.get('x-minute-usage') || null
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ usage: usage || {}, headers }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Server error', details: e.message }));
  }
};



