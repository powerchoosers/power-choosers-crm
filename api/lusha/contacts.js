const cors = require('../_cors');

const LUSHA_API_KEY = '1e97bb11-eac3-4b20-8491-02f9b7d783b7';
const LUSHA_BASE_URL = 'https://api.lusha.com';

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    const { companyId, companyName, domain, kind } = req.body || {};
    const body = { filters: {}, limit: kind === 'all' ? 25 : 10 };
    if (companyId) body.filters.company = { id: companyId };
    else if (domain) body.filters.company = { domain };
    else if (companyName) body.filters.company = { name: companyName };

    const resp = await fetch(`${LUSHA_BASE_URL}/prospecting/contact/search`, {
      method: 'POST',
      headers: { 'api_key': LUSHA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Lusha contacts error', details: text });
    }
    const data = await resp.json();
    const contacts = Array.isArray(data?.data) ? data.data.map(c => ({
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      fullName: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
      title: c.jobTitle || c.title || '',
      email: (c.emailAddresses && c.emailAddresses[0]?.email) || c.email || '',
      phone: (c.phoneNumbers && c.phoneNumbers[0]?.phone) || c.phone || '',
      company: c.company || c.companyName || companyName || '',
      location: c.location || c.city || ''
    })) : [];
    return res.status(200).json({ contacts, total: contacts.length });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
};
