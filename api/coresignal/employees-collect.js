const { cors, getApiKey, fetchWithRetry, CDAPI_BASE } = require('./_utils');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const apiKey = getApiKey();
    const { id, shorthand } = req.query || {};
    if (!id && !shorthand) return res.status(400).json({ error: 'Missing id or shorthand parameter' });
    const path = id ? `/v2/employee_multi_source/collect/${encodeURIComponent(id)}` : `/v2/employee_multi_source/collect/${encodeURIComponent(shorthand)}`;
    const url = `${CDAPI_BASE}${path}`;
    const resp = await fetchWithRetry(url, { method: 'GET', headers: { 'accept': 'application/json', 'apikey': apiKey } });
    const remaining = resp.headers.get('x-credits-remaining');
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'coresignal_collect_error', details: text, remaining });
    }
    const data = await resp.json();
    return res.status(200).json({ data, remaining });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', details: e.message });
  }
};


