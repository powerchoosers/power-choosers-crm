import { cors } from '../_cors.js';
import logger from '../_logger.js';

/**
 * EIA Market Data Discovery & Fetch Handler
 * 
 * This endpoint allows discovery of EIA API v2 datasets and fetching data samples.
 * Use 'route' to navigate and 'data=1' to fetch actual data.
 * All other query parameters are passed directly to the EIA API.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;

  const apiKey = process.env.EIA_API_KEY;
  
  if (!apiKey) {
    logger.error('[EIA] API key is missing in environment variables', 'MarketData');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'EIA API key not configured' }));
  }

  const urlParams = new URL(req.url, `http://${req.headers.host}`);
  const route = urlParams.searchParams.get('route') || '';
  const fetchSamples = urlParams.searchParams.get('data') === '1';
  
  // Create a new URLSearchParams object for the EIA API
  const eiaParams = new URLSearchParams();
  eiaParams.append('api_key', apiKey);
  
  // Pass through all other parameters
  urlParams.searchParams.forEach((value, key) => {
    if (key !== 'route' && key !== 'data') {
      eiaParams.append(key, value);
    }
  });

  // Construct EIA URL
  let path = route;
  if (fetchSamples && !path.endsWith('/data')) {
    path = `${path}/data`;
    // If fetching data and no frequency/length specified, add defaults
    if (!eiaParams.has('length')) eiaParams.append('length', '5');
  }

  const eiaUrl = `https://api.eia.gov/v2/${path}?${eiaParams.toString()}`;

  try {
    logger.info(`[EIA] ${fetchSamples ? 'Fetching data' : 'Discovering'} for: ${path}`, 'MarketData');
    
    const response = await fetch(eiaUrl);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `EIA API returned ${response.status}`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      route: path,
      mode: fetchSamples ? 'data_sample' : 'discovery',
      description: data.response?.description || 'EIA API Results',
      catalog: fetchSamples ? data.response?.data : (data.response?.routes || data.response?.data || data),
      metadata: {
        name: data.response?.name,
        frequency: data.response?.frequency,
        facets: data.response?.facets,
        total: data.response?.total
      },
      debug: {
        url: eiaUrl.replace(apiKey, 'REDACTED')
      }
    }, null, 2));

  } catch (error) {
    logger.error(`[EIA] Operation failed for route ${route}:`, 'MarketData', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      error: 'Failed to fetch EIA data', 
      message: error.message,
      route,
      debug: {
        url: eiaUrl?.replace(apiKey, 'REDACTED')
      }
    }));
  }
}
