-- Email embeddings should only exist for CRM-linked conversations.
-- Anything without a contact link is noise and should not be queued.
CREATE OR REPLACE FUNCTION public.email_embedding_input(record emails)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'util'
AS $function$
  select case
    when record."contactId" is null then null
    else concat_ws(' ',
      'Subject: ' || coalesce(record.subject, ''),
      'From: ' || coalesce(record."from", ''),
      'Body: ' || coalesce(substring(record.text, 1, 2000), '')
    )
  end;
$function$;

DROP TRIGGER IF EXISTS embed_emails_on_insert ON public.emails;
DROP TRIGGER IF EXISTS embed_emails_on_update ON public.emails;

CREATE TRIGGER embed_emails_on_insert
AFTER INSERT ON public.emails
FOR EACH ROW
WHEN (NEW."contactId" IS NOT NULL)
EXECUTE FUNCTION util.queue_embeddings('email_embedding_input', 'embedding');

CREATE TRIGGER embed_emails_on_update
AFTER UPDATE OF subject, text, "from", "contactId" ON public.emails
FOR EACH ROW
WHEN (NEW."contactId" IS NOT NULL AND (OLD.* IS DISTINCT FROM NEW.*))
EXECUTE FUNCTION util.queue_embeddings('email_embedding_input', 'embedding');
