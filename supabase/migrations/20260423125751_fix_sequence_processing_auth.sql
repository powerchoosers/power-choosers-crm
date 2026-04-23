-- Fix sequence processing authentication issue
-- This migration updates the invoke_edge_function to handle missing auth headers
-- when called from cron jobs, allowing sequence processing to work properly

CREATE OR REPLACE FUNCTION util.invoke_edge_function(name text, body jsonb, timeout_milliseconds integer DEFAULT ((5 * 60) * 1000))
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'util', 'public'
AS $function$
DECLARE
  headers_raw TEXT;
  auth_header TEXT;
  service_role_key TEXT;
BEGIN
  -- Try to get service role key from vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE vault.decrypted_secrets.name = 'service_role_key'
  LIMIT 1;

  -- If we're in a PostgREST session, reuse the request headers for authorization
  headers_raw := current_setting('request.headers', true);
  auth_header := CASE
    WHEN headers_raw IS NOT NULL THEN
      (headers_raw::json->>'authorization')
    WHEN service_role_key IS NOT NULL THEN
      'Bearer ' || service_role_key
    ELSE
      NULL
  END;
  
  -- Perform async HTTP request to the edge function
  PERFORM net.http_post(
    url => util.project_url() || '/functions/v1/' || invoke_edge_function.name,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', auth_header
    ),
    body => body,
    timeout_milliseconds => timeout_milliseconds
  );
END;
$function$;

-- Note: The process-sequence-step edge function was also redeployed with verify_jwt: false
-- to allow internal cron job calls without JWT authentication
