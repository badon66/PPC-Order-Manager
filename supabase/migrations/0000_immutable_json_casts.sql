-- Immutable parsers for the date and timestamp values stored as text in JSONB.
--
-- A generated column must be immutable, and neither `text::date` nor
-- `text::timestamptz` is: the first depends on DateStyle, the second on the
-- session TimeZone. Postgres rejects them outright with
-- "generation expression is not immutable". This file exists because the
-- original 0001 tried exactly that and could not be applied.
--
-- These two wrappers are honestly immutable rather than conveniently declared
-- so:
--
--   * to_date() with an explicit format is itself immutable — DateStyle cannot
--     reinterpret 'YYYY-MM-DD'.
--   * ts_utc() only takes the timezone-dependent path when the input carries
--     no offset, and in that case pins it to UTC explicitly instead of
--     inheriting the session's. Every value the app writes comes from
--     JavaScript's Date#toISOString(), which always ends in 'Z', so in
--     practice the first branch is the only one taken. The fallback exists so
--     a hand-edited row can never silently change what an index contains.
--
-- search_path is pinned and every builtin is schema-qualified, so nothing here
-- can be hijacked by a shadowing object earlier on someone's search path.

create or replace function public.date_iso(t text)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when t is null or t = '' then null
           else pg_catalog.to_date(t, 'YYYY-MM-DD')
         end
$$;

comment on function public.date_iso(text) is
  'Immutable YYYY-MM-DD parser for generated columns over JSONB text.';

create or replace function public.ts_utc(t text)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when t is null or t = '' then null
           -- Explicit offset present: the parse is timezone-independent.
           when t ~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' then t::pg_catalog.timestamptz
           -- No offset: read it as UTC rather than as whatever the session says.
           else (t::pg_catalog.timestamp) at time zone 'UTC'
         end
$$;

comment on function public.ts_utc(text) is
  'Immutable ISO-8601 parser for generated columns over JSONB text. Assumes UTC when no offset is given.';
