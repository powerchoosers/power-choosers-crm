/**
 * Supabase Edge Function: Capture ERCOT Market Snapshot
 * 
 * Captures ERCOT real-time settlement prices and grid conditions at strategic times
 * throughout the day to build accurate historical price data.
 * 
 * Strategy:
 * - Runs 4x per day at peak demand hours (7am, 12pm, 5pm, 10pm CT)
 * - Captures actual real-time prices (not just when someone visits the page)
 * - Stores full zone breakdown for accurate historical charting
 * 
 * Triggered by: pg_cron schedule
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ERCOT_API_TIMEOUT = 12000 // 12 seconds

interface ERCOTPriceData {
  houston: number
  north: number
  south: number
  west: number
  hub_avg: number
}

interface ERCOTGridData {
  actual_load?: number
  total_capacity?: number
  reserves?: number
  wind_gen?: number
  pv_gen?: number
  frequency?: number
  net_load?: number
  forecast_load?: number
  scarcity_prob?: number
}

interface MarketSnapshot {
  timestamp: string
  prices: ERCOTPriceData
  grid: ERCOTGridData
  metadata: {
    price_source: string
    grid_source: string
    transmission_rates: Record<string, number>
    last_updated: string
    source: string
    capture_hour: number
  }
}

/**
 * Fetch ERCOT prices from official API with Bearer token auth
 */
async function fetchERCOTPrices(): Promise<{ prices: ERCOTPriceData; timestamp: string; source: string }> {
  const username = Deno.env.get('ERCOT_USERNAME')
  const password = Deno.env.get('ERCOT_PASSWORD')
  const publicKey = Deno.env.get('ERCOT_PUBLIC_API_KEY')

  if (!username || !password || !publicKey) {
    throw new Error('Missing ERCOT credentials')
  }

  // Get Bearer token
  const tokenUrl = 'https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token'
  const tokenParams = new URLSearchParams({
    grant_type: 'password',
    client_id: 'fec253ea-0d06-4272-a5e6-b478baeecd70',
    scope: 'openid fec253ea-0d06-4272-a5e6-b478baeecd70 offline_access',
    username,
    password,
    response_type: 'token id_token'
  })

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams,
    signal: AbortSignal.timeout(ERCOT_API_TIMEOUT)
  })

  if (!tokenRes.ok) {
    throw new Error(`Token request failed: ${tokenRes.status}`)
  }

  const tokenData = await tokenRes.json()
  const bearerToken = tokenData.id_token || tokenData.access_token

  // Fetch settlement point prices
  const priceUrl = 'https://api.ercot.com/api/public-reports/np6-905-cd/spp_node_zone_hub?settlementPointType=LZEW&size=200&sort=deliveryDate&dir=desc'
  const priceRes = await fetch(priceUrl, {
    headers: {
      'Ocp-Apim-Subscription-Key': publicKey,
      'Authorization': `Bearer ${bearerToken}`,
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(ERCOT_API_TIMEOUT)
  })

  if (!priceRes.ok) {
    throw new Error(`Price API failed: ${priceRes.status}`)
  }

  const rawData = await priceRes.json()
  const data = rawData.data || []

  // Group by zone and find latest (Indices: 0:date, 1:hour, 2:interval, 3:point, 5:price)
  const latestByZone: Record<string, any[]> = {}

  for (const row of data) {
    const zone = row[3]
    if (!latestByZone[zone]) {
      latestByZone[zone] = row
    } else {
      const current = latestByZone[zone]
      if (row[0] > current[0] ||
        (row[0] === current[0] && row[1] > current[1]) ||
        (row[0] === current[0] && row[1] === current[1] && row[2] > current[2])) {
        latestByZone[zone] = row
      }
    }
  }

  const h = latestByZone['LZ_HOUSTON'] || []
  const n = latestByZone['LZ_NORTH'] || []
  const s = latestByZone['LZ_SOUTH'] || []
  const w = latestByZone['LZ_WEST'] || []

  const houstonPrice = parseFloat(h[5]) || 0
  const northPrice = parseFloat(n[5]) || 0
  const southPrice = parseFloat(s[5]) || 0
  const westPrice = parseFloat(w[5]) || 0

  return {
    prices: {
      houston: houstonPrice,
      north: northPrice,
      south: southPrice,
      west: westPrice,
      hub_avg: (houstonPrice + northPrice + southPrice + westPrice) / 4
    },
    timestamp: h.length ? `${h[0]} ${h[1]}:${(h[2] - 1) * 15}` : new Date().toISOString(),
    source: 'ERCOT Official API (Unified)'
  }
}

/**
 * Scrape grid conditions from ERCOT public dashboard
 */
async function scrapeGridConditions(): Promise<{ metrics: ERCOTGridData; source: string }> {
  const url = 'https://www.ercot.com/content/cdr/html/real_time_system_conditions.html'
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    signal: AbortSignal.timeout(ERCOT_API_TIMEOUT)
  })

  if (!response.ok) {
    throw new Error(`Grid scrape failed: ${response.status}`)
  }

  const html = await response.text()
  const metrics: ERCOTGridData = {}

  const demandMatch = html.match(/Actual System Demand<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/)
  if (demandMatch) metrics.actual_load = parseFloat(demandMatch[1].replace(/,/g, ''))

  const capacityMatch = html.match(/Total System Capacity[^<]*<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/)
  if (capacityMatch) metrics.total_capacity = parseFloat(capacityMatch[1].replace(/,/g, ''))

  const windMatch = html.match(/Total Wind Output<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/)
  if (windMatch) metrics.wind_gen = parseFloat(windMatch[1].replace(/,/g, ''))

  const pvMatch = html.match(/Total PVGR Output<\/td>\s*<td[^>]*>([\d,.-]+)<\/td>/)
  if (pvMatch) metrics.pv_gen = parseFloat(pvMatch[1].replace(/,/g, ''))

  if (metrics.total_capacity && metrics.actual_load) {
    metrics.reserves = Math.max(0, metrics.total_capacity - metrics.actual_load)
    metrics.forecast_load = metrics.actual_load * 1.02
    metrics.scarcity_prob = parseFloat(Math.max(0, (1 - (metrics.reserves / (metrics.actual_load * 0.1 || 1))) * 10).toFixed(1))
  }

  return {
    metrics,
    source: 'ERCOT Public CDR (Scraper)'
  }
}

Deno.serve(async (req) => {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret !== Deno.env.get('CRON_SECRET')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log('[ERCOT Snapshot] Starting capture...')

    // Fetch both prices and grid in parallel
    const [priceData, gridData] = await Promise.all([
      fetchERCOTPrices(),
      scrapeGridConditions()
    ])

    // Get current hour in Central Time
    const now = new Date()
    const ctHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' })).getHours()

    const snapshot: MarketSnapshot = {
      timestamp: priceData.timestamp,
      prices: priceData.prices,
      grid: gridData.metrics,
      metadata: {
        price_source: priceData.source,
        grid_source: gridData.source,
        transmission_rates: {
          houston: 0.6597,
          north: 0.7234,
          south: 0.5821,
          west: 0.8943
        },
        last_updated: new Date().toISOString(),
        source: 'cron_snapshot',
        capture_hour: ctHour
      }
    }

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error: insertError } = await supabase
      .from('market_telemetry')
      .insert({
        timestamp: snapshot.timestamp,
        prices: snapshot.prices,
        grid: snapshot.grid,
        metadata: snapshot.metadata
      })

    if (insertError) {
      console.error('[ERCOT Snapshot] Insert failed:', insertError)
      throw insertError
    }

    console.log(`[ERCOT Snapshot] Saved successfully at ${ctHour}:00 CT - HUB_AVG: $${snapshot.prices.hub_avg.toFixed(2)}/MWh`)

    return new Response(JSON.stringify({
      success: true,
      timestamp: snapshot.timestamp,
      prices: snapshot.prices,
      capture_hour: ctHour
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[ERCOT Snapshot] Failed:', error)
    return new Response(JSON.stringify({
      error: 'Failed to capture snapshot',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
