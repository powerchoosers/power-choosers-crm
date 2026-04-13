-- Recover stalled sequence members when the member pointer is missing and
-- force condition nodes to branch from the saved signal state instead of a
-- late signal payload.
ALTER FUNCTION util.advance_sequence_member(text, text) RENAME TO advance_sequence_member_raw;

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

    IF v_current_node_type IN ('condition', 'split') THEN
      v_rewrite_outcome := 'completed';
    END IF;
  END IF;

  PERFORM util.advance_sequence_member_raw(p_member_id, v_rewrite_outcome);
END;
$function$;

REVOKE ALL ON FUNCTION util.advance_sequence_member(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION util.advance_sequence_member(text, text) FROM anon;
REVOKE ALL ON FUNCTION util.advance_sequence_member(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION util.advance_sequence_member(text, text) TO service_role;

REVOKE ALL ON FUNCTION util.advance_sequence_member_raw(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION util.advance_sequence_member_raw(text, text) FROM anon;
REVOKE ALL ON FUNCTION util.advance_sequence_member_raw(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION util.advance_sequence_member_raw(text, text) FROM service_role;
