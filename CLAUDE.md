# Powerplay Customs — Order Manager

Internal order-management app for a custom hockey jersey company. Replaces a
Base44 app. Owner: Keenan Huber. This file is for any Claude (Code or Cowork)
working in this repo — read it before changing anything.

@AGENTS.md

## What this is

Next.js 16 (App Router, `src/` layout) + TypeScript + Tailwind v4. No UI
library — components are hand-rolled in `src/components/ui.tsx`. Dark theme,
near-black background, gold accent (`--gold`). It gets used on a phone at a
rink, so mobile is not an afterthought.

Run: `npm install` then `npm run dev` → http://localhost:3000

Access code lives in `admin-code.txt` in the project root (gitignored). Change
it there and restart. `ADMIN_ACCESS_CODE` env var overrides it if set.

## Non-negotiables

- **No pricing, money, or invoicing anywhere.** Not a dollar field, not a
  total, not a "helpful" cost estimate. Deliberate. Don't add it.
- **Dates never pass through a timezone.** `datePaid`, `approvedDate`,
  `estimatedFinishDate` are `YYYY-MM-DD` strings. Format with helpers in
  `src/lib/dates.ts`. Never `new Date(str)` a date-only string. The old app
  displayed every date one day early because of this.
- **The access code never reaches the browser.** Compared server-side in
  `src/lib/session.ts`. Browser only ever gets a signed httpOnly cookie. If you
  find yourself putting the code in client code, stop.
- **Never discard user input to enforce a soft rule.** Validation is two-tier
  (`saveOrder` in `src/app/orders/actions.ts`): blocking = would corrupt the
  record (bad date); warning = storable but flag it (duplicate invoice). One
  bad field must not throw away the rest of the autosave.
- **Public pages are built field-by-field, never by spreading the order.**
  `getByShareToken` in `json-store.ts` — so a new field on Order doesn't leak
  to the customer's page by default.

## Access model (as Keenan specified — don't second-guess it)

- Everything behind one shared access code. Anyone with it sees everything,
  including contact and shipping. There is no admin/staff split right now.
- `/share/<token>` and `/roster/<token>` are **public** — no code. Protected by
  a long random per-order token. The share page **deliberately shows** the
  customer's contact and shipping so they can check it.
- Per-person login is deferred, not cancelled. `src/lib/auth.ts` is the one
  file that changes when it happens.

## Where things are

```
src/lib/types.ts          every entity + enum — start here
src/lib/constants.ts      statuses, sizes, add-on list, CSV columns (edit lists here)
src/lib/dates.ts          calendar-date helpers
src/lib/order-utils.ts    set scaffolding, totals reconciliation, tokens
src/lib/csv.ts            roster CSV export/import (round-trips)
src/lib/session.ts        access code + signed cookie
src/lib/auth.ts           who-is-this + requireRole (placeholder for per-person)
src/lib/storage.ts        file uploads → public/uploads/ (swap for Supabase later)
src/lib/data/repository.ts  THE storage interface — every page goes through this
src/lib/data/json-store.ts  current impl: data/db.json (dev only)
src/lib/data/index.ts     picks the impl. Swap here for Supabase.
src/proxy.ts              the lock — blocks unauthenticated requests before render
src/app/orders/actions.ts every mutation. Server actions. Auth-checked.
src/app/orders/           list, detail, edit
src/app/queue/            production queue
src/app/share/[token]/    customer read-only view
src/app/roster/[token]/   customer roster form (not built yet)
src/components/order-form/  the big form: index, fields, roster-table,
                            roster-tally, assets, additional-logos
```

## Conventions

- Every mutation is a server action in `actions.ts`, calls `requireRole` first,
  goes through `repo`, then `revalidatePath`. Don't call the store from pages.
- The order form autosaves ~1s after typing. New Order creates a draft row
  first (`/orders/new` route handler) so the form always has a URL.
- Roster columns are **mode-aware**: home/away → four tick boxes per player
  (homeJersey/awayJersey/homeSocks/awaySocks); otherwise → quantity fields.
  `buildTallies` in `roster-tally.tsx` shows the live count vs set quantities.
- Sizes are controlled lists (`JERSEY_SIZES` etc.). Goalie and sock-only are
  flags on the row, not strings in the size field.
- Artwork is `OrderAsset` rows with a `role` and `slot` — not numbered columns.
  Additional logos are grouped by `groupId` (label + notes + up to 2 files).
- Web Crypto (`globalThis.crypto`), not `node:crypto`, in anything a client
  component might import. `order-utils.ts` was bitten by this.
- JSON store state is on `globalThis` — Next bundles routes separately and a
  module-level cache went stale between them.

## Tests

Playwright scripts (not committed — in the Cowork build session, but easy to
recreate): form suite (autosave, URL, modes, roster, dates, dup invoice), auth
suite (redirect, cookie httpOnly, code absent from bundles, share public), and
roster suite (mode-aware columns, tallies, logo groups). Run against
`npm run build && npm run start`. Rebuild before testing — `next start`
serves the last build.

## Not built yet

Client roster submission form · customer approval flow (amendments agreed:
record IP/UA/timestamp, on-behalf approvals labelled as such, post-approval
edits flagged, surfaced on list + queue, `approvalRequestedAt` timestamp) ·
real per-person auth · PDF spec sheet · Gmail thread panel · hosting.

## Known dead weight from Base44 (don't port)

"Build Type" dropdown in Add-Ons (Jersey/Sock/Pant Shell) — switches nothing,
no field behind it. `delivery_concern`, `single_*`/`multiple_*` quantity
variants — never used.
