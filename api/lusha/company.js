const { cors, fetchWithRetry, normalizeDomain, getApiKey, LUSHA_BASE_URL } = require('./_utils');

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
    const LUSHA_API_KEY = getApiKey();
    const resp = await fetchWithRetry(url, {
      method: 'GET',
      headers: { 'api_key': LUSHA_API_KEY }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Lusha company error', details: text });
    }

    const raw = await resp.json();

    const derivedDomain = raw?.data?.domain || raw?.data?.fqdn || normalizeDomain(raw?.data?.website || '');
    const website = raw?.data?.website || (derivedDomain ? `https://${derivedDomain}` : '');

    // Map the response to a consistent format
    const companyData = {
      id: raw?.data?.id || null,
      name: raw?.data?.name || '',
      domain: derivedDomain || '',
      website: website || '',
      description: raw?.data?.description || '',
      employees: raw?.data?.employees || '',
      industry: raw?.data?.mainIndustry || '',
      location: raw?.data?.location?.fullLocation || '',
      logoUrl: raw?.data?.logoUrl || null
    };

    return res.status(200).json(companyData);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
