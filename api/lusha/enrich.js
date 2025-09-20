const { cors, fetchWithRetry, getApiKey, LUSHA_BASE_URL } = require('./_utils');

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
  
  try {
    const { requestId, contactIds } = req.body || {};
    
    if (!requestId || !contactIds || !Array.isArray(contactIds)) {
      return res.status(400).json({ error: 'Missing required fields: requestId and contactIds array' });
    }

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
