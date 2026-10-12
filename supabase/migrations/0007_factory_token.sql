-- The factory sheet's link token, looked up the same way as the share and
-- roster tokens: a generated column over the JSON, unique where present.
--
-- Partial on <> '' as well as NOT NULL: orders written before the factory
-- sheet existed are healed to an empty string, not a token, until Keenan makes
-- the link for them, and a unique index over '' would refuse the second one.

alter table public.orders
  add column if not exists factory_token text
  generated always as (data->>'factoryToken') stored;

create unique index if not exists orders_factory_token_key
  on public.orders (factory_token)
  where factory_token is not null and factory_token <> '';
