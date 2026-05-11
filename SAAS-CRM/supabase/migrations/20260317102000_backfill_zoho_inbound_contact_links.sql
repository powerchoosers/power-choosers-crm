-- Backfill inbound Zoho emails that are missing CRM contact links.
-- Safe scope:
-- 1) unique sender + normalized subject groups where another row in the group already has a contact
-- 2) unique, clean sender-name matches against contacts
with inbound as (
    select
        e.id as email_id,
        e."ownerId" as owner_id,
        e.subject,
        coalesce(e.metadata->>'fromAddress', e."from", '') as sender_label,
        lower(regexp_replace(coalesce(e.metadata->>'fromAddress', e."from", ''), '[^a-zA-Z0-9]+', '', 'g')) as sender_norm,
        lower(trim(regexp_replace(coalesce(e.subject, ''), '^\s*((re|fw|fwd)\s*:\s*)+', '', 'gi'))) as subject_norm,
        lower(regexp_replace(coalesce(e.metadata->>'replyToAddress', ''), '[^a-zA-Z0-9]+', '', 'g')) as reply_to_norm
    from emails e
    where e.type in ('received', 'uplink_in')
      and coalesce(e."contactId", '') = ''
      and coalesce(e.metadata->>'provider', '') = 'zoho'
      and coalesce(e."ownerId", '') = 'l.patterson@nodalpoint.io'
),
group_matches as (
    select
        i.email_id,
        max(e."contactId") as contact_id,
        max(e."accountId") as account_id,
        max(c.name) as contact_name,
        max(a.name) as account_name,
        100 as priority,
        'sender_subject_group_match' as match_reason
    from inbound i
    join emails e
      on e."ownerId" = i.owner_id
     and coalesce(e.metadata->>'provider', '') = 'zoho'
     and lower(regexp_replace(coalesce(e.metadata->>'fromAddress', e."from", ''), '[^a-zA-Z0-9]+', '', 'g')) = i.sender_norm
     and lower(trim(regexp_replace(coalesce(e.subject, ''), '^\s*((re|fw|fwd)\s*:\s*)+', '', 'gi'))) = i.subject_norm
     and coalesce(e."contactId", '') <> ''
    left join contacts c
      on c.id = e."contactId"
    left join accounts a
      on a.id = c."accountId"
    group by i.email_id
    having count(distinct e."contactId") = 1
),
direct_groups as (
    select
        i.email_id,
        max(c.id) as contact_id,
        max(c."accountId") as account_id,
        max(c.name) as contact_name,
        max(a.name) as account_name,
        200 as priority,
        'sender_name_match' as match_reason
    from inbound i
    join contacts c
      on (
            lower(regexp_replace(coalesce(c.name, ''), '[^a-zA-Z0-9]+', '', 'g')) = i.sender_norm
         or lower(regexp_replace(coalesce(c."firstName", '') || coalesce(c."lastName", ''), '[^a-zA-Z0-9]+', '', 'g')) = i.sender_norm
      )
    left join accounts a
      on a.id = c."accountId"
    group by i.email_id
    having count(distinct c.id) = 1
),
candidate_matches as (
    select email_id, contact_id, account_id, contact_name, account_name, priority, match_reason
    from direct_groups
    union all
    select email_id, contact_id, account_id, contact_name, account_name, priority, match_reason
    from group_matches
),
best_matches as (
    select distinct on (email_id)
        email_id,
        contact_id,
        account_id,
        contact_name,
        account_name,
        match_reason
    from candidate_matches
    order by email_id, priority desc, contact_name nulls last, account_name nulls last
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
