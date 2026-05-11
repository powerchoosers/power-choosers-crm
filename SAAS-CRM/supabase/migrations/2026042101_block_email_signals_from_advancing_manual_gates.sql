-- Prevent email open/click signals from auto-advancing members while they are
-- sitting on a manual gate node (call or LinkedIn).
--
-- Without this guard, an open/click RPC can push a member past a call node
-- before the call task is ever created, which makes the sequence look like it
-- skipped calls.

CREATE OR REPLACE FUNCTION util.advance_sequence_member(
  p_member_id text,
  p_outcome text DEFAULT 'completed'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'util', 'public'
AS $function$
DECLARE
  v_member record;
  v_last_completed_node_id text;
  v_current_node_type text;
  v_rewrite_outcome text := p_outcome;
  v_normalized_outcome text := lower(btrim(coalesce(p_outcome, '')));
BEGIN
  SELECT *
  INTO v_member
  FROM sequence_members
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence member % not found', p_member_id;
  END IF;

  IF v_member.current_node_id IS NULL THEN
    SELECT n->>'id'
    INTO v_last_completed_node_id
    FROM sequence_executions se
    JOIN sequences s ON s.id = v_member."sequenceId"
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.bgvector->'nodes', '[]'::jsonb)) n
    WHERE se.member_id = p_member_id
      AND se.status = 'completed'
      AND coalesce(n->'data'->>'label', '') = coalesce(se.metadata->>'label', '')
    ORDER BY coalesce(se.completed_at, se.executed_at, se.created_at) DESC NULLS LAST, se.created_at DESC
    LIMIT 1;

    IF v_last_completed_node_id IS NOT NULL THEN
      UPDATE sequence_members
      SET current_node_id = v_last_completed_node_id,
          "updatedAt" = NOW()
      WHERE id = p_member_id;

      v_member.current_node_id := v_last_completed_node_id;
    END IF;
  END IF;

  IF v_member.current_node_id IS NOT NULL THEN
    SELECT coalesce(n->'data'->>'type', n->>'type')
    INTO v_current_node_type
    FROM sequences s,
      jsonb_array_elements(coalesce(s.bgvector->'nodes', '[]'::jsonb)) n
    WHERE s.id = v_member."sequenceId"
      AND n->>'id' = v_member.current_node_id
    LIMIT 1;

    -- Email opens/clicks can arrive while a member is on a manual gate.
    -- Keep the signal history, but do not advance the member until the gate
    -- itself is completed by a real task action.
    IF v_current_node_type IN ('call', 'linkedin') AND v_normalized_outcome <> 'completed' THEN
      IF v_normalized_outcome IN ('opened', 'clicked', 'reply', 'any_signal') THEN
        UPDATE sequence_members
        SET
          total_opens = CASE WHEN v_normalized_outcome = 'opened' THEN COALESCE(total_opens, 0) + 1 ELSE total_opens END,
          total_clicks = CASE WHEN v_normalized_outcome = 'clicked' THEN COALESCE(total_clicks, 0) + 1 ELSE total_clicks END,
          total_replies = CASE WHEN v_normalized_outcome = 'reply' THEN COALESCE(total_replies, 0) + 1 ELSE total_replies END,
          signal_state = COALESCE(signal_state, '{}'::jsonb) || jsonb_build_object(
            'lastOutcome', v_normalized_outcome,
            'lastOutcomeAt', NOW()
          ),
          last_signal_at = CASE WHEN v_normalized_outcome IN ('opened', 'clicked', 'reply', 'any_signal') THEN NOW() ELSE last_signal_at END,
          "updatedAt" = NOW()
        WHERE id = p_member_id;
      END IF;

      RETURN;
    END IF;

    IF v_current_node_type IN ('condition', 'split') THEN
      v_rewrite_outcome := 'completed';
    END IF;
  END IF;

  PERFORM util.advance_sequence_member_raw(p_member_id, v_rewrite_outcome);
END;
$function$;

