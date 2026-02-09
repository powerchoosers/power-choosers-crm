-- Daily cron: call backend to refresh Apollo news for domains not refreshed in 7 days
-- Backend URL and secret: set in Dashboard -> Vault (apollo_news_cron_url, apollo_news_cron_secret)
-- If apollo_news_cron_url is not set, the job no-ops.

create or replace function util.refresh_apollo_news_via_backend()
returns void
language plpgsql
security definer
as $$
declare
  cron_url text;
  cron_secret text;
begin
  begin
    select decrypted_secret into cron_url from vault.decrypted_secrets where name = 'apollo_news_cron_url' limit 1;
  exception when others then
    return;
  end;
  if cron_url is null or cron_url = '' then
    return;
  end if;
  begin
    select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'apollo_news_cron_secret' limit 1;
  exception when others then
    cron_secret := null;
  end;

  perform net.http_post(
    url => rtrim(cron_url, '/') || '/api/cron/refresh-apollo-news',
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(cron_secret, '')
    ),
    body => '{}'::jsonb,
    timeout_milliseconds => 120000
  );
end;
$$;

-- Run daily at 2:00 AM UTC
select cron.schedule(
  'refresh-apollo-news-7day',
  '0 2 * * *',
  $$select util.refresh_apollo_news_via_backend();$$
);

comment on function util.refresh_apollo_news_via_backend is 'Calls backend to refresh Apollo news for domains stale > 7 days; set vault apollo_news_cron_url and apollo_news_cron_secret';
