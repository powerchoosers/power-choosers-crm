-- Migration: Schedule market briefing generation via Supabase pg_cron
-- Purpose: Generate a jargon-free AI market overview twice daily
-- Schedule: 7 AM and 5 PM Central Time

-- Remove old job if it exists
SELECT cron.unschedule('market-briefing-morning') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'market-briefing-morning'
);
SELECT cron.unschedule('market-briefing-evening') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'market-briefing-evening'
);

-- Morning briefing: 7 AM CT = 1 PM UTC (covers both DST scenarios roughly)
SELECT cron.schedule(
  'market-briefing-morning',
  '0 13 * * *', -- 7am CT (1pm UTC)
  $$
    SELECT net.http_post(
      url := 'https://www.nodalpoint.io/api/cron/market-briefing',
      headers := '{"Content-Type":"application/json","x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 55000
    );
  $$
);

-- Evening briefing: 5 PM CT = 11 PM UTC
SELECT cron.schedule(
  'market-briefing-evening',
  '0 23 * * *', -- 5pm CT (11pm UTC)
  $$
    SELECT net.http_post(
      url := 'https://www.nodalpoint.io/api/cron/market-briefing',
      headers := '{"Content-Type":"application/json","x-cron-secret":"nodal-cron-2026"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds => 55000
    );
  $$
);
