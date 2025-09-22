const { cors, getApiKey, fetchWithRetry, CDAPI_BASE, normalizeDomain } = require('./_utils');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const apiKey = getApiKey();
    const { id, shorthand, domain } = req.query || {};
    let path;
    if (id) path = `/v2/company_multi_source/collect/${encodeURIComponent(id)}`;
    else if (shorthand) path = `/v2/company_multi_source/collect/${encodeURIComponent(shorthand)}`;
    else if (domain) {
      // when only domain is provided, do a search to resolve id first
      const esdsl = { query: { bool: { must: [{ query_string: { query: normalizeDomain(domain), default_field: 'website.domain_only' } }] } }, size: 1 };
      const sresp = await fetchWithRetry(`${CDAPI_BASE}/v2/company_multi_source/search/es_dsl`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'accept': 'application/json', 'apikey': apiKey }, body: JSON.stringify(esdsl)
      });
      if (!sresp.ok) {
        const text = await sresp.text();
        return res.status(sresp.status).json({ error: 'coresignal_company_resolve_error', details: text });
      }
      const sdata = await sresp.json();
      const first = Array.isArray(sdata?.data) ? sdata.data[0] : (Array.isArray(sdata?.results) ? sdata.results[0] : null);
      if (!first || !first.id) return res.status(404).json({ error: 'company_not_found' });
      path = `/v2/company_multi_source/collect/${encodeURIComponent(first.id)}`;
    } else {
      return res.status(400).json({ error: 'Missing id, shorthand, or domain parameter' });
    }
    const url = `${CDAPI_BASE}${path}`;
    const resp = await fetchWithRetry(url, { method: 'GET', headers: { 'accept': 'application/json', 'apikey': apiKey } });
    const remaining = resp.headers.get('x-credits-remaining');
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'coresignal_company_collect_error', details: text, remaining });
    }
    const data = await resp.json();
    return res.status(200).json({ data, remaining });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', details: e.message });
  }
};


