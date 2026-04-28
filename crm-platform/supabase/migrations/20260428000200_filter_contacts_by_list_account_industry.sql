CREATE OR REPLACE FUNCTION public.get_contacts_by_list_filtered(
  p_list_id text,
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
  JOIN public.list_members lm ON c.id = lm."targetId"
  LEFT JOIN public.accounts a ON a.id = c."accountId"
  WHERE lm."listId" = p_list_id
    AND lm."targetType" IN ('people', 'contact', 'contacts')
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
      OR c.phone ILIKE '%' || btrim(p_search) || '%'
      OR c.mobile ILIKE '%' || btrim(p_search) || '%'
      OR c."workPhone" ILIKE '%' || btrim(p_search) || '%'
      OR c."otherPhone" ILIKE '%' || btrim(p_search) || '%'
      OR a.name ILIKE '%' || btrim(p_search) || '%'
      OR a.industry ILIKE '%' || btrim(p_search) || '%'
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
          )
      )
    )
  ORDER BY c."lastName" ASC NULLS LAST, c."firstName" ASC NULLS LAST, c."createdAt" DESC
  LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 50), 500))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

CREATE OR REPLACE FUNCTION public.get_contacts_count_by_list_filtered(
  p_list_id text,
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
  JOIN public.list_members lm ON c.id = lm."targetId"
  LEFT JOIN public.accounts a ON a.id = c."accountId"
  WHERE lm."listId" = p_list_id
    AND lm."targetType" IN ('people', 'contact', 'contacts')
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
      OR c.phone ILIKE '%' || btrim(p_search) || '%'
      OR c.mobile ILIKE '%' || btrim(p_search) || '%'
      OR c."workPhone" ILIKE '%' || btrim(p_search) || '%'
      OR c."otherPhone" ILIKE '%' || btrim(p_search) || '%'
      OR a.name ILIKE '%' || btrim(p_search) || '%'
      OR a.industry ILIKE '%' || btrim(p_search) || '%'
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
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_contacts_by_list_filtered(text, text, text[], text[], text[], text[], text[], integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contacts_count_by_list_filtered(text, text, text[], text[], text[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contacts_by_list_filtered(text, text, text[], text[], text[], text[], text[], integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_contacts_count_by_list_filtered(text, text, text[], text[], text[], text[], text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_contacts_by_list_filtered(text, text, text[], text[], text[], text[], text[], integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contacts_count_by_list_filtered(text, text, text[], text[], text[], text[], text[]) TO authenticated, service_role;
