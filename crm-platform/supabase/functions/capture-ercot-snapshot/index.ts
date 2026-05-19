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

interface SnapshotRow {
  created_at: string
  timestamp: string
  prices: ERCOTPriceData
  grid: ERCOTGridData
  metadata: MarketSnapshot['metadata'] & {
    operating_day?: string
    archive_url?: string
  }
}

const ARCHIVE_CAPTURE_HOURS = [7, 12, 17, 22]

function parseTableRows(html: string): string[] {
  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || []
  return rows.filter((row) => row.includes('<td') && !row.includes('class="label"'))
}

function extractCells(row: string): string[] {
  return row
    .match(/<td[^>]*>([\s\S]*?)<\/td>/g)
    ?.map((td) => td.replace(/<[^>]*>/g, '').trim()) || []
}

function toArchiveDate(operatingDay: string): string {
  const [month, day, year] = operatingDay.split('/')
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function chicagoLocalToUtcIso(dateIso: string, timeHHMM: string): string {
  const [year, month, day] = dateIso.split('-').map(Number)
  const [hour, minute] = timeHHMM.split(':').map(Number)
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  let guess = Date.UTC(year, month - 1, day, hour, minute, 0)

  for (let i = 0; i < 3; i++) {
    const parts = format.formatToParts(new Date(guess))
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const gotYear = Number(lookup.year)
    const gotMonth = Number(lookup.month)
    const gotDay = Number(lookup.day)
    const gotHour = Number(lookup.hour)
    const gotMinute = Number(lookup.minute)

    const desiredMinutes = Date.UTC(year, month - 1, day, hour, minute, 0) / 60000
    const currentMinutes = Date.UTC(gotYear, gotMonth - 1, gotDay, gotHour, gotMinute, 0) / 60000
    const deltaMinutes = desiredMinutes - currentMinutes

    if (deltaMinutes === 0) {
      return new Date(guess).toISOString()
    }

    guess += deltaMinutes * 60_000
  }

  return new Date(guess).toISOString()
}

function buildArchiveUrl(dateIso: string): string {
  const compact = dateIso.replace(/-/g, '')
  return `https://www.ercot.com/content/cdr/html/${compact}_real_time_spp.html`
}

function buildSnapshotFromCells(
  cells: string[],
  archiveDateIso: string,
  archiveUrl: string,
  captureHour: number
): SnapshotRow {
  const houston = parseFloat(cells[11]) || 0
  const north = parseFloat(cells[13]) || 0
  const south = parseFloat(cells[15]) || 0
  const west = parseFloat(cells[16]) || 0
  const hubFromCell = parseFloat(cells[4])
  const hub_avg = !isNaN(hubFromCell) ? hubFromCell : (houston + north + south + west) / 4

  const interval = (cells[1] || '').padStart(4, '0')
  const intervalHHMM = `${interval.slice(0, 2)}:${interval.slice(2, 4)}`

  return {
    created_at: chicagoLocalToUtcIso(archiveDateIso, intervalHHMM),
    timestamp: `${cells[0] || ''} ${cells[1] || ''}`.trim(),
    prices: {
      houston,
      north,
      south,
      west,
      hub_avg
    },
    grid: {},
    metadata: {
      price_source: 'ERCOT Public CDR Archive',
      grid_source: 'Historic grid conditions not backfilled',
      transmission_rates: {
        houston: 0.6597,
        north: 0.7234,
        south: 0.5821,
        west: 0.8943
      },
      last_updated: new Date().toISOString(),
      source: 'ercot_archive_backfill',
      capture_hour: captureHour,
      operating_day: cells[0] || archiveDateIso,
      archive_url: archiveUrl
    }
  }
}

async function scrapeArchiveSnapshotsForDate(archiveDateIso: string): Promise<SnapshotRow[]> {
  const archiveUrl = buildArchiveUrl(archiveDateIso)
  const response = await fetch(archiveUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    signal: AbortSignal.timeout(ERCOT_API_TIMEOUT)
  })

  if (!response.ok) {
    throw new Error(`ERCOT archive returned ${response.status} for ${archiveDateIso}`)
  }

  const html = await response.text()
  const rows = parseTableRows(html)
  if (rows.length === 0) {
    throw new Error(`No data rows found in ERCOT archive table for ${archiveDateIso}`)
  }

  const parsedRows = rows.map(extractCells).filter((cells) => cells.length >= 17)
  const snapshots: SnapshotRow[] = []

  for (const captureHour of ARCHIVE_CAPTURE_HOURS) {
    const interval = `${String(captureHour).padStart(2, '0')}00`
    const found = parsedRows.find((cells) => cells[1] === interval)
    if (!found) {
      console.warn(`[ERCOT Snapshot] Missing ${interval} row for ${archiveDateIso}`)
      continue
    }
    snapshots.push(buildSnapshotFromCells(found, archiveDateIso, archiveUrl, captureHour))
  }

  if (snapshots.length === 0) {
    throw new Error(`No target snapshot rows found for ${archiveDateIso}`)
  }

  return snapshots
}

/**
 * Fallback ERCOT price scrape when the private API credentials are unavailable.
 */
async function scrapeRealTimePrices(): Promise<{ prices: ERCOTPriceData; timestamp: string; source: string }> {
  const url = 'https://www.ercot.com/content/cdr/html/real_time_spp.html'
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    signal: AbortSignal.timeout(ERCOT_API_TIMEOUT)
  })

  if (!response.ok) {
    throw new Error(`ERCOT returned ${response.status}`)
  }

  const html = await response.text()
  const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || []
  const dataRows = rows.filter((row) => row.includes('<td') && !row.includes('class="label"'))

  if (dataRows.length === 0) {
    throw new Error('No data rows found in ERCOT price table')
  }

  const lastRow = dataRows[dataRows.length - 1]
  const cells = lastRow.match(/<td[^>]*>([\s\S]*?)<\/td>/g)?.map((td) => td.replace(/<[^>]*>/g, '').trim()) || []

  const houston = parseFloat(cells[11]) || 0
  const north = parseFloat(cells[13]) || 0
  const south = parseFloat(cells[15]) || 0
  const west = parseFloat(cells[16]) || 0
  const hubFromCell = parseFloat(cells[4])
  const hub_avg = !isNaN(hubFromCell) ? hubFromCell : (houston + north + south + west) / 4

  return {
    timestamp: (cells[0] || '') + ' ' + (cells[1] || ''),
    prices: {
      houston,
      north,
      south,
      west,
      hub_avg
    },
    source: 'ERCOT Public CDR (Scraper)'
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
    console.warn('[ERCOT Snapshot] ERCOT credentials missing, using public scraper fallback')
    return await scrapeRealTimePrices()
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
    console.warn(`[ERCOT Snapshot] Private price API failed (${priceRes.status}), using public scraper fallback`)
    return await scrapeRealTimePrices()
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
    const expectedCronSecret = Deno.env.get('CRON_SECRET') || 'nodal-cron-2026'
    if (cronSecret !== expectedCronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log('[ERCOT Snapshot] Starting capture...')

    const url = new URL(req.url)
    const archiveDate = url.searchParams.get('date')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (archiveDate) {
      const snapshots = await scrapeArchiveSnapshotsForDate(archiveDate)
      const existingHours = new Set<number>()

      const { data: existingRows, error: existingError } = await supabase
        .from('market_telemetry')
        .select('id, metadata')
        .eq('metadata->>source', 'ercot_archive_backfill')
        .contains('metadata', { operating_day: snapshots[0]?.metadata.operating_day })

      if (existingError) {
        throw existingError
      }

      for (const row of existingRows ?? []) {
        const hour = Number((row as any)?.metadata?.capture_hour)
        if (!isNaN(hour)) {
          existingHours.add(hour)
        }
      }

      const rowsToInsert = snapshots.filter((snapshot) => !existingHours.has(snapshot.metadata.capture_hour))

      if (rowsToInsert.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          mode: 'archive_backfill',
          inserted: 0,
          skipped: snapshots.length,
          date: archiveDate
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const { error: insertError } = await supabase
        .from('market_telemetry')
        .insert(rowsToInsert.map((snapshot) => ({
          created_at: snapshot.created_at,
          timestamp: snapshot.timestamp,
          prices: snapshot.prices,
          grid: snapshot.grid,
          metadata: snapshot.metadata
        })))

      if (insertError) {
        console.error('[ERCOT Snapshot] Archive insert failed:', insertError)
        throw insertError
      }

      console.log(`[ERCOT Snapshot] Archived ${rowsToInsert.length} snapshots for ${archiveDate}`)

      return new Response(JSON.stringify({
        success: true,
        mode: 'archive_backfill',
        inserted: rowsToInsert.length,
        skipped: snapshots.length - rowsToInsert.length,
        date: archiveDate
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Fetch both prices and grid in parallel for the live capture path
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
