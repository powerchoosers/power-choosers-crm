/**
 * POST /api/market/ercot/snapshot
 * Fetches current ERCOT prices + grid and saves to market_telemetry (throttled 2x/day: AM/PM).
 * Called by the Telemetry page so we get history even when Gemini chat isn't used.
 */
import { cors } from '../../_cors.js';
import logger from '../../_logger.js';
import { supabaseAdmin } from '../../_supabase.js';
import { getErcotMarketData } from './ercot.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const [priceData, gridData] = await Promise.all([
      getErcotMarketData('prices'),
      getErcotMarketData('grid')
    ]);

    const rawPrices = priceData.prices || {};
    const h = rawPrices.houston ?? 0;
    const n = rawPrices.north ?? 0;
    const s = rawPrices.south ?? 0;
    const w = rawPrices.west ?? 0;
    let hub_avg = rawPrices.hub_avg;
    if (hub_avg == null || hub_avg === 0) {
      hub_avg = (h + n + s + w) / 4;
    }

    const prices = {
      houston: h,
      north: n,
      south: s,
      west: w,
      hub_avg
    };

    const combinedData = {
      timestamp: priceData.timestamp || gridData.timestamp,
      prices,
      grid: gridData.metrics || {},
      metadata: {
        price_source: priceData.source || priceData.metadata?.source,
        grid_source: gridData.source || gridData.metadata?.source,
        last_updated: new Date().toISOString(),
        source: 'ercot_snapshot'
      }
    };

    let saved = false;
    const now = new Date();
    const hour = now.getHours();
    const isAM = hour < 12;
    const startOfBlock = new Date(now);
    startOfBlock.setHours(isAM ? 0 : 12, 0, 0, 0);

    const { data: existing } = await supabaseAdmin
      .from('market_telemetry')
      .select('id')
      .gte('created_at', startOfBlock.toISOString())
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabaseAdmin.from('market_telemetry').insert({
        timestamp: combinedData.timestamp,
        prices: combinedData.prices,
        grid: combinedData.grid,
        metadata: combinedData.metadata
      });
      saved = true;
      logger.info(`[ERCOT Snapshot] Logged market_telemetry for ${isAM ? 'AM' : 'PM'} block`, 'MarketData');
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      saved,
      timestamp: combinedData.timestamp,
      prices: combinedData.prices
    }));
  } catch (error) {
    logger.error('[ERCOT Snapshot] Failed:', 'MarketData', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to save snapshot', message: error.message }));
  }
}
