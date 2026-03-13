-- Harden sequence advancement from manual protocol tasks.
-- Accepts both legacy and current metadata key formats and status casing.

CREATE OR REPLACE FUNCTION util.handle_task_completion_advancement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_execution_id TEXT;
  v_member_id TEXT;
  v_new_completed BOOLEAN;
  v_old_completed BOOLEAN;
BEGIN
  v_execution_id := COALESCE(
    NULLIF(NEW.metadata->>'execution_id', ''),
    NULLIF(NEW.metadata->>'sequenceExecutionId', '')
  );

  v_member_id := COALESCE(
    NULLIF(NEW.metadata->>'member_id', ''),
    NULLIF(NEW.metadata->>'memberId', '')
  );

  v_new_completed := lower(COALESCE(NEW.status, '')) = 'completed';
  v_old_completed := lower(COALESCE(OLD.status, '')) = 'completed';

  IF v_new_completed AND NOT v_old_completed AND v_member_id IS NOT NULL THEN
    PERFORM util.advance_sequence_member(v_member_id, 'completed');

    IF v_execution_id IS NOT NULL THEN
      UPDATE sequence_executions
      SET status = 'completed',
          completed_at = NOW(),
          outcome = COALESCE(outcome, 'completed'),
          updated_at = NOW()
      WHERE id = v_execution_id
        AND status <> 'completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

