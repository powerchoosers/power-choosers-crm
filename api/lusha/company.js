const cors = require('../_cors');

const LUSHA_API_KEY = '1e97bb11-eac3-4b20-8491-02f9b7d783b7';
const LUSHA_BASE_URL = 'https://api.lusha.com';

async function fetchWithRetry(url, options, retries = 5) {
  let attempt = 0;
  while (true) {
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
  } catch (_) { return String(raw); }
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const { domain, companyName, companyId } = req.body || {};
    if (!domain && !companyName && !companyId) return res.status(400).json({ error: 'domain, companyName, or companyId required' });

    const qs = new URLSearchParams();
    if (domain) qs.append('domain', normalizeDomain(domain));
    if (companyName) qs.append('company', companyName);
    if (companyId) qs.append('companyId', companyId);

    const resp = await fetchWithRetry(`${LUSHA_BASE_URL}/v2/company?${qs.toString()}`, {
      method: 'GET',
      headers: { 'api_key': LUSHA_API_KEY }
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Lusha company error', details: text });
    }
    const data = await resp.json();
    const rawDomain = data?.data?.domain || data?.data?.fqdn || domain || '';
    const out = {
      id: data?.data?.companyId || data?.data?.id || null,
      name: data?.data?.name || companyName || '',
      domain: normalizeDomain(rawDomain),
      fqdn: data?.data?.fqdn || rawDomain || '',
      raw: data
    };
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
