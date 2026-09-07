-- Sales — cold calling. Three tables, same shape as the rest: the entity as
-- JSONB in `data`, generated columns only for what is queried.
--
-- QUERY SURFACE: list the live lists newest first; load one list's contacts
-- in sheet order and its logs newest first; find one contact; find a
-- contact's most recent log. Nothing filters on an individual sheet column,
-- so nothing else is generated.
--
-- Requires 0000_immutable_json_casts.sql (ts_utc / date_iso).

create table if not exists public.call_lists (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz generated always as (public.ts_utc(data->>'createdAt')) stored,
  deleted_at timestamptz generated always as (public.ts_utc(data->>'deletedAt')) stored
);

create index if not exists call_lists_live_idx
  on public.call_lists (created_at desc) where deleted_at is null;

create table if not exists public.call_contacts (
  id uuid primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  data jsonb not null,
  sort_order int generated always as ((data->>'sortOrder')::int) stored,
  created_at timestamptz generated always as (public.ts_utc(data->>'createdAt')) stored,
  last_outcome text generated always as (data->>'lastOutcome') stored,
  next_call_date date generated always as (public.date_iso(data->>'nextCallDate')) stored,
  do_not_call boolean generated always as ((data->>'doNotCall')::boolean) stored
);

create index if not exists call_contacts_list_idx
  on public.call_contacts (list_id, sort_order, created_at);

create table if not exists public.call_logs (
  id uuid primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  contact_id uuid not null references public.call_contacts (id) on delete cascade,
  data jsonb not null,
  started_at timestamptz generated always as (public.ts_utc(data->>'startedAt')) stored,
  outcome text generated always as (data->>'outcome') stored
);

create index if not exists call_logs_list_idx on public.call_logs (list_id, started_at desc);
create index if not exists call_logs_contact_idx on public.call_logs (contact_id, started_at desc);

-- RLS on, no policies: the publishable key reads nothing. The app uses the
-- service role server-side, same as every other table.
alter table public.call_lists enable row level security;
alter table public.call_contacts enable row level security;
alter table public.call_logs enable row level security;
