-- ============================================================================
-- Sequential Sequence Wiring & Behavioral Branching
-- ============================================================================
-- This migration enhances the sequence engine to support:
-- 1. Sequential progression (one step at a time)
-- 2. Behavioral branching (opened, clicked, no_reply)
-- 3. Task engine integration for manual steps
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Enhance sequence_members to track current position
-- ----------------------------------------------------------------------------

ALTER TABLE sequence_members ADD COLUMN IF NOT EXISTS current_node_id TEXT;

-- ----------------------------------------------------------------------------
-- Step 2: Enhance sequence_executions for outcomes and timeouts
-- ----------------------------------------------------------------------------

ALTER TABLE sequence_executions ADD COLUMN IF NOT EXISTS outcome TEXT; -- 'opened', 'clicked', 'no_reply', 'completed'
ALTER TABLE sequence_executions ADD COLUMN IF NOT EXISTS wait_until TIMESTAMPTZ; -- Deadline for no-reply branch

-- Update status to include awaiting_generation and pending_send
-- (Note: Postgres doesn't easily allow updating constraints, we just document them here)
-- Statuses: 'pending', 'awaiting_generation', 'pending_send', 'processing', 'waiting', 'completed', 'failed', 'skipped'

-- ----------------------------------------------------------------------------
-- Step 3: Utility Function: Get Next Node in Graph
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION util.get_next_node(
  p_protocol_id TEXT,
  p_current_node_id TEXT,
  p_outcome TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_bgvector JSONB;
  v_edges JSONB;
  v_nodes JSONB;
  v_next_node_id TEXT;
  v_target_node JSONB;
BEGIN
  -- Fetch the protocol's graph data
  SELECT bgvector INTO v_bgvector FROM sequences WHERE id = p_protocol_id;
  
  IF v_bgvector IS NULL THEN
    RETURN NULL;
  END IF;

  v_edges := v_bgvector->'edges';
  v_nodes := v_bgvector->'nodes';

  -- Find edges from current node
  -- If p_outcome is provided, search for sourceHandle match
  -- sourceHandle matches outcomes like 'opened', 'clicked'
  SELECT 
    e->>'target' INTO v_next_node_id
  FROM jsonb_array_elements(v_edges) e
  WHERE e->>'source' = p_current_node_id
  AND (
    (p_outcome IS NULL AND (e->>'sourceHandle' IS NULL OR e->>'sourceHandle' = '')) OR
    (p_outcome IS NOT NULL AND e->>'sourceHandle' = p_outcome)
  )
  LIMIT 1;

  IF v_next_node_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Find the actual node data
  SELECT n INTO v_target_node
  FROM jsonb_array_elements(v_nodes) n
  WHERE n->>'id' = v_next_node_id;

  RETURN v_target_node;
END;
$$;

-- ----------------------------------------------------------------------------
-- Step 4: Utility Function: Advance Sequence Member
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION util.advance_sequence_member(
  p_member_id TEXT,
  p_outcome TEXT DEFAULT 'completed'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_current_node_id TEXT;
  v_next_node JSONB;
  v_scheduled_at TIMESTAMPTZ := NOW();
  v_delay_days INT := 0;
BEGIN
  -- Fetch member and current position
  SELECT * INTO v_member FROM sequence_members WHERE id = p_member_id;
  v_current_node_id := v_member.current_node_id;

  -- If no current node, find the start node (node with no incoming edges)
  IF v_current_node_id IS NULL THEN
    SELECT n->>'id' INTO v_current_node_id
    FROM sequences s, jsonb_array_elements(s.bgvector->'nodes') n
    WHERE s.id = v_member."sequenceId"
    AND NOT EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(s.bgvector->'edges') e 
      WHERE e->>'target' = n->>'id'
    )
    LIMIT 1;
    
    -- Instantiate the first node directly
    v_next_node := (SELECT n FROM sequences s, jsonb_array_elements(s.bgvector->'nodes') n WHERE s.id = v_member."sequenceId" AND n->>'id' = v_current_node_id);
  ELSE
    -- Find the next node based on outcome
    v_next_node := util.get_next_node(v_member."sequenceId", v_current_node_id, p_outcome);
  END IF;

  -- Update previous execution status if it exists
  UPDATE sequence_executions 
  SET outcome = p_outcome, status = 'completed', completed_at = NOW()
  WHERE member_id = p_member_id AND status = 'waiting';

  IF v_next_node IS NULL THEN
    -- Sequence complete
    UPDATE sequence_members SET current_node_id = NULL, "updatedAt" = NOW() WHERE id = p_member_id;
    RETURN;
  END IF;

  -- Update member's current position
  UPDATE sequence_members SET current_node_id = v_next_node->>'id', "updatedAt" = NOW() WHERE id = p_member_id;

  -- Calculate delay
  v_delay_days := COALESCE((v_next_node->'data'->>'interval')::INT, 0);
  v_scheduled_at := NOW() + (v_delay_days || ' days')::INTERVAL;

  -- Create execution record for the next step
  INSERT INTO sequence_executions (
    sequence_id,
    member_id,
    step_index,
    step_type,
    status,
    scheduled_at,
    metadata
  ) VALUES (
    v_member."sequenceId",
    p_member_id,
    0, -- We can use 0 or something else since we track by node_id now
    v_next_node->>'type',
    CASE 
        WHEN v_next_node->>'type' = 'email' THEN 'awaiting_generation'
        ELSE 'pending'
    END,
    v_scheduled_at,
    v_next_node->'data'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Step 5: Refactor enroll_in_sequence to be sequential
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enroll_in_sequence(
  p_sequence_id TEXT,
  p_contact_ids TEXT[],
  p_owner_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id TEXT;
  v_member_id TEXT;
  v_enrolled_count INT := 0;
  v_skipped_count INT := 0;
BEGIN
  -- Loop through each contact
  FOREACH v_contact_id IN ARRAY p_contact_ids LOOP
    -- Check if contact is already enrolled
    IF EXISTS (
      SELECT 1 FROM sequence_members 
      WHERE "sequenceId" = p_sequence_id 
      AND "targetId" = v_contact_id
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;
    
    -- Create sequence member (no node set yet)
    INSERT INTO sequence_members (
      id, "sequenceId", "targetId", "targetType", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::text,
      p_sequence_id,
      v_contact_id,
      'contact',
      NOW(),
      NOW()
    ) RETURNING id INTO v_member_id;
    
    -- Trigger the first step instantiation
    PERFORM util.advance_sequence_member(v_member_id);
    
    v_enrolled_count := v_enrolled_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'enrolled', v_enrolled_count,
    'skipped', v_skipped_count,
    'total', array_length(p_contact_ids, 1)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Step 6: Create cron job for No-Reply Timeouts
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION util.check_sequence_timeouts()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Find executions that reached their deadline without engagement
  -- We use outcome = 'no_reply' for ADVANCEMENT, but the current status is 'waiting'
  FOR r IN (
    SELECT member_id 
    FROM sequence_executions 
    WHERE status = 'waiting' 
    AND wait_until < NOW()
  ) LOOP
    PERFORM util.advance_sequence_member(r.member_id, 'no_reply');
  END LOOP;
END;
$$;

-- Schedule it (Supabase pg_cron)
-- Every hour
SELECT cron.schedule(
  'check-sequence-timeouts',
  '0 * * * *',
  $$ SELECT util.check_sequence_timeouts(); $$
);

-- ----------------------------------------------------------------------------
-- Step 7: Update Queue Trigger to handle new statuses
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION util.queue_sequence_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Queue if status is pending, queued, or needs AI generation/sending
  IF NEW.status IN ('pending', 'queued', 'awaiting_generation', 'pending_send') AND NEW.scheduled_at <= NOW() THEN
    PERFORM pgmq.send(
      queue_name => 'sequence_jobs',
      msg => jsonb_build_object(
        'execution_id', NEW.id,
        'sequence_id', NEW.sequence_id,
        'member_id', NEW.member_id,
        'step_index', NEW.step_index,
        'step_type', NEW.step_type,
        'metadata', NEW.metadata
      )
    );
    
    -- Update status to queued
    NEW.status := 'queued';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to queue sequence steps when they become ready
DROP TRIGGER IF EXISTS queue_sequence_step_trigger ON sequence_executions;
CREATE TRIGGER queue_sequence_step_trigger
  BEFORE INSERT OR UPDATE OF status, scheduled_at
  ON sequence_executions
  FOR EACH ROW
  EXECUTE FUNCTION util.queue_sequence_step();

-- ----------------------------------------------------------------------------
-- Complete!
-- ----------------------------------------------------------------------------
