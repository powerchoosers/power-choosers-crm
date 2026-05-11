-- Keep expiring-account embeddings aligned with the fields Lewis actually uses.
CREATE OR REPLACE FUNCTION public.account_embedding_input(record accounts)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select concat_ws(' ',
    record.name,
    record.industry,
    record.domain,
    coalesce(record.description, record.metadata->>'description', ''),
    coalesce(record.city, ''),
    coalesce(record.state, ''),
    'Contract end: ' || coalesce(record.contract_end_date::text, ''),
    'Annual usage: ' || coalesce(record.annual_usage, ''),
    'Current rate: ' || coalesce(record.current_rate, ''),
    'Electricity supplier: ' || coalesce(record.electricity_supplier, ''),
    coalesce(record.metadata->>'notes', '')
  );
$function$;

DROP TRIGGER IF EXISTS embed_accounts_on_update ON public.accounts;

CREATE TRIGGER embed_accounts_on_update
AFTER UPDATE OF name, industry, description, domain, city, state, contract_end_date, annual_usage, current_rate, electricity_supplier
ON public.accounts
FOR EACH ROW
WHEN ((old.* IS DISTINCT FROM new.*))
EXECUTE FUNCTION util.queue_embeddings('account_embedding_input', 'embedding');
