/**
 * POST /api/market/ercot/snapshot
 * Fetches current ERCOT prices + grid and saves to market_telemetry (throttled 2x/day: AM/PM).
 * Called by the Telemetry page so we get history even when Gemini chat isn't used.
 */
import { cors } from '../_cors.js';
import logger from '../_logger.js';
import { supabaseAdmin } from '@/lib/supabase';
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
        transmission_rates: priceData.transmission_rates,
        last_updated: new Date().toISOString(),
        source: 'ercot_snapshot'
      }
    };

    let saved = false;
    
    // Check if we already have a snapshot in the last 2 hours (avoid duplicates from cron)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    const { data: existing } = await supabaseAdmin
      .from('market_telemetry')
      .select('id, created_at, metadata')
      .gte('created_at', twoHoursAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    // Only save if no recent snapshot exists
    if (!existing || existing.length === 0) {
      console.log('[ERCOT Snapshot] No recent snapshot found. Inserting...');
      const { error: insertError } = await supabaseAdmin.from('market_telemetry').insert({
        timestamp: combinedData.timestamp,
        prices: combinedData.prices,
        grid: combinedData.grid,
        metadata: combinedData.metadata
      });
      if (insertError) {
        console.error('[ERCOT Snapshot] Insert failed:', insertError);
        throw insertError;
      }
      saved = true;
      logger.info('[ERCOT Snapshot] Logged market_telemetry (manual trigger)', 'MarketData');
    } else {
      const lastSnapshot = existing[0];
      const minutesAgo = Math.floor((now.getTime() - new Date(lastSnapshot.created_at).getTime()) / 60000);
      console.log(`[ERCOT Snapshot] Recent snapshot exists from ${minutesAgo} minutes ago. Skipping insert.`);
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
