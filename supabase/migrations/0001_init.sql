-- Powerplay Customs order manager — initial schema.
--
-- SHAPE, AND WHY
--
-- Each row keeps its whole entity as JSONB in `data`, exactly the shape the
-- TypeScript types describe. The columns the app actually filters and sorts on
-- are GENERATED from that JSONB and indexed.
--
-- The alternative — fifty-odd real columns on `orders` — means a snake_case
-- mapping layer with fifty chances to typo a field name, and a migration every
-- time an add-on is added. The app's entire query surface is: list (search on
-- team/invoice, filter by status, hide completed, hide deleted), fetch by id,
-- fetch by share token, fetch by roster token. That's it. Nothing reads an
-- individual add-on boolean in SQL.
--
-- Generating the queried columns rather than duplicating them means there is
-- exactly one source of truth per value, and no way for the column and the
-- JSON to disagree.
--
-- ACCESS
--
-- RLS is on everywhere with no policies, so the anon and authenticated keys can
-- read nothing at all. The app reaches this with the service role key, held
-- server-side only, which bypasses RLS. Authorization lives in the app: one
-- shared access code for the admin side, unguessable per-order tokens for the
-- two public pages. If the publishable key ever leaks it grants nothing.

-- Requires 0000_immutable_json_casts.sql — the date/timestamp columns below
-- are generated through public.date_iso() and public.ts_utc(), because a
-- generated column must be immutable and a bare text cast to date/timestamptz
-- is not.

create extension if not exists "pgcrypto";

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

create table if not exists public.orders (
  id uuid primary key,
  data jsonb not null,

  team_name text generated always as (data->>'teamName') stored,
  invoice_number text generated always as (data->>'invoiceNumber') stored,
  status text generated always as (data->>'status') stored,
  share_token text generated always as (data->>'shareToken') stored,
  roster_token text generated always as (data->>'rosterToken') stored,
  -- Calendar dates, not timestamps. Stored as 'YYYY-MM-DD' text in the JSON and
  -- surfaced as `date` here so ordering works; nothing ever converts a timezone.
  date_paid date generated always as (public.date_iso(data->>'datePaid')) stored,
  estimated_finish_date date generated always as (public.date_iso(data->>'estimatedFinishDate')) stored,
  updated_at timestamptz generated always as (public.ts_utc(data->>'updatedAt')) stored,
  created_at timestamptz generated always as (public.ts_utc(data->>'createdAt')) stored,
  deleted_at timestamptz generated always as (public.ts_utc(data->>'deletedAt')) stored
);

-- Tokens address the public pages, so a collision would hand one customer
-- another's order. Unique, and partial so historical nulls can't block a write.
create unique index if not exists orders_share_token_key
  on public.orders (share_token) where share_token is not null;
create unique index if not exists orders_roster_token_key
  on public.orders (roster_token) where roster_token is not null;

-- The list page: live orders, newest first.
create index if not exists orders_live_updated_idx
  on public.orders (updated_at desc) where deleted_at is null;
create index if not exists orders_status_idx on public.orders (status);

-- Search is a case-insensitive substring match on two fields over a handful of
-- rows, so trigram indexes would cost more than they save. Left plain on
-- purpose; revisit past a few thousand orders.

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

create table if not exists public.roster_entries (
  id uuid primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  data jsonb not null,
  sort_order int generated always as ((data->>'sortOrder')::int) stored
);

create index if not exists roster_order_idx on public.roster_entries (order_id, sort_order);

/* ------------------------------------------------------------------ *
 * Artwork
 *
 * `file_url` is either a storage key in the private artwork bucket or, for
 * anything imported from Base44 and not yet copied across, an http URL. The
 * app tells them apart and only signs the former.
 * ------------------------------------------------------------------ */

create table if not exists public.order_assets (
  id uuid primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  data jsonb not null,
  role text generated always as (data->>'role') stored,
  slot int generated always as ((data->>'slot')::int) stored,
  file_url text generated always as (data->>'fileUrl') stored
);

create index if not exists assets_order_idx on public.order_assets (order_id, slot);
create index if not exists assets_role_idx on public.order_assets (order_id, role);

/* ------------------------------------------------------------------ *
 * Client submissions — staging. Never merged onto an order automatically.
 * ------------------------------------------------------------------ */

create table if not exists public.client_submissions (
  id uuid primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  data jsonb not null,
  revision int generated always as ((data->>'revision')::int) stored,
  submitted_at timestamptz generated always as (public.ts_utc(data->>'submittedAt')) stored,
  accepted_at timestamptz generated always as (public.ts_utc(data->>'acceptedAt')) stored
);

create index if not exists submissions_order_idx
  on public.client_submissions (order_id, submitted_at desc);

-- One row per revision per order. Two browser tabs submitting at once would
-- otherwise both read revision 3 and both write 4.
create unique index if not exists submissions_order_revision_key
  on public.client_submissions (order_id, revision);

/* ------------------------------------------------------------------ *
 * Change history
 *
 * Append-only in practice. `snapshot` inside data holds the whole order on
 * approval, which is what makes "what exactly was signed off" answerable.
 * ------------------------------------------------------------------ */

create table if not exists public.change_log (
  id uuid primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  data jsonb not null,
  action text generated always as (data->>'action') stored,
  at timestamptz generated always as (public.ts_utc(data->>'at')) stored
);

create index if not exists change_log_order_idx on public.change_log (order_id, at desc);

/* ------------------------------------------------------------------ *
 * Users
 *
 * Not an auth table. It's the list the app shows as "who can be an actor",
 * standing in until per-person login exists.
 * ------------------------------------------------------------------ */

create table if not exists public.app_users (
  id uuid primary key,
  data jsonb not null,
  email text generated always as (data->>'email') stored
);

create unique index if not exists app_users_email_key on public.app_users (email);

/* ------------------------------------------------------------------ *
 * Lock everything down
 * ------------------------------------------------------------------ */

alter table public.orders enable row level security;
alter table public.roster_entries enable row level security;
alter table public.order_assets enable row level security;
alter table public.client_submissions enable row level security;
alter table public.change_log enable row level security;
alter table public.app_users enable row level security;

-- Deliberately no policies. Every table is unreachable with the publishable
-- key. Only the service role, used server-side, can touch these.
