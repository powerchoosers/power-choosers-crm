import { cors, fetchWithRetry, normalizeDomain, getApiKey, LUSHA_BASE_URL } from './_utils.js';

export default async function handler(req, res) {
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
    
    // Debug logging to see the actual response structure
    console.log('[Lusha Company API] Raw response structure:', JSON.stringify(raw, null, 2));

    const derivedDomain = raw?.data?.domain || raw?.data?.fqdn || normalizeDomain(raw?.data?.website || '');
    const website = raw?.data?.website || (derivedDomain ? `https://${derivedDomain}` : '');
    
    // Extract LinkedIn URL - handle both object and string formats
    let linkedin = '';
    if (raw?.data?.social?.linkedin) {
      if (typeof raw.data.social.linkedin === 'string') {
        linkedin = raw.data.social.linkedin;
      } else if (typeof raw.data.social.linkedin === 'object' && raw.data.social.linkedin.url) {
        linkedin = raw.data.social.linkedin.url;
      }
    }
    
    // Fallback to other possible LinkedIn paths
    if (!linkedin) {
      linkedin = raw?.data?.linkedinUrl ||
                 raw?.data?.links?.linkedin ||
                 raw?.data?.socialNetworks?.linkedinUrl ||
                 '';
    }

    // Map the response to a consistent format
    const companyData = {
      id: raw?.data?.id || null,
      name: raw?.data?.name || '',
      domain: derivedDomain || '',
      website: website || '',
      description: raw?.data?.description || '',
      employees: raw?.data?.employees || '',
      industry: raw?.data?.mainIndustry || '',
      // Location fields - extract individual components
      city: raw?.data?.location?.city || '',
      state: raw?.data?.location?.state || '',
      country: raw?.data?.location?.country || '',
      address: raw?.data?.address || raw?.data?.location?.fullLocation || '',
      location: raw?.data?.location?.fullLocation || '',
      // Social and contact info
      linkedin: linkedin,
      logoUrl: raw?.data?.logoUrl || null,
      // Additional fields from Lusha
      foundedYear: raw?.data?.founded || '',
      revenue: raw?.data?.revenueRange ? raw.data.revenueRange.join(' - ') : '',
      companyType: raw?.data?.subIndustry || ''
    };
    
    // Debug logging to see the mapped response
    console.log('[Lusha Company API] Mapped company data:', JSON.stringify(companyData, null, 2));

    return res.status(200).json(companyData);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
