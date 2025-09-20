const cors = require('../_cors');

const LUSHA_API_KEY = process.env.LUSHA_API_KEY;
const LUSHA_BASE_URL = 'https://api.lusha.com';

async function callLushaApi(endpoint, body) {
  const response = await fetch(`${LUSHA_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'api_key': LUSHA_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Lusha API error for ${endpoint}:`, response.status, errorText);
    throw new Error(`Lusha API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

const handler = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!LUSHA_API_KEY) {
    return res.status(500).json({ error: 'Lusha API key is not configured.' });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { companyName } = req.body;

    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Step 1: Search for the company to get its ID
    const companySearchBody = {
      "filters": {
        "companyName": {
          "values": [companyName]
        }
      },
      "limit": 1
    };
    const companySearchData = await callLushaApi('/prospecting/company/search', companySearchBody);

    if (!companySearchData.companies || companySearchData.companies.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const companyId = companySearchData.companies[0].id;

    // Step 2: Search for contacts at that company
    const contactSearchBody = {
      "filters": {
        "companyId": {
          "values": [companyId]
        }
      },
      "limit": 25 // You can adjust this limit
    };
    const contactSearchData = await callLushaApi('/prospecting/contact/search', contactSearchBody);
    
    if (!contactSearchData.contacts || contactSearchData.contacts.length === 0) {
      return res.status(404).json({ error: 'No contacts found for this company' });
    }

    // Step 3: Enrich the found contacts to get their details
    const contactIdsToEnrich = contactSearchData.contacts.map(c => c.id);
    const enrichBody = {
      "contactIds": contactIdsToEnrich
    };
    const enrichedData = await callLushaApi('/prospecting/contact/enrich', enrichBody);
    
    res.status(200).json({
      success: true,
      contacts: enrichedData.contacts,
      total: enrichedData.contacts.length
    });

  } catch (error) {
    console.error('Lusha prospecting error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
};

module.exports = cors(handler);
