select created_at, timestamp, metadata->>'source' as source, metadata->>'capture_hour' as capture_hour, prices->>'hub_avg' as hub_avg
from public.market_telemetry
where metadata->>'source' = 'ercot_archive_backfill' and metadata->>'operating_day' = '04/15/2026'
order by created_at;
