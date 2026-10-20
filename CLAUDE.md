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
Vercel there is no file, so the env var IS the code. The factory's code works
the same way: `factory-code.txt` locally, `FACTORY_ACCESS_CODE` hosted. It
must differ from the admin code or the factory sheet refuses to open
(`configuredFactoryCode` in `src/lib/session.ts`).

**Two storage backends, chosen by environment.** Set `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` and the app uses Postgres plus a private artwork
bucket; leave them unset and it uses `data/db.json` plus `public/uploads/`.
The switch is `src/lib/data/index.ts`. It keys off credentials rather than a
flag on purpose: a hosted app pointed at a JSON file writes to a disk that
disappears on the next deploy, and a laptop pointed at Supabase edits live
customer data.

**The website posts enquiries in.** `POST /api/intake` (public by Origin, not by
session — see `src/proxy.ts`) creates a Draft with `source: 'website'`, the raw
words in `order.enquiry`, and the client link on. The allowed origins are the
two site origins unless `INTAKE_ALLOWED_ORIGINS` (comma-separated) says
otherwise. Rules in `src/lib/data/intake-logic.ts`, the write in
`src/lib/data/intake.ts`, the per-route customer-page copy in
`src/lib/route-copy.ts`.

## Non-negotiables

- **Money is Keenan's and nobody else's.** Decided 2026-10-02, replacing the
  old "no money anywhere" rule. Money fields (`orderValue`, `completedAt`, the
  list prices in `lib/pricing.ts`, the board's Outgoing / YTD panel) live
  behind the access code. They must NEVER appear in `PublicOrderView` /
  `publicViewOf`, in `FactoryOrderView` / `factoryViewOf`, on `/share/<token>`,
  `/roster/<token>` or `/factory/<token>`, in the roster CSV (any route), or
  in `ApprovalRecord`. The client and the manufacturer never see a price —
  nor a payment date (`datePaid` is not on the factory view). `tests/money/leak.test.ts`
  checks every one of those surfaces by value AND by key name; a new money
  field means adding it to that test in the same commit.
  The payment-request emails still carry the amount Keenan types into the
  send panel, and that amount goes into that email and nowhere else.
- **Keeper jerseys are Powerplay's, not the team's.** `Order.keeperJerseys`
  (`KeeperJersey`, rules in `src/lib/keepers.ts`) are the "make an extra of
  this jersey for us to keep" rows: made with the run, held at the facility,
  never shipped with the order. They are never on the customer's sheet, never
  priced, never in `computeTotals` or the roster tally. Keenan's order page
  and the factory sheet show them marked *Keep for Powerplay*. The leak test
  checks the public view carries no `keeper*`/`factory*` key.
- **Section comments say who reads them** (Keenan, 2026-10-20). "Add comment"
  beside each form section's tick (`SectionCard`/`WizardFrame` in
  `order-form/shell.tsx`) stores one `Order.sectionComments[section]` with an
  audience: `everyone` (customer + factory sheets), `factory` (factory sheet
  only) or `internal` (Keenan's order page only). New comments start as
  `internal`, and `cleanSectionComments` turns any unknown audience into
  `internal`, so nothing is published by accident. `buildSheetOf` carries NO
  comments; `publicViewOf` and `factoryViewOf` each add their own via
  `sheetComments(o, audiences)`, and the build-sheet sections show them at the
  top (`SectionComments`). Never fill comments in `buildSheetOf`.
- **Custom branding** sits in the Powerplay Branding section: `customBranding`
  (the switch) and `customBrandingItems` — any number of logos, each with a
  name, notes and two files (asset roles `custom_branding_logo` +
  `custom_branding_placement`, matched to the logo by `groupId`; files from
  before there could be several have no groupId and belong to the first —
  `customBrandingFiles`). `customBrandingNotes` is the old single description,
  healed into the first item. Shown with the branding on both sheets
  (`CustomBrandingList`), kept out of the logo gallery (`CUSTOM_BRANDING_ROLES`).
  Tier presets never touch it.
- **Sets can be different builds** (Keenan, 2026-10-20). The order's
  `jerseyType`/`jerseyTier` are the FIRST set's; a later set carries its own
  `jerseyType`/`jerseyTier` only when it differs. Read builds through
  `setBuilds` / `buildsDiffer` / `jerseyTypesInUse` (order-utils), never
  `order.jerseyType` alone: pricing goes set by set, add-ons are offered for
  every type in use, the sheets list each set's build (`SetBuildsList`).
- **Hybrid** is a sublimated tier: Premier's add-ons plus stitched-on logos
  (`alsoOn` in TIER_DEFS — turned on by the preset, never turned off by the
  others). Priced as Premier + the $20 stitched-logo line.
- **Home/away captain patches are two designs**: `captainC/AQuantity` is the
  home set's and `captainAwayC/AQuantity` the away set's on a home/away order;
  read them through `captainCounts`. Priced in sets per design.
- **Pictures are two to a row** (2026-10-20) in the artwork galleries and the
  form's upload groups — still whole, scaled to their half.
- **Two note boxes, two readers.** `specialNotes` is on the customer's sheet
  AND the factory's; `factoryNotes` is on the factory's only. Don't merge them
  and don't put a factory-only note on `BuildSheet`.
- **Premier does not include stitched-on logos.** They're the $20-a-jersey
  add-on on any sublimated tier (`STITCHED_ON_SUBLIMATED_PER_JERSEY`); the
  Premier preset no longer ticks them (Keenan, 2026-10-15).
- **Customer update emails are offered, never sent, on a status change.** The
  panel on the order page asks first; only the approval receipt is automatic.
  Leaving the pre-production deposit gate in either direction counts as the
  deposit received (see `statusAfterApproval`).
- **"Payment received" is offered at every status, for all three payments.**
  Teams pay early — all of it during Design Talk happens (Keenan, 2026-10-16).
  The panel offers initial deposit, pre-production deposit (50%) and final
  payment as buttons whatever the status; the status only picks the default.
  The email's second line comes from `paymentReceivedNext(kind, status)`: an
  early payment says what it covers ("once the design is signed off, your
  order goes straight into production"), never a next step that isn't next.
- **The customer's form locks by section, not all at once** (Keenan,
  2026-10-16). `openClientSections` in `data/logic.ts` is the one rule:
  before In Production everything ticked is open; from In Production the
  roster, logos and inspiration lock (`clientEditingLocked` — they're what's
  being made) but the personal details (contact + shipping address) stay open
  until Shipped (`clientDetailsLocked`), because production finishing before
  the address is in is normal. While anything is open the team page shows the
  form — never "your jerseys are done, everything's locked in" — with
  `detailsStillOpenMessage` on top: "check your shipping details" when what
  the form holds is complete (`contactComplete`), "we still need" when not.
  The details step starts from what we have (`contactOnFile` in
  `roster/[token]/load.ts`: their unaccepted details, else the order's). A
  stage page after production asks only for what the link still asks for
  (`pageAsks`), so an old `/details` email link respects an unticked box. A
  tab opened before production that posts
  the roster afterwards is refused with "reload", not trimmed
  (`submittableSections`, using the `sectionsShown` the form sends); both
  stores check again at the write (`assertSectionsOpen`). The roster/artwork
  upload routes still close at In Production (`link.locked`). The share
  sheet's reminder after production shows only while the order is missing
  the shipping details (`clientFormReminder`, `shippingDetailsMissing`).
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
  `buildSheetOf` in `data/logic.ts` is the one deliberate list of build fields;
  `publicViewOf` (customer) and `factoryViewOf` (factory) each spread THAT and
  add only their own — so a new field on Order reaches no sheet by default, and
  a build detail added to `buildSheetOf` reaches both sheets, never one.

  The flip side, and it bit us: a field can sit in the view for months and be
  rendered by nothing. `specialNotes` did exactly that — collected on the form,
  carried into the view, shown on no page, so every note Keenan or a customer
  typed reached nobody. Notes are production instructions ("needs an A",
  "crest 10% larger"), not commentary, so they must be visible: order notes,
  captain-patch notes, the three artwork reference notes, and a Notes column on
  the roster table carrying both players' and spares' notes. Adding a field to
  the view is half the job — render it. **Both sheets render the build through
  `src/components/build-sheet.tsx`** (totals, build type, add-ons, roster,
  artwork, contact, notes) so they cannot drift; a section changed there
  changes for the team and the factory alike.
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
- **The customer confirmation email is best effort and SMTP-based.** `POST /api/intake`
  awaits `confirmEnquiry` (`src/lib/intake-confirm.ts`) after the Draft is saved;
  it composes from `src/lib/data/intake-mail.ts` (pure, tested) and sends through
  `src/lib/mail.ts` (nodemailer over SMTP, off until `SMTP_USER`/`SMTP_PASS` exist).
  It logs and never throws — a mailbox outage must not fail an enquiry. Don't
  fire-and-forget it: a serverless function can be frozen once the response is out.
- **Uploads carry a purpose.** `createUploadUrl`/`putFile` take `'artwork'` (default,
  the strict image/PDF/font list) or `'roster'` (spreadsheets, documents, photos too), and
  the customer endpoint reads it from the request. Don't widen the artwork list to let a
  spreadsheet through — that is what the purpose is for.
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
- `/factory/<token>` is **the manufacturer's sheet**: its own per-order token
  (`factoryToken`, minted at creation or by `createFactoryLink` for older
  orders) AND the factory code on top (`FACTORY_ACCESS_CODE`, cookie
  `ppc_factory`, 30 days, realm-tagged so it can never pass as the admin
  cookie — `src/lib/session.ts`). Keenan's admin cookie opens it too; the
  factory cookie opens nothing else (`src/proxy.ts`). It shows the build, the
  roster, the artwork with the font, the ship-to contact (Michael ships
  straight to the team), the factory-only notes and the keepers. Never money.
- Per-person login is deferred, not cancelled. `src/lib/auth.ts` is the one
  file that changes when it happens.

## Where things are

```
src/lib/types.ts          every entity + enum — start here
src/lib/constants.ts      statuses, sizes, add-on list, CSV columns (edit lists here)
src/lib/dates.ts          calendar-date helpers
src/lib/order-utils.ts    set scaffolding, totals reconciliation, tokens
src/lib/csv.ts            roster CSV export/import (round-trips)
src/lib/session.ts        access codes (admin + factory) + signed cookies
src/lib/keepers.ts        keeper jerseys — count, free numbers, common size (pure, tested)
src/lib/roster-versions.ts  Roster 1, 2… — which is in use, numbering, sign-off fingerprint (pure, tested)
src/lib/roster-import/    reading a roster file: read.ts (bytes → cells), ai.ts (the only API
                          caller), reconcile.ts, columns.ts, sizes.ts, build.ts (the checks),
                          team.ts (the team form's version), validate.ts (what Accept sends back)
src/components/roster-import/  the importer screen, the roster list, the order page's roster tools
src/components/file-preview.tsx  every uploaded picture, shown whole
src/components/build-sheet.tsx  the build sections both sheets render
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
src/app/factory/[token]/  the manufacturer's sheet (factory code); /factory/unlock is its door
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

## Rosters: versions, imports, sign-off

Decided by Keenan 2026-10-15. Design notes live in the file headers named here.

- **An order has rosters, not a roster.** Roster 1, Roster 2… (`Order.rosters`,
  `RosterEntry.rosterId`); exactly one is in use (`activeRosterId`). The share
  sheet, the factory sheet, the totals, the tally and every CSV read only the
  roster in use (`activeRows`, applied inside both stores). Every accepted import
  and every accepted team submission becomes its OWN new roster and goes in use;
  nothing is merged and the previous roster is kept until Keenan deletes it. The
  one in use can't be deleted. Numbers are never reused: `rosterNumbersUsed`
  keeps a deleted Roster 3 retired.
- **The roster table saves into the roster the page loaded, and only that one.**
  `saveRoster(orderId, rows, rosterId)` → `replaceRoster` refuses if another
  roster went in use meanwhile ("Reload the page"), rather than writing one
  roster's rows into another. The form reloads after any switch or import.
- **Importing a file (Keenan's importer, and the team's form):**
  READ — CSV, Excel, a Word table, a web page saved as .xls are read by code,
  cell for cell; the AI never retypes a spreadsheet cell. A PDF, a photo or a
  document with no table is transcribed by AI TWICE, independently (by rows,
  then by columns) and `reconcile` compares them cell by cell: agreement is
  kept, any difference becomes a question showing both readings. No two
  readings with the same shape → nothing is filled in.
  MAP — each column needs its heading rules and the AI to agree, or a person
  picks. A bare "Size" column is always asked (jersey/sock/pant is exactly the
  mix-up this exists to stop), except the one size column on a jerseys-only order.
  CHECK — `buildImport` is deterministic and runs again on the server at Accept
  (`acceptRosterImport`, after `cleanAnalysis`/`cleanDecisions`); it refuses
  while anything is open. Sizes go through the fixed table in `sizes.ts`; a
  bare S/M/L (youth or adult?), a goalie with no goalie cut, a number size are
  questions, never guesses. Suggestions are shown, never applied.
- **The AI.** `ai.ts` is the only file that calls the API: plain `fetch`,
  forced tool use, temperature 0, file content treated as data (the system
  prompt says so). `ANTHROPIC_API_KEY` is server-only — never `NEXT_PUBLIC_`.
  `ROSTER_AI_MODEL` overrides the model (default `claude-opus-5-5`);
  `ANTHROPIC_BASE_URL` is the standard endpoint override. Without a key,
  spreadsheets still import on the heading rules alone (more questions), and a
  PDF or photo says it needs the AI. The order context sent with a file is
  counts only (`aiContextOf`) — no money, no contact details.
- **Two read routes, both `maxDuration = 60`** (read.ts keeps a time budget
  inside that): `/api/orders/[id]/roster-read` (staff) and
  `/api/roster-read/[token]` (public: the roster token, link on and not locked
  — the roster locks at In Production even though the details don't,
  `ROSTER_READS_PER_DAY` per order, bytes only — a public caller can never
  point the server at a stored file). Photos are shrunk in the browser for
  READING only (`readableCopy`); the file kept is the original.
- **The team's form converts their file into rows for them to check.** Only
  three things are asked first (an uncertain column, which part of a full name,
  youth or adult letters); everything else uncertain is left blank and marked
  on the row. The submission records `convertedFrom`. The form starts from the
  roster in use when they have no submission waiting, because what they send
  becomes the roster.
- **Sign-off needs a roster, and its own tick.** No rows → no Approve button.
  The roster box (`ROSTER_VERIFICATION_STATEMENT`) is separate from the terms
  box and checked again on the server; `ApprovalRecord.roster` keeps which
  roster, how many players and a fingerprint, and the order page warns when
  the roster in use no longer matches what they checked
  (`rosterChangedSinceSignOff`).

## Pictures are shown whole

Keenan, 2026-10-15: no photo is ever shrunk into a thumbnail you have to click
to see all of it. Every uploaded picture renders through `FilePreview` (or the
gallery tile, same rule): the whole image, its own proportions, as wide as it
really is up to the width of its space — scaled down to fit, never cropped,
never boxed, never blown up. No `object-cover` on a photo. Non-image files (AI,
EPS, PDF) keep their format badge. Galleries and upload groups lay them out two
to a row (2026-10-20: full-width ones were far too big), the next pair below.

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
- **`<a download>` is ignored cross-origin — use `asDownload`** (`lib/download.ts`).
  Artwork is served from Supabase signed URLs, a different origin, so the bare
  attribute silently opens the file in a tab instead of saving it. Supabase
  honours a `?download=<name>` parameter on a signed URL and answers with
  `Content-Disposition: attachment`; `asDownload` adds it, and leaves local
  paths (same-origin, attribute works) and foreign URLs alone. `downloadName`
  builds the filename from the team and the role, because the stored ones are
  hashes like `dcaadcd01_Screenshot....png` and six of those in a folder are
  indistinguishable. Every artwork tile has a download; a tile with both a
  placement photo and a print-ready file offers each separately.
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
`docs/superpowers/specs/2026-09-07-sales-follow-ups-design.md`,
master lists (named lists, repeat uploads, duplicate matching):
`docs/superpowers/specs/2026-09-08-sales-master-lists-design.md`.

- **A list is a name; uploads add to it.** One list per kind of team (beer
  league, youth, …). `createCallList(name)` makes an empty list;
  `uploadIntoList` appends a sheet, as often as needed. Every upload is an
  `ImportRecord` on `list.imports` (newest first, last 10). `Contact.raw`
  keeps every cell as typed, including columns we don't know — they show
  under *Other info* and export.
- **Same phone or same email = the same person** (`sales/match.ts`: digits
  only, leading 1 dropped, under 7 digits is no number; emails lowercased).
  Inside a list a match **fills blanks and changes nothing else**
  (`sales/merge.ts` — never call state, never the manager flag, never Do Not
  Call). Two matching rows in one sheet become one contact. Across lists the
  row is added here and flagged; *Also in* is computed on render by the same
  matcher and never stored. `planImport` in `sales-logic.ts` is the only
  place these rules meet; stores just write list → updated contacts → new
  contacts. A sheet's Script tab replaces the list's script only when it has
  items and differs; a contacts-only sheet leaves it alone.
- **Rows are skipped only with no org AND no phone.** Everything else is a
  warning on that upload's `ImportRecord`, shown on the list page.
- **Double-click a contacts-table row for row actions** (`row-actions.tsx`):
  *Change status* is a real `CallLog` with zero duration and no session,
  saved through `logCall` (`quickLogInput`) — never a bare badge; *Quick
  edit* writes only `QUICK_EDIT_FIELDS` (`quickEditPatch`); *Delete* removes
  the contact and its logs (`repo.deleteContact`, logs first) after a
  confirm. Desktop table only — the phone cards keep single-tap.
- **The calling screen is built for a 3440×1440 monitor**
  (`docs/call-view-prompt.md`, spec `2026-09-09-call-screen-ultrawide-design.md`).
  From the `wide` breakpoint (1600px, `--breakpoint-wide` in `globals.css`)
  it is four full-height columns and **the page never scrolls** — the
  `body:has(.call-screen)` rules turn body, `main` and the sales layout's
  `.sales-wide` wrapper into a flex column and every column scrolls inside
  itself. Below 1600px it stacks and the page scrolls; don't invest there.
  Sizes are explicit (`text-[20px]` for anything read aloud, 16px questions,
  13px labels) — never a root font change.
- **Discovery is typed.** `CallLog.discovery` (`Discovery` in `types.ts`:
  last redone, satisfaction + change-one-thing, looking at + home/away,
  primary + also priorities) and the same shape on `Contact.discovery`,
  merged by `applyCallLog` through `mergeDiscovery` (answered fields
  overwrite, blank ones keep what was known). Q1 stays `jerseyManager`.
  `satisfaction` is their opinion of their jerseys; `leadRating` is ours —
  don't merge them. The CSV carries eight discovery columns after *Linked
  Contacts*. **Discovery on screen is exactly those five** — the sheet's
  other discovery rows are ignored there (only its `jersey_manager` line is
  read, for Q1's wording); the default script carries no other discovery
  question.
- **The list's script is edited on the calling screen** (opening lines,
  objections) through `saveListScript` → `validateScript` (valid section
  and kind, non-empty text, `MAX_OBJECTIONS` 8, `withScriptIds` keeps ids so
  past answers still resolve). The sheet's Script tab still replaces the
  script on upload. **The pickup line and the voicemail message live in
  Settings** (⚙ in the calling screen's top bar → `call-settings.tsx`,
  `CallList.pickupLine` / `voicemailScript`, saved by `updateListText`);
  the pickup line on screen is view-only. `quickFacts` keeps its in-place
  pencil. *Went to voicemail* (in the expanded Opening) shows the voicemail
  message and logs Voicemail in one click through the same `pick()`.
- **The outcome board is permanent, never a dialog.** No answer and
  Voicemail log on the click (`isImmediate`); every other outcome opens a
  strip with only its own fields and logs on Enter / Log / Ctrl+Enter. The
  contacts table's *Change status* dialog still uses `outcome-panel.tsx`.
- **Nested draft fields go through `update((d) => …)`**, never
  `patch({ discovery: { ...draft.discovery } })`: two taps in one tick would
  read the same stale draft and the second would erase the first.
- **E2E:** `npm run build && npm run test:e2e` runs Playwright at 3440×1440
  (`tests/e2e/call-screen.spec.ts`) against `next start` on port 3010 with
  Supabase blanked and `PPC_DATA_DIR` in a temp folder, so it can never
  touch live or local data. First time: `npx playwright install chromium`.
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
