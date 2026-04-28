alter table if exists public.accounts
  add column if not exists intelligence_brief_headline text,
  add column if not exists intelligence_brief_detail text,
  add column if not exists intelligence_brief_talk_track text,
  add column if not exists intelligence_brief_signal_date date,
  add column if not exists intelligence_brief_source_url text,
  add column if not exists intelligence_brief_confidence_level text,
  add column if not exists intelligence_brief_last_refreshed_at timestamptz,
  add column if not exists intelligence_brief_status text not null default 'idle';
