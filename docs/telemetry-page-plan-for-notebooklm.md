# Real Telemetry Page Plan — For NotebookLM

**Goal:** Repurpose the existing telemetry/market UI into a **single, real-data telemetry page** that shows live ERCOT and EIA market data. We do **not** have access to energy plans or retail offers via API yet, so the page should focus entirely on **market telemetry** (prices, grid conditions, and EIA datasets we can already fetch).

This document catalogs (1) all API features and data we have today, (2) current telemetry/market pages and what is real vs placeholder, and (3) a concrete plan for what to build.

---

## Part 1: ERCOT API (`/api/market/ercot`)

**Base URL (from app):** `GET /api/market/ercot` (proxied from Next.js to Node backend at 3001).

**Query parameters:**
- `type` — `prices` | `grid` (required in practice; defaults to `prices`).
- `scraper=1` — Optional; forces use of public HTML scraper instead of official ERCOT API.

**Data sources (in order of use):**
1. **Official ERCOT API** — Used when `ERCOT_API_KEY` or `ERCOT_PUBLIC_API_KEY` and `ERCOT_USERNAME` / `ERCOT_PASSWORD` are set. Short timeout (~9s), then fallback to scraper.
2. **Scraper** — Public ERCOT CDR HTML pages when API is unavailable or times out.

---

### ERCOT `type=prices`

**Purpose:** Real-time settlement point prices by load zone ($/MWh).

**Response shape:**
```json
{
  "source": "ERCOT Official API" | "ERCOT Public CDR (Scraper)",
  "timestamp": "YYYY-MM-DD HH:MM" (or similar),
  "prices": {
    "houston": 24.15,
    "north": 21.20,
    "south": 22.40,
    "west": 45.20,
    "hub_avg": 28.24
  },
  "metadata": {
    "last_updated": "ISO8601",
    "report_id": "NP6-905-CD" (if API),
    "url": "..." (if scraper)
  }
}
```

**Features:**
- **LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST** — Real-time $/MWh per zone.
- **hub_avg** — Average of the four zones (API) or from scraper cell.
- **timestamp** — From report or HTML.

**Use on telemetry page:** Primary “live price” block; show all four zones + hub average; optionally small sparkline or “last N” if we add history later.

---

### ERCOT `type=grid`

**Purpose:** System load, capacity, reserves, and related grid metrics.

**Response shape:**
```json
{
  "source": "ERCOT Official API" | "ERCOT Public CDR (Scraper)",
  "timestamp": "YYYY-MM-DD HH:MM" (or similar),
  "metrics": {
    "actual_load": 45000,
    "forecast_load": 47250,
    "total_capacity": 51750,
    "reserves": 6750,
    "scarcity_prob": 4.2,
    "wind_gen": 6750,
    "pv_gen": 3600,
    "frequency": 60.0
  },
  "metadata": {
    "last_updated": "ISO8601",
    "report_id": "NP6-345-CD" (if API)
  }
}
```

**Features:**
- **actual_load** — MW (from API report or scraper “Actual System Demand”).
- **forecast_load** — Only from API (derived); scraper does not provide it.
- **total_capacity** — MW (API derived or scraper “Total System Capacity”).
- **reserves** — MW (capacity − load in API; not direct in scraper).
- **scarcity_prob** — Derived in API; not from scraper.
- **wind_gen** — MW (scraper “Total Wind Output”; API may derive).
- **pv_gen** — MW (scraper “Total PVGR Output”; API may derive).
- **frequency** — Hz (scraper “Current Frequency”; API may default 60).
- **net_load** — Only from scraper (“Average Net Load”), not in API response.

**Use on telemetry page:** “Grid conditions” section: actual load, capacity, reserves, wind/solar output, frequency, and optionally a simple “stress” or “scarcity” indicator derived from reserves/scarcity_prob.

---

## Part 2: EIA API (`/api/market/eia`)

**Base URL:** `GET /api/market/eia`.

**Query parameters (passed through to EIA API v2):**
- `route` — Path into EIA hierarchy (e.g. `electricity`, `electricity/retail-sales`, `natural-gas/storage`). Required for meaningful results.
- `data=1` — If set, appends `/data` to the route and requests data rows (default length 5 if not specified).
- All other query params (e.g. `length`, `frequency`, `facets`, `start`, `end`, `data[]`) are forwarded to EIA.

**Authentication:** Requires `EIA_API_KEY` in backend env.

**Response shape (unified by our handler):**
```json
{
  "route": "electricity/retail-sales/data",
  "mode": "discovery" | "data_sample",
  "description": "EIA electricity survey data",
  "catalog": [ ... ],
  "metadata": {
    "name": "...",
    "frequency": [ ... ],
    "facets": [ ... ],
    "total": "7440"
  },
  "debug": { "url": "..." }
}
```

- **Discovery (no `data=1`):** `catalog` = child routes or dataset metadata (e.g. list of sub-routes with id, name, description).
- **Data (`data=1`):** `catalog` = array of data rows (e.g. period, stateid, sectorid, price, etc.).

**EIA v2 hierarchy (relevant to Texas / ERCOT context):**
- **electricity** — Child routes: retail-sales, electric-power-operational-data, rto, state-electricity-profiles, operating-generator-capacity, facility-fuel.
- **electricity/retail-sales** — Sales to ultimate customers by state/sector (customers, revenue, sales MWh, price). Frequencies: monthly, quarterly, yearly. Facets: stateid, sectorid.
- **electricity/electric-power-operational-data** — Monthly/annual operations by state, sector, energy source.
- **electricity/rto** — Daily/hourly by balancing authority (good for ERCOT-level view).
- **electricity/state-electricity-profiles** — State-specific data.
- **natural-gas/** — Production, prices, storage, etc. (useful for gas-driven power and prices).
- **petroleum/** — Crude, prices, consumption.

**Features we can use without an “energy plans” API:**
- **Retail electricity prices by state** — e.g. Texas average price by sector (residential, commercial, etc.) and by month/quarter/year.
- **Power operations** — Generation by fuel type, state, sector.
- **RTO/balancing authority** — Aligns with ERCOT.
- **Natural gas storage/prices** — Context for power prices.
- **Time series** — Use `start`, `end`, `length`, `frequency` to get recent periods (e.g. last 12 months) for charts or tables.

**Use on telemetry page:** Sections such as “EIA — Texas retail price trend” (e.g. electricity/retail-sales with state=TX, data=1, length=12), “EIA — Generation mix” (electric-power-operational-data), or “EIA — Natural gas” (storage or price). All via same `/api/market/eia` endpoint with different `route` and params.

---

## Part 3: Current App Usage (What Is Real vs Placeholder)

**Frontend data layer:**
- **useMarketPulse** — Calls `/api/market/ercot?type=prices` and `/api/market/ercot?type=grid`, merges into one object: `prices` (houston, north, south, west, hub_avg) and `grid` (actual_load, forecast_load, total_capacity, reserves, scarcity_prob, wind_gen, pv_gen, frequency). Fallback: Supabase `market_telemetry` table if live API fails.
- **EIA** — Not currently used by the telemetry/market UI. Only the backend proxy exists; no frontend hook or component calls it yet.

**Current “telemetry” surfaces:**
1. **TelemetryWidget (right panel)** — Used on contact/account dossier. Shows: Local time (real), Weather (hardcoded “72°F Clear”), Volatility Index (real: from price, reserves, capacity, scarcity). So: one real metric (volatility), rest mixed/placeholder.
2. **MarketPulseWidget (right panel, scanning mode)** — Shows LZ_HOUSTON and LZ_NORTH prices (real), Grid Reserves (real), Scarcity % (real). All from useMarketPulse. Good candidate to reuse/expand.
3. **Market data page (public, /market-data)** — One big Houston price (real), “Live Feed” badge, abstract static chart, “Grid Stress: Nominal” (static), “Wind 12,450 MW” / “Predicted Peak 58,000 MW” (static). Only the single price is live.
4. **Energy page (/network/energy)** — “Energy Plans” table from useEnergyPlans: **100% mock data** (Reliant, TXU, etc.). No API for retail plans; this is placeholder.

**Conclusion:** Real data today = ERCOT prices (all 4 zones + hub) and ERCOT grid (load, capacity, reserves, scarcity, wind, PV, frequency). EIA is available from backend but unused in UI. “Energy plans” do not exist in any API; that page should be repurposed or clearly labeled as demo.

---

## Part 4: What Real Data We Can Put on the Telemetry Page

**From ERCOT (already in use or trivial to add):**
- **All four zone prices** — LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST ($/MWh) and hub average.
- **Grid metrics** — Actual load (MW), total capacity (MW), reserves (MW), reserve %.
- **Scarcity / stress** — Scarcity probability or a simple “stress” level derived from reserves and price.
- **Generation** — Wind (MW), solar/PV (MW); optionally “net load” when using scraper.
- **Frequency** — Hz (when available from scraper/API).
- **Timestamp** — “Last updated” for each feed.

**From EIA (new on telemetry page):**
- **Texas retail electricity price** — e.g. electricity/retail-sales, facet state=TX, last 12 months; show as table or trend.
- **Generation mix** — electric-power-operational-data by fuel/state (e.g. Texas) for recent period.
- **RTO/balancing authority** — electricity/rto for ERCOT-relevant series.
- **Natural gas** — Storage or price series for context (e.g. short-term outlook).

**Do not rely on (no API):**
- Retail energy plans, offers, or rates from a “plans API.”
- Real-time weather (unless we add a separate weather API later).

---

## Part 5: Plan for the Real Telemetry Page (For NotebookLM to Expand)

**Objective:** One dedicated “Telemetry” or “Market” page (e.g. under `/network/energy` or a new `/network/telemetry`) that:
- Uses **only real data**: ERCOT (prices + grid) and, where useful, EIA.
- Repurposes the existing “Energy Plans” table view: either replace it with a “Market telemetry” layout or add a clear “Telemetry” tab/section that becomes the main content, and keep “Plans” as a “Coming soon” or demo section.

**Suggested structure:**

1. **ERCOT — Live prices**
   - Card or table: LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST, hub_avg ($/MWh).
   - Source/timestamp and “Live” vs “Last saved” indicator (reuse useMarketPulse logic).

2. **ERCOT — Grid conditions**
   - Actual load, total capacity, reserves (MW and %).
   - Wind output, PV output (MW).
   - Optional: frequency, scarcity %, and a simple “Grid stress” label (e.g. Nominal / Elevated / High) from reserves and scarcity.

3. **Volatility / stress**
   - Reuse or adapt TelemetryWidget’s volatility index (already uses price, reserves, capacity, scarcity).
   - Optional: same formula on the page with a short explanation.

4. **EIA — Texas & market context**
   - One or two sections fed by `/api/market/eia`:
     - **Texas retail price trend:** route `electricity/retail-sales/data`, facet state=TX, length=12, frequency=monthly (or quarterly). Show as table or simple chart.
     - **Generation or RTO:** e.g. electricity/rto or electric-power-operational-data for Texas/recent period.
   - Label source as “EIA” and “Not real-time” (e.g. monthly).

5. **Weather (replace placeholder)**
   - Use **Google Maps API** (or related Google APIs) for weather and other local information to replace the current weather placeholder on the telemetry/market view.

6. **Technical**
   - Keep using **useMarketPulse** for ERCOT (prices + grid). Extend if needed to expose south/west and all grid fields consistently.
   - Add a small **useEIA** (or inline fetch) for selected EIA routes; call `/api/market/eia?route=...&data=1&...` and map response to tables/trends.
   - Reuse existing design system (cards, font-mono, zinc/blue, “forensic” look) from TelemetryWidget and MarketPulseWidget.

**Deliverable for NotebookLM:** Use this document to formulate a step-by-step implementation plan (e.g. “Step 1: Add ERCOT all-zones price block; Step 2: Add grid conditions block; Step 3: Add EIA Texas retail price section; Step 4: Replace static market-data page numbers with ERCOT; Step 5: Consolidate Energy page to telemetry-first with plans as secondary/mock”) and, if desired, copy for the codebase as a short `docs/telemetry-implementation.md` or add to the project’s feature-tracking.

---

## Part 6: Live Response Samples (Server Run)

These samples were captured with the server running via `node scripts/dump-api-responses.cjs` (writes to `scripts/output/`). Use them to see exactly what each endpoint returns so NotebookLM does not suggest features we don’t have.

### ERCOT `type=prices` (actual response)

- **Single snapshot only** — One timestamp, one set of prices. The backend does **not** return an array of past intervals.
- **Example:** `"timestamp": "2026-02-07 1:0"`, `prices`: houston 23.04, north 21.9, south 25, west 67.2, hub_avg 34.285 ($/MWh). Source: ERCOT Official API, report_id NP6-905-CD.
- **Important:** The official ERCOT API is called with `size=5` (five 15‑minute intervals). Our code uses only `data[0]`. So we **could** expose the last 5 intervals (~75 minutes of “mini history”) by returning a `data` array from the handler—no new API, just a backend change. Today we do not.

### ERCOT `type=grid` (actual response)

- **Single snapshot.** Example: `timestamp`: "2026-02-06 01:00", `actual_load`: 46415.88, `forecast_load`: 48736.674, `total_capacity`: 53378.26, `reserves`: 6962, `scarcity_prob`: 0, `wind_gen`: 6962.38, `pv_gen`: 3713.27, `frequency`: 60. Report NP6-345-CD.
- No array of historical grid snapshots in our response. For historical grid we would need to **store snapshots ourselves** (see below).

### EIA electricity discovery (actual response)

- **route:** `electricity`, **mode:** discovery. **catalog:** 6 child routes: retail-sales, electric-power-operational-data, rto, state-electricity-profiles, operating-generator-capacity, facility-fuel (each with id, name, description). **metadata.name:** "Electricity".

### EIA retail-sales data, TX, monthly (actual response)

- **route:** `electricity/retail-sales/data`, **mode:** data_sample.
- **catalog:** Array of rows. Each row: `period` (e.g. "2025-11", "2025-10"), `stateid`, `stateDescription`, `sectorid`, `sectorName`, `price` (cents/kWh, string), `price-units`.
- **Sectors:** ALL, COM (commercial), IND (industrial), OTH (other), RES (residential), TRA (transportation). Some sectors can have `price: null`.
- **metadata:** `frequency`: "monthly", `total`: "1794" (total rows matching the query). So we have **real historical monthly data**; we can request more months with `length=72` (12 months × 6 sectors) and paginate with `offset`/`length` (max 5000 per request).
- **Sort:** Use `sort[0][column]=period&sort[0][direction]=desc` to get **most recent months first**. Without sort, default order can vary (per EIA v2.1.9).
- **Date range / 2026:** EIA publishes with a lag (often 1–2 months). The same request returns the newest available data each time; there is no “2026” until EIA releases those months. The chart therefore **updates as months go on** (newest 12 months of published data).
- **What the “price” is:** State-level **average price to ultimate customers** (cents/kWh), blended across utilities and customers. So it is **smoother** than ERCOT wholesale or single-bill summer spikes; the series is accurate but reflects statewide averages, not real-time or load-zone spikes.
- **Use on telemetry:** Texas retail price trend by month and by sector (COM vs IND) — all from this one route.

### What we do NOT get from the endpoints (avoid suggesting these)

- **ERCOT:** No multi-day or multi-week history in our current responses. No day-ahead (DAM) prices from our handler (different ERCOT reports, e.g. NP4-190-CD, would be needed). No forecast beyond what’s in the grid snapshot.
- **EIA:** No real-time or sub-daily data for retail-sales; it’s monthly/quarterly/annual. No “energy plans” or retail offers.

### Storing data to build historical graphs

- We already have a **Supabase `market_telemetry`** table (prices jsonb, grid jsonb, timestamp, metadata). The app uses it as a fallback when the live ERCOT API fails.
- **Recommendation:** Periodically (e.g. every 15–60 minutes) insert a row from the ERCOT prices + grid response into `market_telemetry`. Then the telemetry page can query last 24h / 7d / 30d and chart **our own** historical series (e.g. LZ_HOUSTON over time, or actual_load over time). No change to ERCOT or EIA APIs required.
- EIA already gives historical months; we don’t need to store it for retail-sales unless we want to cache.

### How to re-run the dump

1. Start the backend (e.g. `npm run dev:all` or `node server.js` on port 3001).
2. Run: `node scripts/dump-api-responses.cjs`
3. Inspect `scripts/output/ercot-prices.json`, `ercot-grid.json`, `eia-electricity-discovery.json`, `eia-retail-sales-sample.json`.

---

## Quick Reference: API Endpoints and Shapes

| Endpoint | Method | Params | Returns |
|----------|--------|--------|---------|
| `/api/market/ercot` | GET | `type=prices` | `{ source, timestamp, prices: { houston, north, south, west, hub_avg }, metadata }` |
| `/api/market/ercot` | GET | `type=grid` | `{ source, timestamp, metrics: { actual_load, forecast_load, total_capacity, reserves, scarcity_prob, wind_gen, pv_gen, frequency }, metadata }` |
| `/api/market/eia` | GET | `route=electricity` | Discovery: catalog of child routes (retail-sales, rto, ...). |
| `/api/market/eia` | GET | `route=electricity/retail-sales&data=1&length=12&facets[stateid][]=TX` | Data: array of rows (period, stateid, sectorid, price, ...). |

---

*Document generated for NotebookLM to create a concrete implementation plan for the real telemetry page. No energy plans API is available; all content must be driven by ERCOT and EIA market data.*
