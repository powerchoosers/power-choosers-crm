# Sequence Automation – Edge Function Quota (Free Tier)

## Supabase free tier limit

- **500,000 Edge Function invocations per month** on the free plan.  
- No charge within that quota; overages can trigger a grace period and billing email.

## How many invocations does this use?

The Edge Function `process-sequence-step` is **only called when there is work to do** (jobs in the queue). The cron jobs run on a schedule, but they only invoke the Edge Function when there are sequence steps to process.

### When the function is invoked

1. **Cron runs** (every 5 minutes, 8AM–5PM CST):
   - `process-sequence-steps-business-hours`: `*/5 14-22 * * *` (every 5 min from 14:00–22:59 UTC).
   - `process-sequence-steps-end-of-day`: `0 23 * * *` (once at 23:00 UTC).

2. **Each cron run** calls `util.process_sequence_steps()`, which:
   - Reads from the `sequence_jobs` queue.
   - **If the queue is empty** → no HTTP request → **0 Edge Function invocations**.
   - **If there are jobs** → one HTTP POST per **batch** of up to 10 jobs → **1 invocation per batch**.

So: **invocations = number of batches processed**, not number of cron runs.

### Monthly invocation estimates

| Scenario | Invocations per run | Runs/day (9h) | Runs/month | Invocations/month |
|--------|----------------------|---------------|------------|--------------------|
| Queue usually empty | 0 | 109 | 3,270 | **0** |
| 1 batch per run (e.g. 1–10 steps) | 1 | 109 | 3,270 | **~3,270** |
| 2 batches per run | 2 | 109 | 3,270 | **~6,540** |
| 5 batches per run (heavy use) | 5 | 109 | 3,270 | **~16,350** |

- **109 runs/day** ≈ 12 runs/hour × 9 hours (14:00–23:00 UTC).
- **3,270 runs/month** ≈ 109 × 30.

### Conclusion for free tier

- **Typical / light use (often empty queue):** **0–~3,000** invocations/month.
- **Moderate use (1 batch per run):** **~3,000–7,000** invocations/month.
- **Heavy use (multiple batches every run):** still only **tens of thousands** per month.

All of these are **well under 500,000**, so this setup is **safe for the free tier** for normal sequence automation.

### If you want to reduce usage further

- Run the cron less often (e.g. every 15 minutes instead of 5): divide invocations by 3.
- Shorten business hours in the cron (e.g. 9AM–4PM): fewer runs per day.
- Keep batch size at 10 so each invocation handles more steps.

---

**Reference:** [Supabase – Manage Edge Function Invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)
