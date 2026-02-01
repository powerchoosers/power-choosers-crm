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

  const apiKey = process.env.ERCOT_API_KEY;
  const publicApiKey = process.env.ERCOT_PUBLIC_API_KEY;

  try {
    // If we have an API key and didn't explicitly ask for the scraper, use the API
    if ((apiKey || publicApiKey) && !useScraper) {
      return await fetchFromOfficialApi(res, type, apiKey || publicApiKey);
    }

    // Fallback to scraper
    if (type === 'prices') {
      return await fetchRealTimePrices(res);
    } else if (type === 'grid') {
      return await fetchGridConditions(res);
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid type parameter. Use "prices" or "grid".' }));
    }
  } catch (error) {
    logger.error(`[ERCOT] Request failed for type ${type}:`, 'MarketData', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      error: 'Failed to fetch ERCOT data', 
      message: error.message 
    }));
  }
}

/**
 * Fetches data from the official ERCOT API
 */
async function fetchFromOfficialApi(res, type, key) {
  logger.info(`[ERCOT] Fetching ${type} from official API...`, 'MarketData');
  
  // Example endpoint for Real-Time SPP (from API Explorer)
  // Note: Actual endpoints may vary based on the specific API subscription
  let endpoint = '';
  if (type === 'prices') {
    endpoint = 'https://api.ercot.com/pubapi/apim/data/agg/edc'; // Placeholder
  } else {
    endpoint = 'https://api.ercot.com/pubapi/apim/data/grid/conditions'; // Placeholder
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        logger.warn('[ERCOT] Official API auth failed, falling back to scraper', 'MarketData');
        if (type === 'prices') return await fetchRealTimePrices(res);
        return await fetchGridConditions(res);
      }
      throw new Error(`ERCOT API returned ${response.status}`);
    }

    const data = await response.json();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      source: 'ERCOT Official API',
      data: data,
      metadata: { last_updated: new Date().toISOString() }
    }, null, 2));

  } catch (error) {
    logger.error(`[ERCOT] Official API failed: ${error.message}. Falling back to scraper.`, 'MarketData');
    if (type === 'prices') return await fetchRealTimePrices(res);
    return await fetchGridConditions(res);
  }
}

/**
 * Fetches Real-Time Settlement Point Prices (SPP)
 */
async function fetchRealTimePrices(res) {
  const URL = 'https://www.ercot.com/content/cdr/html/real_time_spp.html';
  logger.info('[ERCOT] Fetching real-time prices...', 'MarketData');

  const response = await fetch(URL);
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`ERCOT returned ${response.status}`);
  }

  // Simple parser for the HTML table
  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  logger.info(`[ERCOT] Found ${rows.length} rows in price table`, 'MarketData');

  if (rows.length < 2) {
    // If we only have 0 or 1 rows (header only?), log the HTML to see what's up
    logger.warn('[ERCOT] Price table has insufficient rows', 'MarketData', { htmlSample: html.substring(0, 500) });
    throw new Error('Could not parse ERCOT price table - insufficient rows');
  }

  // Filter out rows that are just headers or empty
  const dataRows = rows.filter(row => row.includes('<td'));
  logger.info(`[ERCOT] Found ${dataRows.length} data rows`, 'MarketData');

  if (dataRows.length === 0) {
    throw new Error('No data rows found in ERCOT price table');
  }

  // The last row contains the most recent data
  const lastRow = dataRows[dataRows.length - 1];
  const cells = lastRow.match(/<td[^>]*>([\s\S]*?)<\/td>/g)?.map(td => td.replace(/<[^>]*>/g, '').trim()) || [];

  logger.info(`[ERCOT] Last row cells: ${JSON.stringify(cells)}`, 'MarketData');

  // Based on the table structure:
  // 0: Oper Day, 1: Interval Ending, 2: HB_BUSAVG, 3: HB_HOUSTON, 4: HB_HUBAVG, 5: HB_NORTH, 6: HB_PAN, 7: HB_SOUTH, 8: HB_WEST, 9: LZ_AEN, 10: LZ_CPS, 11: LZ_HOUSTON, 12: LZ_LCRA, 13: LZ_NORTH, 14: LZ_RAYBN, 15: LZ_SOUTH, 16: LZ_WEST
  const data = {
    timestamp: cells[0] + ' ' + cells[1],
    prices: {
      houston: parseFloat(cells[11]) || 0,
      north: parseFloat(cells[13]) || 0,
      south: parseFloat(cells[15]) || 0,
      west: parseFloat(cells[16]) || 0,
      hub_avg: parseFloat(cells[4]) || 0
    },
    metadata: {
      source: 'ERCOT Public CDR',
      url: URL,
      last_updated: new Date().toISOString()
    }
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify(data, null, 2));
}

/**
 * Fetches Grid Conditions (Load vs Capacity)
 */
async function fetchGridConditions(res) {
  const URL = 'https://www.ercot.com/content/cdr/html/load_forecast_vs_actual.html';
  logger.info('[ERCOT] Fetching grid conditions...', 'MarketData');

  try {
    const response = await fetch(URL);
    const html = await response.text();

    if (!response.ok) {
      throw new Error(`ERCOT returned ${response.status}`);
    }

    // Parse the HTML table for grid conditions
    // This table structure is different. Let's look for rows with <td>
    const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
    
    // We want the last row of the table
    const dataRows = rows.filter(row => row.includes('<td'));
    if (dataRows.length === 0) {
      throw new Error('No data rows found in ERCOT grid conditions table');
    }

    const lastRow = dataRows[dataRows.length - 1];
    const cells = lastRow.match(/<td[^>]*>([\s\S]*?)<\/td>/g)?.map(td => td.replace(/<[^>]*>/g, '').trim()) || [];

    // Table structure for Load Forecast vs Actual:
    // 0: Hour Ending, 1: System Load, 2: System Load Forecast, 3: Total PV Generation, 4: Total PV Forecast, 5: Total Wind Generation, 6: Total Wind Forecast
    const data = {
      timestamp: new Date().toLocaleDateString() + ' ' + cells[0],
      metrics: {
        actual_load: parseFloat(cells[1].replace(/,/g, '')) || 0,
        forecast_load: parseFloat(cells[2].replace(/,/g, '')) || 0,
        pv_gen: parseFloat(cells[3].replace(/,/g, '')) || 0,
        wind_gen: parseFloat(cells[5].replace(/,/g, '')) || 0
      },
      metadata: {
        source: 'ERCOT Public CDR',
        url: URL,
        last_updated: new Date().toISOString()
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data, null, 2));

  } catch (error) {
    logger.error('[ERCOT] Grid conditions scraper failed:', 'MarketData', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to fetch grid conditions', message: error.message }));
  }
}
