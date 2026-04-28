# Sequence Queue Safeguards

## Overview
Automated safeguards to prevent sequence jobs from getting stuck in the queue.

## What Was Fixed (April 27, 2026)

### Root Cause
The `advance_sequence_member` SQL function was using `v_next_node->>'type'` which returned `"protocolNode"` (React Flow component type) instead of the actual step type like "call", "email", or "linkedin" from `v_next_node->'data'->>'type'`.

### Impact
- Call and LinkedIn tasks were being skipped
- Jobs would retry indefinitely with wrong step_type
- Queue would fill up with stuck jobs

### Solution
1. Fixed SQL function to use correct step_type from node data
2. Added check constraint to prevent `step_type = 'protocolNode'`
3. Updated all existing executions with correct step_type
4. Purged and re-queued stuck jobs

## Safeguards in Place

### 1. Database Constraint
```sql
ALTER TABLE sequence_executions 
ADD CONSTRAINT check_step_type_not_protocol_node 
CHECK (step_type != 'protocolNode');
```
**Purpose:** Prevents any execution from being created with the wrong step_type.

### 2. Auto-Purge Stuck Jobs (Cron: Every hour at :00)
```sql
SELECT util.purge_stuck_sequence_jobs();
```
**What it does:**
- Detects jobs with >20 retry attempts
- Automatically purges them from the queue
- Logs the purge count

**Schedule:** `0 * * * *` (every hour)

### 3. Auto-Requeue Stuck Executions (Cron: Every hour at :15)
```sql
SELECT util.requeue_stuck_sequence_executions();
```
**What it does:**
- Finds executions that are pending/queued but past scheduled time by >1 hour
- Checks if they're missing from the queue
- Re-queues them with correct step_type
- Updates status to 'queued'

**Schedule:** `15 * * * *` (every hour at minute 15)

### 4. Monitoring View
```sql
SELECT * FROM util.v_stuck_sequence_jobs;
```
**Shows:**
- Jobs with high retry counts (>10)
- Executions stuck without queue entries
- Execution status and metadata

**Use this to:** Monitor for issues before they become critical.

## Manual Recovery Commands

### Check for stuck jobs
```sql
SELECT * FROM util.v_stuck_sequence_jobs;
```

### Purge stuck jobs manually
```sql
SELECT util.purge_stuck_sequence_jobs();
```

### Re-queue stuck executions manually
```sql
SELECT util.requeue_stuck_sequence_executions();
```

### Check queue status
```sql
SELECT 
  COUNT(*) as total_in_queue,
  MAX(read_ct) as max_retries,
  message->>'step_type' as step_type
FROM pgmq.q_sequence_jobs
GROUP BY message->>'step_type';
```

### Purge entire queue (EMERGENCY ONLY)
```sql
SELECT pgmq.purge_queue('sequence_jobs');
```
**Warning:** Only use this if the queue is completely stuck. You'll need to manually re-queue pending executions afterward.

## Monitoring

### Check cron job status
```sql
SELECT jobid, jobname, schedule, active, last_run_status
FROM cron.job 
WHERE jobname LIKE '%sequence%'
ORDER BY jobname;
```

### View cron job history
```sql
SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE '%sequence%'
)
ORDER BY start_time DESC
LIMIT 20;
```

## Prevention Checklist

✅ **Database constraint** prevents wrong step_type  
✅ **Hourly purge** removes stuck jobs (>20 retries)  
✅ **Hourly re-queue** recovers stuck executions  
✅ **Monitoring view** shows issues early  
✅ **SQL function** uses correct node data type  

## If Issues Occur

1. **Check the monitoring view:**
   ```sql
   SELECT * FROM util.v_stuck_sequence_jobs;
   ```

2. **Run manual recovery:**
   ```sql
   SELECT util.purge_stuck_sequence_jobs();
   SELECT util.requeue_stuck_sequence_executions();
   ```

3. **Verify queue is healthy:**
   ```sql
   SELECT COUNT(*), MAX(read_ct) FROM pgmq.q_sequence_jobs;
   ```
   - If `MAX(read_ct) > 20`: Jobs are failing repeatedly
   - If `COUNT(*) > 100`: Queue is backing up

4. **Check edge function logs** in Supabase dashboard for errors

## Contact
If safeguards fail or new issues arise, check:
- Edge function logs: Supabase Dashboard → Functions → process-sequence-step
- Database logs: Check for constraint violations
- Cron job logs: `cron.job_run_details` table
