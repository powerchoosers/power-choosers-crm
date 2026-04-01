-- Second-pass cleanup:
-- 1. add the missing foreign-key indexes that still matter for read paths
-- 2. remove the duplicate prospect_radar index
-- 3. freeze search_path on hot functions so Supabase stops flagging them

CREATE INDEX IF NOT EXISTS idx_accounts_primary_contact_id
  ON public.accounts USING btree ("primaryContactId");

CREATE INDEX IF NOT EXISTS idx_calls_account_id
  ON public.calls USING btree ("accountId");

CREATE INDEX IF NOT EXISTS idx_calls_contact_id
  ON public.calls USING btree ("contactId");

CREATE INDEX IF NOT EXISTS idx_contacts_account_id
  ON public.contacts USING btree ("accountId");

CREATE INDEX IF NOT EXISTS idx_deals_account_id
  ON public.deals USING btree ("accountId");

CREATE INDEX IF NOT EXISTS idx_emails_account_id
  ON public.emails USING btree ("accountId");

CREATE INDEX IF NOT EXISTS idx_emails_thread_id
  ON public.emails USING btree ("threadId");

CREATE INDEX IF NOT EXISTS idx_sequence_activations_sequence_id
  ON public.sequence_activations USING btree ("sequenceId");

CREATE INDEX IF NOT EXISTS idx_sequence_members_sequence_id
  ON public.sequence_members USING btree ("sequenceId");

CREATE INDEX IF NOT EXISTS idx_signature_requests_document_id
  ON public.signature_requests USING btree (document_id);

CREATE INDEX IF NOT EXISTS idx_signature_requests_contact_id
  ON public.signature_requests USING btree (contact_id);

CREATE INDEX IF NOT EXISTS idx_signature_requests_account_id
  ON public.signature_requests USING btree (account_id);

CREATE INDEX IF NOT EXISTS idx_signature_requests_deal_id
  ON public.signature_requests USING btree (deal_id);

CREATE INDEX IF NOT EXISTS idx_signature_telemetry_request_id
  ON public.signature_telemetry USING btree (request_id);

CREATE INDEX IF NOT EXISTS idx_tasks_account_id
  ON public.tasks USING btree ("accountId");

CREATE INDEX IF NOT EXISTS idx_tasks_contact_id
  ON public.tasks USING btree ("contactId");

CREATE INDEX IF NOT EXISTS idx_transmission_assets_user_id
  ON public.transmission_assets USING btree (user_id);

DROP INDEX IF EXISTS public.prospect_radar_discovered_at_idx;

DO $$
DECLARE
  r record;
  path text;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'util')
      AND p.proname = ANY (ARRAY[
        'advance_sequence_member',
        'apply_sequence_delay_on_insert',
        'call_embedding_input',
        'check_sequence_timeouts',
        'contact_embedding_input',
        'email_embedding_input',
        'enroll_in_sequence',
        'fn_cleanup_list_members',
        'get_next_node',
        'handle_email_engagement_signal',
        'handle_sequence_stop_on_optout',
        'handle_sequence_stop_on_reply',
        'handle_task_completion_advancement',
        'hybrid_search_accounts',
        'hybrid_search_calls',
        'hybrid_search_contacts',
        'hybrid_search_emails',
        'invoke_apollo_prospect_discovery',
        'invoke_edge_function',
        'invoke_intelligence_scrape',
        'normalize_execution_metadata',
        'process_embeddings',
        'process_sequence_steps',
        'project_url',
        'queue_embeddings',
        'refresh_apollo_news_via_backend',
        'requeue_scheduled_steps',
        'sanitize_sequence_execution_metadata',
        'update_updated_at_column'
      ]::text[])
  LOOP
    path := CASE
      WHEN r.nspname = 'util' THEN 'pg_catalog, util, public'
      ELSE 'pg_catalog, public, util'
    END;

    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path TO %s',
      r.nspname,
      r.proname,
      r.args,
      path
    );
  END LOOP;
END $$;
