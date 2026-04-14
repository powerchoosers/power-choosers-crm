# ERCOT Market Snapshot Capture

## Problem
Previously, ERCOT price history was only saved when someone visited the telemetry page, resulting in:
- Sparse, irregular data points
- Prices captured at random times (not representative of daily patterns)
- Missing data on days when no one accessed the page
- Inaccurate historical charts

## Solution
Automated snapshot capture at strategic times throughout the day using Supabase Edge Functions + pg_cron.

### Capture Schedule (Central Time)
- **7:00 AM** - Morning ramp-up (residential/commercial demand increases)
- **12:00 PM** - Midday peak (commercial peak, solar generation peak)
- **5:00 PM** - Evening peak (highest demand, solar declining)
- **10:00 PM** - Late night baseline (lowest demand)

These 4 daily snapshots provide:
- Representative coverage of daily price patterns
- Capture of peak demand pricing (most important for customers)
- Baseline pricing for comparison
- Consistent data for accurate historical charting

### Data Captured
Each snapshot includes:
- **Zonal Prices**: LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST
- **Hub Average**: Calculated average across all zones
- **Grid Conditions**: Load, capacity, reserves, wind/solar generation
- **Metadata**: Source, timestamp, capture hour, transmission rates

## Architecture

### Components
1. **Edge Function** (`capture-ercot-snapshot/index.ts`)
   - Fetches real-time prices from ERCOT Official API
   - Scrapes grid conditions from ERCOT public dashboard
   - Stores snapshot in `market_telemetry` table

2. **Cron Jobs** (4 scheduled jobs via pg_cron)
   - `ercot-snapshot-morning` - 7am CT (13:00 UTC)
   - `ercot-snapshot-midday` - 12pm CT (18:00 UTC)
   - `ercot-snapshot-evening` - 5pm CT (23:00 UTC)
   - `ercot-snapshot-night` - 10pm CT (04:00 UTC next day)

3. **Manual Trigger** (`/api/market/ercot-snapshot`)
   - Still available for on-demand captures
   - Now checks for recent snapshots (2hr window) to avoid duplicates
   - Used by telemetry page on mount

## Deployment

### 1. Deploy Edge Function
```bash
cd crm-platform
npx supabase functions deploy capture-ercot-snapshot
```

### 2. Set Environment Variables
In Supabase Dashboard → Edge Functions → Secrets:
```
ERCOT_USERNAME=your_username
ERCOT_PASSWORD=your_password
ERCOT_PUBLIC_API_KEY=your_api_key
CRON_SECRET=nodal-cron-2026
SUPABASE_URL=https://gfitvnkaevozbcyostez.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Run Migration
```bash
npx supabase db push
```

Or manually apply the migration:
```sql
-- Run the SQL in: supabase/migrations/20260414_ercot_snapshot_cron.sql
```

## Monitoring

### Check Cron Jobs
```sql
SELECT jobid, jobname, schedule, active, last_run_status
FROM cron.job
WHERE jobname LIKE 'ercot-snapshot%';
```

### View Recent Captures
```sql
SELECT 
  created_at AT TIME ZONE 'America/Chicago' as ct_time,
  (prices->>'hub_avg')::numeric as hub_avg,
  metadata->>'source' as source,
  metadata->>'capture_hour' as capture_hour
FROM market_telemetry
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Check Cron Execution History
```sql
SELECT 
  jobid,
  start_time AT TIME ZONE 'America/Chicago' as ct_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE 'ercot-snapshot%'
)
ORDER BY start_time DESC
LIMIT 20;
```

## Testing

### Manual Test
```bash
curl -X POST https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: nodal-cron-2026"
```

### Verify Data Quality
```sql
-- Check daily snapshot count (should be ~4 per day)
SELECT 
  DATE(created_at AT TIME ZONE 'America/Chicago') as date,
  COUNT(*) as snapshots,
  AVG((prices->>'hub_avg')::numeric) as avg_price,
  MIN((prices->>'hub_avg')::numeric) as min_price,
  MAX((prices->>'hub_avg')::numeric) as max_price
FROM market_telemetry
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at AT TIME ZONE 'America/Chicago')
ORDER BY date DESC;
```

## Benefits

1. **Accurate Historical Data**: 4 snapshots per day provide representative daily pricing
2. **Peak Hour Coverage**: Captures prices during critical demand periods
3. **Reliable**: Runs automatically, no dependency on user visits
4. **Efficient**: Only 4 captures per day (vs. continuous polling)
5. **Cost-Effective**: Minimal API calls, stays within ERCOT rate limits

## Future Enhancements

- Add daily/weekly price aggregation table for faster queries
- Implement price spike detection and alerts
- Calculate daily weighted averages based on demand curves
- Add historical comparison features (YoY, MoM)
