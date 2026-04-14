-- Verification Queries for ERCOT Snapshot System

-- 1. Check that cron jobs are active
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  CASE 
    WHEN schedule = '0 13 * * *' THEN '7am CT'
    WHEN schedule = '0 18 * * *' THEN '12pm CT'
    WHEN schedule = '0 23 * * *' THEN '5pm CT'
    WHEN schedule = '0 4 * * *' THEN '10pm CT'
  END as capture_time
FROM cron.job
WHERE jobname LIKE 'ercot-snapshot%'
ORDER BY schedule;

-- 2. View recent snapshot captures (last 7 days)
SELECT 
  created_at AT TIME ZONE 'America/Chicago' as ct_time,
  EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Chicago') as hour,
  (prices->>'hub_avg')::numeric as hub_avg,
  (prices->>'houston')::numeric as houston,
  (prices->>'north')::numeric as north,
  (prices->>'south')::numeric as south,
  (prices->>'west')::numeric as west,
  metadata->>'source' as source,
  metadata->>'capture_hour' as capture_hour
FROM market_telemetry
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- 3. Daily snapshot count (should be ~4 per day after deployment)
SELECT 
  DATE(created_at AT TIME ZONE 'America/Chicago') as date,
  COUNT(*) as snapshots_per_day,
  ROUND(AVG((prices->>'hub_avg')::numeric), 2) as avg_hub_price,
  ROUND(MIN((prices->>'hub_avg')::numeric), 2) as min_hub_price,
  ROUND(MAX((prices->>'hub_avg')::numeric), 2) as max_hub_price,
  ROUND(MAX((prices->>'hub_avg')::numeric) - MIN((prices->>'hub_avg')::numeric), 2) as daily_spread
FROM market_telemetry
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at AT TIME ZONE 'America/Chicago')
ORDER BY date DESC;

-- 4. Check cron execution history
SELECT 
  j.jobname,
  d.start_time AT TIME ZONE 'America/Chicago' as ct_time,
  d.status,
  LEFT(d.return_message, 100) as message_preview
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname LIKE 'ercot-snapshot%'
ORDER BY d.start_time DESC
LIMIT 20;

-- 5. Hourly distribution of captures (should cluster around 7am, 12pm, 5pm, 10pm CT)
SELECT 
  EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Chicago') as hour_ct,
  COUNT(*) as capture_count,
  ROUND(AVG((prices->>'hub_avg')::numeric), 2) as avg_price
FROM market_telemetry
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Chicago')
ORDER BY hour_ct;

-- 6. Price volatility by capture hour (peak hours should show higher prices)
SELECT 
  metadata->>'capture_hour' as capture_hour,
  CASE 
    WHEN metadata->>'capture_hour' = '7' THEN 'Morning Ramp'
    WHEN metadata->>'capture_hour' = '12' THEN 'Midday Peak'
    WHEN metadata->>'capture_hour' = '17' THEN 'Evening Peak'
    WHEN metadata->>'capture_hour' = '22' THEN 'Night Baseline'
    ELSE 'Other'
  END as period_name,
  COUNT(*) as samples,
  ROUND(AVG((prices->>'hub_avg')::numeric), 2) as avg_price,
  ROUND(MIN((prices->>'hub_avg')::numeric), 2) as min_price,
  ROUND(MAX((prices->>'hub_avg')::numeric), 2) as max_price
FROM market_telemetry
WHERE metadata->>'source' = 'cron_snapshot'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY metadata->>'capture_hour'
ORDER BY metadata->>'capture_hour';

-- 7. Data quality check (look for gaps or missing snapshots)
WITH expected_snapshots AS (
  SELECT 
    DATE(created_at AT TIME ZONE 'America/Chicago') as date,
    COUNT(*) as actual_count,
    4 as expected_count
  FROM market_telemetry
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at AT TIME ZONE 'America/Chicago')
)
SELECT 
  date,
  actual_count,
  expected_count,
  CASE 
    WHEN actual_count >= expected_count THEN '✅ Complete'
    WHEN actual_count >= 2 THEN '⚠️ Partial'
    ELSE '❌ Missing'
  END as status
FROM expected_snapshots
ORDER BY date DESC;
