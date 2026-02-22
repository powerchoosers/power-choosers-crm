import { cors } from '../_cors.js';
import logger from '../_logger.js';

/**
 * ERCOT Market Data Handler
 * 
 * This handler fetches real-time market data.
 * It prioritizes the official ERCOT API if keys are available,
 * otherwise falls back to scraping public CDR HTML files.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;

  const urlParams = new URL(req.url, `http://${req.headers.host}`);
  const type = urlParams.searchParams.get('type') || 'prices'; // prices, grid
  const useScraper = urlParams.searchParams.get('scraper') === '1';

  try {
    const data = await getErcotMarketData(type, useScraper);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error(`[ERCOT] Request failed for type ${type}:`, 'MarketData', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: 'Failed to fetch ERCOT data',
      message: error.message
    }));
  }
}

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Sleep helper for timeout/retry
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates a Bearer Token using OAuth2 ROPC Flow (simple version, no single-flight).
 */
async function getBearerToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const username = process.env.ERCOT_USERNAME;
  const password = process.env.ERCOT_PASSWORD;

  if (!username || !password) {
    throw new Error('ERCOT_USERNAME or ERCOT_PASSWORD not set in .env');
  }

  logger.info('[ERCOT] Requesting new Bearer token...', 'MarketData');

  const tokenUrl = 'https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token';
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: 'fec253ea-0d06-4272-a5e6-b478baeecd70',
    scope: 'openid fec253ea-0d06-4272-a5e6-b478baeecd70 offline_access',
    username: username,
    password: password,
    response_type: 'token id_token'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const data = await response.text();
  let parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch (e) {
    logger.error('[ERCOT] Token response not valid JSON:', 'MarketData', data.substring(0, 100));
    throw new Error('ERCOT Token endpoint returned non-JSON response');
  }

  if (!response.ok) {
    logger.error('[ERCOT] Token request failed:', 'MarketData', parsedData.error_description || parsedData.error || data.substring(0, 100));
    throw new Error(`Token request failed: ${parsedData.error_description || parsedData.error || 'Unknown error'}`);
  }

  cachedToken = parsedData.id_token || parsedData.access_token;
  tokenExpiry = Date.now() + (parsedData.expires_in * 1000) - (5 * 60 * 1000);
  logger.info('[ERCOT] Bearer token acquired successfully.', 'MarketData');
  return cachedToken;
}

/** Max time to wait for official API before falling back to scraper (avoids socket hang up) */
const API_TIMEOUT_MS = 9000;

/**
 * Core function to fetch ERCOT market data.
 * Uses official API with a short timeout; falls back to scraper so we respond before client/proxy close.
 */
export async function getErcotMarketData(type = 'prices', forceScraper = false) {
  const apiKey = process.env.ERCOT_API_KEY;
  const publicApiKey = process.env.ERCOT_PUBLIC_API_KEY;

  const runScraper = () => {
    if (type === 'prices') return scrapeRealTimePrices();
    if (type === 'grid') return scrapeGridConditions();
    throw new Error('Invalid type parameter. Use "prices" or "grid".');
  };

  if (forceScraper) {
    return runScraper();
  }

  if (apiKey || publicApiKey) {
    const keysToTry = [publicApiKey, apiKey].filter(Boolean);
    const apiPromise = fetchFromOfficialApi(type, keysToTry);
    const timeoutPromise = sleep(API_TIMEOUT_MS).then(() => {
      throw new Error('API timeout');
    });
    try {
      return await Promise.race([apiPromise, timeoutPromise]);
    } catch (error) {
      logger.error(`[ERCOT] getErcotMarketData failed for type ${type}:`, 'MarketData', error.message);
      try {
        return await runScraper();
      } catch (scraperError) {
        throw new Error(`Both API and Scraper failed: ${error.message} / ${scraperError.message}`);
      }
    }
  }

  return runScraper();
}

/**
 * Fetches data from the official ERCOT API (no retry loop to keep response fast).
 */
async function fetchFromOfficialApi(type, keys) {
  const keysToTry = Array.isArray(keys) ? keys : [keys];
  logger.info(`[ERCOT] Fetching ${type} from official API...`, 'MarketData');

  const token = await getBearerToken();
  const primaryKey = keysToTry[0];

  const fetchOne = async (url, options) => {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type');
    if (!res.ok) {
      const text = await res.text();
      logger.error(`[ERCOT] API Error (${res.status}): ${text.substring(0, 100)}...`, 'MarketData');
      throw new Error(`ERCOT API returned ${res.status}: ${text.substring(0, 50)}`);
    }
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      logger.error(`[ERCOT] Non-JSON response from ${url}: ${text.substring(0, 100)}...`, 'MarketData');
      throw new Error('ERCOT API returned non-JSON response');
    }
    return res.json();
  };

  if (type === 'prices') {
    const rawData = await fetchOne('https://api.ercot.com/api/public-reports/np6-905-cd/spp_node_zone_hub?settlementPointType=LZEW&size=200&sort=deliveryDate&dir=desc', {
      headers: { 'Ocp-Apim-Subscription-Key': primaryKey, 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    // Group by zone and find latest (Indices: 0:date, 1:hour, 2:interval, 3:point, 5:price)
    const data = rawData.data || [];
    const latestByZone = {};

    for (const row of data) {
      const zone = row[3];
      if (!latestByZone[zone]) {
        latestByZone[zone] = row;
      } else {
        const current = latestByZone[zone];
        // Compare date, then hour, then interval (Date is YYYY-MM-DD string)
        if (row[0] > current[0] ||
          (row[0] === current[0] && row[1] > current[1]) ||
          (row[0] === current[0] && row[1] === current[1] && row[2] > current[2])) {
          latestByZone[zone] = row;
        }
      }
    }

    const h = latestByZone['LZ_HOUSTON'] || [];
    const n = latestByZone['LZ_NORTH'] || [];
    const s = latestByZone['LZ_SOUTH'] || [];
    const w = latestByZone['LZ_WEST'] || [];

    const houstonPrice = parseFloat(h[5]) || 0;
    const northPrice = parseFloat(n[5]) || 0;
    const southPrice = parseFloat(s[5]) || 0;
    const westPrice = parseFloat(w[5]) || 0;

    return {
      source: 'ERCOT Official API (Unified)',
      timestamp: h.length ? `${h[0]} ${h[1]}:${(h[2] - 1) * 15}` : new Date().toISOString(),
      prices: {
        houston: houstonPrice,
        north: northPrice,
        south: southPrice,
        west: westPrice,
        hub_avg: (houstonPrice + northPrice + southPrice + westPrice) / 4
      },
      metadata: {
        last_updated: new Date().toISOString(),
        report_id: 'NP6-905-CD'
      }
    };
  } else {
    // Report NP6-345-CD is only for local load. System capacity/reserves are best scraped 
    // from the dashboard for real-time accuracy until a proper system-wide API report is mapped.
    return scrapeGridConditions();
  }
}

/**
 * Common fetch headers to avoid bot detection
 */
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Scrapes Real-Time Settlement Point Prices (SPP)
 */
async function scrapeRealTimePrices() {
  const URL = 'https://www.ercot.com/content/cdr/html/real_time_spp.html';
  logger.info('[ERCOT] Scraping real-time prices...', 'MarketData');

  const response = await fetch(URL, { headers: FETCH_HEADERS });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`ERCOT returned ${response.status}`);
  }

  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  const dataRows = rows.filter(row => row.includes('<td') && !row.includes('class="label"'));

  if (dataRows.length === 0) {
    throw new Error('No data rows found in ERCOT price table');
  }

  const lastRow = dataRows[dataRows.length - 1];
  const cells = lastRow.match(/<td[^>]*>([\s\S]*?)<\/td>/g)?.map(td => td.replace(/<[^>]*>/g, '').trim()) || [];

  const houston = parseFloat(cells[11]) || 0;
  const north = parseFloat(cells[13]) || 0;
  const south = parseFloat(cells[15]) || 0;
  const west = parseFloat(cells[16]) || 0;
  const hubFromCell = parseFloat(cells[4]);
  const hub_avg = !isNaN(hubFromCell) ? hubFromCell : (houston + north + south + west) / 4;

  return {
    timestamp: (cells[0] || '') + ' ' + (cells[1] || ''),
    prices: {
      houston,
      north,
      south,
      west,
      hub_avg
    },
    metadata: {
      source: 'ERCOT Public CDR (Scraper)',
      url: URL,
      last_updated: new Date().toISOString()
    }
  };
}

/**
 * Scrapes Grid Conditions (Load vs Capacity)
 */
async function scrapeGridConditions() {
  const URL = 'https://www.ercot.com/content/cdr/html/real_time_system_conditions.html';
  logger.info('[ERCOT] Scraping grid conditions...', 'MarketData');

  const response = await fetch(URL, { headers: FETCH_HEADERS });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`ERCOT returned ${response.status}`);
  }

  const metrics = {};

  const demandMatch = html.match(/Actual System Demand<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
  if (demandMatch) metrics.actual_load = parseFloat(demandMatch[1].replace(/,/g, ''));

  const capacityMatch = html.match(/Total System Capacity[^<]*<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
  if (capacityMatch) metrics.total_capacity = parseFloat(capacityMatch[1].replace(/,/g, ''));

  const windMatch = html.match(/Total Wind Output<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
  if (windMatch) metrics.wind_gen = parseFloat(windMatch[1].replace(/,/g, ''));

  const pvMatch = html.match(/Total PVGR Output<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
  if (pvMatch) metrics.pv_gen = parseFloat(pvMatch[1].replace(/,/g, ''));

  const netLoadMatch = html.match(/Average Net Load<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
  if (netLoadMatch) metrics.net_load = parseFloat(netLoadMatch[1].replace(/,/g, ''));

  const frequencyMatch = html.match(/Current Frequency<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/);
  if (frequencyMatch) metrics.frequency = parseFloat(frequencyMatch[1]);

  if (metrics.total_capacity && metrics.actual_load) {
    metrics.reserves = Math.max(0, metrics.total_capacity - metrics.actual_load);
    metrics.forecast_load = metrics.actual_load * 1.02; // Better estimate if missing
    metrics.scarcity_prob = Math.max(0, (1 - (metrics.reserves / (metrics.actual_load * 0.1 || 1))) * 10).toFixed(1);
  }

  return {
    source: 'ERCOT Public CDR (Scraper)',
    timestamp: new Date().toISOString(),
    metrics,
    metadata: {
      source: 'ERCOT Public CDR (Scraper)',
      url: URL,
      last_updated: new Date().toISOString()
    }
  };
}
