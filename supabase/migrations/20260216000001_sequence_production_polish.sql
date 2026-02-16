-- ============================================================================
-- Sequence Production Polish: Task Automation & Signal Logic
-- ============================================================================

-- Step 1: Automated Advancement on Task Completion
CREATE OR REPLACE FUNCTION util.handle_task_completion_advancement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_execution_id TEXT;
  v_member_id TEXT;
BEGIN
  -- Check if this task is linked to a sequence execution
  v_execution_id := NEW.metadata->>'execution_id';
  v_member_id := NEW.metadata->>'member_id';

  IF NEW.status = 'completed' AND OLD.status != 'completed' AND v_member_id IS NOT NULL THEN
    -- Advance the sequence member
    PERFORM util.advance_sequence_member(v_member_id, 'completed');
    
    -- Update the specific execution that generated this task
    IF v_execution_id IS NOT NULL THEN
      UPDATE sequence_executions 
      SET status = 'completed', 
          completed_at = NOW(), 
          outcome = 'completed'
      WHERE id = v_execution_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Fire when a task is updated to 'completed'
DROP TRIGGER IF EXISTS trg_task_completion_sequence_advance ON tasks;
CREATE TRIGGER trg_task_completion_sequence_advance
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION util.handle_task_completion_advancement();

-- Step 2: Ensure Email Engagements (Opens/Clicks) Update the Sequence Engine
-- This logic helps if the direct API calls to util.advance_sequence_member fail or for legacy compatibility
CREATE OR REPLACE FUNCTION util.handle_email_engagement_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_execution_id TEXT;
  v_member_id TEXT;
  v_outcome TEXT;
BEGIN
  v_execution_id := NEW.metadata->>'execution_id';
  v_member_id := NEW.metadata->>'member_id';

  IF v_member_id IS NOT NULL AND v_execution_id IS NOT NULL THEN
    -- Determine outcome
    IF NEW."clickCount" > OLD."clickCount" THEN
      v_outcome := 'clicked';
    ELSIF NEW."openCount" > OLD."openCount" THEN
      v_outcome := 'opened';
    ELSE
      RETURN NEW;
    END IF;

    -- Advance sequence if the current state is waiting/processing
    IF EXISTS (
      SELECT 1 FROM sequence_executions 
      WHERE id = v_execution_id AND status IN ('waiting', 'processing')
    ) THEN
      PERFORM util.advance_sequence_member(v_member_id, v_outcome);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Fire when email engagement counters increase
DROP TRIGGER IF EXISTS trg_email_engagement_sequence_signal ON emails;
CREATE TRIGGER trg_email_engagement_sequence_signal
  AFTER UPDATE OF "openCount", "clickCount" ON emails
  FOR EACH ROW
  EXECUTE FUNCTION util.handle_email_engagement_signal();

-- ----------------------------------------------------------------------------
-- Final Polish
-- ----------------------------------------------------------------------------
COMMENT ON FUNCTION util.handle_task_completion_advancement() IS 'Automatically advances sequence members when a linked manual task is completed.';
COMMENT ON FUNCTION util.handle_email_engagement_signal() IS 'Ensures email engagement signals from the emails table trigger sequence progression.';
