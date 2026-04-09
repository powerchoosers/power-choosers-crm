-- Prevent sequence emails from stacking too closely when manual steps or branch
-- completion happen faster than intended.
CREATE OR REPLACE FUNCTION util.advance_sequence_member(p_member_id text, p_outcome text DEFAULT 'completed'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'util', 'public'
AS $function$
declare
  v_member record;
  v_current_node_id text;
  v_current_node jsonb;
  v_next_node jsonb;
  v_scheduled_at timestamptz := now();
  v_delay_val int := 0;
  v_delay_unit text := 'days';
  v_effective_outcome text := p_outcome;
  v_last_outcome text := '';
  v_any_signal boolean := false;
  v_outcome_item jsonb;
  v_condition text;
  v_last_email_sent_at timestamptz;
begin
  select *
  into v_member
  from sequence_members
  where id = p_member_id;

  if not found then
    raise exception 'Sequence member % not found', p_member_id;
  end if;

  if v_effective_outcome is not null then
    v_effective_outcome := lower(btrim(v_effective_outcome));
  end if;
  if v_effective_outcome = '' then
    v_effective_outcome := null;
  end if;
  if v_effective_outcome = 'replied' then
    v_effective_outcome := 'reply';
  end if;

  -- MANUAL GATE GUARD: never auto-advance a call/linkedin step via the timeout checker.
  -- If the caller is the cron (outcome = 'no_reply') and the current waiting execution
  -- has manualGate:true in metadata, bail out immediately.
  IF lower(coalesce(p_outcome, '')) = 'no_reply' THEN
    IF EXISTS (
      SELECT 1 FROM sequence_executions
      WHERE member_id = p_member_id
        AND status = 'waiting'
        AND (
          (metadata->>'manualGate')::boolean = true
          OR lower(coalesce(
            metadata->>'type',
            CASE WHEN step_type = 'protocolNode' THEN NULL ELSE step_type END,
            ''
          )) IN ('call', 'linkedin')
        )
    ) THEN
      RETURN; -- silently refuse -- this is a manual gate, user must act
    END IF;
  END IF;

  if v_effective_outcome in ('opened', 'clicked', 'reply', 'no_reply', 'no_open', 'ghost', 'any_signal') then
    update sequence_members
    set
      total_opens = case when v_effective_outcome = 'opened' then coalesce(total_opens, 0) + 1 else total_opens end,
      total_clicks = case when v_effective_outcome = 'clicked' then coalesce(total_clicks, 0) + 1 else total_clicks end,
      total_replies = case when v_effective_outcome = 'reply' then coalesce(total_replies, 0) + 1 else total_replies end,
      signal_state = coalesce(signal_state, '{}'::jsonb) || jsonb_build_object(
        'lastOutcome', v_effective_outcome,
        'lastOutcomeAt', now()
      ),
      last_signal_at = case when v_effective_outcome in ('opened', 'clicked', 'reply', 'any_signal') then now() else last_signal_at end,
      "updatedAt" = now()
    where id = p_member_id
    returning * into v_member;
  end if;

  v_current_node_id := v_member.current_node_id;

  if v_current_node_id is null then
    if exists (
      select 1
      from sequence_executions
      where member_id = p_member_id
        and status = 'completed'
      limit 1
    ) then
      return;
    end if;

    select n->>'id'
    into v_current_node_id
    from sequences s,
      jsonb_array_elements(coalesce(s.bgvector->'nodes', '[]'::jsonb)) n
    where s.id = v_member."sequenceId"
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(s.bgvector->'edges', '[]'::jsonb)) e
        where e->>'target' = n->>'id'
      )
    order by case when coalesce(n->'data'->>'type', '') = 'input' then 0 else 1 end, n->>'id'
    limit 1;

    select n
    into v_next_node
    from sequences s,
      jsonb_array_elements(coalesce(s.bgvector->'nodes', '[]'::jsonb)) n
    where s.id = v_member."sequenceId"
      and n->>'id' = v_current_node_id
    limit 1;
  else
    select n
    into v_current_node
    from sequences s,
      jsonb_array_elements(coalesce(s.bgvector->'nodes', '[]'::jsonb)) n
    where s.id = v_member."sequenceId"
      and n->>'id' = v_current_node_id
    limit 1;

    if coalesce(v_current_node->'data'->>'type', '') in ('condition', 'split')
       and (v_effective_outcome is null or v_effective_outcome = 'completed') then
      v_last_outcome := lower(coalesce(v_member.signal_state->>'lastOutcome', ''));
      if v_last_outcome = 'replied' then
        v_last_outcome := 'reply';
      end if;

      v_any_signal := v_last_outcome in ('opened', 'clicked', 'reply', 'any_signal');

      for v_outcome_item in
        select value
        from jsonb_array_elements(coalesce(v_current_node->'data'->'outcomes', '[]'::jsonb))
      loop
        v_condition := lower(coalesce(v_outcome_item->>'condition', ''));
        if v_condition = '' then
          v_condition := lower(regexp_replace(coalesce(v_outcome_item->>'id', ''), '^outcome-', ''));
        end if;

        if v_condition = '' then
          continue;
        end if;

        if (
          (v_condition = 'clicked' and v_last_outcome = 'clicked') or
          (v_condition = 'opened' and v_last_outcome in ('opened', 'clicked')) or
          (v_condition in ('reply', 'replied') and v_last_outcome = 'reply') or
          (v_condition = 'no_open' and (not v_any_signal or v_last_outcome in ('no_open', 'no_reply', 'ghost', ''))) or
          (v_condition = 'no_reply' and (not v_any_signal or v_last_outcome in ('no_reply', 'no_open', 'ghost', ''))) or
          (v_condition = 'any_signal' and v_any_signal) or
          (v_condition = 'ghost' and (not v_any_signal or v_last_outcome in ('ghost', 'no_reply', 'no_open')))
        ) then
          v_effective_outcome := coalesce(nullif(v_outcome_item->>'id', ''), v_condition);
          exit;
        end if;
      end loop;

      if v_effective_outcome is null or v_effective_outcome = 'completed' then
        select coalesce(nullif(value->>'id', ''), 'completed')
        into v_effective_outcome
        from jsonb_array_elements(coalesce(v_current_node->'data'->'outcomes', '[]'::jsonb))
        limit 1;

        if v_effective_outcome is null then
          v_effective_outcome := 'completed';
        end if;
      end if;
    end if;

    v_next_node := util.get_next_node(v_member."sequenceId", v_current_node_id, v_effective_outcome);
  end if;

  -- Mark current active execution as completed with resolved outcome.
  UPDATE sequence_executions
  SET outcome = coalesce(v_effective_outcome, p_outcome, 'completed'),
      status = 'completed',
      completed_at = now()
  WHERE member_id = p_member_id
    AND status in ('waiting', 'processing', 'pending', 'queued', 'awaiting_generation', 'pending_send');

  if v_next_node is null then
    update sequence_members
    set current_node_id = null,
        "updatedAt" = now()
    where id = p_member_id;
    return;
  end if;

  update sequence_members
  set current_node_id = v_next_node->>'id',
      "updatedAt" = now()
  where id = p_member_id;

  -- Delay parsing with guardrails.
  if coalesce(v_next_node->'data'->>'delay', '') ~ '^-?[0-9]+$' then
    v_delay_val := greatest((v_next_node->'data'->>'delay')::int, 0);
  elsif coalesce(v_next_node->'data'->>'interval', '') ~ '^-?[0-9]+$' then
    v_delay_val := greatest((v_next_node->'data'->>'interval')::int, 0);
  else
    v_delay_val := 0;
  end if;

  v_delay_unit := lower(coalesce(nullif(v_next_node->'data'->>'delayUnit', ''), 'days'));
  if v_delay_unit not in ('minutes', 'hours', 'days', 'weeks', 'months') then
    v_delay_unit := 'days';
  end if;

  v_scheduled_at := now() + (v_delay_val || ' ' || v_delay_unit)::interval;

  -- Safety floor: do not schedule a sequence email less than 24 hours after
  -- the last email already sent to this contact.
  IF COALESCE(v_next_node->'data'->>'type', v_next_node->>'type') = 'email' THEN
    SELECT MAX(COALESCE(e."sentAt", e."timestamp", e."createdAt"))
    INTO v_last_email_sent_at
    FROM public.emails e
    WHERE e."contactId" = v_member."targetId"
      AND e.type = 'sent'
      AND (
        COALESCE(e.metadata->>'source', '') = 'sequence'
        OR e.id LIKE 'seq_exec_%'
        OR COALESCE(e.metadata->>'isSequenceEmail', '') = 'true'
      );

    IF v_last_email_sent_at IS NOT NULL THEN
      v_scheduled_at := GREATEST(v_scheduled_at, v_last_email_sent_at + INTERVAL '1 day');
    END IF;
  END IF;

  insert into sequence_executions (
    sequence_id,
    member_id,
    step_index,
    step_type,
    status,
    scheduled_at,
    metadata
  ) values (
    v_member."sequenceId",
    p_member_id,
    0,
    v_next_node->>'type',
    case
      when coalesce(v_next_node->'data'->>'type', v_next_node->>'type') = 'email' then 'awaiting_generation'
      else 'pending'
    end,
    v_scheduled_at,
    coalesce(v_next_node->'data', '{}'::jsonb)
  );
end;
$function$;
