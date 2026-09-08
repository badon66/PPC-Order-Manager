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
it there and restart. `ADMIN_ACCESS_CODE` env var overrides it if set — and on
Vercel there is no file, so the env var IS the code.

**Two storage backends, chosen by environment.** Set `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` and the app uses Postgres plus a private artwork
bucket; leave them unset and it uses `data/db.json` plus `public/uploads/`.
The switch is `src/lib/data/index.ts`. It keys off credentials rather than a
flag on purpose: a hosted app pointed at a JSON file writes to a disk that
disappears on the next deploy, and a laptop pointed at Supabase edits live
customer data.

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
  `publicViewOf` in `data/logic.ts` — so a new field on Order doesn't leak to
  the customer's page by default.
- **Business rules live in `data/logic.ts`, not in a store.** What gets logged,
  what a customer sees, what accepting a submission does. Both backends call
  it. Put a rule in one store and the two quietly stop agreeing.
- **Artwork is private.** Stored `fileUrl` is a bucket key, not a URL. Pages
  call `resolveFileUrl`/`resolveAll` (`src/lib/storage.ts`) to get a link that
  expires in an hour. Never persist a signed URL — it works in testing and is
  dead by the time a customer opens it. `ViewableAsset` is the display type.
- **File bytes never travel through a route handler when Supabase is on.**
  Vercel caps a serverless function's request body at ~4.5 MB and nothing
  raises it, so a large crest failed before any app code ran. The browser gets
  a signed upload URL (`createUploadUrl`) and PUTs straight to the bucket:
  `/api/upload/sign` for staff, `PATCH /api/public-upload/[token]` for
  customers. The old multipart POST survives only as the no-Supabase local
  path, which those endpoints announce with a 409. Don't "simplify" this back
  into a single upload route.
- **MAX_BYTES in storage.ts and the bucket's `file_size_limit` must match**
  (both 50 MB — migration `0003`). App limit higher than the bucket means the
  browser sends the whole file and Supabase rejects it at the very end.
- **Creating a record is never a GET.** New Order is a POST server action.
  It used to be a link to a route handler that created a draft, and Next
  prefetches links — so loading the list page spawned blank orders.

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
src/lib/storage.ts        uploads -> private Supabase bucket, or public/uploads/ locally
src/lib/data/repository.ts  THE storage interface — every page goes through this
src/lib/data/logic.ts     store-agnostic rules, shared by both backends
src/lib/data/json-store.ts  local dev impl: data/db.json
src/lib/data/supabase-store.ts  hosted impl: Postgres via supabase-js
src/lib/data/index.ts     picks the impl from the environment
src/lib/supabase.ts       the service-role client. SERVER ONLY.
supabase/migrations/      the SQL schema, applied in order
scripts/migrate-to-supabase.mjs  one-off: local JSON -> Postgres + bucket
src/proxy.ts              the lock — blocks unauthenticated requests before render
src/app/orders/actions.ts every mutation. Server actions. Auth-checked.
src/app/orders/           list, detail, edit
src/app/queue/            production queue
src/app/share/[token]/    customer read-only view
src/app/roster/[token]/   customer roster form (revisits + change logging)
src/app/sales/            cold calling: landing (upload, lists), contacts table, calling view
src/app/sales/actions.ts  every sales mutation — upload, log, edit, skip, delete
src/lib/data/sales-logic.ts  sales rules (queue, call state, validation) — pure, both stores use it
src/lib/sales/            columns (the sheet), import, export, script rules, phone, timezones
src/components/sales/     landing pieces + call-view/ (the one-contact-at-a-time screen)
scripts/build-call-template.mjs  regenerates public/templates/… and the test fixture
src/components/order-form/  the big form: index, fields, roster-table,
                            roster-tally, assets, additional-logos
```

## Conventions

- **Statuses group into three buckets** (`constants.ts`): `UNFINALIZED_STATUSES`
  (incomplete, draft), `ACTIVE_STATUSES` (waiting for payment / approval, in
  production, shipped), and completed. `OPEN_STATUSES` is the first two — what
  the production queue schedules. The order board shows ACTIVE by default and
  puts the other two behind switches that say how many they hide. Use these
  constants, never a hand-written list: the queue had one, `waiting_for_approval`
  was added later and nobody updated it, and every order awaiting a signature
  silently vanished from the schedule.
- **Urgency colour is only for live jobs.** A draft with an old finish date is
  not late — nothing is owed on it. Red on a card that doesn't need action
  teaches you to ignore red on the ones that do.
- Every mutation is a server action in `actions.ts`, calls `requireRole` first,
  goes through `repo`, then `revalidatePath`. Don't call the store from pages.
- **`EDITABLE` in `orders/actions.ts` is an allowlist — add every new form
  field to it in the same commit.** A field missing from it type-checks, renders,
  updates on screen and is dropped on the way to the database, so the control
  looks like it does nothing. That's how the approval toggle, the production
  dates and the spare-jersey list all shipped unsaveable. New date fields go in
  `DATE_FIELDS` too, or a blank input stores `''` and the generated column
  rejects the row. `approvalRecord` is deliberately excluded: only the
  customer's sign-off writes it, so a signature can't be edited afterwards.
- The order form autosaves ~1s after typing. New Order creates a draft row
  first (`/orders/new` route handler) so the form always has a URL.
- Roster columns are **mode-aware**: home/away → four tick boxes per player
  (homeJersey/awayJersey/homeSocks/awaySocks); otherwise → quantity fields.
  `buildTallies` in `roster-tally.tsx` shows the live count vs set quantities.
- Sizes are controlled lists (`JERSEY_SIZES` etc.). Goalie and sock-only are
  flags on the row, not strings in the size field.
- **Roster markers are spelled out, never abbreviated.** `GoalieBadge` and
  `CaptaincyBadge` (`components/captaincy.tsx`) print "Goalie", "Captain" and
  "Alternate" — a bare G or A means nothing to the parent checking their kid's
  row. `RosterEntry.captaincy` / `SubmittedPlayer.captaincy` is `'' | 'C' | 'A'`,
  set by `CaptaincyPicker` on both the client form and the admin roster table,
  hidden on a sock-only row (no jersey, no letter), carried through
  `acceptSubmission`, diffed into the change log, and round-tripped in the CSV
  as the `Letter` column. Old rows have no such field, so `healRosterEntry`
  fills it in on load in both stores.
- **Totals are the entered quantities plus extras. The roster NEVER supplies a
  number** (`computeTotals`). No conditions, no fallbacks — two earlier
  versions each allowed one and each was wrong. The roster is only compared,
  and disagreements surface via `mismatchDetail`.

  **There is no separate "number of players" field.** `playersTotal` was
  removed: a second number meaning the same thing as the jersey count, kept in
  step by hand, which drifted. Roster slots derive from the largest single set
  (`rosterSlotCount`) — every set dresses the same squad, so home/away is 20
  players and 40 jerseys, never 40 slots.

  The bug that settled the totals rule: an order for 16 jerseys and no socks reported 16
  pairs of socks, because a declared `0` was read as "not filled in yet" and
  fell back to the roster, where every blank row defaulted to
  `socksPerPlayer: 1`. **Zero is an answer, not an absence** — and
  `blankRosterEntry` now takes what the order includes so a row can't claim a
  garment that isn't on it. Zeros are dropped from the UI rather than printed
  (`Stat hideWhenZero`).
- Artwork is `OrderAsset` rows with a `role` and `slot` — not numbered columns.
  Additional logos are grouped by `groupId` (label + notes + up to 2 files).
- Web Crypto (`globalThis.crypto`), not `node:crypto`, in anything a client
  component might import. `order-utils.ts` was bitten by this.
- JSON store state is on `globalThis` — Next bundles routes separately and a
  module-level cache went stale between them.

## Tests

Playwright scripts, not committed — they live in the Cowork build session.
Two suites: the non-negotiables above (the lock, no money, calendar dates,
two-tier validation, public pages) and the current feature set (add-on
filtering by jersey type, pants section, laces photos, Numbers & Names, client
form revisits and change logging).

Run against `npm run build && npm run start` — `next start` serves the last
build, so rebuild first or you'll test the previous version and not know it.
Reset the data from a pristine snapshot before each run; the suites mutate
state and stacked runs give false failures.

Gotchas worth knowing before writing more: sections are `#sec-<id>`; a choice
button's active state is `text-ppc-gold`, since `border-ppc-gold` also appears
in inactive hover classes; React omits `type="text"`, so `input[type="text"]`
matches nothing — select by placeholder. Pick orders with `!o.deletedAt`,
because soft-deleted rows are still in the file and 404 on every page.

## Database notes

Every table stores its entity as JSONB in a `data` column; the few fields the
app filters on are Postgres GENERATED columns over that JSON, and indexed. So
there is no snake_case mapping layer and no migration to add an add-on. See the
header of `supabase/migrations/0001_init.sql` for why.

RLS is on everywhere with no policies — the publishable key can read nothing.
The app uses the service role key server-side. Authorization is the access code
and the per-order tokens, in app code.

supabase-js has no transactions. `replaceRoster` and `acceptSubmission` are
ordered so a failure part-way leaves duplicates (visible, deletable) rather
than missing data. Read the comments there before reordering anything.

## Sales — cold calling

Design: `docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md`,
follow-ups (wide layout, finish dialog, jersey manager, contact page, sessions):
`docs/superpowers/specs/2026-09-07-sales-follow-ups-design.md`.

- **One upload = one `CallList`.** Contacts and the script come from the
  sheet; re-upload to change either. `Contact.raw` keeps every cell as typed,
  including columns we don't know — they show under *Other info* and export.
- **Rows are skipped only with no org AND no phone.** Everything else is a
  warning, stored on `list.importReport`, shown every time the list opens.
- **Call state on a contact is written only by `applyCallLog` / `applySkip`**
  in `sales-logic.ts`. Never patch `lastOutcome`, `callCount`, `nextCallDate`
  by hand — the queue is computed from them.
- **Skip is not an outcome.** It logs nothing and bumps `skipCount`.
- **Save & Next requires an outcome**; editing is allowed only for a contact's
  most recent call, and can't undo Do Not Call. The survey lives in the
  *Call finished* dialog (`call-view/finish-dialog.tsx`); an outcome hotkey
  opens it with that outcome chosen, Ctrl+Enter opens it or saves it.
- **Do Not Call is enforced twice**: `buildQueue` drops the contact and the
  server refuses any other outcome for it. The screen hides the number.
- **Linked contacts are derived, never stored.** Same list + same
  `orgKey(orgName)` = the same team (`linkedContacts`). They stay separate
  rows — one team is often two or three people to call — and list each other
  under *Also at this team*. Don't merge them and don't add a team table.
- **"Who handles the jerseys" is `isJerseyManager`, one per team at most.**
  It is NOT a decision maker (decisions are usually a group). Only
  `planJerseyManager` writes it: *This person* flags the contact and clears
  the rest of the team; *Someone else* flags a linked contact or creates a
  new linked row (`contactFromPerson`) and clears the others. The server
  applies those moves as `extraPatches` in the same `addCallLog` call.
- **A `CallSession` is a row, not a timer.** The calling view starts one when
  it opens (closing any the list left open), stamps every `CallLog.sessionId`,
  and ends it from the back link. A tab closed mid-session stays open until
  the next start; the list page shows it as ended at its last call. The
  footer tally is per session, not per day.
- **`/sales/[id]/contacts/[contactId]` is read-only.** Every contact link on
  the list page goes there; only *Start call* (and the Start calling button)
  enters the calling view. Opening a contact must never start a session.
- **Write order on Supabase**: list before contacts; log before contact patch
  before the other team members' patches before the new contact. Read the
  comments in `supabase-store.ts` before reordering.
- **Drafts live in `localStorage`** per contact until saved; the session id
  in `sessionStorage` per list so a refresh keeps counting. Both are
  per-device conveniences.
- **Sales pages get the wide layout** (`.sales-wide` in `sales/layout.tsx`,
  rule in `globals.css`): 120rem instead of 72rem. Orders stay narrow.
- **The template and the importer share one column map** (`sales/columns.ts`)
  and one pick-list file (`sales/picklists.json`). Change either, run
  `npm run build:template`, commit the regenerated `.xlsx`.
- `npm test` covers the pure modules (`tests/sales/`). Stores and pages are
  checked by `tsc` and the browser walkthrough.

## Not built yet

Real per-person auth · PDF spec sheet · Gmail thread panel · post-approval
edits surfaced on the list and queue (the order form warns, the change log
records, but neither list flags it yet).

**Customer approval is built.** `requestApproval` per order shows a sign-off
block on BOTH public links **and at the bottom of the admin order sheet**, so a
team can sign in person on Keenan's phone — same component, same server action,
same record, only the wording differs (`audience="staff"`). `ApprovalRecord`
stores the statement as it read, the terms URL, the instant, and the request
origin. Approving twice is refused. `APPROVAL_STATEMENT` and `TERMS_URL` are in
`constants.ts` — the statement is copied onto each record, so rewording it never
changes what someone signed.

**The signature is drawn, not typed.** `SignaturePad` (`components/signature-pad.tsx`)
is a canvas using Pointer Events — one handler set for mouse, finger and stylus,
`touch-action: none` so a finger draws instead of scrolling, buffer sized by
`getBoundingClientRect()` × dpr so the ink lands under the pointer. A tap is not
a signature: it needs 60px of travel (`MIN_INK`) before it exports. It exports
downscaled to 800px because `ApprovalRecord.signatureDataUrl` is stored inline
on the order row, and `listOrders` reads rows whole — a real signature is ~8 KB;
the server rejects anything over 250 KB or not a `data:image/png;base64,` URL.
Display it with `SignatureProof`, which renders identically in all three places
and says so plainly when an old approval has a name but no drawn mark.

## The Base44 rescue is gone — don't rebuild it

The imported orders' artwork lives at `base44.app` URLs and is staying there.
Keenan decided the old files aren't worth rescuing, so `/rehost`, the
`/api/import/base44` endpoint, `lib/migrate-base44.ts`, `putBytes` and the
`rehostAsset*` store helpers were deleted outright.

**The asset rows were deliberately left alone.** `resolveAll` in `storage.ts`
passes a full `http(s)://` value straight through instead of treating it as a
bucket key, which is the only reason that artwork still displays. Don't
"tidy up" that branch — it's what keeps 17 historical orders showing their
crests. When Base44 is switched off they'll break, and that's the accepted
outcome, not a bug to fix.

## Known dead weight from Base44 (don't port)

"Build Type" dropdown in Add-Ons (Jersey/Sock/Pant Shell) — switches nothing,
no field behind it. `delivery_concern`, `single_*`/`multiple_*` quantity
variants — never used.
