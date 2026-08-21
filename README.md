# Powerplay Customs — Order Manager

Replacement for the Base44 app at `powerplay-order-manager.base44.app`.
Built to the spec in `powerplay-order-manager-build-brief.md`.

## Running it

You need Node 20+ installed on your PC. Then, in this folder:

```
npm install
npm run dev
```

Open http://localhost:3000

Sample data is generated on first run into `data/db.json` — invented teams, nothing
from the live Base44 app. Delete that file to start over with a blank slate.

## Where things are

```
src/lib/dates.ts          Calendar-date handling — the off-by-one date fix lives here
src/lib/types.ts          Every entity and enum
src/lib/constants.ts      Statuses, sizes, add-on list, CSV columns — edit lists here
src/lib/order-utils.ts    Set scaffolding, totals reconciliation, tokens
src/lib/csv.ts            Roster CSV export + import (round-trips)
src/lib/auth.ts           PLACEHOLDER auth — swap this one file for Supabase
src/lib/data/             Storage. repository.ts is the interface; json-store.ts is
                          the current file-backed implementation; index.ts picks one
src/app/orders/           Admin: list, detail, form
src/app/queue/            Production queue
src/app/share/[token]/    Customer-facing read-only order view
src/app/roster/[token]/   Customer-facing roster submission form
```

## Built so far

- Order list — search, status filter, show/hide completed
- Order detail — full spec view, inline status / finish date / tracking editing
- Production queue — overdue, due soon, by month, and orders with no date set
- Customer share page — redacted, token-addressed, no login
- CSV roster export and import (round-trip safe)
- Change history recorded on every mutation, with an approval snapshot
- Totals reconciliation between roster and declared set quantities

## Not built yet

- The order form (new + edit) — the big one
- Client roster submission form
- File uploads for artwork
- Real authentication
- PDF spec sheet
- Gmail thread panel

## Two things to know before this goes near real customers

**Auth is a placeholder.** `src/lib/auth.ts` returns a fixed admin user. Every page
and action already routes through it, so replacing it is a swap of that one file —
but until that happens there is no login and no authorization.

**Storage is a JSON file.** Fine for building against; not safe for concurrent use
and not backed up. `src/lib/data/index.ts` is the single place that chooses the
storage backend.

## Design decisions carried over from the teardown

Things the old app got wrong that this deliberately does differently:

- **Dates never pass through a timezone.** A date stored as `2026-08-13` displays as
  August 13 everywhere, including the customer's page. The old app showed August 12.
- **Public pages are built field-by-field**, not by spreading the order object, so
  contact details and shipping addresses can't leak when a field is added later.
- **Share links use a random per-order token**, not the database row id.
- **Roster is the source of truth for totals** when one exists, and a disagreement
  with the declared set quantities is shown rather than silently rendered as two
  different numbers on two pages.
- **Sizes come from a controlled list** in `constants.ts`. Goalie and sock-only are
  their own flags, not strings typed into the size field.
- **No pricing anywhere.** Deliberate. Don't add it.
