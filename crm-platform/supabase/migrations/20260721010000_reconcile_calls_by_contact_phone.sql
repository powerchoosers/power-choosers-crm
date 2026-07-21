create or replace function util.normalized_phone(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when length(regexp_replace(value, '\D', '', 'g')) >= 10
      then right(regexp_replace(value, '\D', '', 'g'), 10)
    else null
  end
$$;

create or replace function util.link_call_to_contact_by_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  remote_phone text;
  matched_contact_id text;
  matched_account_id text;
begin
  if new."contactId" is not null then
    return new;
  end if;

  remote_phone := case
    when lower(coalesce(new.direction, '')) like 'inbound%'
      then util.normalized_phone(new."from")
    else util.normalized_phone(new."to")
  end;

  if remote_phone is null then
    return new;
  end if;

  select min(candidate.id), min(candidate."accountId")
    into matched_contact_id, matched_account_id
  from public.contacts candidate
  where remote_phone = any(array[
    util.normalized_phone(candidate.phone),
    util.normalized_phone(candidate.mobile),
    util.normalized_phone(candidate."workPhone"),
    util.normalized_phone(candidate."otherPhone"),
    util.normalized_phone(candidate."companyPhone")
  ])
  having count(*) = 1;

  if matched_contact_id is not null then
    new."contactId" := matched_contact_id;
    new."accountId" := coalesce(new."accountId", matched_account_id);
  end if;

  return new;
end
$$;

create or replace function util.reconcile_contact_calls_by_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  contact_phones text[];
begin
  contact_phones := array_remove(array[
    util.normalized_phone(new.phone),
    util.normalized_phone(new.mobile),
    util.normalized_phone(new."workPhone"),
    util.normalized_phone(new."otherPhone"),
    util.normalized_phone(new."companyPhone")
  ], null);

  if cardinality(contact_phones) = 0 then
    return new;
  end if;

  update public.calls call_row
  set
    "contactId" = new.id,
    "accountId" = coalesce(call_row."accountId", new."accountId")
  where call_row."contactId" is null
    and case
      when lower(coalesce(call_row.direction, '')) like 'inbound%'
        then util.normalized_phone(call_row."from") = any(contact_phones)
      else util.normalized_phone(call_row."to") = any(contact_phones)
    end
    and not exists (
      select 1
      from public.contacts other_contact
      where other_contact.id <> new.id
        and (case
          when lower(coalesce(call_row.direction, '')) like 'inbound%'
            then util.normalized_phone(call_row."from")
          else util.normalized_phone(call_row."to")
        end) = any(array[
          util.normalized_phone(other_contact.phone),
          util.normalized_phone(other_contact.mobile),
          util.normalized_phone(other_contact."workPhone"),
          util.normalized_phone(other_contact."otherPhone"),
          util.normalized_phone(other_contact."companyPhone")
        ])
    );

  return new;
end
$$;

drop trigger if exists trg_link_call_to_contact_by_phone on public.calls;
create trigger trg_link_call_to_contact_by_phone
before insert or update of "from", "to", direction, "contactId"
on public.calls
for each row
execute function util.link_call_to_contact_by_phone();

drop trigger if exists trg_reconcile_contact_calls_by_phone on public.contacts;
create trigger trg_reconcile_contact_calls_by_phone
after insert or update of phone, mobile, "workPhone", "otherPhone", "companyPhone", "accountId"
on public.contacts
for each row
execute function util.reconcile_contact_calls_by_phone();
