const { cors, getApiKey, fetchWithRetry, CDAPI_BASE } = require('./_utils');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const apiKey = getApiKey();
    const esdsl = req.body && req.body.query ? req.body : req.body?.esdsl || req.body || {};
    if (!esdsl || typeof esdsl !== 'object' || !esdsl.query) {
      return res.status(400).json({ error: 'Missing Elasticsearch DSL body with query' });
    }
    const payload = { query: esdsl.query };
    const url = `${CDAPI_BASE}/v2/company_multi_source/search/es_dsl`;
    const resp = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'accept': 'application/json', 'apikey': apiKey },
      body: JSON.stringify(payload)
    });
    const remaining = resp.headers.get('x-credits-remaining');
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'coresignal_company_search_error', details: text, remaining });
    }
    const data = await resp.json();
    return res.status(200).json({ data, remaining });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', details: e.message });
  }
};


