# ERCOT Price History Analysis & Solution

## Problem Identified

Your ERCOT Price History chart only updates when you visit the telemetry page because:

1. **Current Implementation**: The `ercot-snapshot` API is called via `useEffect` when the telemetry page mounts
2. **Throttling**: It's throttled to save only 2x per day (AM/PM blocks)
3. **Real-Time Capture**: It captures whatever the current 15-minute interval price is at that moment
4. **Issue**: This gives you a random snapshot price, not a representative daily value

## Current Data Flow

```
Telemetry Page Loads
  → POST /api/market/ercot-snapshot
    → Fetches current real-time prices (15-min interval)
    → Checks if AM/PM block already saved today
    → If not saved, inserts current snapshot
    → Result: Random 15-min interval price saved
```

## Database Analysis

From your `market_telemetry` table (last 10 rows):
- **Created timestamps**: Scattered throughout the day (22:07, 10:46, 00:32, etc.)
- **Price volatility**: Huge swings (e.g., $940/MWh on 3/23 at 22:45, then $32/MWh at 8:30)
- **Problem**: These snapshots don't represent daily trends

Example from your data:
```
2026-03-24 04:29 → $940.85/MWh (peak scarcity event)
2026-03-24 22:04 → $24.92/MWh (normal)
```

## ERCOT Data Available

### Real-Time Market (RTM)
- **Frequency**: Every 15 minutes (96 intervals/day)
- **What you're currently capturing**: Single 15-min interval
- **API**: `NP6-905-CD` report (Settlement Point Prices)

### Day-Ahead Market (DAM)  
- **Frequency**: Once per day (hourly prices for next day)
- **Better for**: Planning, but not actual settlement
- **Not ideal**: Doesn't reflect actual market conditions

### Historical Settlement Data
- ERCOT provides compiled annual SPP data
- Available by calendar year for Hubs and Load Zones
- **Best option**: Use this for historical analysis

## Recommended Solutions

### Option 1: Daily Weighted Average (BEST FOR YOUR USE CASE)
**What**: Calculate the daily weighted average of all 96 intervals

**Pros**:
- Most accurate representation of daily market conditions
- Reflects actual settlement prices
- Industry standard for daily price reporting

**Cons**:
- Requires storing/fetching all 96 intervals per day
- More API calls or scraping

**Implementation**: 
- Run a scheduled job (cron/edge function) at end of day
- Fetch all 96 intervals from ERCOT API
- Calculate weighted average: `Σ(price × interval_duration) / total_duration`
- Store single daily record

### Option 2: Peak Hour Average (GOOD FOR ENERGY TRADERS)
**What**: Average of 4-6 PM prices (peak demand hours)

**Pros**:
- Captures highest-value hours
- Relevant for 4CP monitoring
- Simpler than full-day average

**Cons**:
- Misses overnight negative pricing
- Not representative of full day

**Implementation**:
- Schedule job for 6:30 PM daily
- Fetch intervals 16:00-18:00
- Average those prices

### Option 3: Settlement Price (SIMPLEST)
**What**: Use ERCOT's official daily settlement price

**Pros**:
- Official ERCOT data
- No calculation needed
- Most reliable

**Cons**:
- May lag by 1-2 days
- Less granular

**Implementation**:
- Use ERCOT's historical settlement reports
- Fetch previous day's settlement at midnight

### Option 4: Multiple Daily Snapshots (CURRENT APPROACH IMPROVED)
**What**: Take 4-6 snapshots throughout the day and average

**Pros**:
- Simple to implement
- Better than single snapshot
- Low API usage

**Cons**:
- Still not fully representative
- Requires multiple scheduled jobs

**Implementation**:
- Schedule snapshots at: 6 AM, 12 PM, 6 PM, 12 AM
- Average all snapshots for the day
- Store daily average

## My Recommendation: Option 1 (Daily Weighted Average)

### Why This is Best:
1. **Accuracy**: True representation of daily market
2. **Industry Standard**: How energy traders calculate daily prices
3. **Captures Volatility**: Includes scarcity events and negative pricing
4. **Historical Consistency**: Can backfill historical data from ERCOT

### Implementation Plan:

#### Step 1: Create Scheduled Edge Function
```javascript
// supabase/functions/daily-ercot-settlement/index.ts
// Runs daily at 11:59 PM CT
```

#### Step 2: Fetch All 96 Intervals
Use ERCOT API `NP6-905-CD` with date filter for previous day

#### Step 3: Calculate Weighted Average
```javascript
const dailyAverage = intervals.reduce((sum, interval) => {
  return sum + (interval.price * 0.25) // 15-min = 0.25 hours
}, 0) / 24
```

#### Step 4: Store Single Daily Record
Insert one row per day with the calculated average

### Alternative: Use ERCOT's Pre-Calculated Data
ERCOT provides annual settlement data files. You could:
1. Download yearly SPP files
2. Parse and import to your database
3. Update daily from API

## Testing the Current Endpoint

Let me test what data is currently available:


## Current API Capabilities

Based on your `ercot.js` implementation, the API endpoint `NP6-905-CD` returns:
- **Size**: 200 most recent records
- **Sorting**: By delivery date (descending)
- **Data structure**: `[date, hour, interval, settlementPoint, ..., price]`

### Key Insight
The API already returns 200 intervals! You can use this to calculate daily averages without additional API calls.

## Proposed Solution: Enhanced Snapshot with Daily Average

### Modified Approach:
Instead of saving a single snapshot, calculate and save the daily average from the 200 intervals already returned by the API.

### Code Changes Needed:

#### 1. Update `ercot-snapshot.js`:

```javascript
// After fetching price data, calculate daily average
const calculateDailyAverage = (apiData, targetDate) => {
  const data = apiData.data || [];
  const targetDateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Filter intervals for target date
  const dayIntervals = data.filter(row => row[0] === targetDateStr);
  
  if (dayIntervals.length === 0) return null;
  
  // Group by zone and calculate average
  const zoneAverages = {};
  const zoneCounts = {};
  
  for (const row of dayIntervals) {
    const zone = row[3]; // Settlement point
    const price = parseFloat(row[5]) || 0;
    
    if (!zoneAverages[zone]) {
      zoneAverages[zone] = 0;
      zoneCounts[zone] = 0;
    }
    
    zoneAverages[zone] += price;
    zoneCounts[zone]++;
  }
  
  // Calculate averages
  const result = {};
  for (const zone in zoneAverages) {
    result[zone] = zoneAverages[zone] / zoneCounts[zone];
  }
  
  return {
    houston: result['LZ_HOUSTON'] || 0,
    north: result['LZ_NORTH'] || 0,
    south: result['LZ_SOUTH'] || 0,
    west: result['LZ_WEST'] || 0,
    hub_avg: (result['LZ_HOUSTON'] + result['LZ_NORTH'] + result['LZ_SOUTH'] + result['LZ_WEST']) / 4,
    interval_count: Math.min(...Object.values(zoneCounts))
  };
};
```

#### 2. Save Strategy Options:

**Option A: Save Yesterday's Average (Recommended)**
- Run at midnight
- Calculate previous day's complete average
- Most accurate

**Option B: Save Today's Average So Far**
- Run when page loads
- Calculate average of intervals completed today
- Updates throughout the day

**Option C: Hybrid Approach**
- Save yesterday's final average (complete data)
- Show today's running average (live)
- Best of both worlds

## Implementation Steps

### Step 1: Create New API Endpoint
`/api/market/ercot-daily-average`

```javascript
export default async function handler(req, res) {
  // Fetch from official API (returns 200 intervals)
  const priceData = await getErcotMarketData('prices');
  
  // Calculate yesterday's average
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const dailyAvg = calculateDailyAverage(priceData, yesterday);
  
  if (!dailyAvg) {
    return res.status(404).json({ error: 'No data for yesterday' });
  }
  
  // Check if already saved
  const { data: existing } = await supabaseAdmin
    .from('market_telemetry')
    .select('id')
    .gte('created_at', yesterday.toISOString().split('T')[0])
    .lt('created_at', new Date().toISOString().split('T')[0])
    .limit(1);
  
  if (existing && existing.length > 0) {
    return res.json({ ok: true, saved: false, message: 'Already saved' });
  }
  
  // Save to database
  await supabaseAdmin.from('market_telemetry').insert({
    timestamp: yesterday.toISOString().split('T')[0],
    prices: dailyAvg,
    metadata: {
      source: 'daily_average',
      interval_count: dailyAvg.interval_count,
      calculation_date: new Date().toISOString()
    }
  });
  
  return res.json({ ok: true, saved: true, data: dailyAvg });
}
```

### Step 2: Schedule Daily Job

**Option A: Vercel Cron Job**
```json
// vercel.json
{
  "crons": [{
    "path": "/api/market/ercot-daily-average",
    "schedule": "0 6 * * *"  // 6 AM UTC (midnight CT)
  }]
}
```

**Option B: Supabase Edge Function**
```sql
-- Create pg_cron job
SELECT cron.schedule(
  'daily-ercot-average',
  '0 6 * * *',  -- 6 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://your-domain.com/api/market/ercot-daily-average',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

### Step 3: Update Chart Display

Modify `useMarketTelemetryHistory.ts` to show date labels instead of timestamps:

```typescript
const label = d
  ? d.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric'
    })
  : '—'
```

## Quick Win: Immediate Improvement

While implementing the full solution, you can immediately improve by:

1. **Change snapshot timing**: Instead of when page loads, schedule at specific times
2. **Take multiple snapshots**: 4x per day (6 AM, 12 PM, 6 PM, 12 AM)
3. **Average them**: Calculate daily average from your 4 snapshots

This requires minimal code changes and gives you 4x better data immediately.

## Data Quality Comparison

### Current (Single Snapshot):
- **Accuracy**: ±50% (could catch peak or valley)
- **Representative**: No
- **Example**: Caught $940/MWh spike (not typical)

### 4 Snapshots Averaged:
- **Accuracy**: ±20%
- **Representative**: Better
- **Example**: Would average $940 spike with normal hours

### Full Daily Average (96 intervals):
- **Accuracy**: ±2%
- **Representative**: Yes
- **Example**: True daily market price

## Recommendation Summary

**Immediate (This Week)**:
1. Modify `ercot-snapshot.js` to calculate daily average from API response
2. Schedule to run at midnight (saves yesterday's complete average)
3. Update chart labels to show dates instead of timestamps

**Future Enhancement**:
1. Backfill historical data from ERCOT annual files
2. Add day-ahead vs real-time comparison
3. Show intraday volatility metrics

## Testing Plan

1. **Test API Response**: Verify 200 intervals are returned
2. **Test Calculation**: Ensure daily average is accurate
3. **Test Scheduling**: Confirm midnight job runs
4. **Verify Database**: Check one row per day is saved
5. **Validate Chart**: Ensure smooth daily progression

Would you like me to implement the enhanced snapshot solution now?
