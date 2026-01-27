-- Add city and state columns to contacts table
alter table contacts add column if not exists city text;
alter table contacts add column if not exists state text;

-- Optional: Create an index for faster searching
create index if not exists contacts_city_idx on contacts(city);
create index if not exists contacts_state_idx on contacts(state);
