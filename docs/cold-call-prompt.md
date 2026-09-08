# Prompt for Claude Code — Outreach section (segmented cold-call lists)

---

Build a new **Outreach** section in this app: segmented cold-call lists that
replace the spreadsheet workflow I've been running by hand.

Read `CLAUDE.md` before you write anything. Everything in its Non-negotiables
and Conventions sections applies here — this is a new section of the same app,
not a separate thing.

## Two decisions already made

- **Nothing sends from this app.** It tracks who's on a list and where each one
  stands. I send from Gmail as I do now. Do not add an email integration, a
  send button, or a mail queue.
- **It has to import what I already have.** My contacts live in
  `Powerplay_MASTER_Contact_List.xlsx` — several hundred rows across four tabs.
  CSV import is required, not optional; I am not retyping them.

## The problem

I have one master spreadsheet and it's the wrong shape. Everything is jammed
into a single list split only by *how* I can reach someone (email only / email
and phone / phone only). But that isn't how the work divides. Adult beer league,
ringette, firefighter and first-responder teams, youth and high school programs,
corporate — each one is a different audience with a different pitch, different
rules about who's even eligible, and a different exclusion list. Ringette gets a
rewritten second paragraph because socks and pant shells don't apply. Firefighter
teams get a sponsorship-forward variant. Quebec gets written in French. Youth is
a completely separate pitch I deliberately keep out of the adult list.

So: **many named lists, each carrying its own context**, not one big list.

## What to build

### 1. Lists

I create and name a list myself — "Adult / Beer League", "Ringette 18+",
"Firefighter & First Responder", "Youth & High School", whatever I need next.
Each list holds:

- **Name** and an optional short description
- **Context** — a long free-text field that is the whole point of this feature.
  It's where I write who belongs on this list, who explicitly does not, and how
  the pitch changes for them. Render it as readable prose at the top of the
  list page, always visible, editable in place. This is the thing I'll read
  before writing a single email to anyone on it.

Lists can be archived, never hard-deleted while they hold contacts.

### 2. Contacts

Fields, matching what my sources actually publish:

`teamName`, `contactName`, `role`, `email`, `phone`, `city`, `region`
(province/state), `league`, `sourceUrl`, `notes`, `tosWarning`, `batch`,
`status`, `statusReason`, `lastContactedDate`.

Notes on specific fields:

- **`email` and `phone` are both optional** — plenty of rows are one or the
  other. A contact needs a team name plus at least one of the two.
- **Contact channel is derived, never stored.** "Email only / Both / Phone
  only" is computed from whether the fields are filled. Do not add a column for
  it. (This app has been burned three times by a stored number that duplicates
  a derived one and drifts out of step — see the totals rule in `CLAUDE.md`.)
- **`tosWarning`** — some sources publish contacts but restrict solicitation in
  their terms. I collect those and record the restriction rather than dropping
  the row.
- **`lastContactedDate`** is a calendar date. `YYYY-MM-DD`, never through a
  timezone. Use the helpers in `src/lib/dates.ts`.

### 3. Status

Five states. These are the ones the work actually has, so don't invent others:

| status | meaning |
|---|---|
| `new` | just added, not yet reviewed |
| `to_contact` | reviewed, eligible, queued to send |
| `contacted` | an email or call has gone out — `batch` says which |
| `replied` | they came back; I take it from here |
| `held` | eligible but deliberately not sent yet — **requires a reason** |
| `excluded` | does not belong on this list — **requires a reason** |

`held` and `excluded` both **must** carry a `statusReason`, and the UI must not
let me set either without typing one. That's not bureaucracy — it's the whole
value. Real examples from my last batch: *"second rep at a team already
contacted — one rep per team, two reads as automated"*, *"accented character in
the address, guaranteed bounce"*, *"league president, not a team manager"*,
*"site's newest content is 2022, likely dormant"*. In six weeks I will not
remember any of that, and without the reason I'd re-add the same person.

**Excluded contacts stay on the list.** They are the audit trail — the
spreadsheet has a whole tab for this. Hidden from the default view, never
deleted.

### 4. The list page

Follow the pattern already built on `/orders` (`src/app/orders/page.tsx`) —
it's the same problem and I like how it turned out:

- A strip of status chips across the top with live counts, each clickable to
  filter to that status
- Default view shows the working set: `new`, `to_contact`, `contacted`,
  `replied`. `held` and `excluded` sit behind toggles that say how many they're
  hiding
- Search across team name, contact name, email, league, city
- A table, not cards — this is scanning work, and I need many rows per screen.
  It must still be usable on a phone; solve that properly rather than shipping
  a horizontally scrolling desktop table
- Changing a status is one click from the row. Setting `held` or `excluded`
  prompts for the reason inline
- Multi-select rows for a bulk status change and a bulk batch label — after a
  send I mark thirty at once

### 5. Adding and appending

The list grows forever. Three ways in, all of which must work repeatedly on the
same list:

- **Add one by hand** — a small form
- **Paste rows** — a textarea I can paste tab-separated cells into straight
  from Excel
- **Import CSV** — with a preview and a skip report before anything commits.
  Reuse the approach in `src/lib/csv.ts`. **It must never silently drop a row
  it can't parse** — show me exactly what it's skipping and why. That rule
  already exists for the roster importer; same rule here.

On import, flag two things without blocking the import:

- **Duplicate email or phone** anywhere in the same list
- **A team name already present** on a non-excluded contact — my hard rule is
  one rep per team, and this is the check that enforces it

Flag them, show them in the preview, let me decide. Don't auto-merge and don't
auto-drop.

### 6. Never fabricate a contact detail

Put this in the code as a comment where imports and edits happen, because it
has already cost me real damage: an automated pass once invented 49 email
addresses by pattern-completing names against a league domain. All 49 were
wrong and had to be found and deleted.

So: no inference, no auto-correction, no "did you mean". A malformed address
with an accent in it gets stored verbatim and flagged in notes — not silently
fixed. An empty field stays empty.

## Where it lives

- `/outreach` — the lists, with per-list counts and last activity
- `/outreach/[listId]` — one list
- Behind the existing access code, same as the rest of the admin side. **No
  public route, no share token.** These are third-party contact details and
  nothing about them is customer-facing.
- Add "Outreach" to the main nav beside Orders and Production.

## Architecture — non-negotiable, and the traps

Read `CLAUDE.md` in full, but specifically:

- **Everything goes through `repo`** (`src/lib/data/repository.ts`). Add the new
  methods to the interface and implement them in **both** backends — the JSON
  store and the Supabase store. Pages never touch a store directly.
- **Store-agnostic rules go in `src/lib/data/logic.ts`**, not in either store.
  Two implementations of a rule is how the backends quietly stop agreeing.
- **Every mutation is a server action** that calls `requireRole` first, goes
  through `repo`, then `revalidatePath`.
- **Watch the `EDITABLE` allowlist** in `src/app/orders/actions.ts` — if you
  follow that pattern for outreach actions, every new field must be added to
  the allowlist in the same commit. A field missing from it type-checks,
  renders, updates on screen, and is silently dropped on the way to the
  database. That exact trap has shipped four broken controls in this project.
- **New non-optional fields need a `heal` line** in `logic.ts`, or rows written
  before the field existed will crash the first page that touches one.
- **Supabase migration**: same JSONB + generated column pattern as
  `supabase/migrations/0001_init.sql`. Generated columns **must be immutable** —
  a `text::date` cast is not; use the `date_iso` / `ts_utc` helpers from
  migration `0000`. RLS on, zero policies, service role server-side only.
- **Creating a record is never a GET.** New List is a POST server action. Next
  prefetches links, and a GET route handler that created rows once spawned
  blank orders just from loading a list page.
- Dark theme, gold accent, hand-rolled components from `src/components/ui.tsx`.

## Before you build

Show me a plan first: the data model, the repository methods you're adding, the
files you'll touch, and anything in the above you think is a bad idea. I'd
rather argue about the shape now than after it's built.

Then build it, run `npm run build` and `npx tsc --noEmit` clean, and write
Playwright coverage for: creating a list, adding a contact by hand, a CSV
import that includes two unparseable rows and one duplicate team, every status
transition, the reason-required rule on `held` and `excluded`, the default view
hiding excluded contacts, and the counts on the status chips matching the rows
behind them.
