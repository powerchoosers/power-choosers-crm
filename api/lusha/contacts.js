const LUSHA_API_KEY = process.env.LUSHA_API_KEY || '1e97bb11-eac3-4b20-8491-02f9b7d783b7';

function cors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000', 
    'https://powerchoosers.com',
    'https://www.powerchoosers.com',
    'https://power-choosers-crm.vercel.app'
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
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
    const { companyId, companyName, domain, kind, page, size } = req.body || {};
    const pages = { page: Math.max(0, parseInt(page ?? 0, 10) || 0), size: Math.min(40, Math.max(1, parseInt(size ?? 10, 10) || 10)) };
    
    // Try the exact format from Lusha documentation
    const body = { pages };
    
    // Add filters in the exact format specified by Lusha
    if (companyId) {
      body.filters = { company: { id: companyId } };
    } else if (domain) {
      body.filters = { company: { domain: normalizeDomain(domain) } };
    } else if (companyName) {
      body.filters = { company: { name: companyName } };
    }

    const resp = await fetchWithRetry(`${LUSHA_BASE_URL}/prospecting/contact/search`, {
      method: 'POST',
      headers: { 'api_key': LUSHA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Lusha contacts error', details: text });
    }
    const data = await resp.json();

    // Map minimal fields the widget needs from prospecting search
    const contacts = Array.isArray(data?.contacts)
      ? data.contacts.map(c => ({
          id: c.contactId,
          firstName: c?.name?.first || '',
          lastName: c?.name?.last || '',
          jobTitle: c?.jobTitle || '',
          companyId: c?.companyId || null,
          companyName: c?.companyName || companyName || '',
          fqdn: c?.fqdn || '',
          hasEmails: !!c?.hasEmails,
          hasPhones: !!c?.hasPhones
        }))
      : [];

    return res.status(200).json({ contacts, page: data?.currentPage ?? pages.page, total: data?.totalResults ?? contacts.length });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
