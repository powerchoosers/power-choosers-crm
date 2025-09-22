const { cors, fetchWithRetry, getApiKey, LUSHA_BASE_URL } = require('./_utils');

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
  
  try {
    const { requestId, contactIds, company, name, title, revealEmails, revealPhones } = req.body || {};
    
    // Helper to extract contacts array from search response
    const extractContacts = (data) => {
      if (!data) return [];
      if (Array.isArray(data.contacts)) return data.contacts;
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.results)) return data.results;
      return [];
    };
    
    // If requestId is missing, perform a search to obtain one (direct enrich path)
    let effectiveRequestId = requestId;
    let searchContacts = [];
    if (!effectiveRequestId) {
      try {
        const LUSHA_API_KEY = getApiKey();
        const include = { };
        if (company?.domain) include.domains = [company.domain];
        else if (company?.id) include.ids = [company.id];
        else if (company?.name) include.names = [company.name];
        if (!Object.keys(include).length) {
          return res.status(400).json({ error: 'Missing requestId and insufficient company context for search' });
        }
        // Minimal, progressive pre-search to obtain requestId while limiting search requests
        const attemptSizes = [10, 40];
        for (const size of attemptSizes) {
          const searchBody = {
            pages: { page: 0, size },
            filters: { companies: { include } }
          };
          const searchResp = await fetchWithRetry(`${LUSHA_BASE_URL}/prospecting/contact/search`, {
            method: 'POST',
            headers: { 'api_key': LUSHA_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(searchBody)
          });
          if (!searchResp.ok) {
            const text = await searchResp.text();
            // If the first attempt fails hard, bubble up; otherwise try next size
            if (size === attemptSizes[0]) return res.status(searchResp.status).json({ error: 'Search before enrich failed', details: text });
            continue;
          }
          const searchData = await searchResp.json();
          effectiveRequestId = searchData.requestId;
          searchContacts = extractContacts(searchData);

          // Try to resolve the id from current batch
          const targetName = (name || '').toString().trim().toLowerCase();
          const targetTitle = (title || '').toString().trim().toLowerCase();
          const candidates = searchContacts.map(c => ({
            id: c.contactId || c.id,
            name: (c.fullName || c.name?.full || c.name || `${c.firstName || c.name?.first || ''} ${c.lastName || c.name?.last || ''}`).toString().trim().toLowerCase(),
            title: (c.jobTitle || c.title || '').toString().trim().toLowerCase()
          })).filter(x => x.id);
          let match = null;
          if (targetName) {
            match = candidates.find(x => x.name === targetName && (!targetTitle || x.title === targetTitle))
              || candidates.find(x => x.name === targetName)
              || null;
          }
          if (match || candidates.length > 0) {
            // Good enough — stop escalating size
            break;
          }
        }
      } catch (e) {
        return res.status(500).json({ error: 'Failed to initiate search before enrich', details: e.message });
      }
    }
    
    // Determine IDs to enrich
    let idsToEnrich = Array.isArray(contactIds) ? contactIds.filter(Boolean) : [];
    if (idsToEnrich.length === 0) {
      // Try to resolve from search contacts using name/title
      const targetName = (name || '').toString().trim().toLowerCase();
      const targetTitle = (title || '').toString().trim().toLowerCase();
      const candidates = searchContacts.map(c => ({
        id: c.contactId || c.id,
        name: (c.fullName || c.name?.full || c.name || `${c.firstName || c.name?.first || ''} ${c.lastName || c.name?.last || ''}`).toString().trim().toLowerCase(),
        title: (c.jobTitle || c.title || '').toString().trim().toLowerCase()
      })).filter(x => x.id);
      let match = null;
      if (targetName) {
        match = candidates.find(x => x.name === targetName && (!targetTitle || x.title === targetTitle))
          || candidates.find(x => x.name === targetName)
          || null;
      }
      if (!match && candidates.length > 0) match = candidates[0];
      if (match) idsToEnrich = [match.id];
    }
    
    if (!effectiveRequestId || idsToEnrich.length === 0) {
      return res.status(400).json({ error: 'Missing requestId or unable to resolve contactId for enrich' });
    }

    const requestBody = {
      requestId: effectiveRequestId,
      contactIds: idsToEnrich
    };
    if (typeof revealEmails === 'boolean') requestBody.revealEmails = !!revealEmails;
    if (typeof revealPhones === 'boolean') requestBody.revealPhones = !!revealPhones;

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
