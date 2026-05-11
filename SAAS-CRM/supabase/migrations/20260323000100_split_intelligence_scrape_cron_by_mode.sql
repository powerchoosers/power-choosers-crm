create or replace function util.invoke_intelligence_scrape(mode text default 'all')
returns void
language plpgsql
as $function$
begin
  perform util.invoke_edge_function(
    name => 'scrape-intelligence',
    body => jsonb_build_object('mode', mode),
    timeout_milliseconds => 180000
  );
end;
$function$;

select cron.schedule(
  'scrape-intelligence-morning',
  '0 14 * * *',
  $$ select util.invoke_intelligence_scrape('location'); $$
);

select cron.schedule(
  'scrape-intelligence-midday',
  '0 18 * * *',
  $$ select util.invoke_intelligence_scrape('buyer'); $$
);

select cron.schedule(
  'scrape-intelligence-evening',
  '0 23 * * *',
  $$ select util.invoke_intelligence_scrape('people'); $$
);
