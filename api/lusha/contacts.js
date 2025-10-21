import { cors, fetchWithRetry, normalizeDomain, getApiKey, LUSHA_BASE_URL } from './_utils.js';

export default async function handler(req, res) {
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
      console.error('Lusha contacts API error:', resp.status, text);
      
      // Handle specific error cases
      if (resp.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded', 
          message: 'Too many requests. Please try again later.',
          details: text 
        });
      } else if (resp.status === 401) {
        return res.status(401).json({ 
          error: 'Authentication failed', 
          message: 'Invalid API key. Please check your Lusha API configuration.',
          details: text 
        });
      } else if (resp.status === 403) {
        return res.status(403).json({ 
          error: 'Access forbidden', 
          message: 'Your account may not be active or may not have access to this feature.',
          details: text 
        });
      }
      
      return res.status(resp.status).json({ error: 'Lusha contacts error', details: text });
    }
    const data = await resp.json();
    console.log('Raw Lusha API response:', JSON.stringify(data, null, 2));
    
    // Debug: Log response structure to identify data mapping issues
    console.log('Lusha contacts response structure:', {
      hasContacts: Array.isArray(data?.contacts),
      contactsLength: data?.contacts?.length || 0,
      hasData: Array.isArray(data?.data),
      dataLength: data?.data?.length || 0,
      hasResults: Array.isArray(data?.results),
      resultsLength: data?.results?.length || 0,
      totalResults: data?.totalResults,
      currentPage: data?.currentPage,
      requestId: data?.requestId,
      responseKeys: Object.keys(data || {})
    });

    // Enhanced contact mapping with better fallbacks and debugging
    let contacts = [];
    
    if (Array.isArray(data?.contacts)) {
      console.log('Mapping from data.contacts array, length:', data.contacts.length);
      contacts = data.contacts.map((c, index) => {
        // Handle cases where Lusha returns name as a single string
        const nameAsString = (typeof c?.name === 'string') ? c.name : '';
        let parsedFirst = '';
        let parsedLast = '';
        if (nameAsString) {
          const parts = nameAsString.trim().split(/\s+/);
          parsedFirst = parts.shift() || '';
          parsedLast = parts.join(' ');
        }

        const firstName = c?.name?.first || c?.firstName || parsedFirst || '';
        const lastName = c?.name?.last || c?.lastName || parsedLast || '';
        const fullName = (typeof c?.name?.full === 'string' && c.name.full) ? c.name.full
          : (typeof c?.fullName === 'string' && c.fullName) ? c.fullName
          : nameAsString || `${firstName} ${lastName}`.trim();

        const jobTitle = c?.jobTitle || c?.title || c?.position || '';

        const mapped = {
          contactId: c.contactId || c.id,
          id: c.contactId || c.id,
          firstName,
          lastName,
          fullName,
          jobTitle,
          // duplicate for UI fallbacks
          title: jobTitle,
          companyId: c?.companyId || null,
          companyName: c?.companyName || c?.company || '',
          fqdn: c?.fqdn || c?.domain || '',
          hasEmails: !!c?.hasEmails,
          hasPhones: !!c?.hasPhones,
          // additional helpful flags and fields
          hasMobilePhone: !!c?.hasMobilePhone,
          hasDirectPhone: !!c?.hasDirectPhone,
          hasSocialLink: !!c?.hasSocialLink,
          location: c?.location || c?.city || '',
          linkedin: c?.linkedinUrl || c?.linkedin || c?.social?.linkedin || ''
        };

        // Debug log for first few contacts
        if (index < 3) {
          console.log(`Contact ${index} mapping:`, {
            original: c,
            mapped: mapped
          });
        }

        return mapped;
      });
    } else if (Array.isArray(data?.data)) {
      console.log('Mapping from data.data array, length:', data.data.length);
      contacts = data.data.map((x, index) => {
        const full = (typeof x.name === 'string') ? x.name : (x?.name?.full || '');
        const [first, ...rest] = String(full || '').trim().split(/\s+/);
        const last = rest.join(' ');
        
        const mapped = {
          contactId: x.contactId || x.id,
          id: x.contactId || x.id,
          firstName: x.firstName || first || '',
          lastName: x.lastName || last || '',
          fullName: full || '',
          jobTitle: x.jobTitle || x.title || '',
          companyId: x.companyId || null,
          companyName: x.companyName || x.company || '',
          fqdn: x.fqdn || x.domain || '',
          hasEmails: !!x.hasEmails,
          hasPhones: !!x.hasPhones,
          hasMobilePhone: !!x.hasMobilePhone,
          hasDirectPhone: !!x.hasDirectPhone,
          hasSocialLink: !!x.hasSocialLink,
          location: x.location || x.city || '',
          linkedin: x.linkedinUrl || x.linkedin || x.social?.linkedin || ''
        };
        
        // Debug log for first few contacts
        if (index < 3) {
          console.log(`Data contact ${index} mapping:`, {
            original: x,
            mapped: mapped
          });
        }
        
        return mapped;
      });
    } else {
      console.log('No contacts found in expected response structure');
    }
    
    console.log('Final mapped contacts count:', contacts.length);

    // Fallbacks: if contacts array is empty, map from alternative shapes (e.g., data.data[])
    let contactIds = [];
    if (contacts.length > 0) {
      contactIds = contacts.map(c => c.contactId).filter(Boolean);
    } else {
      // If data.data is an array with contact objects
      if (Array.isArray(data?.data)) {
        contacts = data.data.map(x => {
          const full = (typeof x.name === 'string') ? x.name : (x?.name?.full || '');
          const [first, ...rest] = String(full || '').trim().split(/\s+/);
          const last = rest.join(' ');
        return {
            contactId: x.contactId || x.id,
            id: x.contactId || x.id,
            firstName: x.firstName || first || '',
            lastName: x.lastName || last || '',
            fullName: full || '',
            jobTitle: x.jobTitle || '',
            companyId: x.companyId || null,
            companyName: x.companyName || '',
            fqdn: x.fqdn || '',
          hasEmails: !!x.hasEmails,
          hasPhones: !!x.hasPhones,
          hasMobilePhone: !!x.hasMobilePhone,
          hasDirectPhone: !!x.hasDirectPhone,
          hasSocialLink: !!x.hasSocialLink,
          location: x.location || x.city || '',
          linkedin: x.linkedinUrl || x.linkedin || x.social?.linkedin || ''
          };
        });
        contactIds = contacts.map(c => c.contactId).filter(Boolean);
      }

      // If data.contacts is an object keyed by id
      if (contacts.length === 0 && data && typeof data.contacts === 'object' && !Array.isArray(data.contacts)) {
        contactIds = Object.keys(data.contacts);
        contacts = contactIds.map(id => ({ contactId: id, id }));
      }

      // If other arrays contain only IDs
      if (contacts.length === 0) {
        const buckets = [data?.results, data?.items, data?.contactsList];
        for (const b of buckets) {
          if (Array.isArray(b)) {
            const ids = b.map(x => x.contactId || x.id).filter(Boolean);
            if (ids.length > 0) { contactIds = ids; break; }
          }
        }
        if (contactIds.length > 0) contacts = contactIds.map(id => ({ contactId: id, id }));
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
