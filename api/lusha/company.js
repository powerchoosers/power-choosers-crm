const cors = require('../_cors');

const LUSHA_API_KEY = '1e97bb11-eac3-4b20-8491-02f9b7d783b7';
const LUSHA_BASE_URL = 'https://api.lusha.com';

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const { domain, companyName } = req.body || {};
    if (!domain && !companyName) return res.status(400).json({ error: 'domain or companyName required' });

    const qs = new URLSearchParams();
    if (domain) qs.append('domain', String(domain).replace(/^https?:\/\//i, '').replace(/^www\./i, ''));
    if (companyName) qs.append('name', companyName);

    const resp = await fetch(`${LUSHA_BASE_URL}/v2/company?${qs.toString()}`, {
      method: 'GET',
      headers: { 'api_key': LUSHA_API_KEY }
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Lusha company error', details: text });
    }
    const data = await resp.json();
    const out = {
      id: data?.data?.companyId || data?.data?.id || null,
      name: data?.data?.name || companyName || '',
      domain: data?.data?.domain || (domain || ''),
      raw: data
    };
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
