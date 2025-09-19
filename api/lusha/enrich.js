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
    
    const resp = await fetchWithRetry(`${LUSHA_BASE_URL}/prospecting/contact/enrich`, {
      method: 'POST',
      headers: { 'api_key': LUSHA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Lusha enrich error', details: text });
    }

    const data = await resp.json();
    console.log('Lusha enrich response:', JSON.stringify(data, null, 2));
    
    // Map the enriched contact data
    const enrichedContacts = Array.isArray(data.contacts)
      ? data.contacts.map(contact => ({
          id: contact.id,
          firstName: contact.data?.name?.first || '',
          lastName: contact.data?.name?.last || '',
          jobTitle: contact.data?.jobTitle || '',
          companyId: contact.data?.companyId || null,
          companyName: contact.data?.companyName || '',
          fqdn: contact.data?.fqdn || '',
          emails: contact.data?.emailAddresses || [],
          phones: contact.data?.phoneNumbers || [],
          isSuccess: contact.isSuccess || false
        }))
      : [];

    return res.status(200).json({ 
      contacts: enrichedContacts,
      requestId: data.requestId 
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
