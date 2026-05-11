-- Backfill Zoho-sent email rows that are missing contact/account links.
-- This only repairs rows that can be matched safely to an existing contact.
with candidate_emails as (
    select
        e.id as email_id,
        e."contactId" as current_contact_id,
        e."ownerId",
        case
            when jsonb_typeof(e."to") = 'array' then e."to"->>0
            else trim(both '"' from e."to"::text)
        end as recipient_raw,
        lower(regexp_replace(
            case
                when jsonb_typeof(e."to") = 'array' then e."to"->>0
                else trim(both '"' from e."to"::text)
            end,
            '[^a-zA-Z0-9@._+-]+',
            '',
            'g'
        )) as recipient_safe,
        split_part(
            lower(regexp_replace(
                case
                    when jsonb_typeof(e."to") = 'array' then e."to"->>0
                    else trim(both '"' from e."to"::text)
                end,
                '[^a-zA-Z0-9@._+-]+',
                '',
                'g'
            )),
            '@',
            1
        ) as recipient_local,
        split_part(
            lower(regexp_replace(
                case
                    when jsonb_typeof(e."to") = 'array' then e."to"->>0
                    else trim(both '"' from e."to"::text)
                end,
                '[^a-zA-Z0-9@._+-]+',
                '',
                'g'
            )),
            '@',
            2
        ) as recipient_domain,
        lower(regexp_replace(
            split_part(
                lower(regexp_replace(
                    case
                        when jsonb_typeof(e."to") = 'array' then e."to"->>0
                        else trim(both '"' from e."to"::text)
                    end,
                    '[^a-zA-Z0-9@._+-]+',
                    '',
                    'g'
                )),
                '@',
                1
            ),
            '[^a-z0-9]+',
            '',
            'g'
        )) as recipient_local_compact,
        lower(regexp_replace(
            case
                when jsonb_typeof(e."to") = 'array' then e."to"->>0
                else trim(both '"' from e."to"::text)
            end,
            '[^a-zA-Z0-9]+',
            '',
            'g'
        )) as recipient_name_compact
    from emails e
    where e.type in ('sent', 'uplink_out')
      and coalesce(e."contactId", '') = ''
      and coalesce(e.metadata->>'provider', '') = 'zoho'
      and coalesce(e."ownerId", '') = 'l.patterson@nodalpoint.io'
),
match_candidates as (
    select
        ce.email_id,
        c.id as contact_id,
        c."accountId" as account_id,
        c.name as contact_name,
        a.name as account_name,
        case
            when ce.recipient_safe = lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')) then 100
            when ce.recipient_name_compact = lower(regexp_replace(coalesce(c.name, ''), '[^a-zA-Z0-9]+', '', 'g')) then 95
            when ce.recipient_name_compact = lower(regexp_replace(coalesce(c."firstName", '') || coalesce(c."lastName", ''), '[^a-zA-Z0-9]+', '', 'g')) then 90
            when ce.recipient_domain <> ''
             and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
             and ce.recipient_local_compact = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g')) then 80
            when ce.recipient_domain <> ''
             and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
             and substring(ce.recipient_local_compact from 2) = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g')) then 70
            else 0
        end as match_score,
        case
            when ce.recipient_safe = lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')) then 'email_exact'
            when ce.recipient_name_compact = lower(regexp_replace(coalesce(c.name, ''), '[^a-zA-Z0-9]+', '', 'g')) then 'name_exact'
            when ce.recipient_name_compact = lower(regexp_replace(coalesce(c."firstName", '') || coalesce(c."lastName", ''), '[^a-zA-Z0-9]+', '', 'g')) then 'first_last_exact'
            when ce.recipient_domain <> ''
             and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
             and ce.recipient_local_compact = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g')) then 'email_normalized'
            when ce.recipient_domain <> ''
             and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
             and substring(ce.recipient_local_compact from 2) = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g')) then 'alias_drop_leading_char'
            else 'other'
        end as match_reason,
        row_number() over (
            partition by ce.email_id
            order by
                case
                    when coalesce(c."ownerId", '') = 'l.patterson@nodalpoint.io' then 3
                    when coalesce(c."ownerId", '') = ce."ownerId" then 2
                    when c."ownerId" is null or c."ownerId" = '' then 1
                    else 0
                end desc,
                case
                    when ce.recipient_safe = lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')) then 100
                    when ce.recipient_name_compact = lower(regexp_replace(coalesce(c.name, ''), '[^a-zA-Z0-9]+', '', 'g')) then 95
                    when ce.recipient_name_compact = lower(regexp_replace(coalesce(c."firstName", '') || coalesce(c."lastName", ''), '[^a-zA-Z0-9]+', '', 'g')) then 90
                    when ce.recipient_domain <> ''
                     and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
                     and ce.recipient_local_compact = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g')) then 80
                    when ce.recipient_domain <> ''
                     and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
                     and substring(ce.recipient_local_compact from 2) = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g')) then 70
                    else 0
                end desc,
                c.name nulls last,
                c.email nulls last
        ) as rn
    from candidate_emails ce
    join contacts c
      on (
            ce.recipient_safe = lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g'))
         or ce.recipient_name_compact = lower(regexp_replace(coalesce(c.name, ''), '[^a-zA-Z0-9]+', '', 'g'))
         or ce.recipient_name_compact = lower(regexp_replace(coalesce(c."firstName", '') || coalesce(c."lastName", ''), '[^a-zA-Z0-9]+', '', 'g'))
         or (
                ce.recipient_domain <> ''
            and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
            and ce.recipient_local_compact = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g'))
            )
         or (
                ce.recipient_domain <> ''
            and ce.recipient_domain = split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 2)
            and substring(ce.recipient_local_compact from 2) = lower(regexp_replace(split_part(lower(regexp_replace(coalesce(c.email, ''), '[^a-zA-Z0-9@._+-]+', '', 'g')), '@', 1), '[^a-z0-9]+', '', 'g'))
            )
      )
    left join accounts a on a.id = c."accountId"
),
best_matches as (
    select *
    from match_candidates
    where match_score > 0
      and rn = 1
)
update emails e
set
    "contactId" = bm.contact_id,
    "accountId" = bm.account_id,
    metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
        'contactId', bm.contact_id,
        'accountId', bm.account_id,
        'contactName', bm.contact_name,
        'contactCompany', bm.account_name
    ),
    "updatedAt" = now()
from best_matches bm
where e.id = bm.email_id
returning e.id, e.subject, e."contactId", e."accountId", bm.contact_name, bm.account_name, bm.match_reason;
