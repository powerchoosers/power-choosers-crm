-- Purge completed tasks on a schedule so the tasks page stays focused on pending work.
-- Runs at 5 PM Central Standard Time (CST), Monday–Friday. pg_cron uses UTC: 5 PM CST = 23:00 UTC.

create or replace function util.purge_completed_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with deleted as (
    delete from public.tasks
    where (status is not null and lower(trim(status)) = 'completed')
    returning id
  )
  select count(*)::integer into deleted_count from deleted;
  return deleted_count;
end;
$$;

comment on function util.purge_completed_tasks is 'Deletes all tasks with status Completed. Used by pg_cron at 5 PM CST (23:00 UTC) Mon–Fri.';

-- Idempotent: unschedule if already present, then schedule (5 PM CST = 23:00 UTC)
select cron.unschedule('purge-completed-tasks')
where exists (select 1 from cron.job where jobname = 'purge-completed-tasks');

select cron.schedule(
  'purge-completed-tasks',
  '0 23 * * 1-5',
  $$select util.purge_completed_tasks();$$
);
