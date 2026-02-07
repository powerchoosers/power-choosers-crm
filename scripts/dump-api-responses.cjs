/**
 * Dump raw API responses from ERCOT and EIA for inspection (historical data, extra fields, etc.).
 * Run with server up: npm run dev:all (or node server.js), then: node scripts/dump-api-responses.cjs
 * Writes to scripts/output/ercot-prices.json, ercot-grid.json, eia-electricity-discovery.json, eia-retail-sales-sample.json
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3001';
const OUT_DIR = path.join(__dirname, 'output');

function loadEnv() {
  const roots = [path.join(__dirname, '..'), path.join(__dirname, '..', 'crm-platform')];
  for (const root of roots) {
    const p = path.join(root, '.env');
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
}
loadEnv();

async function fetchJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching ERCOT prices...');
  try {
    const prices = await fetchJSON(`${BASE}/api/market/ercot?type=prices`);
    fs.writeFileSync(path.join(OUT_DIR, 'ercot-prices.json'), JSON.stringify(prices, null, 2));
    console.log('  -> output/ercot-prices.json');
    if (prices.data) console.log('  (data array length:', prices.data?.length, ')');
  } catch (e) {
    console.log('  Failed:', e.message);
    fs.writeFileSync(path.join(OUT_DIR, 'ercot-prices.json'), JSON.stringify({ error: e.message }, null, 2));
  }

  console.log('Fetching ERCOT grid...');
  try {
    const grid = await fetchJSON(`${BASE}/api/market/ercot?type=grid`);
    fs.writeFileSync(path.join(OUT_DIR, 'ercot-grid.json'), JSON.stringify(grid, null, 2));
    console.log('  -> output/ercot-grid.json');
  } catch (e) {
    console.log('  Failed:', e.message);
    fs.writeFileSync(path.join(OUT_DIR, 'ercot-grid.json'), JSON.stringify({ error: e.message }, null, 2));
  }

  console.log('Fetching EIA electricity discovery...');
  try {
    const eiaDiscovery = await fetchJSON(`${BASE}/api/market/eia?route=electricity`);
    fs.writeFileSync(path.join(OUT_DIR, 'eia-electricity-discovery.json'), JSON.stringify(eiaDiscovery, null, 2));
    console.log('  -> output/eia-electricity-discovery.json');
  } catch (e) {
    console.log('  Failed:', e.message);
    fs.writeFileSync(path.join(OUT_DIR, 'eia-electricity-discovery.json'), JSON.stringify({ error: e.message }, null, 2));
  }

  console.log('Fetching EIA retail-sales data (TX, last 12 months)...');
  try {
    const eiaData = await fetchJSON(
      `${BASE}/api/market/eia?route=electricity/retail-sales&data=1&length=12&frequency=monthly&facets[stateid][]=TX&data[]=price`
    );
    fs.writeFileSync(path.join(OUT_DIR, 'eia-retail-sales-sample.json'), JSON.stringify(eiaData, null, 2));
    console.log('  -> output/eia-retail-sales-sample.json');
    if (eiaData.catalog && Array.isArray(eiaData.catalog)) console.log('  (rows:', eiaData.catalog.length, ')');
  } catch (e) {
    console.log('  Failed:', e.message);
    fs.writeFileSync(path.join(OUT_DIR, 'eia-retail-sales-sample.json'), JSON.stringify({ error: e.message }, null, 2));
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
