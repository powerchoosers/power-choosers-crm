CREATE OR REPLACE FUNCTION public.get_contacts_by_list_filtered(
  p_list_id text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_industries text[] DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_locations text[] DEFAULT NULL,
  p_titles text[] DEFAULT NULL,
  p_owner_ids text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.contacts
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.contacts c
  LEFT JOIN public.accounts a ON a.id = c."accountId"
  WHERE (
      p_list_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.list_members lm
        WHERE lm."listId" = p_list_id
          AND lm."targetId" = c.id
          AND lm."targetType" IN ('people', 'contact', 'contacts')
      )
    )
    AND (
      COALESCE(cardinality(p_owner_ids), 0) = 0
      OR c."ownerId" = ANY(p_owner_ids)
    )
    AND (
      NULLIF(btrim(COALESCE(p_search, '')), '') IS NULL
      OR c.name ILIKE '%' || btrim(p_search) || '%'
      OR c.email ILIKE '%' || btrim(p_search) || '%'
      OR c."firstName" ILIKE '%' || btrim(p_search) || '%'
      OR c."lastName" ILIKE '%' || btrim(p_search) || '%'
      OR c.title ILIKE '%' || btrim(p_search) || '%'
      OR c.phone ILIKE '%' || btrim(p_search) || '%'
      OR c.mobile ILIKE '%' || btrim(p_search) || '%'
      OR c."workPhone" ILIKE '%' || btrim(p_search) || '%'
      OR c."otherPhone" ILIKE '%' || btrim(p_search) || '%'
      OR c.city ILIKE '%' || btrim(p_search) || '%'
      OR c.state ILIKE '%' || btrim(p_search) || '%'
      OR c.notes ILIKE '%' || btrim(p_search) || '%'
      OR c."linkedinUrl" ILIKE '%' || btrim(p_search) || '%'
      OR a.name ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.domain, a.website, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.industry, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.description, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.linkedin_url, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(to_char(a.contract_end_date, 'YYYY-MM-DD'), '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.city, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.state, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.address, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.zip, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.phone, '') ILIKE '%' || btrim(p_search) || '%'
    )
    AND (
      COALESCE(cardinality(p_statuses), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_statuses) AS status_filter(value)
        WHERE replace(replace(lower(COALESCE(c.status, '')), '-', '_'), ' ', '_')
          = replace(replace(lower(btrim(status_filter.value)), '-', '_'), ' ', '_')
      )
    )
    AND (
      COALESCE(cardinality(p_titles), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_titles) AS title_filter(value)
        WHERE NULLIF(btrim(title_filter.value), '') IS NOT NULL
          AND c.title ILIKE '%' || btrim(title_filter.value) || '%'
      )
    )
    AND (
      COALESCE(cardinality(p_industries), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_industries) AS industry_filter(value)
        WHERE NULLIF(btrim(industry_filter.value), '') IS NOT NULL
          AND a.industry ILIKE '%' || btrim(industry_filter.value) || '%'
      )
    )
    AND (
      COALESCE(cardinality(p_locations), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_locations) AS location_filter(value)
        WHERE NULLIF(btrim(location_filter.value), '') IS NOT NULL
          AND (
            c.city ILIKE '%' || btrim(location_filter.value) || '%'
            OR c.state ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.city ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.state ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.address ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.zip ILIKE '%' || btrim(location_filter.value) || '%'
          )
      )
    )
  ORDER BY c."lastName" ASC NULLS LAST, c."firstName" ASC NULLS LAST, c."createdAt" DESC
  LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 50), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

CREATE OR REPLACE FUNCTION public.get_contacts_count_by_list_filtered(
  p_list_id text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_industries text[] DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_locations text[] DEFAULT NULL,
  p_titles text[] DEFAULT NULL,
  p_owner_ids text[] DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)
  FROM public.contacts c
  LEFT JOIN public.accounts a ON a.id = c."accountId"
  WHERE (
      p_list_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.list_members lm
        WHERE lm."listId" = p_list_id
          AND lm."targetId" = c.id
          AND lm."targetType" IN ('people', 'contact', 'contacts')
      )
    )
    AND (
      COALESCE(cardinality(p_owner_ids), 0) = 0
      OR c."ownerId" = ANY(p_owner_ids)
    )
    AND (
      NULLIF(btrim(COALESCE(p_search, '')), '') IS NULL
      OR c.name ILIKE '%' || btrim(p_search) || '%'
      OR c.email ILIKE '%' || btrim(p_search) || '%'
      OR c."firstName" ILIKE '%' || btrim(p_search) || '%'
      OR c."lastName" ILIKE '%' || btrim(p_search) || '%'
      OR c.title ILIKE '%' || btrim(p_search) || '%'
      OR c.phone ILIKE '%' || btrim(p_search) || '%'
      OR c.mobile ILIKE '%' || btrim(p_search) || '%'
      OR c."workPhone" ILIKE '%' || btrim(p_search) || '%'
      OR c."otherPhone" ILIKE '%' || btrim(p_search) || '%'
      OR c.city ILIKE '%' || btrim(p_search) || '%'
      OR c.state ILIKE '%' || btrim(p_search) || '%'
      OR c.notes ILIKE '%' || btrim(p_search) || '%'
      OR c."linkedinUrl" ILIKE '%' || btrim(p_search) || '%'
      OR a.name ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.domain, a.website, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.industry, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.description, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.linkedin_url, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(to_char(a.contract_end_date, 'YYYY-MM-DD'), '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.city, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.state, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.address, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.zip, '') ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(a.phone, '') ILIKE '%' || btrim(p_search) || '%'
    )
    AND (
      COALESCE(cardinality(p_statuses), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_statuses) AS status_filter(value)
        WHERE replace(replace(lower(COALESCE(c.status, '')), '-', '_'), ' ', '_')
          = replace(replace(lower(btrim(status_filter.value)), '-', '_'), ' ', '_')
      )
    )
    AND (
      COALESCE(cardinality(p_titles), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_titles) AS title_filter(value)
        WHERE NULLIF(btrim(title_filter.value), '') IS NOT NULL
          AND c.title ILIKE '%' || btrim(title_filter.value) || '%'
      )
    )
    AND (
      COALESCE(cardinality(p_industries), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_industries) AS industry_filter(value)
        WHERE NULLIF(btrim(industry_filter.value), '') IS NOT NULL
          AND a.industry ILIKE '%' || btrim(industry_filter.value) || '%'
      )
    )
    AND (
      COALESCE(cardinality(p_locations), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_locations) AS location_filter(value)
        WHERE NULLIF(btrim(location_filter.value), '') IS NOT NULL
          AND (
            c.city ILIKE '%' || btrim(location_filter.value) || '%'
            OR c.state ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.city ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.state ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.address ILIKE '%' || btrim(location_filter.value) || '%'
            OR a.zip ILIKE '%' || btrim(location_filter.value) || '%'
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_accounts_by_list(
  p_list_id text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL::text,
  p_industries text[] DEFAULT NULL::text[],
  p_statuses text[] DEFAULT NULL::text[],
  p_locations text[] DEFAULT NULL::text[],
  p_owner_ids text[] DEFAULT NULL::text[]
)
RETURNS SETOF accounts
LANGUAGE sql
STABLE
AS $function$
  SELECT *
  FROM public.accounts a
  WHERE EXISTS (
    SELECT 1
    FROM public.list_members lm
    WHERE lm."listId" = p_list_id
      AND lm."targetId" = a.id
      AND lm."targetType" IN ('account', 'accounts', 'company', 'companies')
  )
  AND (
    p_owner_ids IS NULL
    OR cardinality(p_owner_ids) = 0
    OR a."ownerId" = ANY(p_owner_ids)
  )
  AND (
    p_search IS NULL
    OR p_search = ''
    OR a.name ILIKE ('%' || p_search || '%')
    OR COALESCE(a.domain, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.description, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.website, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.linkedin_url, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(to_char(a.contract_end_date, 'YYYY-MM-DD'), '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.industry, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.city, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.state, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.address, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.zip, '') ILIKE ('%' || p_search || '%')
    OR COALESCE(a.phone, '') ILIKE ('%' || p_search || '%')
  )
  AND (
    p_industries IS NULL
    OR cardinality(p_industries) = 0
    OR a.industry = ANY(p_industries)
  )
  AND (
    p_locations IS NULL
    OR cardinality(p_locations) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(p_locations) AS loc(term)
      WHERE (
        COALESCE(a.city, '') ILIKE ('%' || loc.term || '%')
        OR COALESCE(a.state, '') ILIKE ('%' || loc.term || '%')
        OR COALESCE(a.address, '') ILIKE ('%' || loc.term || '%')
        OR COALESCE(a.zip, '') ILIKE ('%' || loc.term || '%')
      )
    )
  )
  AND (
    p_statuses IS NULL
    OR cardinality(p_statuses) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(p_statuses) AS st(term)
      WHERE (
        upper(replace(st.term, '-', '_')) = 'ACTIVE_LOAD'
        AND upper(coalesce(a.status, '')) IN ('ACTIVE', 'ACTIVE_LOAD')
        AND a.contract_end_date >= current_date
      )
      OR (
        upper(replace(st.term, '-', '_')) = 'CUSTOMER'
        AND upper(coalesce(a.status, '')) = 'CUSTOMER'
      )
      OR (
        upper(replace(st.term, '-', '_')) = 'PROSPECT'
        AND upper(coalesce(a.status, '')) = 'PROSPECT'
      )
      OR (
        upper(replace(st.term, '-', '_')) = 'CHURNED'
        AND upper(coalesce(a.status, '')) = 'CHURNED'
      )
      OR (
        upper(replace(st.term, '-', '_')) NOT IN ('ACTIVE_LOAD', 'CUSTOMER', 'PROSPECT', 'CHURNED')
        AND upper(coalesce(a.status, '')) = upper(replace(st.term, '-', '_'))
      )
    )
  )
  ORDER BY a.name ASC
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_accounts_count_by_list(
  p_list_id text,
  p_search text DEFAULT NULL::text,
  p_industries text[] DEFAULT NULL::text[],
  p_statuses text[] DEFAULT NULL::text[],
  p_locations text[] DEFAULT NULL::text[],
  p_owner_ids text[] DEFAULT NULL::text[]
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $function$
  select count(*)::bigint
  from public.accounts a
  where exists (
    select 1
    from public.list_members lm
    where lm."listId" = p_list_id
      and lm."targetId" = a.id
      and lm."targetType" in ('account', 'accounts', 'company', 'companies')
  )
  and (
    p_owner_ids is null
    or cardinality(p_owner_ids) = 0
    or a."ownerId" = any(p_owner_ids)
  )
  and (
    p_search is null
    or p_search = ''
    or a.name ilike ('%' || p_search || '%')
    or coalesce(a.domain, '') ilike ('%' || p_search || '%')
    or coalesce(a.description, '') ilike ('%' || p_search || '%')
    or coalesce(a.website, '') ilike ('%' || p_search || '%')
    or coalesce(a.linkedin_url, '') ilike ('%' || p_search || '%')
    or coalesce(to_char(a.contract_end_date, 'YYYY-MM-DD'), '') ilike ('%' || p_search || '%')
    or coalesce(a.industry, '') ilike ('%' || p_search || '%')
    or coalesce(a.city, '') ilike ('%' || p_search || '%')
    or coalesce(a.state, '') ilike ('%' || p_search || '%')
    or coalesce(a.address, '') ilike ('%' || p_search || '%')
    or coalesce(a.zip, '') ilike ('%' || p_search || '%')
    or coalesce(a.phone, '') ilike ('%' || p_search || '%')
  )
  and (
    p_industries is null
    or cardinality(p_industries) = 0
    or a.industry = any(p_industries)
  )
  and (
    p_locations is null
    or cardinality(p_locations) = 0
    or exists (
      select 1
      from unnest(p_locations) as loc(term)
      where (
        coalesce(a.city, '') ilike ('%' || loc.term || '%')
        or coalesce(a.state, '') ilike ('%' || loc.term || '%')
        or coalesce(a.address, '') ilike ('%' || loc.term || '%')
        or coalesce(a.zip, '') ilike ('%' || loc.term || '%')
      )
    )
  )
  and (
    p_statuses is null
    or cardinality(p_statuses) = 0
    or exists (
      select 1
      from unnest(p_statuses) as st(term)
      where (
        upper(replace(st.term, '-', '_')) = 'ACTIVE_LOAD'
        and upper(coalesce(a.status, '')) in ('ACTIVE', 'ACTIVE_LOAD')
        and a.contract_end_date >= current_date
      )
      or (
        upper(replace(st.term, '-', '_')) = 'CUSTOMER'
        and upper(coalesce(a.status, '')) = 'CUSTOMER'
      )
      or (
        upper(replace(st.term, '-', '_')) = 'PROSPECT'
        and upper(coalesce(a.status, '')) = 'PROSPECT'
      )
      or (
        upper(replace(st.term, '-', '_')) = 'CHURNED'
        and upper(coalesce(a.status, '')) = 'CHURNED'
      )
      or (
        upper(replace(st.term, '-', '_')) not in ('ACTIVE_LOAD', 'CUSTOMER', 'PROSPECT', 'CHURNED')
        and upper(coalesce(a.status, '')) = upper(replace(st.term, '-', '_'))
      )
    )
  );
$function$;
