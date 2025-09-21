const { cors, fetchWithRetry, getApiKey, LUSHA_BASE_URL } = require('./_utils');

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
  
  try {
    const { requestId, contactIds, company } = req.body || {};

    if (!contactIds || !Array.isArray(contactIds)) {
      return res.status(400).json({ error: 'Missing required fields: contactIds array' });
    }

    // If no requestId, try direct contact ID enrichment (experimental)
    if (!requestId) {
      console.log('No requestId provided, attempting direct contact enrichment');

      // For direct enrichment, we need to make a search first to get the requestId
      if (!company) {
        return res.status(400).json({ error: 'Company context required for direct enrichment without requestId' });
      }

      // First, do a search to get the contact data and requestId
      let searchBody = {
        pages: { page: 0, size: 40 },
        filters: { companies: { include: {} } }
      };

      // Add company identifier based on available data
      if (company.domain) {
        searchBody.filters.companies.include.domains = [company.domain];
      } else if (company.name) {
        searchBody.filters.companies.include.names = [company.name];
      } else {
        return res.status(400).json({ error: 'Company domain or name required for direct enrichment' });
      }

      try {
        const searchResp = await fetchWithRetry(`${LUSHA_BASE_URL}/prospecting/contact/search`, {
          method: 'POST',
          headers: { 'api_key': LUSHA_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(searchBody)
        });

        if (!searchResp.ok) {
          const text = await searchResp.text();
          return res.status(searchResp.status).json({
            error: 'Direct enrichment search failed',
            details: text
          });
        }

        const searchData = await searchResp.json();

        // Find the specific contact by ID
        const targetContact = Array.isArray(searchData.contacts)
          ? searchData.contacts.find(c => contactIds.includes(c.id || c.contactId))
          : null;

        if (!targetContact) {
          return res.status(404).json({
            error: 'Contact not found',
            message: 'Contact ID not found in search results'
          });
        }

        // Now use the search requestId to enrich this specific contact
        const enrichBody = {
          requestId: searchData.requestId,
          contactIds: [targetContact.id || targetContact.contactId]
        };

        const enrichResp = await fetchWithRetry(`${LUSHA_BASE_URL}/prospecting/contact/enrich`, {
          method: 'POST',
          headers: { 'api_key': LUSHA_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichBody)
        });

        if (!enrichResp.ok) {
          const text = await enrichResp.text();
          if (enrichResp.status === 403) {
            return res.status(403).json({
              error: 'Access forbidden',
              message: 'Your current Lusha plan may not allow individual data point reveals (emails/phones).',
              details: text
            });
          }
          return res.status(enrichResp.status).json({ error: 'Lusha enrich error', details: text });
        }

        const enrichData = await enrichResp.json();

        // Map and return the enriched data
        const enrichedContacts = Array.isArray(enrichData.contacts)
          ? enrichData.contacts.map(contact => {
              const emailsRaw = contact.data?.emailAddresses || [];
              const phonesRaw = contact.data?.phoneNumbers || [];
              const emails = Array.isArray(emailsRaw)
                ? emailsRaw.map(e => ({ address: e.address || e.email || e.value || '', type: e.type || e.kind || '' })).filter(x => x.address)
                : [];
              const phones = Array.isArray(phonesRaw)
                ? phonesRaw.map(p => ({ number: p.number || p.phone || p.value || '', type: p.type || p.kind || '' })).filter(x => x.number)
                : [];
              const city = contact.data?.location?.city || contact.data?.location?.cityName || '';
              const state = contact.data?.location?.state || contact.data?.location?.stateCode || contact.data?.location?.region || '';
              const location = (city || state) ? `${city}${city && state ? ', ' : ''}${state}` : (contact.data?.location?.fullLocation || '');
              const linkedin = contact.data?.linkedinUrl || contact.data?.linkedin || contact.data?.social?.linkedin || contact.data?.links?.linkedin || '';
              return ({
                id: contact.id,
                firstName: contact.data?.name?.first || '',
                lastName: contact.data?.name?.last || '',
                jobTitle: contact.data?.jobTitle || '',
                companyId: contact.data?.companyId || null,
                companyName: contact.data?.companyName || '',
                fqdn: contact.data?.fqdn || '',
                emails,
                phones,
                location,
                linkedin,
                isSuccess: contact.isSuccess || false
              });
            })
          : [];

        return res.status(200).json({
          contacts: enrichedContacts,
          requestId: enrichData.requestId
        });

      } catch (searchError) {
        return res.status(500).json({
          error: 'Direct enrichment failed',
          details: searchError.message
        });
      }
    }

    // Original requestId-based enrichment
    const requestBody = {
      requestId: requestId,
      contactIds: contactIds
    };

    console.log('Lusha enrich request body:', JSON.stringify(requestBody, null, 2));

    const LUSHA_API_KEY = getApiKey();
    const resp = await fetchWithRetry(`${LUSHA_BASE_URL}/prospecting/contact/enrich`, {
      method: 'POST',
      headers: { 'api_key': LUSHA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 403) {
        return res.status(403).json({
          error: 'Access forbidden',
          message: 'Your current Lusha plan may not allow individual data point reveals (emails/phones).',
          details: text
        });
      }
      return res.status(resp.status).json({ error: 'Lusha enrich error', details: text });
    }

    const data = await resp.json();
    console.log('Lusha enrich response:', JSON.stringify(data, null, 2));
    
    // Map the enriched contact data
    const enrichedContacts = Array.isArray(data.contacts)
      ? data.contacts.map(contact => {
          const emailsRaw = contact.data?.emailAddresses || [];
          const phonesRaw = contact.data?.phoneNumbers || [];
          const emails = Array.isArray(emailsRaw)
            ? emailsRaw.map(e => ({ address: e.address || e.email || e.value || '', type: e.type || e.kind || '' })).filter(x => x.address)
            : [];
          const phones = Array.isArray(phonesRaw)
            ? phonesRaw.map(p => ({ number: p.number || p.phone || p.value || '', type: p.type || p.kind || '' })).filter(x => x.number)
            : [];
          const city = contact.data?.location?.city || contact.data?.location?.cityName || '';
          const state = contact.data?.location?.state || contact.data?.location?.stateCode || contact.data?.location?.region || '';
          const location = (city || state) ? `${city}${city && state ? ', ' : ''}${state}` : (contact.data?.location?.fullLocation || '');
          const linkedin = contact.data?.linkedinUrl || contact.data?.linkedin || contact.data?.social?.linkedin || contact.data?.links?.linkedin || '';
          return ({
            id: contact.id,
            firstName: contact.data?.name?.first || '',
            lastName: contact.data?.name?.last || '',
            jobTitle: contact.data?.jobTitle || '',
            companyId: contact.data?.companyId || null,
            companyName: contact.data?.companyName || '',
            fqdn: contact.data?.fqdn || '',
            emails,
            phones,
            location,
            linkedin,
            isSuccess: contact.isSuccess || false
          });
        })
      : [];

    return res.status(200).json({ 
      contacts: enrichedContacts,
      requestId: data.requestId 
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
