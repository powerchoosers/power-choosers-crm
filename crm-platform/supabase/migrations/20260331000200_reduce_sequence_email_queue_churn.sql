-- Stop the scheduled sequence-email placeholder row from being rewritten
-- when the incoming sequence execution data has not actually changed.

CREATE OR REPLACE FUNCTION util.sync_sequence_scheduled_email_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'util'
AS $function$
DECLARE
  v_effective_type TEXT;
  v_email_id TEXT;
  v_contact_id TEXT;
  v_account_id TEXT;
  v_to_email TEXT;
  v_owner_id TEXT;
  v_owner_email TEXT;
  v_from_email TEXT;
  v_subject TEXT;
  v_body TEXT;
  v_body_text TEXT;
  v_existing_email RECORD;
BEGIN
  v_effective_type := lower(COALESCE(
    NEW.metadata->>'type',
    CASE WHEN NEW.step_type = 'protocolNode' THEN NULL ELSE NEW.step_type END,
    ''
  ));

  IF v_effective_type <> 'email' THEN
    RETURN NEW;
  END IF;

  v_email_id := COALESCE(NULLIF(NEW.metadata->>'emailRecordId', ''), 'seq_exec_' || NEW.id);

  -- Once send/terminal states happen, remove stale scheduled placeholder if it still exists.
  IF NEW.status IN ('waiting', 'completed', 'failed', 'skipped') THEN
    DELETE FROM public.emails e
    WHERE e.id = v_email_id
      AND e.type = 'scheduled'
      AND COALESCE(e.metadata->>'source', '') = 'sequence';

    RETURN NEW;
  END IF;

  -- Only maintain queue records for pre-send states.
  IF NEW.status NOT IN ('awaiting_generation', 'pending_send', 'pending', 'queued', 'processing') THEN
    RETURN NEW;
  END IF;

  SELECT
    c.id,
    c."accountId",
    c.email,
    s."ownerId",
    u.email
  INTO
    v_contact_id,
    v_account_id,
    v_to_email,
    v_owner_id,
    v_owner_email
  FROM public.sequence_members m
  JOIN public.contacts c ON c.id = m."targetId"
  LEFT JOIN public.sequences s ON s.id = m."sequenceId"
  LEFT JOIN public.users u ON (u.id = s."ownerId" OR u.email = s."ownerId")
  WHERE m.id = NEW.member_id
  LIMIT 1;

  IF COALESCE(v_to_email, '') = '' THEN
    RETURN NEW;
  END IF;

  v_from_email := COALESCE(
    NULLIF(v_owner_email, ''),
    CASE WHEN POSITION('@' IN COALESCE(v_owner_id, '')) > 0 THEN v_owner_id ELSE NULL END
  );

  v_subject := COALESCE(
    NULLIF(NEW.metadata->>'subject', ''),
    NULLIF(NEW.metadata->>'aiSubject', ''),
    NULLIF(NEW.metadata->>'label', ''),
    'Scheduled Sequence Email'
  );

  v_body := COALESCE(
    NULLIF(NEW.metadata->>'body', ''),
    NULLIF(NEW.metadata->>'aiBody', ''),
    ''
  );
  v_body_text := regexp_replace(v_body, '<[^>]+>', ' ', 'g');

  SELECT
    e."contactId",
    e."accountId",
    e."from",
    e."to",
    e.subject,
    e.html,
    e.text,
    e.status,
    e.type,
    e."scheduledSendTime",
    e."timestamp",
    e."ownerId",
    e.metadata
  INTO v_existing_email
  FROM public.emails e
  WHERE e.id = v_email_id
  LIMIT 1;

  IF FOUND
    AND v_existing_email."contactId" IS NOT DISTINCT FROM v_contact_id
    AND v_existing_email."accountId" IS NOT DISTINCT FROM v_account_id
    AND v_existing_email."from" IS NOT DISTINCT FROM v_from_email
    AND v_existing_email."to" IS NOT DISTINCT FROM jsonb_build_array(v_to_email)
    AND v_existing_email.subject IS NOT DISTINCT FROM v_subject
    AND v_existing_email.html IS NOT DISTINCT FROM v_body
    AND v_existing_email.text IS NOT DISTINCT FROM v_body_text
    AND v_existing_email.status IS NOT DISTINCT FROM NEW.status
    AND v_existing_email.type IS NOT DISTINCT FROM 'scheduled'
    AND v_existing_email."scheduledSendTime" IS NOT DISTINCT FROM NEW.scheduled_at
    AND v_existing_email."timestamp" IS NOT DISTINCT FROM NEW.scheduled_at
    AND v_existing_email."ownerId" IS NOT DISTINCT FROM v_owner_id
    AND COALESCE(v_existing_email.metadata->>'source', '') = 'sequence'
    AND COALESCE(v_existing_email.metadata->>'sequenceExecutionId', '') = NEW.id
    AND COALESCE(v_existing_email.metadata->>'sequenceId', '') = NEW.sequence_id
    AND COALESCE(v_existing_email.metadata->>'memberId', '') = NEW.member_id
    AND COALESCE(v_existing_email.metadata->>'status', '') = NEW.status
    AND COALESCE(v_existing_email.metadata->>'scheduledAt', '') = COALESCE(NEW.scheduled_at::text, '')
    AND COALESCE(v_existing_email.metadata->>'emailRecordId', '') = v_email_id
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.emails (
    id,
    "contactId",
    "accountId",
    "from",
    "to",
    subject,
    html,
    text,
    status,
    type,
    is_read,
    "scheduledSendTime",
    "timestamp",
    "createdAt",
    "updatedAt",
    "ownerId",
    metadata
  ) VALUES (
    v_email_id,
    v_contact_id,
    v_account_id,
    v_from_email,
    jsonb_build_array(v_to_email),
    v_subject,
    v_body,
    v_body_text,
    NEW.status,
    'scheduled',
    false,
    NEW.scheduled_at,
    NEW.scheduled_at,
    NOW(),
    NOW(),
    v_owner_id,
    jsonb_build_object(
      'source', 'sequence',
      'sequenceExecutionId', NEW.id,
      'sequenceId', NEW.sequence_id,
      'memberId', NEW.member_id,
      'status', NEW.status,
      'scheduledAt', NEW.scheduled_at,
      'emailRecordId', v_email_id
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET
    "contactId" = EXCLUDED."contactId",
    "accountId" = EXCLUDED."accountId",
    "from" = COALESCE(EXCLUDED."from", public.emails."from"),
    "to" = EXCLUDED."to",
    subject = COALESCE(EXCLUDED.subject, public.emails.subject),
    html = CASE WHEN public.emails.type = 'scheduled' THEN EXCLUDED.html ELSE public.emails.html END,
    text = CASE WHEN public.emails.type = 'scheduled' THEN EXCLUDED.text ELSE public.emails.text END,
    status = CASE WHEN public.emails.type = 'scheduled' THEN EXCLUDED.status ELSE public.emails.status END,
    type = CASE WHEN public.emails.type IN ('sent', 'uplink_out') THEN public.emails.type ELSE 'scheduled' END,
    "scheduledSendTime" = EXCLUDED."scheduledSendTime",
    "timestamp" = CASE WHEN public.emails.type = 'scheduled' THEN EXCLUDED."timestamp" ELSE public.emails."timestamp" END,
    "updatedAt" = NOW(),
    "ownerId" = COALESCE(EXCLUDED."ownerId", public.emails."ownerId"),
    metadata = COALESCE(public.emails.metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'sequence',
      'sequenceExecutionId', NEW.id,
      'sequenceId', NEW.sequence_id,
      'memberId', NEW.member_id,
      'status', NEW.status,
      'scheduledAt', NEW.scheduled_at,
      'emailRecordId', v_email_id
    );

  RETURN NEW;
END;
$function$;
