const fetch = require('node-fetch');

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

function getApiKey() {
  const key = process.env.CORESIGNAL_API_KEY || process.env.CDAPI_API_KEY || '';
  if (!key) throw new Error('Missing CORESIGNAL_API_KEY');
  return key;
}

async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, options);
      if (resp.status === 429 && i < retries) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return resp;
    } catch (e) {
      lastErr = e;
      if (i < retries) { await new Promise(r => setTimeout(r, 300 * (i + 1))); continue; }
    }
  }
  throw lastErr || new Error('Unknown fetch error');
}

// Normalizes domains like https://www.example.com → example.com
function normalizeDomain(value = '') {
  try {
    const str = String(value || '').trim();
    if (!str) return '';
    const withoutProto = str.replace(/^https?:\/\//i, '');
    const withoutPath = withoutProto.split('/')[0];
    return withoutPath.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return '';
  }
}

const CDAPI_BASE = 'https://api.coresignal.com/cdapi';

module.exports = { cors, getApiKey, fetchWithRetry, normalizeDomain, CDAPI_BASE };


