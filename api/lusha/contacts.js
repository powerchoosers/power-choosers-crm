const { cors, fetchWithRetry, normalizeDomain, getApiKey, LUSHA_BASE_URL } = require('./_utils');

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const requestBody = req.body || {};
    let body;
    
    // Check if request already has the correct Lusha API structure
    if (requestBody.pages && requestBody.filters && requestBody.filters.companies) {
      // Request is already in correct format, use it directly
      body = requestBody;
      
      // Validate that we have at least one company identifier
      const hasCompanyId = body.filters.companies.include?.ids?.length > 0;
      const hasDomain = body.filters.companies.include?.domains?.length > 0;
      const hasCompanyName = body.filters.companies.include?.names?.length > 0;
      
      if (!hasCompanyId && !hasDomain && !hasCompanyName) {
        return res.status(400).json({ error: 'Missing company identifier in filters.companies.include' });
      }
      
      // Normalize domains if present
      if (hasDomain) {
        body.filters.companies.include.domains = body.filters.companies.include.domains.map(normalizeDomain);
      }
    } else {
      // Legacy format - convert to correct structure
      const { companyId, companyName, domain, kind, page, size } = requestBody;
      const pages = { page: Math.max(0, parseInt(page ?? 0, 10) || 0), size: Math.min(40, Math.max(10, parseInt(size ?? 10, 10) || 10)) };
      
      body = {
        pages,
        filters: {
          companies: {
            include: {}
          }
        }
      };
      
      // Add company filter using correct structure
      if (companyId) {
        body.filters.companies.include.ids = [companyId];
      } else if (domain) {
        body.filters.companies.include.domains = [normalizeDomain(domain)];
      } else if (companyName) {
        body.filters.companies.include.names = [companyName];
      } else {
        return res.status(400).json({ error: 'Missing company identifier (domain, companyId, or companyName)' });
      }
    }

    // Debug: log the request body
    console.log('Lusha contacts request body:', JSON.stringify(body, null, 2));

    const LUSHA_API_KEY = getApiKey();
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
    console.log('Raw Lusha API response:', JSON.stringify(data, null, 2));

    // Map minimal fields the widget needs from prospecting search
    let contacts = Array.isArray(data?.contacts)
      ? data.contacts.map(c => ({
          contactId: c.contactId, // Keep original contactId for enrich step
          id: c.contactId,
          firstName: c?.name?.first || '',
          lastName: c?.name?.last || '',
          jobTitle: c?.jobTitle || '',
          companyId: c?.companyId || null,
          companyName: c?.companyName || '',
          fqdn: c?.fqdn || '',
          hasEmails: !!c?.hasEmails,
          hasPhones: !!c?.hasPhones
        }))
      : [];

    // Fallbacks: if contacts array is empty, try to infer contactIds from alternative shapes
    let contactIds = [];
    if (contacts.length > 0) {
      contactIds = contacts.map(c => c.contactId).filter(Boolean);
    } else {
      // If data.contacts is an object keyed by id
      if (data && typeof data.contacts === 'object' && !Array.isArray(data.contacts)) {
        contactIds = Object.keys(data.contacts);
        contacts = contactIds.map(id => ({ contactId: id, id }));
      }
      // If data.results or data.items contain contactId
      const buckets = [data?.results, data?.items, data?.data, data?.contactsList];
      for (const b of buckets) {
        if (Array.isArray(b)) {
          const ids = b.map(x => x.contactId || x.id).filter(Boolean);
          if (ids.length > 0) { contactIds = ids; break; }
        }
      }
      if (contacts.length === 0 && contactIds.length > 0) {
        contacts = contactIds.map(id => ({ contactId: id, id }));
      }
    }

    const payload = {
      contacts,
      contactIds, // surfaced to allow frontend to enrich even when only IDs are available
      page: data?.currentPage ?? body.pages?.page ?? 0,
      total: data?.totalResults ?? data?.total ?? contacts.length,
      requestId: data?.requestId
    };

    // Debug passthrough when ?debug=1
    if ((req.query && (req.query.debug === '1' || req.query.debug === 1))) {
      payload.raw = data;
    }

    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
