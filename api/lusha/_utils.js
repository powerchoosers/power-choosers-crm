const LUSHA_BASE_URL = 'https://api.lusha.com';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://powerchoosers.com',
  'https://www.powerchoosers.com',
  'https://power-choosers-crm-792458658491.us-south1.run.app'
];

function cors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

async function fetchWithRetry(url, options, retries = 5) {
  let attempt = 0;
  while (true) { // eslint-disable-line no-constant-condition
    const resp = await fetch(url, options);
    if (resp.status !== 429 && resp.status < 500) return resp;
    attempt += 1;
    if (attempt > retries) return resp;
    const jitter = Math.random() * 200;
    const delay = Math.min(30000, Math.pow(2, attempt) * 1000) + jitter;
    await new Promise(r => setTimeout(r, delay));
  }
}

function normalizeDomain(raw) {
  if (!raw) return '';
  try {
    let s = String(raw).trim();
    s = s.replace(/^https?:\/\//i, '');
    s = s.replace(/^www\./i, '');
    return s.split('/')[0];
  } catch (_) {
    return String(raw);
  }
}

function getApiKey() {
  const key = process.env.LUSHA_API_KEY;
  if (!key) {
    throw new Error('Missing LUSHA_API_KEY environment variable');
  }
  return key;
}

export {
  cors,
  fetchWithRetry,
  normalizeDomain,
  getApiKey,
  LUSHA_BASE_URL,
};