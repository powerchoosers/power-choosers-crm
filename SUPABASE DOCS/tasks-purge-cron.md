# Purge Completed Tasks (pg_cron)

Completed tasks are automatically removed from the database so the Tasks page and sidebar widgets stay focused on pending work.

## Schedule

- **When:** 5 PM **Central Standard Time (CST)**, **Monday through Friday** (23:00 UTC in cron)
- **What:** Deletes all rows in `tasks` where `status` is `'Completed'` (case-insensitive)

The job is implemented in SQL and runs inside Supabase via **pg_cron** (no external API or Edge Function).

## Migration

- **File:** `supabase/migrations/20260210000000_purge_completed_tasks_cron.sql`
- **Function:** `util.purge_completed_tasks()` — returns the number of rows deleted
- **Cron job name:** `purge-completed-tasks`

## Changing the time or timezone

pg_cron uses **UTC**. To run at “5 PM” in your timezone, set the hour accordingly:

| 5 PM in…        | UTC hour | Cron expression   |
|-----------------|----------|--------------------|
| US Central (CST)| 23       | `0 23 * * 1-5`     |
| US Central (CDT)| 22       | `0 22 * * 1-5`     |
| US Eastern (EST)| 22       | `0 22 * * 1-5`     |
| US Pacific (PST)| 01 (next day) | `0 1 * * 2-6` |

To change the schedule after the migration is applied:

1. **Dashboard:** Supabase Dashboard → Database → Extensions → pg_cron (if available in your plan), or
2. **SQL:** Run in the SQL Editor (Dashboard or `supabase db execute`):

```sql
-- Unschedule current job
select cron.unschedule('purge-completed-tasks');

-- Reschedule at 5 PM CST (23:00 UTC) Mon–Fri (current default)
select cron.schedule(
  'purge-completed-tasks',
  '0 23 * * 1-5',
  $$select util.purge_completed_tasks();$$
);
```

Cron format: `minute hour day-of-month month day-of-week` (0–6, 0 = Sunday). So `1-5` = Monday–Friday.

## Manual run

You can purge completed tasks immediately without waiting for cron:

```sql
select util.purge_completed_tasks();
```

Returns the number of tasks deleted.

## Relation to “Automatic Embeddings”

This job is **not** related to the [Automatic Embeddings](Automatic%20Embeddings) flow (pg_cron + pgmq + Edge Functions for vector embeddings). It only runs a simple `DELETE` on `tasks` on a schedule. The same **pg_cron** extension is used for both.
