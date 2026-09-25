-- App-wide settings: one row, id 'app', three strings Keenan writes once
-- (how to pay, Google review link, referral line). Read on every send.
create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null
);

-- RLS on, no policies, like every other table: the service role is the only reader.
alter table public.app_settings enable row level security;
