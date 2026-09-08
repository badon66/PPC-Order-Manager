-- Sales — calling sessions. One small row per session; each call log carries
-- its sessionId inside its own data, so nothing else changes.
--
-- QUERY SURFACE: a list's sessions newest first. Nothing else is filtered.
--
-- Requires 0000_immutable_json_casts.sql (ts_utc).

create table if not exists public.call_sessions (
  id uuid primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  data jsonb not null,
  started_at timestamptz generated always as (public.ts_utc(data->>'startedAt')) stored
);

create index if not exists call_sessions_list_idx on public.call_sessions (list_id, started_at desc);

-- RLS on, no policies, like every other table: the service role is the only reader.
alter table public.call_sessions enable row level security;
