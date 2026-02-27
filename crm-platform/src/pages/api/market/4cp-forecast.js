/**
 * GET /api/market/4cp-forecast
 * Computes a real-time 4CP Coincident Peak probability score from live ERCOT grid metrics.
 * 
 * Scoring model (heuristic, ERCOT-domain logic):
 *  - Load % of seasonal historical peak     → 35 pts
 *  - Reserves below 5,000 MW               → 20 pts
 *  - In the 4CP window (2pm-6pm, Jun-Sep)  → 20 pts
 *  - Hub price > $100/MWh                  → 15 pts
 *  - Scarcity probability signal            → 10 pts
 */
import { cors } from '../_cors.js'
import logger from '../_logger.js'

// ERCOT historical seasonal peaks (MW) — used for load% calculation.
// Source: ERCOT seasonal peak demand records (last 5-year avg summer peak ~75,000 MW).
const ERCOT_HISTORICAL_PEAK_MW = 80_000

export default async function handler(req, res) {
    if (cors(req, res)) return
    if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Method not allowed' }))
    }

    try {
        // Fetch live grid data from the existing ERCOT handler
        const base = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000'

        const [gridRes, priceRes] = await Promise.all([
            fetch(`${base}/api/market/ercot?type=grid`),
            fetch(`${base}/api/market/ercot?type=prices`)
        ])

        let grid = null
        let prices = null

        if (gridRes.ok) {
            const gd = await gridRes.json()
            grid = gd.metrics || null
        }
        if (priceRes.ok) {
            const pd = await priceRes.json()
            prices = pd.prices || null
        }

        const now = new Date()
        // Convert UTC to Central Time (CST = UTC-6, CDT = UTC-5)
        const centralOffset = isCDT(now) ? -5 : -6
        const centralHour = (now.getUTCHours() + 24 + centralOffset) % 24
        const month = now.getUTCMonth() + 1 // 1-indexed

        const isPeakSeason = month >= 6 && month <= 9 // June–September
        const isTimeWindow = centralHour >= 14 && centralHour < 18 // 2pm–6pm CDT

        let probability = 0
        const signals = []

        if (!isPeakSeason) {
            // Off-season: return baseline
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({
                probability: 0,
                riskLevel: 'OFF_SEASON',
                isPeakSeason: false,
                isTimeWindow: false,
                peaksRecorded: 0,
                peaksRemaining: 4,
                alertMessage: null,
                signals: ['Outside ERCOT 4CP monitoring window (Jun–Sep)'],
                month,
                centralHour
            }))
        }

        // --- Scoring ---

        // 1. Load % of historical peak (35 pts)
        const actualLoad = grid?.actual_load ?? 0
        const loadPct = actualLoad > 0 ? (actualLoad / ERCOT_HISTORICAL_PEAK_MW) * 100 : 0
        const loadScore = Math.min(35, (loadPct / 100) * 35)
        probability += loadScore
        if (loadPct > 85) signals.push(`Load at ${loadPct.toFixed(1)}% of seasonal maximum — critical threshold`)
        else if (loadPct > 70) signals.push(`Load at ${loadPct.toFixed(1)}% of seasonal maximum — elevated`)

        // 2. Reserves < 5,000 MW (20 pts)
        const reserves = grid?.reserves ?? Infinity
        if (reserves < 3000) {
            probability += 20
            signals.push(`Reserves critically low at ${Math.round(reserves).toLocaleString()} MW`)
        } else if (reserves < 5000) {
            probability += 12
            signals.push(`Reserves tight at ${Math.round(reserves).toLocaleString()} MW`)
        } else if (reserves < 8000) {
            probability += 5
        }

        // 3. Time window: 2pm–6pm CDT (20 pts)
        if (isTimeWindow) {
            probability += 20
            signals.push(`Within 4CP risk window: ${centralHour}:00 CDT`)
        } else if (centralHour >= 13 && centralHour < 19) {
            probability += 8
            signals.push(`Approaching 4CP risk window: ${centralHour}:00 CDT`)
        }

        // 4. Hub price signal (15 pts)
        const hubPrice = prices?.hub_avg ?? 0
        if (hubPrice > 500) {
            probability += 15
            signals.push(`Scarcity adder active: Hub at $${hubPrice.toFixed(0)}/MWh`)
        } else if (hubPrice > 100) {
            probability += 10
            signals.push(`Hub price elevated: $${hubPrice.toFixed(0)}/MWh`)
        } else if (hubPrice > 50) {
            probability += 3
        }

        // 5. Grid scarcity probability signal (10 pts)
        const scarcityProb = parseFloat(grid?.scarcity_prob ?? '0') || 0
        if (scarcityProb > 50) {
            probability += 10
            signals.push(`ERCOT scarcity probability: ${scarcityProb.toFixed(0)}%`)
        } else if (scarcityProb > 20) {
            probability += 5
        }

        probability = Math.min(100, Math.round(probability))

        let riskLevel = 'LOW'
        if (probability >= 80) riskLevel = 'BATTLE_STATIONS'
        else if (probability >= 65) riskLevel = 'CRITICAL'
        else if (probability >= 45) riskLevel = 'HIGH'
        else if (probability >= 25) riskLevel = 'MODERATE'

        const alertMessage = probability >= 80
            ? `⚡ BATTLE STATIONS — 4CP probability at ${probability}%. Call 4CP-exposed accounts immediately.`
            : probability >= 65
                ? `⚠ 4CP risk CRITICAL at ${probability}%. Prepare account outreach list.`
                : probability >= 45
                    ? `🔶 4CP risk HIGH at ${probability}%. Monitor grid closely.`
                    : null

        const response = {
            probability,
            riskLevel,
            isPeakSeason,
            isTimeWindow,
            peaksRecorded: 0, // Future: could track from Supabase
            peaksRemaining: 4,
            alertMessage,
            signals,
            gridSnapshot: {
                actualLoad,
                reserves,
                hubPrice,
                loadPct: Math.round(loadPct * 10) / 10
            },
            month,
            centralHour
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(response))
    } catch (err) {
        logger.error('[4CP Forecast] Failed:', 'MarketData', err.message)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: '4CP forecast failed', message: err.message }))
    }
}

/** Determine if we're currently in Central Daylight Time (CDT, UTC-5).
 *  CDT runs from second Sunday in March to first Sunday in November.
 */
function isCDT(date) {
    const year = date.getUTCFullYear()
    // Second Sunday in March (UTC)
    const startCDT = nthSundayOfMonth(year, 3, 2)
    // First Sunday in November (UTC)
    const endCDT = nthSundayOfMonth(year, 11, 1)
    return date >= startCDT && date < endCDT
}

function nthSundayOfMonth(year, month, nth) {
    const d = new Date(Date.UTC(year, month - 1, 1))
    const day = d.getUTCDay()
    const firstSunday = day === 0 ? 1 : 8 - day
    return new Date(Date.UTC(year, month - 1, firstSunday + (nth - 1) * 7, 7)) // 2am local = ~7am UTC
}
