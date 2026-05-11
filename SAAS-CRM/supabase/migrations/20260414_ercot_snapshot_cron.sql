-- Migration: Set up automated ERCOT price snapshot capture
-- Purpose: Capture market prices 4x daily at strategic hours to build accurate historical data
-- 
-- Schedule: 7am, 12pm, 5pm, 10pm Central Time (peak demand hours)
-- These times capture: morning ramp, midday peak, evening peak, and late night baseline

-- Remove old manual snapshot cron if it exists
SELECT cron.unschedule('ercot-snapshot-manual') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ercot-snapshot-manual'
);

-- Schedule ERCOT snapshot capture at strategic hours (Central Time = UTC-6 in winter, UTC-5 in summer)
-- Using UTC times: 1pm, 6pm, 11pm, 4am UTC (covers both DST scenarios)
SELECT cron.schedule(
  'ercot-snapshot-morning',
  '0 13 * * *', -- 7am CT (1pm UTC)
  $$
    SELECT net.http_post(
      url := 'https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot',
      headers := '{"Content-Type":"application/json","x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 25000
    );
  $$
);

SELECT cron.schedule(
  'ercot-snapshot-midday',
  '0 18 * * *', -- 12pm CT (6pm UTC)
  $$
    SELECT net.http_post(
      url := 'https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot',
      headers := '{"Content-Type":"application/json","x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 25000
    );
  $$
);

SELECT cron.schedule(
  'ercot-snapshot-evening',
  '0 23 * * *', -- 5pm CT (11pm UTC)
  $$
    SELECT net.http_post(
      url := 'https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot',
      headers := '{"Content-Type":"application/json","x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 25000
    );
  $$
);

SELECT cron.schedule(
  'ercot-snapshot-night',
  '0 4 * * *', -- 10pm CT (4am UTC next day)
  $$
    SELECT net.http_post(
      url := 'https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot',
      headers := '{"Content-Type":"application/json","x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 25000
    );
  $$
);

-- Add index on created_at for faster historical queries
CREATE INDEX IF NOT EXISTS idx_market_telemetry_created_at 
ON market_telemetry(created_at DESC);

-- Add index on metadata source for filtering cron vs manual snapshots
CREATE INDEX IF NOT EXISTS idx_market_telemetry_metadata_source 
ON market_telemetry USING gin(metadata);

COMMENT ON TABLE market_telemetry IS 'ERCOT market data snapshots captured 4x daily at peak hours (7am, 12pm, 5pm, 10pm CT) for accurate historical pricing';
