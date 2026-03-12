-- Make sequence branching executable (not UI-only):
-- 1) Route outcomes like "opened" to edges using "outcome-opened" handles.
-- 2) Resolve condition/split nodes from the latest recorded interaction signal.
-- 3) Fall back safely to default edges when no explicit outcome edge exists.

CREATE OR REPLACE FUNCTION util.get_next_node(
  p_protocol_id text,
  p_current_node_id text,
  p_outcome text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_bgvector JSONB;
  v_edges JSONB;
  v_nodes JSONB;
  v_next_node_id TEXT;
  v_target_node JSONB;
  v_outcome_prefixed TEXT;
BEGIN
  SELECT bgvector INTO v_bgvector
  FROM sequences
  WHERE id = p_protocol_id;

  IF v_bgvector IS NULL THEN
    RETURN NULL;
  END IF;

  v_edges := COALESCE(v_bgvector->'edges', '[]'::jsonb);
  v_nodes := COALESCE(v_bgvector->'nodes', '[]'::jsonb);

  v_outcome_prefixed := CASE
    WHEN p_outcome IS NULL OR btrim(p_outcome) = '' THEN NULL
    WHEN p_outcome LIKE 'outcome-%' THEN p_outcome
    ELSE 'outcome-' || p_outcome
  END;

  SELECT e->>'target'
  INTO v_next_node_id
  FROM jsonb_array_elements(v_edges) e
  WHERE e->>'source' = p_current_node_id
    AND (
      (p_outcome IS NOT NULL AND btrim(p_outcome) <> '' AND e->>'sourceHandle' = p_outcome)
      OR (v_outcome_prefixed IS NOT NULL AND e->>'sourceHandle' = v_outcome_prefixed)
      OR COALESCE(e->>'sourceHandle', '') = ''
      OR e->>'sourceHandle' = 'completed'
    )
  ORDER BY CASE
    WHEN p_outcome IS NOT NULL AND btrim(p_outcome) <> '' AND e->>'sourceHandle' = p_outcome THEN 0
    WHEN v_outcome_prefixed IS NOT NULL AND e->>'sourceHandle' = v_outcome_prefixed THEN 1
    WHEN COALESCE(e->>'sourceHandle', '') = '' OR e->>'sourceHandle' = 'completed' THEN 2
    ELSE 99
  END
  LIMIT 1;

  IF v_next_node_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT n
  INTO v_target_node
  FROM jsonb_array_elements(v_nodes) n
  WHERE n->>'id' = v_next_node_id
  LIMIT 1;

  RETURN v_target_node;
END;
$function$;

CREATE OR REPLACE FUNCTION util.advance_sequence_member(
  p_member_id text,
  p_outcome text DEFAULT 'completed'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_member RECORD;
  v_current_node_id TEXT;
  v_current_node JSONB;
  v_next_node JSONB;
  v_scheduled_at TIMESTAMPTZ := NOW();
  v_delay_val INT := 0;
  v_delay_unit TEXT := 'days';
  v_effective_outcome TEXT := p_outcome;
  v_last_outcome TEXT := '';
  v_any_signal BOOLEAN := FALSE;
  v_outcome_item JSONB;
  v_condition TEXT;
BEGIN
  SELECT *
  INTO v_member
  FROM sequence_members
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence member % not found', p_member_id;
  END IF;

  IF v_effective_outcome IS NOT NULL THEN
    v_effective_outcome := lower(btrim(v_effective_outcome));
  END IF;
  IF v_effective_outcome = '' THEN
    v_effective_outcome := NULL;
  END IF;
  IF v_effective_outcome = 'replied' THEN
    v_effective_outcome := 'reply';
  END IF;

  -- Persist signal outcomes so condition nodes can branch on latest interaction.
  IF v_effective_outcome IN ('opened', 'clicked', 'reply', 'no_reply', 'no_open', 'ghost', 'any_signal') THEN
    UPDATE sequence_members
    SET
      total_opens = CASE WHEN v_effective_outcome = 'opened' THEN COALESCE(total_opens, 0) + 1 ELSE total_opens END,
      total_clicks = CASE WHEN v_effective_outcome = 'clicked' THEN COALESCE(total_clicks, 0) + 1 ELSE total_clicks END,
      total_replies = CASE WHEN v_effective_outcome = 'reply' THEN COALESCE(total_replies, 0) + 1 ELSE total_replies END,
      signal_state = COALESCE(signal_state, '{}'::jsonb) || jsonb_build_object(
        'lastOutcome', v_effective_outcome,
        'lastOutcomeAt', NOW()
      ),
      last_signal_at = CASE WHEN v_effective_outcome IN ('opened', 'clicked', 'reply', 'any_signal') THEN NOW() ELSE last_signal_at END,
      "updatedAt" = NOW()
    WHERE id = p_member_id
    RETURNING * INTO v_member;
  END IF;

  v_current_node_id := v_member.current_node_id;

  IF v_current_node_id IS NULL THEN
    -- Entry point: prefer an input/start node if present.
    SELECT n->>'id'
    INTO v_current_node_id
    FROM sequences s,
      jsonb_array_elements(COALESCE(s.bgvector->'nodes', '[]'::jsonb)) n
    WHERE s.id = v_member."sequenceId"
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(s.bgvector->'edges', '[]'::jsonb)) e
        WHERE e->>'target' = n->>'id'
      )
    ORDER BY CASE WHEN COALESCE(n->'data'->>'type', '') = 'input' THEN 0 ELSE 1 END, n->>'id'
    LIMIT 1;

    SELECT n
    INTO v_next_node
    FROM sequences s,
      jsonb_array_elements(COALESCE(s.bgvector->'nodes', '[]'::jsonb)) n
    WHERE s.id = v_member."sequenceId"
      AND n->>'id' = v_current_node_id
    LIMIT 1;
  ELSE
    SELECT n
    INTO v_current_node
    FROM sequences s,
      jsonb_array_elements(COALESCE(s.bgvector->'nodes', '[]'::jsonb)) n
    WHERE s.id = v_member."sequenceId"
      AND n->>'id' = v_current_node_id
    LIMIT 1;

    -- Condition/split nodes branch from interaction signal, not generic "completed".
    IF COALESCE(v_current_node->'data'->>'type', '') IN ('condition', 'split')
       AND (v_effective_outcome IS NULL OR v_effective_outcome = 'completed') THEN
      v_last_outcome := lower(COALESCE(v_member.signal_state->>'lastOutcome', ''));
      IF v_last_outcome = 'replied' THEN
        v_last_outcome := 'reply';
      END IF;

      v_any_signal := v_last_outcome IN ('opened', 'clicked', 'reply', 'any_signal');

      FOR v_outcome_item IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(v_current_node->'data'->'outcomes', '[]'::jsonb))
      LOOP
        v_condition := lower(COALESCE(v_outcome_item->>'condition', ''));
        IF v_condition = '' THEN
          v_condition := lower(regexp_replace(COALESCE(v_outcome_item->>'id', ''), '^outcome-', ''));
        END IF;

        IF v_condition = '' THEN
          CONTINUE;
        END IF;

        IF (
          (v_condition = 'clicked' AND v_last_outcome = 'clicked') OR
          (v_condition = 'opened' AND v_last_outcome IN ('opened', 'clicked')) OR
          (v_condition IN ('reply', 'replied') AND v_last_outcome = 'reply') OR
          (v_condition = 'no_open' AND (NOT v_any_signal OR v_last_outcome IN ('no_open', 'no_reply', 'ghost', ''))) OR
          (v_condition = 'no_reply' AND (NOT v_any_signal OR v_last_outcome IN ('no_reply', 'no_open', 'ghost', ''))) OR
          (v_condition = 'any_signal' AND v_any_signal) OR
          (v_condition = 'ghost' AND (NOT v_any_signal OR v_last_outcome IN ('ghost', 'no_reply', 'no_open')))
        ) THEN
          v_effective_outcome := COALESCE(NULLIF(v_outcome_item->>'id', ''), v_condition);
          EXIT;
        END IF;
      END LOOP;

      IF v_effective_outcome IS NULL OR v_effective_outcome = 'completed' THEN
        SELECT COALESCE(NULLIF(value->>'id', ''), 'completed')
        INTO v_effective_outcome
        FROM jsonb_array_elements(COALESCE(v_current_node->'data'->'outcomes', '[]'::jsonb))
        LIMIT 1;

        IF v_effective_outcome IS NULL THEN
          v_effective_outcome := 'completed';
        END IF;
      END IF;
    END IF;

    v_next_node := util.get_next_node(v_member."sequenceId", v_current_node_id, v_effective_outcome);
  END IF;

  -- Mark current active execution as completed with resolved outcome.
  UPDATE sequence_executions
  SET outcome = COALESCE(v_effective_outcome, p_outcome, 'completed'),
      status = 'completed',
      completed_at = NOW()
  WHERE member_id = p_member_id
    AND status IN ('waiting', 'processing', 'pending', 'queued', 'awaiting_generation', 'pending_send');

  IF v_next_node IS NULL THEN
    UPDATE sequence_members
    SET current_node_id = NULL,
        "updatedAt" = NOW()
    WHERE id = p_member_id;
    RETURN;
  END IF;

  UPDATE sequence_members
  SET current_node_id = v_next_node->>'id',
      "updatedAt" = NOW()
  WHERE id = p_member_id;

  -- Delay parsing with guardrails.
  IF COALESCE(v_next_node->'data'->>'delay', '') ~ '^-?\\d+$' THEN
    v_delay_val := GREATEST((v_next_node->'data'->>'delay')::INT, 0);
  ELSIF COALESCE(v_next_node->'data'->>'interval', '') ~ '^-?\\d+$' THEN
    v_delay_val := GREATEST((v_next_node->'data'->>'interval')::INT, 0);
  ELSE
    v_delay_val := 0;
  END IF;

  v_delay_unit := lower(COALESCE(NULLIF(v_next_node->'data'->>'delayUnit', ''), 'days'));
  IF v_delay_unit NOT IN ('minutes', 'hours', 'days', 'weeks', 'months') THEN
    v_delay_unit := 'days';
  END IF;

  v_scheduled_at := NOW() + (v_delay_val || ' ' || v_delay_unit)::INTERVAL;

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
    0,
    v_next_node->>'type',
    CASE
      WHEN COALESCE(v_next_node->'data'->>'type', v_next_node->>'type') = 'email' THEN 'awaiting_generation'
      ELSE 'pending'
    END,
    v_scheduled_at,
    COALESCE(v_next_node->'data', '{}'::jsonb)
  );
END;
$function$;
