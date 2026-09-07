# Sales — Cold Calling: design

Date: 2026-09-06 · Owner: Keenan Huber · Status: approved design, awaiting implementation plan

## 1. What this is

A new **Sales** section of the order manager for working through a list of
prospects on the phone. Keenan fills in a blank spreadsheet (contacts on one
tab, the call script on another), uploads it, and the app walks through the
contacts one at a time: everything worth knowing about the person on the left,
the script — filtered to what's relevant to them — on the right, a notes box,
multiple-choice discovery questions, a lead rating, and an after-call outcome.
Previous / Skip / Save & Next moves through the queue. Every call is a record,
so follow-ups can be built on top later.

### Goals

- Upload an `.xlsx` (or `.csv`) and start calling within a minute.
- One screen per contact with no scrolling needed for the common case.
- Nothing typed on a call is ever lost — drafts autosave, saves are retryable.
- Every call is attributed (caller name), timestamped and timed.
- Results come back out as a spreadsheet.

### Not in this release

- A follow-up queue beyond pinning contacts whose call-back date has arrived.
- Two people calling from the same list at the same time (no claiming).
- Editing a contact inside the app (fix the sheet and re-upload).
- A script editor inside the app (the script is a tab in the sheet).
- Clearing a Do Not Call flag.
- Per-person login. `/sales` sits behind the existing shared access code.
- **Any price, money or deal-value field. Ever.** (Repo non-negotiable.)

### Decisions already made

| Question | Decision |
|---|---|
| Gating | Same access code, separate section. Enforced by the existing proxy (deny-by-default). |
| Device | Desktop/laptop with a phone in hand. Wide layout first; keyboard shortcuts. Mobile must still work. |
| Script source | Second tab of the uploaded sheet. Pre-filled with a drafted script. |
| Callers | Keenan only for now. Caller name is still stamped on every log. |
| Persistence | Full data-layer entities, both backends, migration `0004`. |
| Upload format | `.xlsx` and `.csv`. `.xlsx` needs the project's first runtime dependency: `read-excel-file`. |
| Outcomes | All 11 (see §6). |
| Interested | Prompts for email + follow-up note/date. No "create order" bridge — orders start from an email thread. |
| Lead rating | 1–5 stars, per call; contact carries the latest. |
| Timers | Per-contact ("time here") and per-session ("calling for"). |

## 2. Data model

New in `src/lib/types.ts`, following the existing envelope (`id` first, ISO
instant strings for timestamps, `deletedAt: string | null` for soft delete,
`CalendarDate` for dates that must never pass through a timezone).

### Enums

```ts
export const CALL_OUTCOMES = [
  // didn't reach them
  'no_answer', 'voicemail', 'bad_number', 'referred',
  // talked to them
  'callback', 'send_info', 'interested', 'meeting_booked',
  'not_now', 'not_interested', 'do_not_call',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const SCRIPT_KINDS = ['read', 'reminder', 'question', 'objection'] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

export const SCRIPT_SECTIONS = ['opening', 'discovery', 'objections', 'close'] as const;
export type ScriptSection = (typeof SCRIPT_SECTIONS)[number];

export type LeadPriority = '' | 'A' | 'B' | 'C';
export type LeadRating = 1 | 2 | 3 | 4 | 5;
```

`CALL_OUTCOME_META` in `src/lib/constants.ts` mirrors `STATUS_META`:
`Record<CallOutcome, { label; emoji; className; group: 'missed' | 'talked'; order }>`,
with `CALL_OUTCOME_OPTIONS` derived and sorted by `order`. Nothing hand-writes
a subset of outcomes at a call site.

### `CallList` — one per upload

```ts
export interface CallList {
  id: string;
  name: string;                 // defaults to the file name without extension
  sourceFileName: string;
  script: ScriptItem[];         // parsed from the Script tab; empty if absent
  importReport: ImportReport;   // what was skipped/warned — shown every time
  createdBy: string;            // actor name at upload
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ScriptItem {
  id: string;                   // 's1', 's2', … by row order; per-list, stable
  section: ScriptSection;
  kind: ScriptKind;
  text: string;                 // the line to read / reminder / question / objection
  response: string;             // objection reply; '' otherwise
  options: string[];            // question choices; empty = free-text answer
  showWhen: string;             // raw rule text as typed, '' = always
}

export interface ImportReport {
  imported: number;
  skipped: Array<{ line: number; reason: string; raw: string }>;
  warnings: Array<{ line: number; reason: string }>;
}
```

### `Contact` — one per sheet row (or one per referral)

```ts
export interface Contact {
  id: string;
  listId: string;
  sortOrder: number;            // sheet row order; a referral copies its source's
  source: 'sheet' | 'referral';
  referredFromContactId: string | null;

  /* From the sheet. All strings unless noted; blank cell = '' */
  orgName: string;
  orgType: string;
  contactName: string;
  role: string;
  phone: string;                // as typed
  altPhone: string;
  email: string;
  city: string;
  province: string;             // two-letter code as typed, upper-cased
  timezoneOverride: string;
  league: string;
  ageDivisions: string;         // comma-separated as typed
  teams: number | null;
  players: number | null;
  seasonStartMonth: string;
  orderingMonth: string;
  currentSupplier: string;
  lastOrderedYear: string;
  colours: string;
  website: string;
  social: string;
  leadSource: string;
  priority: LeadPriority;
  bestTimeToCall: string;
  doNotCall: boolean;
  notes: string;                // the sheet's Notes column (research), read-only in app
  raw: Record<string, string>;  // every header → cell as uploaded, incl. unknown columns

  /* Call state. Written ONLY by applyCallLog / applySkip in sales-logic.ts */
  lastOutcome: CallOutcome | null;
  lastCalledAt: string | null;
  callCount: number;
  skipCount: number;
  lastSkippedAt: string | null;
  nextCallDate: CalendarDate | null;
  leadRating: LeadRating | null;

  createdAt: string;
  updatedAt: string;
}
```

`raw` is the "never discard user input" guarantee: a column the importer does
not recognise still reaches the screen (under *Other info*) and the export.

### `CallLog` — one per completed call

```ts
export interface CallLog {
  id: string;
  listId: string;
  contactId: string;
  outcome: CallOutcome;
  leadRating: LeadRating | null;
  notes: string;
  answers: Record<string, string>;   // ScriptItem.id → chosen option or free text
  checklist: string[];               // ScriptItem.ids of reminders ticked
  startedAt: string;                 // contact opened
  endedAt: string;                   // Save pressed
  durationSeconds: number;
  callerName: string;
  /* Outcome extras — only the ones the outcome asks for are non-empty */
  followUp: { date: CalendarDate | null; time: string; note: string };  // time 'HH:MM' or ''
  email: string;                     // captured on send_info / interested
  reason: string;                    // not_interested pick-list value
  referral: { name: string; role: string; phone: string; email: string };
  newPhone: string;                  // bad_number
  createdAt: string;
  updatedAt: string;
}
```

### Derived, never stored

- `contactBucket(c)`: `'do_not_call' | 'uncalled' | 'retry' | 'follow_up' | 'done'`
  (see §7). Used for table filters and list-card counts.
- List progress: `contacts.filter(c => c.callCount > 0).length / contacts.length`.
- Today's session tally: today's logs on the list by this caller.

## 3. The blank sheet

`public/templates/powerplay-call-list-template.xlsx`, generated by
`scripts/build-call-template.mjs` (Node + `exceljs`, a dev-only dependency —
there is no Python on the build machine). Pick-list values
come from `src/lib/sales/picklists.json`, which the importer also reads, so
the dropdowns and the app cannot drift. Re-run the script when the JSON
changes and commit the regenerated file.

### Tab 1 — `Contacts`

One row per person. Header row, bold, frozen. Columns in this order; `*` has
a dropdown fed from the `Lists` tab.

| Header | Maps to | Notes |
|---|---|---|
| Org Name | orgName | |
| Org Type * | orgType | |
| Contact Name | contactName | may be blank (call the main line) |
| Role * | role | |
| Phone | phone | text column so Excel keeps leading `+`/`0` |
| Alt Phone | altPhone | text column |
| Email | email | |
| City | city | |
| Province * | province | two-letter |
| Timezone Override * | timezoneOverride | blank unless the province default is wrong |
| League / Level | league | free text |
| Age Divisions * | ageDivisions | multi, comma-separated; dropdown offers one value, typing more is fine |
| Teams (#) | teams | number |
| Players (approx) | players | number |
| Season Start (month) * | seasonStartMonth | |
| Ordering Window (month) * | orderingMonth | drives the Not Now default |
| Current Supplier | currentSupplier | |
| Last Ordered (year) | lastOrderedYear | |
| Colours | colours | |
| Website | website | |
| Social | social | |
| Lead Source * | leadSource | |
| Priority * | priority | A / B / C |
| Best Time to Call * | bestTimeToCall | |
| Do Not Call * | doNotCall | Y / N, blank = N |
| Notes | notes | research notes; shown read-only on the call screen |

Pick-list values (`picklists.json`):

- **orgType**: Minor Hockey Association · Rep/Club Team · Adult League (organiser) · Adult Team · Junior Team · School Team · College/University · Tournament · Spring/Summer Program · Rec Program · Other
- **role**: President · Vice President · Equipment Manager · Head Coach · Team Manager · Treasurer · Registrar · Director/Board · Tournament Director · Athletic Director · League Convenor/Commissioner · Captain/Organiser · Office Admin · Other
- **province**: AB BC MB NB NL NS NT NU ON PE QC SK YT
- **timezoneOverride**: Pacific · Mountain · Central · Central (no DST) · Eastern · Atlantic · Newfoundland
- **ageDivisions**: U7 U9 U11 U13 U15 U18 U21 Adult
- **month**: Jan … Dec · Unknown
- **leadSource**: Referral · Tournament · Web research · Social · Existing customer · Inbound · Other
- **priority**: A · B · C
- **bestTimeToCall**: Weekday daytime · Weekday evening · Weekend · Unknown
- **yesNo**: Y · N
- **notInterestedReason** (app only, not a sheet column): Happy with supplier · Locked contract · Price · No need · Other

### Tab 2 — `Script`

One row per item, read top to bottom within each section.

| Header | Meaning |
|---|---|
| Section * | Opening · Discovery · Objections · Close |
| Kind * | Read · Reminder · Question · Objection |
| Text | The line to read, the reminder, the question, or the objection as the prospect says it |
| Response | Objection rows only: what to say back |
| Option 1 … Option 6 | Question rows only. Blank all six → free-text answer box |
| Show When | Blank = always. Otherwise a rule (below) |

**Show When grammar.** `Field = Value` or `Field != Value`. `Value` may be
several values separated by commas, meaning any of them. Several rules
separated by `;` must all hold. `Field` matches a Contacts header, its camelCase
key, or any raw header, case-insensitively; `Value` compares trimmed and
case-insensitively. For a comma-separated field (Age Divisions), `=` means
"contains any of". Examples:

- `Org Type = Minor Hockey Association`
- `Org Type = Adult Team, Adult League (organiser)`
- `Role != Head Coach; Priority = A`

A rule that cannot be parsed produces an import warning and the item shows
**always** — a broken rule must never hide a line.

**Placeholders** in Text/Response: `[Name]` (first word of Contact Name, or
"there"), `[Full Name]`, `[Org]`, `[City]`, `[Rep]` (first word of the caller
name), `[Supplier]` (Current Supplier, or "your current supplier"). Any other
`[Header]` is looked up in the contact's raw row; unknown stays as typed.

The template ships **pre-filled** with the script in Appendix A.

### Tab 3 — `Lists`

One column per pick-list, header = the list name, values below. The `Contacts`
and `Script` dropdowns reference these ranges (whole-column named ranges so
adding a value works without editing validations).

### Tab 4 — `Read Me`

Plain-language: what each tab is, what each column means, what a Show When
rule looks like, what happens on upload (skipped vs warned), and that
re-uploading makes a new list.

## 4. Import

Module: `src/lib/sales/import.ts` (server-only; imports `read-excel-file/node`).

1. **Detect format** by extension then sniff: `.xlsx` → `read-excel-file`
   (sheets by name: `Contacts`, `Script`; if `Contacts` is missing, the first
   sheet is treated as contacts and there is no script). `.csv` → the existing
   `parseCsv` in `src/lib/csv.ts`; a CSV is contacts only. Anything else, an
   empty file, or a file with no header row → a blocking error; nothing is
   created.
2. **Header aliases** (`CONTACT_ALIASES`, case-insensitive, whitespace-collapsed,
   the `csv.ts` pattern): each template header plus tolerant variants —
   `Org`, `Organization`, `Organisation`, `Team`, `Team Name` → `orgName`;
   `Name`, `Contact` → `contactName`; `Phone Number`, `Cell`, `Mobile` →
   `phone`; `Prov`, `Province/State` → `province`; `DNC`, `Do Not Call?` →
   `doNotCall`; `Priority (A/B/C)` → `priority`; and so on for every column.
   Unmapped headers are kept in `raw` only.
3. **Row rules.** A row is **skipped** (recorded in `importReport.skipped` with
   its 1-based sheet line, reason and raw text) only when it has no `orgName`
   **and** no `phone`. Blank rows are ignored silently. Everything else is
   stored. **Warnings** (row kept, flagged) for: duplicate `orgName+phone`
   within the sheet; a pick-list column whose value is not in the list (kept
   as typed); a phone that does not normalise to 10 or 11 digits; `Do Not
   Call` set (so it is visible at upload time); a Show When rule that failed
   to parse.
4. **Normalisation.** Trim everything. `province` upper-cased. `doNotCall`:
   `Y`, `Yes`, `True`, `1` → true; else false. `teams`/`players`: numeric →
   number, else `null` (the text goes to `raw`). `priority`: `A`/`B`/`C`
   upper-cased, else `''`. Phone kept as typed; `phoneDigits(phone)` in
   `src/lib/sales/phone.ts` derives the dial string (`tel:+1XXXXXXXXXX` for
   10/11-digit North American numbers, `tel:<digits>` otherwise) and the
   display form `(705) 555-0142` when it is 10 digits.
5. **Script tab** → `ScriptItem[]`: `section`/`kind` matched case-insensitively
   against the enums; a row with an unknown section or kind, or a blank
   Text, is skipped and recorded in `importReport.skipped` with its sheet
   line (prefixed "Script:"); `options` = non-blank Option cells in order;
   ids `s1…sN` by row order among the rows kept.
6. Output: `{ list: Omit<CallList, …bookkeeping>, contacts: Contact[] }` or a
   blocking error. The action never throws to the UI; it returns
   `{ ok: false, error }`.

Sheet-order `sortOrder` is the row index. The upload is **one step**: parse →
create → redirect to `/sales/[id]`. There is no preview/confirm; a bad upload
is one soft-delete away, and the report is persisted on the list.

## 5. Queue

`buildQueue(contacts, today): string[]` in `src/lib/data/sales-logic.ts`.
Pure; both stores and the page call it.

1. Drop `doNotCall`.
2. Buckets, in this order:
   - **due**: `nextCallDate <= today` and not closed. (Callbacks, Not Now
     months that have arrived, Send Info / Interested follow-ups whose date
     has come, retries whose date has come.)
   - **uncalled**: `callCount === 0`. Sort by priority `A < B < C < ''`, then
     `sortOrder`, then `createdAt` (so a referral sits right after its source).
   - **retry**: `lastOutcome ∈ {no_answer, voicemail}` with `nextCallDate > today`.
     Oldest `lastCalledAt` first.
   - Everything else is excluded: closed outcomes, and follow-ups whose date
     is still in the future.
3. Within each bucket, contacts with `lastSkippedAt` **today** sort after
   those without — Skip "moves it to the end of today's queue".

**Closed** (`isClosed(c)`) = `lastOutcome ∈ {not_interested, do_not_call,
referred, meeting_booked}`, or `bad_number` with `nextCallDate === null` (no
new number was given). A `bad_number` **with** a new number has
`nextCallDate = today` and is a retry.

`contactBucket(c)` for the table filter, first match wins: `do_not_call` →
`uncalled` (`callCount === 0`) → `retry` (`no_answer`, `voicemail`, or
`bad_number` with a `nextCallDate`) → `follow_up` (`callback`, `send_info`,
`interested`, `meeting_booked`, `not_now`) → `done` (`not_interested`,
`referred`, `bad_number` without a `nextCallDate`).

## 6. Outcomes

| Outcome | Group | Prompt (required in bold) | Effect on contact | `nextCallDate` |
|---|---|---|---|---|
| No Answer | missed | — | — | today + 2 |
| Left Voicemail | missed | — | — | today + 4 |
| Bad Number | missed | New number | if given: `phone` ← new, old number appended to `altPhone`; else closed | today if new number, else `null` |
| Gatekeeper / Referred | missed | **Name or phone**, role, email | closed; **creates a new Contact** (`source: 'referral'`, same `sortOrder`, `referredFromContactId`, inherits org fields + priority) | `null` |
| Callback Requested | talked | **Date**, time, note | — | the date |
| Send Info | talked | **Email**, **date** (default +7), note | `email` ← captured | the date |
| Interested | talked | Email (warning if blank), **date** (default +7), note | `email` ← captured if given | the date |
| Meeting Booked | talked | **Date**, time, note | closed | the date (shown on table, not queued) |
| Not Now | talked | **Month** `YYYY-MM` (default: Ordering Window month; if that month is this month or past, next year), note | — | first of that month |
| Not Interested | talked | reason (pick-list), note | closed | `null` |
| Do Not Call | talked | **confirm** | `doNotCall = true`; closed | `null` |

Every outcome also accepts a lead rating (1–5, optional) and notes. The
contact's `leadRating` becomes the latest non-null rating. All of the above
is `applyCallLog(contact, log, today, { replacing }) → Partial<Contact>` in
`sales-logic.ts`: `callCount` increments and `lastCalledAt` is set only when
`replacing` is false. `applySkip(contact, now)` bumps `skipCount` and sets
`lastSkippedAt`.

**Editing a log** (`updateCallLog`) is accepted only for the contact's most
recent log — the server rejects anything older with a blocking error — and
applies `applyCallLog` with `replacing: true`, so the contact's state follows
the corrected outcome without counting a second call. An edit that changes
the outcome *away from* `do_not_call` is rejected: clearing Do Not Call is out
of scope and must not happen by accident.

Skip is **not** an outcome and writes no `CallLog`.

## 7. Pages

All under `src/app/sales/`, all `export const dynamic = 'force-dynamic'`,
all reading through `repo`, all writing through `actions.ts`. Locked by the
existing proxy — nothing to register. One `<Link href="/sales">Sales</Link>`
added to the nav in `layout.tsx`.

### `/sales` — landing

- **Calling as** — a text field defaulting to `currentUser().name`, stored in
  `localStorage['ppc.callerName']`. Sent with every log.
- **Upload card** — *Download blank template* (link to the file in
  `public/templates/`), file input accepting `.xlsx,.csv`, list name (auto
  from file name, editable), **Upload** button. Client component
  `src/components/sales/upload-form.tsx` posts `FormData` to `uploadCallList`.
  Shows the blocking error inline if parsing failed.
- **Your lists** — a `Card` per non-deleted list, newest first: name,
  *uploaded Sep 6, 2026 by Keenan*, progress bar and *"23 of 48 called"*,
  counts (reached · voicemail · due today · do not call), buttons **Start
  calling** (primary, → `/sales/[id]/call`), **Contacts** (→ `/sales/[id]`),
  **Export CSV** (→ `/api/sales/[id]/export.csv`), **Delete** (danger, soft,
  `requireRole('admin')`, with a confirm). `EmptyState` when there are none.

### `/sales/[id]` — contacts table

- Import report banner at the top whenever `skipped` or `warnings` is
  non-empty (persistent, collapsible).
- **Due today** group pinned first when non-empty.
- Filter chips (GET params, the orders-page pattern): All · Uncalled · Retry
  · Follow-up · Done · Do not call, each with a count. Search box on org,
  contact name, phone, city.
- Table (wide) / cards (narrow, the roster-table dual-render pattern): org ·
  contact · role · phone · city · rating (stars) · last outcome (badge) ·
  calls · next call date. Row → `/sales/[id]/call?c=<contactId>`.

### `/sales/[id]/call` — the calling view

Server shell loads the bundle, computes `buildQueue`, picks the starting
contact — `?c=<contactId>` when present (this is the only way a Do Not Call
contact is ever shown, and it opens disabled — see below), otherwise the
first in the queue — and renders the client component `src/components/sales/call-view/index.tsx` with
`{ list, contacts, logs, queue, startId, callerDefault }`.

Layout (≥ `lg`: two columns; below: stacked, contact first):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Ennismore list     12 of 48 in queue     ⏱ calling for 0:42:10 · 2:14 here │
├────────────────────────────────┬─────────────────────────────────────────┤
│ CONTACT                        │ SCRIPT                                  │
│ name · role · org · org type   │ OPENING  (Read lines, Reminder ticks)   │
│ ☎ phone (tel:)  alt · ✉ email  │ DISCOVERY (Questions as choice buttons) │
│ city, prov · local time        │ ▸ OBJECTIONS (n)  collapsed             │
│ priority · best time · source  │ CLOSE                                   │
│ ── details ──                  ├─────────────────────────────────────────┤
│ league · divisions · teams ·   │ NOTES (autosaving)                      │
│ players · supplier/year ·      │ LEAD RATING ☆☆☆☆☆                      │
│ colours · website · social ·   │ OUTCOME                                 │
│ sheet notes · other info (raw) │  Didn't reach: 4 buttons                │
│ ── history ──                  │  Talked:       7 buttons                │
│ date · outcome · caller · rating│  [prompt for the chosen outcome]       │
│ · note · answers               │                                         │
├────────────────────────────────┴─────────────────────────────────────────┤
│ ← Previous    Skip →     Calls 9 · Reached 3 · Voicemails 4   [Save & Next →] │
└──────────────────────────────────────────────────────────────────────────┘
```

Behaviour:

- **Timers.** Per-contact starts when the contact is shown (`startedAt`);
  labelled *"here"*; becomes `durationSeconds` on save. Per-session starts
  when the view mounts if `sessionStorage['ppc.callSession.<listId>']` is
  absent, displayed as *"calling for h:mm:ss"*, survives refresh, cleared by
  the ← back link.
- **Script filtering.** `applicableItems(script, contact)` in
  `src/lib/sales/script.ts` evaluates Show When; `fillPlaceholders(text,
  contact, callerName)`. Reminders are `Toggle`-style ticks; questions with
  options are `ChoiceGroup`s (active class `text-ppc-gold`, per repo
  convention); questions without options are a one-line input; objections
  render collapsed with a count, expanding to objection → response pairs.
- **Drafts.** Notes, ticks, answers, rating, chosen outcome and its extras
  autosave to `localStorage['ppc.callDraft.<contactId>']` ~1 s after a change
  (the order-form debounce). Restored if the contact is reopened; cleared on
  successful save.
- **Outcome panel.** Eleven `ChoiceGroup`-style buttons in two labelled rows.
  Choosing one reveals its prompt (§6). **Save & Next** is disabled until an
  outcome is chosen and its required fields are filled; a tooltip says what is
  missing. Save calls `logCall`; on `ok` the log is appended locally, the
  contact patched locally with the returned contact, the draft cleared, the
  contact removed from the local queue, and the next one shown. On failure the
  footer goes red with the message, the draft stays, and the button re-enables.
- **Skip.** `skipContact` (fire-and-forget with error toast); locally moves
  the contact to the end of the queue; shows the next.
- **Previous.** Client-side history stack of contacts shown this session.
  Going back shows the contact; if it was logged this session the outcome
  panel is replaced with *"Logged as Left Voicemail, 3 min ago — Edit"*; Edit
  loads that log into the panel and Save calls `updateCallLog` instead.
- **Do Not Call** contact (reachable only via `?c=`): red `Warning` banner,
  phone hidden, outcome panel and Save disabled, Skip/Previous/Next still
  work.
- **Local time.** `localTimeFor(contact, now)` in `src/lib/sales/timezones.ts`:
  override → IANA zone, else province → zone (AB Edmonton · BC Vancouver · MB
  Winnipeg · NB Moncton · NL St_Johns · NS Halifax · NT Yellowknife · NU
  Iqaluit · ON Toronto · PE Halifax · QC Toronto · SK Regina · YT Whitehorse);
  overrides Pacific→Vancouver, Mountain→Edmonton, Central→Winnipeg, Central
  (no DST)→Regina, Eastern→Toronto, Atlantic→Halifax, Newfoundland→St_Johns.
  Unknown → no time shown. Rendered with `Intl.DateTimeFormat`, ticking once a
  minute.
- **Keyboard** (`use-keyboard.ts`; ignored while focus is in an input,
  textarea or select): `1`–`9`, `0`, `-` choose the eleven outcomes in
  on-screen order; `Shift+1`…`Shift+5` set the star rating; `Ctrl+Enter`
  Save & Next; `Ctrl+→` Skip; `Ctrl+←` Previous; `/` focus notes; `Esc` blur;
  `?` toggles a cheat-sheet panel. The footer shows `?` as a hint.
- **Footer tally**: today's logs on this list with this caller name — Calls ·
  Reached (talked group) · Voicemails · Callbacks set · Info sent.
- **Queue exhausted**: an `EmptyState` — *"Nothing left in the queue. 12
  contacts are waiting on a future date."* with links to the table and the
  list page.
- Header nav stays visible (it is the app shell); the view is not full-screen.

### `/api/sales/[id]/export.csv`

Route handler mirroring `roster.csv`: `requireRole('staff')`, 404 on a missing
list, `Content-Disposition: attachment; filename="<list-slug>-calls.csv"`.
Columns: the 26 template headers in order (values from the contact, so a
captured email replaces the sheet's), then `Lead Rating`, `Last Outcome`,
`Calls`, `Skips`, `Last Called`, `Next Call Date`, `Last Notes`, `Source`,
then one `Q: <question text>` column per script question holding the latest
answer, then any raw-only headers. `\r\n` line endings, UTF-8 BOM so Excel
reads accents. Re-uploading the export works: the template headers map, the
extra columns land in `raw`.

## 8. Server actions

`src/app/sales/actions.ts` — `'use server'`; every action begins
`await requireRole('staff')` then `const actor = await currentActor()`.

| Action | Signature | Validation | Revalidates |
|---|---|---|---|
| `uploadCallList` | `(formData) → { ok: true; listId } \| { ok: false; error }` | §4 | `/sales` |
| `logCall` | `(listId, contactId, input: CallLogInput) → { ok: true; log; contact } \| { ok: false; error; errors? }` | below | `/sales`, `/sales/[id]` |
| `updateCallLog` | `(logId, input) → same` | same | same |
| `skipContact` | `(listId, contactId) → { ok }` | contact exists in list | `/sales/[id]` |
| `deleteCallList` | `(listId) → void` | `requireRole('admin')` | `/sales` |

`CallLogInput` is `CallLog` minus id/listId/contactId/bookkeeping. Two-tier
validation (`validateCallLog`):

- **Blocking** (returned as `errors`, nothing saved): `outcome` not in
  `CALL_OUTCOMES`; `leadRating` not `null` or an integer 1–5; a `followUp.date`
  that is present but not a calendar date; `followUp.time` not `''` or
  `HH:MM`; `referred` with neither `referral.name` nor `referral.phone`;
  `send_info` with blank `email`; `callback`/`meeting_booked`/`send_info`/
  `interested`/`not_now` with no date/month; `durationSeconds` negative or
  non-integer; `contactId` not in `listId`; contact `doNotCall` and outcome
  is not `do_not_call`.
- **Warning** (saved, returned as `warnings`): `email` present but not
  `x@y.z`-shaped; `referral.phone` or `newPhone` not 10/11 digits;
  `interested` with blank email.

`DATE_FIELDS` for this module: `followUp.date` — `''` is coerced to `null`
before validation (generated `date` columns reject `''`).

## 9. Repository and logic

`src/lib/data/repository.ts` gains a `/* Sales */` section:

```ts
listCallLists(): Promise<CallList[]>;                       // not deleted, newest first
getCallList(id: string): Promise<CallListBundle | null>;    // { list, contacts (by sortOrder, createdAt), logs (newest first) }
createCallList(list: CallList, contacts: Contact[], actor: Actor): Promise<CallList>;
addCallLog(log: CallLog, contactPatch: Partial<Contact>, referral: Contact | null, actor: Actor): Promise<void>;
updateCallLog(log: CallLog, contactPatch: Partial<Contact>, actor: Actor): Promise<void>;
updateContact(id: string, patch: Partial<Contact>, actor: Actor): Promise<Contact>;   // used by skip
softDeleteCallList(id: string, actor: Actor): Promise<void>;
```

`CallListBundle` is exported from `data/index.ts` alongside `OrderBundle`.

`src/lib/data/sales-logic.ts` (new, pure, imported by both stores and by the
action): `applyCallLog`, `applySkip`, `buildQueue`, `contactBucket`,
`referralContactFrom(source, referral, now)`, `healCallList`, `healContact`,
`healCallLog`, `nextCallDateFor(outcome, input, contact, today)`. The action
computes the contact patch and referral with these and passes them in; the
stores only write. This is the "rules live in one place" rule applied to a
second file because `logic.ts` is already 700 lines; CLAUDE.md is updated to
say so.

**Write order (no transactions on Supabase; documented in the store):**

- `createCallList`: list row first, then contacts in one upsert. A failure
  after the first step leaves an empty list — visible, deletable.
- `addCallLog`: **log first**, then the contact patch, then the referral
  contact. A failure after the log leaves a contact that looks uncalled (you
  might ring twice); the other order would lose the notes. A failure before
  the referral leaves the referral only in the log's `referral` field, which
  the history panel shows, so it is not lost.
- `updateCallLog`: log, then contact.

**JSON store**: `Database` gains `callLists`, `callContacts`, `callLogs`;
`heal()` does `db.callLists ??= []` etc. (an existing `db.json` predates the
keys) and heals each row; `seed.ts` includes the three empty arrays;
`resetCache()` unchanged.

**Supabase store**: consts `CALL_LISTS = 'call_lists'`, `CALL_CONTACTS =
'call_contacts'`, `CALL_LOGS = 'call_logs'`; rows are `{ id, list_id?,
contact_id?, data }`; reads `select('id, data')`, filter/order only on
generated columns; heal on read.

`scripts/migrate-to-supabase.mjs` pushes the three tables and counts them.

## 10. Migration `supabase/migrations/0004_sales.sql`

Header comment explains the query surface (list lists; load a list's
contacts in sheet order; load a list's/contact's logs newest first; nothing
else is filtered in SQL). Then:

```sql
create table if not exists public.call_lists (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz generated always as (public.ts_utc(data->>'createdAt')) stored,
  deleted_at timestamptz generated always as (public.ts_utc(data->>'deletedAt')) stored
);
create index if not exists call_lists_live_idx on public.call_lists (created_at desc) where deleted_at is null;

create table if not exists public.call_contacts (
  id uuid primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  data jsonb not null,
  sort_order int generated always as ((data->>'sortOrder')::int) stored,
  last_outcome text generated always as (data->>'lastOutcome') stored,
  next_call_date date generated always as (public.date_iso(data->>'nextCallDate')) stored,
  do_not_call boolean generated always as ((data->>'doNotCall')::boolean) stored
);
create index if not exists call_contacts_list_idx on public.call_contacts (list_id, sort_order);

create table if not exists public.call_logs (
  id uuid primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  contact_id uuid not null references public.call_contacts (id) on delete cascade,
  data jsonb not null,
  started_at timestamptz generated always as (public.ts_utc(data->>'startedAt')) stored,
  outcome text generated always as (data->>'outcome') stored
);
create index if not exists call_logs_list_idx on public.call_logs (list_id, started_at desc);
create index if not exists call_logs_contact_idx on public.call_logs (contact_id, started_at desc);

alter table public.call_lists enable row level security;
alter table public.call_contacts enable row level security;
alter table public.call_logs enable row level security;
```

`teams`/`players` stay JSON numbers or `null`, never `''`, because an int cast
of `''` would reject the row (the `DATE_FIELDS` lesson, for numbers).

## 11. Failure handling

| Situation | Behaviour |
|---|---|
| File isn't `.xlsx`/`.csv`, is empty, or has no header row | Inline error on the upload card; nothing created |
| Row has no org and no phone | Skipped; listed in the persistent import report with line number |
| Duplicate org+phone, unknown pick-list value, odd phone, DNC row, bad Show When | Stored; warning in the report |
| Show When unparseable | Item shown always |
| `logCall` network/server failure | Footer turns red with the message; draft retained; Save re-enabled |
| Tab closed mid-call | Draft in `localStorage` restores when the contact is reopened |
| Contact is Do Not Call | Excluded from the queue; screen disables outcomes and hides the phone; server rejects any outcome but `do_not_call` |
| Supabase partial write | Ordered as in §9; every partial state is visible and recoverable |
| `?c=` points at a contact from another list | 404 |

## 12. Testing

- **Pure modules** with `node --test` via the `tsx` loader (`npm test`; `tsx` is a dev dependency so the `@/` alias resolves): `import.ts` (fixture `.xlsx` and `.csv` covering aliases,
  skip/warn rules, numbers, DNC parsing, script tab), `script.ts` (Show When
  grammar incl. multi-value, `!=`, `;`, unparseable; placeholders),
  `sales-logic.ts` (`applyCallLog` per outcome incl. Not Now year rollover,
  `buildQueue` ordering incl. skipped-today and referral placement,
  `contactBucket`), `phone.ts`, `timezones.ts`.
- **Playwright** (the repo's convention — scripts live in the Cowork session,
  run against `npm run build && npm run start`, data reset first): `/sales`
  redirects to `/unlock` when locked; nav shows Sales when unlocked; upload
  the fixture sheet → list card shows counts and the report lists the skipped
  line; Start calling opens the first queued contact; a Show When reminder
  appears for one contact and not another; Save & Next disabled until an
  outcome + required prompt; Voicemail → next contact, table shows the badge;
  Skip logs nothing and bumps the skip count; Previous → Edit → re-save
  updates rather than duplicates; Referred creates the new contact right
  after; Do Not Call contact is absent from the queue and disabled via `?c=`;
  export has the expected header row.
- Manual: both timers, keyboard shortcuts, phone layout.

## 13. Files

New:
```
public/templates/powerplay-call-list-template.xlsx
scripts/build-call-template.mjs
src/lib/sales/picklists.json
src/lib/sales/import.ts        parse xlsx/csv → { list, contacts } | error
src/lib/sales/script.ts        applicableItems, fillPlaceholders, parseShowWhen
src/lib/sales/phone.ts         phoneDigits, phoneDisplay, telHref
src/lib/sales/timezones.ts     zoneFor, localTimeFor
src/lib/data/sales-logic.ts    applyCallLog, applySkip, buildQueue, contactBucket, referralContactFrom, heal*
src/app/sales/page.tsx
src/app/sales/actions.ts
src/app/sales/[id]/page.tsx
src/app/sales/[id]/call/page.tsx
src/app/api/sales/[id]/export.csv/route.ts
src/components/sales/upload-form.tsx
src/components/sales/list-card.tsx
src/components/sales/contacts-table.tsx
src/components/sales/outcome-badge.tsx
src/components/sales/star-rating.tsx
src/components/sales/call-view/index.tsx
src/components/sales/call-view/contact-panel.tsx
src/components/sales/call-view/script-panel.tsx
src/components/sales/call-view/outcome-panel.tsx
src/components/sales/call-view/history.tsx
src/components/sales/call-view/footer-bar.tsx
src/components/sales/call-view/use-keyboard.ts
src/components/sales/call-view/use-timers.ts
src/components/sales/call-view/use-draft.ts
supabase/migrations/0004_sales.sql
tests/sales/*.test.mjs + fixtures
```
Changed: `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/data/repository.ts`,
`src/lib/data/index.ts`, `src/lib/data/json-store.ts`, `src/lib/data/seed.ts`,
`src/lib/data/supabase-store.ts`, `src/app/layout.tsx`, `package.json`
(`read-excel-file`, `test` script), `scripts/migrate-to-supabase.mjs`,
`CLAUDE.md`.

## Appendix A — the shipped script

Section · Kind · Text · Response · Options · Show When

**Opening**
- Reminder · Say your name and "Powerplay Customs" clearly before anything else.
- Read · Hi [Name], it's [Rep] from Powerplay Customs — we make custom sublimated hockey jerseys, socks and pant shells for teams. I know I'm calling out of the blue; can I take thirty seconds to say why, and you tell me if it's worth a longer chat?
- Read · The reason I'm calling: most teams and associations we work with are sorting out jersey sets for next season around now, and I wanted to find out who handles that for [Org] and when you're next looking.
- Reminder · Mention the current promotion.
- Reminder · Ask when their AGM or budget meeting is. · *Show When:* `Org Type = Minor Hockey Association`
- Reminder · Ask whether a sponsor covers the jerseys. · *Show When:* `Org Type = Adult Team, Adult League (organiser)`

**Discovery**
- Question · Who looks after jerseys for [Org] — is that you, an equipment manager, or does the board decide? · Options: This person · Equipment manager · Board vote · Coach/manager per team · Parent committee · Other
- Question · When do you usually place your jersey order — and when's the next one? · Options: This season · Next season · No plan yet · Unknown
- Question · Who are you using today, and how's that going? · Options: Happy · Fine · Unhappy · No supplier
- Question · What's in a typical order — jerseys only, socks, pant shells? One set or home and away? · Options: Jerseys only · Jerseys + socks · Jerseys + socks + pants · Home & away sets · Association-wide
- Question · Roughly how many teams and players are we talking? · *(no options — free text)*
- Question · When you pick a supplier, what matters most? · Options: Turnaround · Durability · Design help · Low minimums · Price · Other

**Objections**
- Objection · We already have a supplier. · Response: Makes sense — most teams we work with did too. What do you like about them, and if you could change one thing, what would it be? Would a second quote on the next order be useful as a comparison?
- Objection · There's no budget for that. · Response: Understood. When does the next budget get set — the AGM, or the team meeting in the fall? I'll make sure you have something to table for it.
- Objection · The board decides. · Response: Who usually brings the proposal to the board, and when's the next meeting? I can send a one-pager they can table.
- Objection · Call back after the season / after tryouts. · Response: Happy to — what week works? One thing worth knowing: September is when everyone orders, so teams that lock a design in early skip the rush.
- Objection · Just send me something. · Response: Will do — what's the best email? I'll send the catalogue today. Is Thursday or Friday next week better for me to check back?

**Close**
- Read · Great — I'll send the catalogue over today and check back next week. What's the best email to use?
- Reminder · Read the email address back to them.
- Reminder · Pick the outcome and rate the lead before moving on.

"Price" appears only as a discovery option label. No price, quote amount or
money field exists anywhere in this feature.
