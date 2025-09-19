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
  if (req.method !== 'GET') { return res.status(405).json({ error: 'Method not allowed' }); }
  
  try {
    const { domain, company, companyId } = req.query || {};
    
    if (!domain && !company && !companyId) {
      return res.status(400).json({ error: 'Missing required parameter: domain, company, or companyId' });
    }

    // Build query parameters
    const params = new URLSearchParams();
    if (domain) params.append('domain', normalizeDomain(domain));
    if (company) params.append('company', company);
    if (companyId) params.append('companyId', companyId);

    const url = `${LUSHA_BASE_URL}/v2/company?${params.toString()}`;
    
    const resp = await fetchWithRetry(url, {
      method: 'GET',
      headers: { 'api_key': LUSHA_API_KEY }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Lusha company error', details: text });
    }

    const data = await resp.json();
    
    // Map the response to a consistent format
    const companyData = {
      id: data?.data?.id || null,
      name: data?.data?.name || '',
      domain: data?.data?.domain || '',
      website: data?.data?.website || '',
      description: data?.data?.description || '',
      employees: data?.data?.employees || '',
      industry: data?.data?.mainIndustry || '',
      location: data?.data?.location?.fullLocation || '',
      logoUrl: data?.data?.logoUrl || null
    };

    return res.status(200).json(companyData);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};