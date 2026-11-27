-- Client portal: bills, supplier directory, automatic bill intake.
-- New tables only. All writes go through server routes using the service role key.

-- Supplier directory. Names only are seeded. Phone numbers are never seeded: they come
-- from a client's own bill, from a web lookup that stores its source link, or an advisor.
create table if not exists public.energy_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,            -- lower-case, letters and digits only
  aliases text[] not null default '{}',     -- name_key forms of other spellings
  support_phone text,
  support_hours text,
  support_email text,
  website text,
  phone_source text check (phone_source in ('bill', 'web', 'advisor')),
  source_url text,
  verified boolean not null default false,  -- an advisor confirmed the number
  looked_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists energy_suppliers_aliases_idx on public.energy_suppliers using gin (aliases);

insert into public.energy_suppliers (name, name_key, aliases) values
  ('TXU Energy', 'txuenergy', '{txu,txuenergyretailcompanyllc}'),
  ('NRG Business', 'nrgbusiness', '{nrg,nrgenergy}'),
  ('Reliant', 'reliant', '{reliantenergy,reliantenergyretailservices}'),
  ('ENGIE Resources', 'engieresources', '{engie,engieresourcesllc}'),
  ('Constellation', 'constellation', '{constellationnewenergy,constellationnewenergyinc,constellationenergy}'),
  ('APG&E', 'apge', '{apgande,apgeenergy,apgeenergysolutions}'),
  ('Direct Energy Business', 'directenergybusiness', '{directenergy,directenergybusinessllc}'),
  ('Gexa Energy', 'gexaenergy', '{gexa}'),
  ('Hudson Energy', 'hudsonenergy', '{hudson,hudsonenergyservices,hudsonenergyservicesllc}'),
  ('Freepoint Energy Solutions', 'freepointenergysolutions', '{freepoint,freepointenergysolutionsllc}'),
  ('Gridmatic', 'gridmatic', '{}'),
  ('Champion Energy', 'championenergy', '{champion,championenergyservices}'),
  ('Ironhorse Power', 'ironhorsepower', '{ironhorse}'),
  ('Shell Energy Solutions', 'shellenergysolutions', '{shellenergy,mp2energy}'),
  ('Spark Energy', 'sparkenergy', '{spark,sparkenergyllc}')
on conflict (name_key) do nothing;

create table if not exists public.client_bills (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.accounts(id) on delete cascade,
  source text not null check (source in ('upload', 'email', 'advisor')),
  status text not null default 'processing' check (status in ('processing', 'ready', 'needs_review', 'failed')),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  sha256 text not null,
  uploaded_by_email text,
  source_sender text,
  supplier_id uuid references public.energy_suppliers(id) on delete set null,
  supplier_name text,
  account_number text,
  esid text,
  service_address text,
  period_start date,
  period_end date,
  due_date date,
  total_amount numeric(12,2),
  usage_kwh numeric(14,2),
  billed_demand_kw numeric(10,2),
  actual_demand_kw numeric(10,2),
  energy_rate numeric(10,6),          -- dollars per kWh, as printed
  supply_charges numeric(12,2),
  delivery_charges numeric(12,2),
  taxes_and_fees numeric(12,2),
  extracted jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  review_reason text,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, sha256)
);

create index if not exists client_bills_account_period_idx on public.client_bills (account_id, period_end desc nulls last, created_at desc);

-- Automatic intake enrollment: one forwarding address per account.
create table if not exists public.client_bill_intake (
  account_id text primary key references public.accounts(id) on delete cascade,
  address_token text not null unique,
  status text not null default 'active' check (status in ('active', 'paused')),
  enrolled_by_email text,
  enrolled_at timestamptz not null default now(),
  last_received_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Inbound webhook idempotency: one row per delivery id.
create table if not exists public.client_bill_inbound_events (
  event_id text primary key,
  received_at timestamptz not null default now(),
  result text
);

alter table public.energy_suppliers enable row level security;
alter table public.client_bills enable row level security;
alter table public.client_bill_intake enable row level security;
alter table public.client_bill_inbound_events enable row level security;

revoke all on public.energy_suppliers, public.client_bills, public.client_bill_intake, public.client_bill_inbound_events from anon;
revoke insert, update, delete on public.client_bills, public.client_bill_intake from authenticated;
revoke all on public.client_bill_inbound_events from authenticated;

create policy "Signed-in users read suppliers" on public.energy_suppliers
  for select to authenticated using (true);
create policy "Admins manage suppliers" on public.energy_suppliers
  for all to authenticated using (is_admin()) with check (is_admin());

-- A bill is visible exactly when its account is (admins, account owners, the client).
create policy "Read bills of accounts you can see" on public.client_bills
  for select to authenticated
  using (account_id in (select a.id from public.accounts a));

create policy "Read intake of accounts you can see" on public.client_bill_intake
  for select to authenticated
  using (account_id in (select a.id from public.accounts a));
