# ERCOT Price History Fix - Implementation Summary

## Problem Identified
Your ERCOT Price History chart was only updating when you manually visited the telemetry page, resulting in:
- **Sparse data**: Only 1 snapshot per day (or none on days you didn't visit)
- **Random timing**: Prices captured at whatever time you happened to open the page
- **Inaccurate representation**: Missing peak demand periods and daily price patterns
- **Poor historical analysis**: Can't see true daily price trends

Example from your data:
- March 23: 2 snapshots (one at 8:30am showing $32/MWh, one at 10:45pm showing $940/MWh spike)
- Most days: Only 1 random snapshot

## Root Cause
The old `/api/market/ercot-snapshot` endpoint used a "2x per day" throttle (AM/PM blocks), but it was only triggered when someone loaded the telemetry page. No automated capture existed.

## Solution Implemented

### 1. Automated Snapshot Capture (Supabase Edge Function)
Created `supabase/functions/capture-ercot-snapshot/index.ts`:
- Fetches real-time prices from ERCOT Official API (with Bearer token auth)
- Scrapes grid conditions from ERCOT public dashboard
- Saves complete snapshot to `market_telemetry` table
- Includes metadata: source, capture hour, transmission rates

### 2. Strategic Scheduling (pg_cron)
Set up 4 daily cron jobs at peak demand hours (Central Time):
- **7:00 AM** (13:00 UTC) - Morning ramp-up
- **12:00 PM** (18:00 UTC) - Midday peak
- **5:00 PM** (23:00 UTC) - Evening peak (highest demand)
- **10:00 PM** (04:00 UTC) - Late night baseline

These times capture the most important price points for your customers.

### 3. Smart Deduplication
Updated `/api/market/ercot-snapshot.js`:
- Now checks for snapshots in the last 2 hours before inserting
- Prevents duplicates when users visit the telemetry page
- Cron jobs run automatically, manual trigger is backup only

### 4. Database Optimization
Added indexes for faster queries:
- `idx_market_telemetry_created_at` - Speeds up historical queries
- `idx_market_telemetry_metadata_source` - Enables filtering by source type

## Files Created/Modified

### New Files
1. `supabase/functions/capture-ercot-snapshot/index.ts` - Edge function
2. `supabase/functions/capture-ercot-snapshot/README.md` - Documentation
3. `supabase/migrations/20260414_ercot_snapshot_cron.sql` - Migration

### Modified Files
1. `src/pages/api/market/ercot-snapshot.js` - Smart deduplication logic
2. `src/app/network/telemetry/page.tsx` - Updated description

## Deployment Status

✅ **Migration Applied**: Cron jobs created and active
✅ **Database Indexes**: Created successfully
✅ **Cron Jobs Active**:
   - `ercot-snapshot-morning` (jobid: 31)
   - `ercot-snapshot-midday` (jobid: 32)
   - `ercot-snapshot-evening` (jobid: 33)
   - `ercot-snapshot-night` (jobid: 34)

⚠️ **Edge Function**: Needs deployment (see below)

## Next Steps

### 1. Deploy the Edge Function
```bash
cd crm-platform
npx supabase functions deploy capture-ercot-snapshot
```

### 2. Verify Environment Variables
In Supabase Dashboard → Edge Functions → Secrets, ensure these are set:
- `ERCOT_USERNAME`
- `ERCOT_PASSWORD`
- `ERCOT_PUBLIC_API_KEY`
- `CRON_SECRET` (should be: `nodal-cron-2026`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. Test the Function
```bash
curl -X POST https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: nodal-cron-2026"
```

Expected response:
```json
{
  "success": true,
  "timestamp": "2026-04-14 15:45",
  "prices": {
    "houston": 120.64,
    "north": 19.69,
    "south": 16.94,
    "west": -8.46,
    "hub_avg": 37.20
  },
  "capture_hour": 15
}
```

### 4. Monitor Execution
Check cron job execution:
```sql
SELECT 
  j.jobname,
  d.start_time AT TIME ZONE 'America/Chicago' as ct_time,
  d.status,
  d.return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname LIKE 'ercot-snapshot%'
ORDER BY d.start_time DESC
LIMIT 10;
```

View captured data:
```sql
SELECT 
  created_at AT TIME ZONE 'America/Chicago' as ct_time,
  (prices->>'hub_avg')::numeric as hub_avg,
  metadata->>'source' as source,
  metadata->>'capture_hour' as hour
FROM market_telemetry
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

## Expected Results

### Before (Current State)
- 1 snapshot per day at random times
- Missing peak demand pricing
- Inconsistent data collection
- Chart shows sparse, irregular points

### After (Once Deployed)
- 4 snapshots per day at strategic hours
- Captures morning, midday, evening, and night pricing
- Consistent, reliable data collection
- Chart shows smooth, accurate daily price patterns
- Better insights into peak vs. off-peak pricing

## Benefits

1. **Accurate Historical Data**: Representative daily pricing patterns
2. **Peak Hour Coverage**: Captures prices during critical demand periods
3. **Reliable**: Runs automatically, no user interaction needed
4. **Efficient**: Only 4 API calls per day (stays within rate limits)
5. **Better Analysis**: Can now see true daily trends, identify patterns
6. **Customer Value**: More accurate pricing data for proposals and analysis

## Monitoring & Maintenance

### Daily Check
```sql
-- Should show ~4 snapshots per day
SELECT 
  DATE(created_at AT TIME ZONE 'America/Chicago') as date,
  COUNT(*) as snapshots,
  ROUND(AVG((prices->>'hub_avg')::numeric), 2) as avg_price
FROM market_telemetry
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at AT TIME ZONE 'America/Chicago')
ORDER BY date DESC;
```

### Troubleshooting
If snapshots aren't appearing:
1. Check Edge Function logs in Supabase Dashboard
2. Verify cron jobs are active: `SELECT * FROM cron.job WHERE jobname LIKE 'ercot%'`
3. Check execution history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20`
4. Test manual trigger: Visit `/api/market/ercot-snapshot` in browser

## Cost Impact
- **API Calls**: 4 per day (vs. unlimited with continuous polling)
- **Edge Function**: ~120 invocations/month (well within free tier)
- **Database**: Minimal storage (~1KB per snapshot = ~120KB/month)
- **Total**: Essentially free within Supabase limits

---

**Status**: Ready for deployment. Once the Edge Function is deployed, you'll start seeing 4 daily snapshots automatically captured at peak hours, giving you accurate historical ERCOT pricing data.
