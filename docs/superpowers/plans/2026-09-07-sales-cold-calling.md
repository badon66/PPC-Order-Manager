# Sales Cold-Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/sales` section of the Powerplay order manager where a spreadsheet of prospects (contacts + call script) is uploaded and worked through one contact at a time, logging an outcome, rating, notes and answers per call, with results exportable as CSV.

**Architecture:** Three new entities (`CallList`, `Contact`, `CallLog`) added through the existing `Repository` interface and implemented in both the JSON store and the Supabase store, with all business rules in a new pure module `src/lib/data/sales-logic.ts`. Pure helpers for the sheet columns, phone numbers, timezones, the script's Show-When rules, import and export live under `src/lib/sales/`. Three server-rendered pages under `src/app/sales/` hand a client component (`src/components/sales/call-view/`) the data; every write is a server action in `src/app/sales/actions.ts`.

**Tech Stack:** Next.js 16 App Router (`src/`), TypeScript, Tailwind v4, hand-rolled UI in `src/components/ui.tsx` and `src/components/order-form/fields.tsx`; `read-excel-file` (runtime, `.xlsx` parsing); `exceljs` (dev-only, builds the template); `tsx` (dev-only, loads TS for `node --test`).

**Spec:** `docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md`. Read it first. Section numbers below (§n) refer to it.

## Global Constraints

- **No pricing, money, invoicing or deal-value field anywhere.** "Price" may appear only as a discovery-question option label.
- **Dates never pass through a timezone.** `nextCallDate`, `followUp.date` are `CalendarDate` (`YYYY-MM-DD`) strings; use `src/lib/dates.ts` (`today`, `addDays`, `isCalendarDate`, `formatShort`, `timestampDay`, `formatTimestamp`). Never `new Date('YYYY-MM-DD')`.
- **`''` is never stored in a date or number field** — coerce to `null` (`followUp.date`, `teams`, `players`).
- **Never discard user input**: unknown sheet columns go to `Contact.raw`; rows are skipped only with no org AND no phone; every other problem is a warning.
- **Business rules live in `src/lib/data/sales-logic.ts`** (pure, no I/O), called by both stores and the actions. Stores only read and write.
- **Every server action**: `'use server'`, `await requireRole('staff')` (`'admin'` for delete), `const actor = await currentActor()`, then `repo`, then `revalidatePath`.
- **Creating a record is never a GET.** Upload is a POST server action; `/sales/[id]/call` creates nothing.
- **Web Crypto only** in anything a client component imports: ids from `newId()` in `src/lib/order-utils.ts`.
- **Enums are `as const` arrays in `src/lib/types.ts`** with a derived union; labels/emoji/classes in a `Record` in `src/lib/constants.ts`; never hand-write a subset list at a call site.
- **Pages** are async server components with `export const dynamic = 'force-dynamic'`, `params`/`searchParams` are Promises.
- **Mobile still works**: 44px targets are global CSS; use `sm:`/`lg:` breakpoints; wide tables get a `md:hidden` card fallback.
- **Choice buttons** use the app's active class `border-ppc-gold bg-ppc-gold/10 text-ppc-gold`; inactive `border-line bg-surface-2 hover:border-ppc-gold/50`.
- Tests: `npm test` → `node --import tsx --test "tests/**/*.test.ts"`. Pure modules must be covered; stores are covered by `npx tsc --noEmit` and the browser walkthrough (they write the dev database).
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Spec amendments already agreed (apply in Task 0): the template builder is a Node script using `exceljs` (no Python on the machine); tests use `node --test` with the `tsx` loader.

---

## File map

| Path | Responsibility |
|---|---|
| `src/lib/types.ts` (modify, append) | Enums and the three entity interfaces |
| `src/lib/constants.ts` (modify, append) | `CALL_OUTCOME_META`, option lists, hotkeys |
| `src/lib/sales/picklists.json` | Pick-list values shared by importer, UI and template builder |
| `src/lib/sales/default-script.json` | The shipped script (Appendix A) for the template and the sample fixture |
| `src/lib/sales/columns.ts` | The 26 sheet columns: header, key, aliases, kind, pick-list |
| `src/lib/sales/phone.ts` | digits / display / `tel:` |
| `src/lib/sales/timezones.ts` | province → zone, local time string |
| `src/lib/sales/script.ts` | Show When parser/evaluator, placeholders, applicable items |
| `src/lib/data/sales-logic.ts` | factories, heal, `applyCallLog`, `applySkip`, `buildQueue`, `contactBucket`, `validateCallLog`, `referralContactFrom`, tally |
| `src/lib/sales/import.ts` | file bytes → `{ list, contacts }` or error |
| `src/lib/sales/export.ts` | bundle → CSV text |
| `scripts/build-call-template.mjs` | writes the blank template and the test fixture |
| `public/templates/powerplay-call-list-template.xlsx` | the blank sheet |
| `tests/sales/fixtures/sample-list.xlsx`, `sample-list.csv` | import fixtures |
| `src/lib/data/repository.ts` (modify) | `CallListBundle`, nine sales methods |
| `src/lib/data/json-store.ts`, `seed.ts`, `supabase-store.ts`, `index.ts` (modify) | the two implementations |
| `supabase/migrations/0004_sales.sql` | three tables |
| `scripts/migrate-to-supabase.mjs` (modify) | push + verify the three tables |
| `src/app/sales/actions.ts` | `uploadCallList`, `logCall`, `updateCallLog`, `skipContact`, `deleteCallList` |
| `src/app/sales/page.tsx` | landing: caller name, upload, list cards |
| `src/app/sales/[id]/page.tsx` | contacts table + import report |
| `src/app/sales/[id]/call/page.tsx` | server shell for the calling view |
| `src/app/api/sales/[id]/export.csv/route.ts` | CSV download |
| `src/components/sales/use-caller-name.ts` | localStorage caller name hook |
| `src/components/sales/upload-form.tsx`, `list-card.tsx`, `delete-list-button.tsx`, `outcome-badge.tsx`, `star-rating.tsx`, `import-report.tsx` | landing/table pieces |
| `src/components/sales/call-view/index.tsx`, `contact-panel.tsx`, `script-panel.tsx`, `outcome-panel.tsx`, `history.tsx`, `footer-bar.tsx`, `use-draft.ts`, `use-timers.ts`, `use-keyboard.ts` | the calling view |
| `src/app/layout.tsx` (modify) | nav link |
| `CLAUDE.md` (modify) | Sales section |

---

### Task 0: Dependencies, test harness, spec amendments

**Files:**
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md` (§12 and §3 wording)
- Create: `tests/sales/harness.test.ts`

**Interfaces:**
- Produces: `npm test` running `node --import tsx --test "tests/**/*.test.ts"`; runtime dep `read-excel-file`; dev deps `tsx`, `exceljs`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install read-excel-file@^9 && npm install -D tsx@^4 exceljs@^4
```
Expected: `package.json` gains `"read-excel-file"` under `dependencies` and `"tsx"`, `"exceljs"` under `devDependencies`; no peer warnings that mention `next` or `react`.

- [ ] **Step 2: Add the test script**

In `package.json` `"scripts"`, add after `"lint"`:
```json
    "test": "node --import tsx --test \"tests/**/*.test.ts\""
```

- [ ] **Step 3: Write a harness test that proves the `@/` alias resolves**

Create `tests/sales/harness.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '@/lib/dates';

test('tsx loader resolves the @/ alias and runs TypeScript', () => {
  assert.equal(addDays('2026-09-06', 1), '2026-09-07');
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: `# pass 1` and exit code 0. If the import fails with "Cannot find module '@/lib/dates'", tsx is not reading `tsconfig.json` `paths` — check the script runs from the repo root (it does under npm) and that `tsconfig.json` still has `"paths": { "@/*": ["./src/*"] }`.

- [ ] **Step 5: Amend the spec for the two tooling changes**

In the spec, replace the sentence in §3 that begins `` `public/templates/powerplay-call-list-template.xlsx`, generated by `scripts/build-call-template.py` (openpyxl; dev-time only). `` with:
```
`public/templates/powerplay-call-list-template.xlsx`, generated by
`scripts/build-call-template.mjs` (Node + `exceljs`, a dev-only dependency —
there is no Python on the build machine).
```
In §12 replace `` with `node --test` (no runner to install; `npm test` script added) `` with `` with `node --test` via the `tsx` loader (`npm test`; `tsx` is a dev dependency so the `@/` alias resolves) ``. In §13 change `scripts/build-call-template.py` to `scripts/build-call-template.mjs`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/sales/harness.test.ts docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md
git commit -m "Sales: test harness (node --test via tsx) and parsing deps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Types, constants, pick-lists

**Files:**
- Modify: `src/lib/types.ts` (append at end of file)
- Modify: `src/lib/constants.ts` (append at end of file)
- Create: `src/lib/sales/picklists.json`
- Test: `tests/sales/constants.test.ts`

**Interfaces:**
- Produces (types): `CALL_OUTCOMES`, `CallOutcome`, `SCRIPT_KINDS`, `ScriptKind`, `SCRIPT_SECTIONS`, `ScriptSection`, `LeadPriority`, `LeadRating`, `ContactSource`, `ContactBucket`, `ScriptItem`, `ImportReport`, `CallList`, `Contact`, `CallLog`, `FollowUp`, `Referral`.
- Produces (constants): `CALL_OUTCOME_META`, `CALL_OUTCOME_OPTIONS`, `MISSED_OUTCOMES`, `TALKED_OUTCOMES`, `OUTCOME_HOTKEYS`, `NOT_INTERESTED_REASONS`, `PRIORITY_RANK`.
- Produces (json): `picklists.json` with keys `orgType, role, province, timezoneOverride, ageDivisions, month, leadSource, priority, bestTimeToCall, yesNo, notInterestedReason`.

- [ ] **Step 1: Append the sales types to `src/lib/types.ts`**

At the very end of `src/lib/types.ts` add (the file already imports `CalendarDate` from `./dates`; if it doesn't, add `import type { CalendarDate } from './dates';` at the top):
```ts
/* ------------------------------------------------------------------ *
 * Sales — cold calling.
 * Design: docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md
 * ------------------------------------------------------------------ */

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
export type ContactSource = 'sheet' | 'referral';
export type ContactBucket = 'do_not_call' | 'uncalled' | 'retry' | 'follow_up' | 'done';

/** One row of the sheet's Script tab. Ids are per-list (`s1`, `s2`, …). */
export interface ScriptItem {
  id: string;
  section: ScriptSection;
  kind: ScriptKind;
  text: string;
  /** Objection rows: what to say back. '' otherwise. */
  response: string;
  /** Question rows: the choices. Empty = free-text answer. */
  options: string[];
  /** Show When rule as typed. '' = always. Parsed at render time. */
  showWhen: string;
}

/** What the upload skipped or flagged. Persisted on the list; shown every time. */
export interface ImportReport {
  imported: number;
  skipped: Array<{ line: number; reason: string; raw: string }>;
  warnings: Array<{ line: number; reason: string }>;
}

export interface CallList {
  id: string;
  name: string;
  sourceFileName: string;
  script: ScriptItem[];
  importReport: ImportReport;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Contact {
  id: string;
  listId: string;
  /** Sheet row order. A referral copies its source's, and sorts after it by createdAt. */
  sortOrder: number;
  source: ContactSource;
  referredFromContactId: string | null;

  /* From the sheet */
  orgName: string;
  orgType: string;
  contactName: string;
  role: string;
  phone: string;
  altPhone: string;
  email: string;
  city: string;
  province: string;
  timezoneOverride: string;
  league: string;
  ageDivisions: string;
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
  notes: string;
  /** Every header → cell as uploaded, including columns the importer doesn't know. */
  raw: Record<string, string>;

  /* Call state. Written only by applyCallLog / applySkip in data/sales-logic.ts. */
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

export interface FollowUp {
  date: CalendarDate | null;
  /** 'HH:MM' or ''. */
  time: string;
  note: string;
}

export interface Referral {
  name: string;
  role: string;
  phone: string;
  email: string;
}

export interface CallLog {
  id: string;
  listId: string;
  contactId: string;
  outcome: CallOutcome;
  leadRating: LeadRating | null;
  notes: string;
  /** ScriptItem.id → chosen option or free text. */
  answers: Record<string, string>;
  /** ScriptItem.ids of reminders ticked. */
  checklist: string[];
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  callerName: string;
  followUp: FollowUp;
  /** Captured on send_info / interested. */
  email: string;
  /** not_interested reason. */
  reason: string;
  referral: Referral;
  /** bad_number replacement. */
  newPhone: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create `src/lib/sales/picklists.json`**

```json
{
  "orgType": [
    "Minor Hockey Association", "Rep/Club Team", "Adult League (organiser)", "Adult Team",
    "Junior Team", "School Team", "College/University", "Tournament",
    "Spring/Summer Program", "Rec Program", "Other"
  ],
  "role": [
    "President", "Vice President", "Equipment Manager", "Head Coach", "Team Manager",
    "Treasurer", "Registrar", "Director/Board", "Tournament Director", "Athletic Director",
    "League Convenor/Commissioner", "Captain/Organiser", "Office Admin", "Other"
  ],
  "province": ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"],
  "timezoneOverride": ["Pacific", "Mountain", "Central", "Central (no DST)", "Eastern", "Atlantic", "Newfoundland"],
  "ageDivisions": ["U7", "U9", "U11", "U13", "U15", "U18", "U21", "Adult"],
  "month": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Unknown"],
  "leadSource": ["Referral", "Tournament", "Web research", "Social", "Existing customer", "Inbound", "Other"],
  "priority": ["A", "B", "C"],
  "bestTimeToCall": ["Weekday daytime", "Weekday evening", "Weekend", "Unknown"],
  "yesNo": ["Y", "N"],
  "notInterestedReason": ["Happy with supplier", "Locked contract", "Price", "No need", "Other"]
}
```

- [ ] **Step 3: Append the outcome metadata to `src/lib/constants.ts`**

At the top of `src/lib/constants.ts`, with the other imports: extend the existing `import type { … } from './types'` with `CallOutcome` and `LeadPriority`, and add
```ts
import picklists from './sales/picklists.json';
```
Then at the very end of the file add:
```ts
/* ------------------------------------------------------------------ *
 * Sales — call outcomes. Same shape as STATUS_META: one record, derived
 * lists, never a hand-written subset at a call site.
 * ------------------------------------------------------------------ */

export type OutcomeGroup = 'missed' | 'talked';

export const CALL_OUTCOME_META: Record<
  CallOutcome,
  { label: string; emoji: string; group: OutcomeGroup; className: string; order: number }
> = {
  no_answer:      { label: 'No Answer',            emoji: '📵', group: 'missed', order: 0,  className: 'border-line text-muted bg-surface-2' },
  voicemail:      { label: 'Left Voicemail',       emoji: '📼', group: 'missed', order: 1,  className: 'border-sky-500/60 text-sky-300 bg-sky-500/10' },
  bad_number:     { label: 'Bad Number',           emoji: '❌', group: 'missed', order: 2,  className: 'border-red-500/60 text-red-300 bg-red-500/10' },
  referred:       { label: 'Gatekeeper / Referred', emoji: '↪️', group: 'missed', order: 3,  className: 'border-violet-500/60 text-violet-300 bg-violet-500/10' },
  callback:       { label: 'Callback Requested',   emoji: '🔁', group: 'talked', order: 4,  className: 'border-amber-500/60 text-amber-300 bg-amber-500/10' },
  send_info:      { label: 'Send Info',            emoji: '📨', group: 'talked', order: 5,  className: 'border-sky-500/60 text-sky-300 bg-sky-500/10' },
  interested:     { label: 'Interested',           emoji: '🔥', group: 'talked', order: 6,  className: 'border-ppc-gold text-ppc-gold bg-ppc-gold/10' },
  meeting_booked: { label: 'Meeting Booked',       emoji: '📅', group: 'talked', order: 7,  className: 'border-emerald-500/60 text-emerald-300 bg-emerald-500/10' },
  not_now:        { label: 'Not Now',              emoji: '⏳', group: 'talked', order: 8,  className: 'border-amber-500/60 text-amber-300 bg-amber-500/10' },
  not_interested: { label: 'Not Interested',       emoji: '🚫', group: 'talked', order: 9,  className: 'border-line text-muted bg-surface-2' },
  do_not_call:    { label: 'Do Not Call',          emoji: '⛔', group: 'talked', order: 10, className: 'border-red-500/60 text-red-300 bg-red-500/10' },
};

export const CALL_OUTCOME_OPTIONS = (Object.keys(CALL_OUTCOME_META) as CallOutcome[]).sort(
  (a, b) => CALL_OUTCOME_META[a].order - CALL_OUTCOME_META[b].order,
);
export const MISSED_OUTCOMES = CALL_OUTCOME_OPTIONS.filter((o) => CALL_OUTCOME_META[o].group === 'missed');
export const TALKED_OUTCOMES = CALL_OUTCOME_OPTIONS.filter((o) => CALL_OUTCOME_META[o].group === 'talked');

/** Keyboard keys for the eleven outcomes, in CALL_OUTCOME_OPTIONS order. */
export const OUTCOME_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'] as const;

export const NOT_INTERESTED_REASONS: readonly string[] = picklists.notInterestedReason;

/** Queue sort: A first, blank last. */
export const PRIORITY_RANK: Record<LeadPriority, number> = { A: 0, B: 1, C: 2, '': 3 };

export const SALES_PICKLISTS = picklists;
```
If `tsc` complains about the JSON import, confirm `tsconfig.json` has `"resolveJsonModule": true` (Next's default does) and `"esModuleInterop": true`.

- [ ] **Step 4: Write the test**

Create `tests/sales/constants.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_OUTCOMES } from '@/lib/types';
import {
  CALL_OUTCOME_META, CALL_OUTCOME_OPTIONS, MISSED_OUTCOMES, TALKED_OUTCOMES, OUTCOME_HOTKEYS, SALES_PICKLISTS,
} from '@/lib/constants';

test('every outcome has metadata and the option list is in declared order', () => {
  assert.deepEqual([...CALL_OUTCOME_OPTIONS], [...CALL_OUTCOMES]);
  for (const o of CALL_OUTCOMES) assert.ok(CALL_OUTCOME_META[o].label.length > 0);
});

test('groups split 4 / 7 and hotkeys cover all eleven', () => {
  assert.equal(MISSED_OUTCOMES.length, 4);
  assert.equal(TALKED_OUTCOMES.length, 7);
  assert.equal(OUTCOME_HOTKEYS.length, CALL_OUTCOME_OPTIONS.length);
});

test('pick-lists have the keys the sheet and the app rely on', () => {
  for (const k of ['orgType', 'role', 'province', 'timezoneOverride', 'ageDivisions', 'month', 'leadSource', 'priority', 'bestTimeToCall', 'yesNo', 'notInterestedReason']) {
    assert.ok(Array.isArray((SALES_PICKLISTS as Record<string, unknown>)[k]), k);
  }
  assert.equal(SALES_PICKLISTS.province.length, 13);
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: `# pass 4` (harness + 3), tsc silent.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/constants.ts src/lib/sales/picklists.json tests/sales/constants.test.ts
git commit -m "Sales: entity types, call outcome metadata, pick-lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Sheet columns, phone, timezones

**Files:**
- Create: `src/lib/sales/columns.ts`, `src/lib/sales/phone.ts`, `src/lib/sales/timezones.ts`
- Test: `tests/sales/columns.test.ts`, `tests/sales/phone.test.ts`, `tests/sales/timezones.test.ts`

**Interfaces:**
- Produces: `CONTACT_COLUMNS: readonly ContactColumn[]` (26 entries, template order), `ContactSheetKey`, `normaliseHeader(h): string`, `keyForHeader(h): ContactSheetKey | null`, `headerForKey(key): string`;
  `phoneDigits(raw): string`, `isNorthAmerican(raw): boolean`, `telHref(raw): string | null`, `phoneDisplay(raw): string`;
  `zoneFor({province, timezoneOverride}): string | null`, `localTimeFor(contact, now?): string | null`.

- [ ] **Step 1: Write the column tests**

Create `tests/sales/columns.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_COLUMNS, keyForHeader, headerForKey, normaliseHeader } from '@/lib/sales/columns';

test('26 template columns, first is Org Name, last is Notes', () => {
  assert.equal(CONTACT_COLUMNS.length, 26);
  assert.equal(CONTACT_COLUMNS[0].header, 'Org Name');
  assert.equal(CONTACT_COLUMNS[25].header, 'Notes');
});

test('headers and aliases resolve case-insensitively, unknown → null', () => {
  assert.equal(keyForHeader('Org Name'), 'orgName');
  assert.equal(keyForHeader('  organization '), 'orgName');
  assert.equal(keyForHeader('Team Name'), 'orgName');
  assert.equal(keyForHeader('PHONE NUMBER'), 'phone');
  assert.equal(keyForHeader('Do Not Call?'), 'doNotCall');
  assert.equal(keyForHeader('Priority (A/B/C)'), 'priority');
  assert.equal(keyForHeader('Rink'), null);
  assert.equal(headerForKey('orderingMonth'), 'Ordering Window (month)');
});

test('normaliseHeader collapses spaces and strips punctuation', () => {
  assert.equal(normaliseHeader('  League / Level '), 'league level');
  assert.equal(normaliseHeader('Teams (#)'), 'teams');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test -- tests/sales/columns.test.ts` — note: `node --test` takes file args; run `node --import tsx --test tests/sales/columns.test.ts`.
Expected: FAIL — cannot find module `@/lib/sales/columns`.

- [ ] **Step 3: Create `src/lib/sales/columns.ts`**

```ts
import type { Contact } from '@/lib/types';
import picklists from './picklists.json';

/**
 * The Contacts tab, column by column. This is the single description of the
 * sheet: the importer maps headers with it, the exporter writes them in this
 * order, the template builder reads it (via the JSON mirror it generates from
 * the same list), and Show When rules resolve field names through it.
 */
export type ContactSheetKey =
  | 'orgName' | 'orgType' | 'contactName' | 'role' | 'phone' | 'altPhone' | 'email'
  | 'city' | 'province' | 'timezoneOverride' | 'league' | 'ageDivisions' | 'teams'
  | 'players' | 'seasonStartMonth' | 'orderingMonth' | 'currentSupplier'
  | 'lastOrderedYear' | 'colours' | 'website' | 'social' | 'leadSource' | 'priority'
  | 'bestTimeToCall' | 'doNotCall' | 'notes';

export type ColumnKind = 'text' | 'number' | 'yesNo' | 'priority' | 'province';

export interface ContactColumn {
  header: string;
  key: ContactSheetKey;
  aliases: string[];
  kind: ColumnKind;
  /** Which pick-list constrains the value (warning when not on it). */
  picklist?: keyof typeof picklists;
  /** Comma-separated multi-value (Age Divisions). */
  multi?: boolean;
}

export const CONTACT_COLUMNS: readonly ContactColumn[] = [
  { header: 'Org Name', key: 'orgName', kind: 'text', aliases: ['org', 'organization', 'organisation', 'team', 'team name', 'association', 'club'] },
  { header: 'Org Type', key: 'orgType', kind: 'text', picklist: 'orgType', aliases: ['type', 'organization type', 'organisation type'] },
  { header: 'Contact Name', key: 'contactName', kind: 'text', aliases: ['name', 'contact', 'full name', 'person'] },
  { header: 'Role', key: 'role', kind: 'text', picklist: 'role', aliases: ['title', 'position'] },
  { header: 'Phone', key: 'phone', kind: 'text', aliases: ['phone number', 'cell', 'mobile', 'telephone', 'tel'] },
  { header: 'Alt Phone', key: 'altPhone', kind: 'text', aliases: ['alternate phone', 'phone 2', 'second phone', 'other phone'] },
  { header: 'Email', key: 'email', kind: 'text', aliases: ['e-mail', 'email address'] },
  { header: 'City', key: 'city', kind: 'text', aliases: ['town'] },
  { header: 'Province', key: 'province', kind: 'province', picklist: 'province', aliases: ['prov', 'province/state', 'state'] },
  { header: 'Timezone Override', key: 'timezoneOverride', kind: 'text', picklist: 'timezoneOverride', aliases: ['timezone', 'time zone'] },
  { header: 'League / Level', key: 'league', kind: 'text', aliases: ['league', 'level', 'league level'] },
  { header: 'Age Divisions', key: 'ageDivisions', kind: 'text', picklist: 'ageDivisions', multi: true, aliases: ['divisions', 'age groups', 'ages'] },
  { header: 'Teams (#)', key: 'teams', kind: 'number', aliases: ['teams', 'number of teams', 'team count'] },
  { header: 'Players (approx)', key: 'players', kind: 'number', aliases: ['players', 'number of players', 'player count'] },
  { header: 'Season Start (month)', key: 'seasonStartMonth', kind: 'text', picklist: 'month', aliases: ['season start'] },
  { header: 'Ordering Window (month)', key: 'orderingMonth', kind: 'text', picklist: 'month', aliases: ['ordering window', 'orders in', 'order month', 'ordering month'] },
  { header: 'Current Supplier', key: 'currentSupplier', kind: 'text', aliases: ['supplier', 'vendor'] },
  { header: 'Last Ordered (year)', key: 'lastOrderedYear', kind: 'text', aliases: ['last ordered', 'last order year'] },
  { header: 'Colours', key: 'colours', kind: 'text', aliases: ['colors', 'team colours', 'team colors'] },
  { header: 'Website', key: 'website', kind: 'text', aliases: ['web', 'url', 'site'] },
  { header: 'Social', key: 'social', kind: 'text', aliases: ['social media', 'instagram', 'facebook'] },
  { header: 'Lead Source', key: 'leadSource', kind: 'text', picklist: 'leadSource', aliases: ['source'] },
  { header: 'Priority', key: 'priority', kind: 'priority', picklist: 'priority', aliases: ['priority abc', 'tier', 'rank'] },
  { header: 'Best Time to Call', key: 'bestTimeToCall', kind: 'text', picklist: 'bestTimeToCall', aliases: ['best time', 'call time', 'when to call'] },
  { header: 'Do Not Call', key: 'doNotCall', kind: 'yesNo', picklist: 'yesNo', aliases: ['dnc', 'do not call', 'no call'] },
  { header: 'Notes', key: 'notes', kind: 'text', aliases: ['note', 'comments', 'research'] },
];

/** Lower-case, punctuation stripped, whitespace collapsed. 'Teams (#)' → 'teams'. */
export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_TO_KEY: Record<string, ContactSheetKey> = {};
for (const col of CONTACT_COLUMNS) {
  HEADER_TO_KEY[normaliseHeader(col.header)] = col.key;
  for (const a of col.aliases) HEADER_TO_KEY[normaliseHeader(a)] ??= col.key;
}

export function keyForHeader(header: string): ContactSheetKey | null {
  return HEADER_TO_KEY[normaliseHeader(header)] ?? null;
}

export function headerForKey(key: ContactSheetKey): string {
  return CONTACT_COLUMNS.find((c) => c.key === key)!.header;
}

/** The sheet-facing string for a contact field (numbers and booleans rendered). */
export function sheetValue(contact: Contact, key: ContactSheetKey): string {
  const v = contact[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  return String(v);
}
```

- [ ] **Step 4: Write the phone tests**

Create `tests/sales/phone.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneDigits, isNorthAmerican, telHref, phoneDisplay } from '@/lib/sales/phone';

test('digits, NA detection', () => {
  assert.equal(phoneDigits('(705) 555-0142'), '7055550142');
  assert.equal(phoneDigits('+1 705.555.0142 ext 4'), '17055550142' + '4');
  assert.ok(isNorthAmerican('705-555-0142'));
  assert.ok(isNorthAmerican('1 705 555 0142'));
  assert.ok(!isNorthAmerican('555-0142'));
});

test('tel: hrefs', () => {
  assert.equal(telHref('705 555 0142'), 'tel:+17055550142');
  assert.equal(telHref('+1 (705) 555-0142'), 'tel:+17055550142');
  assert.equal(telHref('0044 20 7946 0958'), 'tel:00442079460958');
  assert.equal(telHref(''), null);
  assert.equal(telHref('n/a'), null);
});

test('display keeps odd numbers verbatim', () => {
  assert.equal(phoneDisplay('7055550142'), '(705) 555-0142');
  assert.equal(phoneDisplay('1-705-555-0142'), '(705) 555-0142');
  assert.equal(phoneDisplay(' 555-0142 '), '555-0142');
});
```

- [ ] **Step 5: Create `src/lib/sales/phone.ts`**

```ts
/** Everything that isn't a digit is dropped. Extensions are kept as trailing digits — the caller sees the raw string too. */
export function phoneDigits(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** 10 digits, or 11 starting with 1. */
export function isNorthAmerican(raw: string): boolean {
  const d = phoneDigits(raw);
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
}

/** `tel:` link, or null when there's nothing to dial. */
export function telHref(raw: string): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;
  if (d.length === 10) return `tel:+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `tel:+${d}`;
  return `tel:${d}`;
}

/** `(705) 555-0142` for North American numbers; anything else as typed. */
export function phoneDisplay(raw: string): string {
  const d = phoneDigits(raw);
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (n.length !== 10) return (raw ?? '').trim();
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}
```

- [ ] **Step 6: Write the timezone tests**

Create `tests/sales/timezones.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneFor, localTimeFor } from '@/lib/sales/timezones';

test('province → zone, override wins, unknown → null', () => {
  assert.equal(zoneFor({ province: 'ON', timezoneOverride: '' }), 'America/Toronto');
  assert.equal(zoneFor({ province: 'SK', timezoneOverride: '' }), 'America/Regina');
  assert.equal(zoneFor({ province: 'BC', timezoneOverride: 'Mountain' }), 'America/Edmonton');
  assert.equal(zoneFor({ province: 'on', timezoneOverride: '' }), 'America/Toronto');
  assert.equal(zoneFor({ province: '', timezoneOverride: '' }), null);
  assert.equal(zoneFor({ province: 'XX', timezoneOverride: 'nonsense' }), null);
});

test('local time renders in the contact zone', () => {
  const noon = new Date('2026-09-06T16:00:00Z'); // 12:00 Toronto (EDT), 9:00 Vancouver (PDT)
  assert.equal(localTimeFor({ province: 'ON', timezoneOverride: '' }, noon), '12:00 pm');
  assert.equal(localTimeFor({ province: 'BC', timezoneOverride: '' }, noon), '9:00 am');
  assert.equal(localTimeFor({ province: 'NL', timezoneOverride: '' }, noon), '1:30 pm');
  assert.equal(localTimeFor({ province: '', timezoneOverride: '' }, noon), null);
});
```

- [ ] **Step 7: Create `src/lib/sales/timezones.ts`**

```ts
/**
 * Canada spans five and a half hours. The caller should never do the math:
 * the contact panel shows the prospect's local time, derived from province
 * unless the sheet says otherwise (Lloydminster, the BC Peace region, …).
 */
const PROVINCE_ZONES: Record<string, string> = {
  AB: 'America/Edmonton', BC: 'America/Vancouver', MB: 'America/Winnipeg',
  NB: 'America/Moncton', NL: 'America/St_Johns', NS: 'America/Halifax',
  NT: 'America/Yellowknife', NU: 'America/Iqaluit', ON: 'America/Toronto',
  PE: 'America/Halifax', QC: 'America/Toronto', SK: 'America/Regina',
  YT: 'America/Whitehorse',
};

const OVERRIDE_ZONES: Record<string, string> = {
  'pacific': 'America/Vancouver', 'mountain': 'America/Edmonton',
  'central': 'America/Winnipeg', 'central (no dst)': 'America/Regina',
  'eastern': 'America/Toronto', 'atlantic': 'America/Halifax',
  'newfoundland': 'America/St_Johns',
};

export function zoneFor(c: { province: string; timezoneOverride: string }): string | null {
  const o = OVERRIDE_ZONES[(c.timezoneOverride ?? '').trim().toLowerCase()];
  if (o) return o;
  return PROVINCE_ZONES[(c.province ?? '').trim().toUpperCase()] ?? null;
}

/** "2:14 pm" in the contact's zone, or null when the zone is unknown. */
export function localTimeFor(
  c: { province: string; timezoneOverride: string },
  now: Date = new Date(),
): string | null {
  const zone = zoneFor(c);
  if (!zone) return null;
  // formatToParts, not format(): locale output varies ("p.m.", narrow spaces); the parts don't.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}
```

- [ ] **Step 8: Run all three tests**

Run: `npm test`
Expected: all pass (harness 1 + constants 3 + columns 3 + phone 3 + timezones 2 = 12).

- [ ] **Step 9: Commit**

```bash
git add src/lib/sales/columns.ts src/lib/sales/phone.ts src/lib/sales/timezones.ts tests/sales/columns.test.ts tests/sales/phone.test.ts tests/sales/timezones.test.ts
git commit -m "Sales: sheet column map, phone helpers, contact local time

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Script rules — Show When, placeholders

**Files:**
- Create: `src/lib/sales/script.ts`
- Test: `tests/sales/script.test.ts`

**Interfaces:**
- Consumes: `ScriptItem`, `Contact` (Task 1); `CONTACT_COLUMNS`, `keyForHeader`, `sheetValue` (Task 2).
- Produces: `parseShowWhen(rule): ParsedShowWhen`, `showWhenMatches(rule, contact): boolean`, `applicableItems(script, contact): ScriptItem[]`, `fillPlaceholders(text, contact, callerName): string`, `contactFieldValue(contact, field): string | undefined`, `blankContactFields()` test helper is NOT here — tests build contacts inline.

- [ ] **Step 1: Write the tests**

Create `tests/sales/script.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contact, ScriptItem } from '@/lib/types';
import { parseShowWhen, showWhenMatches, applicableItems, fillPlaceholders } from '@/lib/sales/script';

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c1', listId: 'l1', sortOrder: 1, source: 'sheet', referredFromContactId: null,
    orgName: 'Ennismore Eagles', orgType: 'Minor Hockey Association', contactName: 'Jamie Ouellette',
    role: 'Equipment Manager', phone: '7055550142', altPhone: '', email: '', city: 'Ennismore',
    province: 'ON', timezoneOverride: '', league: 'OMHA', ageDivisions: 'U9, U11, U13', teams: 14,
    players: 210, seasonStartMonth: 'Sep', orderingMonth: 'Jun', currentSupplier: 'XYZ Sports',
    lastOrderedYear: '2023', colours: 'navy/gold', website: '', social: '', leadSource: 'Web research',
    priority: 'A', bestTimeToCall: 'Weekday evening', doNotCall: false, notes: '',
    raw: { 'Rink': 'Ennismore CC' },
    lastOutcome: null, lastCalledAt: null, callCount: 0, skipCount: 0, lastSkippedAt: null,
    nextCallDate: null, leadRating: null, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
    ...over,
  };
}

test('parseShowWhen: blank, =, !=, multi-value, ;, and errors', () => {
  assert.deepEqual(parseShowWhen(''), { ok: true, clauses: [] });
  assert.deepEqual(parseShowWhen('Org Type = Minor Hockey Association'), {
    ok: true, clauses: [{ field: 'Org Type', op: '=', values: ['minor hockey association'] }],
  });
  assert.deepEqual(parseShowWhen('Role != Head Coach; Priority = A, B'), {
    ok: true,
    clauses: [
      { field: 'Role', op: '!=', values: ['head coach'] },
      { field: 'Priority', op: '=', values: ['a', 'b'] },
    ],
  });
  assert.equal(parseShowWhen('Org Type').ok, false);
  assert.equal(parseShowWhen('= Adult Team').ok, false);
  assert.equal(parseShowWhen('Org Type = ').ok, false);
});

test('showWhenMatches resolves headers, keys and raw columns', () => {
  const c = contact();
  assert.ok(showWhenMatches('Org Type = Minor Hockey Association', c));
  assert.ok(showWhenMatches('orgType = minor hockey association', c));
  assert.ok(!showWhenMatches('Org Type = Adult Team', c));
  assert.ok(showWhenMatches('Org Type = Adult Team, Minor Hockey Association', c));
  assert.ok(showWhenMatches('Role != Head Coach', c));
  assert.ok(!showWhenMatches('Role != Equipment Manager', c));
  assert.ok(showWhenMatches('Age Divisions = U11', c));          // contains any
  assert.ok(!showWhenMatches('Age Divisions = U15', c));
  assert.ok(showWhenMatches('Rink = Ennismore CC', c));          // raw column
  assert.ok(!showWhenMatches('Rink = Somewhere Else', c));
  assert.ok(showWhenMatches('Role != Head Coach; Priority = A', c));
  assert.ok(!showWhenMatches('Role != Head Coach; Priority = B', c));
  assert.ok(showWhenMatches('Nonexistent Column = X', c) === false);
  assert.ok(showWhenMatches('Nonexistent Column != X', c) === true);
});

test('unparseable rule shows the item (never hides)', () => {
  assert.ok(showWhenMatches('garbage', contact()));
});

test('applicableItems keeps order and filters', () => {
  const script: ScriptItem[] = [
    { id: 's1', section: 'opening', kind: 'read', text: 'Hi [Name]', response: '', options: [], showWhen: '' },
    { id: 's2', section: 'opening', kind: 'reminder', text: 'Ask about AGM', response: '', options: [], showWhen: 'Org Type = Minor Hockey Association' },
    { id: 's3', section: 'opening', kind: 'reminder', text: 'Ask about sponsor', response: '', options: [], showWhen: 'Org Type = Adult Team' },
  ];
  assert.deepEqual(applicableItems(script, contact()).map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(applicableItems(script, contact({ orgType: 'Adult Team' })).map((s) => s.id), ['s1', 's3']);
});

test('placeholders', () => {
  const c = contact();
  assert.equal(fillPlaceholders('Hi [Name], it\'s [Rep] about [Org] in [City]', c, 'Keenan Huber'), 'Hi Jamie, it\'s Keenan about Ennismore Eagles in Ennismore');
  assert.equal(fillPlaceholders('[Full Name] / [Supplier]', c, 'K'), 'Jamie Ouellette / XYZ Sports');
  assert.equal(fillPlaceholders('[Name]', contact({ contactName: '' }), 'K'), 'there');
  assert.equal(fillPlaceholders('[Supplier]', contact({ currentSupplier: '' }), 'K'), 'your current supplier');
  assert.equal(fillPlaceholders('at [Rink]', c, 'K'), 'at Ennismore CC');
  assert.equal(fillPlaceholders('[Unknown Thing]', c, 'K'), '[Unknown Thing]');
  assert.equal(fillPlaceholders('[name] [ORG]', c, 'K'), 'Jamie Ennismore Eagles');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --import tsx --test tests/sales/script.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/sales/script.ts`**

```ts
import type { Contact, ScriptItem } from '@/lib/types';
import { CONTACT_COLUMNS, keyForHeader, normaliseHeader, sheetValue } from './columns';

/*
 * Show When — the rule in the Script tab that makes a line "relevant".
 *
 *   Org Type = Minor Hockey Association
 *   Org Type = Adult Team, Adult League (organiser)      any of
 *   Role != Head Coach; Priority = A                     all of
 *
 * A field name is matched against the Contacts headers, their camelCase keys,
 * and any raw column the sheet had. Values compare trimmed, case-insensitive.
 * A comma-separated field (Age Divisions) is a set: `=` means "contains any".
 * Anything unparseable shows the item — a broken rule must never hide a line.
 */

export interface ShowWhenClause {
  field: string;
  op: '=' | '!=';
  /** lower-cased, trimmed */
  values: string[];
}
export type ParsedShowWhen = { ok: true; clauses: ShowWhenClause[] } | { ok: false; error: string };

const norm = (s: string) => s.trim().toLowerCase();

export function parseShowWhen(rule: string): ParsedShowWhen {
  const text = (rule ?? '').trim();
  if (!text) return { ok: true, clauses: [] };
  const clauses: ShowWhenClause[] = [];
  for (const part of text.split(';')) {
    const m = part.match(/^\s*([^=!]+?)\s*(!=|=)\s*(.+?)\s*$/);
    if (!m) return { ok: false, error: `Can't read "${part.trim()}" — expected "Field = Value" or "Field != Value"` };
    const field = m[1].trim();
    const values = m[3].split(',').map(norm).filter(Boolean);
    if (!field || values.length === 0) return { ok: false, error: `Can't read "${part.trim()}" — field or value is blank` };
    clauses.push({ field, op: m[2] as '=' | '!=', values });
  }
  return { ok: true, clauses };
}

/** The contact's value for a header / key / raw column, or undefined when no such field exists. */
export function contactFieldValue(contact: Contact, field: string): string | undefined {
  const key = keyForHeader(field);
  if (key) return sheetValue(contact, key);
  const camel = CONTACT_COLUMNS.find((c) => c.key.toLowerCase() === field.trim().toLowerCase());
  if (camel) return sheetValue(contact, camel.key);
  const want = normaliseHeader(field);
  for (const [h, v] of Object.entries(contact.raw ?? {})) {
    if (normaliseHeader(h) === want) return v;
  }
  return undefined;
}

export function showWhenMatches(rule: string, contact: Contact): boolean {
  const parsed = parseShowWhen(rule);
  if (!parsed.ok) return true;
  return parsed.clauses.every((cl) => {
    const raw = contactFieldValue(contact, cl.field);
    const have = new Set((raw ?? '').split(',').map(norm).filter(Boolean));
    const hit = cl.values.some((v) => have.has(v));
    return cl.op === '=' ? hit : !hit;
  });
}

export function applicableItems(script: ScriptItem[], contact: Contact): ScriptItem[] {
  return script.filter((item) => showWhenMatches(item.showWhen, contact));
}

const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? '';

/** [Name] [Full Name] [Org] [City] [Rep] [Supplier], then any raw column; unknown stays as typed. */
export function fillPlaceholders(text: string, contact: Contact, callerName: string): string {
  return (text ?? '').replace(/\[([^\]]+)\]/g, (whole, inner: string) => {
    switch (norm(inner)) {
      case 'name': return firstWord(contact.contactName) || 'there';
      case 'full name': return contact.contactName.trim() || 'there';
      case 'org': return contact.orgName;
      case 'city': return contact.city;
      case 'rep': return firstWord(callerName);
      case 'supplier': return contact.currentSupplier.trim() || 'your current supplier';
      default: {
        const v = contactFieldValue(contact, inner);
        return v === undefined ? whole : v;
      }
    }
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass. If `'[name] [ORG]'` fails, `norm(inner)` is lower-casing — check the `switch` keys are all lower-case.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales/script.ts tests/sales/script.test.ts
git commit -m "Sales: Show When rules and script placeholders

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Business rules — `sales-logic.ts`

**Files:**
- Create: `src/lib/data/sales-logic.ts`
- Test: `tests/sales/sales-logic.test.ts`

**Interfaces:**
- Consumes: types (Task 1), `PRIORITY_RANK`, `CALL_OUTCOMES`, `BUSINESS_TIMEZONE` (constants), `addDays`, `isCalendarDate`, `timestampDay` (dates), `phoneDigits`, `isNorthAmerican` (Task 2).
- Produces (all pure):
  - `blankContact(listId, sortOrder, now): Contact`, `blankCallList(id, name, sourceFileName, createdBy, now): CallList`, `blankCallLogInput(startedAt): CallLogInput`
  - `healCallList(l)`, `healContact(c)`, `healCallLog(g)`
  - `type CallLogInput = Omit<CallLog, 'id' | 'listId' | 'contactId' | 'createdAt' | 'updatedAt'>`
  - `isClosed(c): boolean`, `contactBucket(c): ContactBucket`
  - `nextCallDateFor(input, contact, today): CalendarDate | null`
  - `applyCallLog(contact, log, today, opts: { replacing: boolean }): Partial<Contact>`
  - `applySkip(contact, now): Partial<Contact>`
  - `buildQueue(contacts, today): string[]`
  - `referralContactFrom(source, log, now): Contact`
  - `defaultNotNowMonth(contact, today): string` (`YYYY-MM`)
  - `validateCallLog(input, contact, opts: { replacing: boolean }): { blocking: Record<string,string>; warnings: Record<string,string> }`
  - `sessionTally(logs, callerName, today): { calls; reached; voicemails; callbacks; infoSent }`
  - `MONTH_INDEX: Record<string, number>` (Jan → 1 …)

- [ ] **Step 1: Write the tests**

Create `tests/sales/sales-logic.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallLog, Contact } from '@/lib/types';
import {
  blankContact, blankCallLogInput, applyCallLog, applySkip, buildQueue, contactBucket, isClosed,
  nextCallDateFor, referralContactFrom, defaultNotNowMonth, validateCallLog, sessionTally, healContact,
} from '@/lib/data/sales-logic';

const NOW = '2026-09-06T20:00:00.000Z';
const TODAY = '2026-09-06';

function c(over: Partial<Contact> = {}): Contact {
  return { ...blankContact('l1', 1, NOW), id: over.id ?? 'c1', orgName: 'Org', phone: '7055550142', ...over };
}
function log(over: Partial<CallLog> = {}): CallLog {
  return {
    ...blankCallLogInput(NOW), id: 'g1', listId: 'l1', contactId: 'c1', outcome: 'no_answer',
    endedAt: NOW, createdAt: NOW, updatedAt: NOW, ...over,
  };
}

test('nextCallDateFor per outcome', () => {
  const k = c();
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'no_answer' }, k, TODAY), '2026-09-08');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'voicemail' }, k, TODAY), '2026-09-10');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'bad_number' }, k, TODAY), null);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'bad_number', newPhone: '705 555 9999' }, k, TODAY), TODAY);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'referred' }, k, TODAY), null);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'callback', followUp: { date: '2026-09-09', time: '', note: '' } }, k, TODAY), '2026-09-09');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'not_now', followUp: { date: '2027-06-01', time: '', note: '' } }, k, TODAY), '2027-06-01');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'not_interested' }, k, TODAY), null);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'do_not_call' }, k, TODAY), null);
});

test('applyCallLog: counts, rating, email, bad number, dnc, replacing', () => {
  const k = c({ altPhone: '', phone: '111', email: 'old@x.ca' });
  const p1 = applyCallLog(k, log({ outcome: 'voicemail', leadRating: 4 }), TODAY, { replacing: false });
  assert.equal(p1.callCount, 1);
  assert.equal(p1.lastCalledAt, NOW);
  assert.equal(p1.lastOutcome, 'voicemail');
  assert.equal(p1.leadRating, 4);
  assert.equal(p1.nextCallDate, '2026-09-10');

  const p2 = applyCallLog(k, log({ outcome: 'send_info', email: 'new@x.ca' }), TODAY, { replacing: false });
  assert.equal(p2.email, 'new@x.ca');

  const p3 = applyCallLog(k, log({ outcome: 'bad_number', newPhone: '222' }), TODAY, { replacing: false });
  assert.equal(p3.phone, '222');
  assert.equal(p3.altPhone, '111');

  const p4 = applyCallLog(k, log({ outcome: 'do_not_call' }), TODAY, { replacing: false });
  assert.equal(p4.doNotCall, true);

  const p5 = applyCallLog({ ...k, callCount: 3, lastCalledAt: '2026-09-01T00:00:00.000Z' }, log({ outcome: 'callback', followUp: { date: '2026-09-10', time: '', note: '' } }), TODAY, { replacing: true });
  assert.equal(p5.callCount, undefined);
  assert.equal(p5.lastCalledAt, undefined);
  assert.equal(p5.lastOutcome, 'callback');
  assert.equal(p5.leadRating, undefined);
});

test('applySkip', () => {
  const p = applySkip(c({ skipCount: 2 }), NOW);
  assert.equal(p.skipCount, 3);
  assert.equal(p.lastSkippedAt, NOW);
});

test('isClosed and contactBucket', () => {
  assert.ok(!isClosed(c()));
  assert.ok(isClosed(c({ callCount: 1, lastOutcome: 'not_interested' })));
  assert.ok(isClosed(c({ callCount: 1, lastOutcome: 'bad_number', nextCallDate: null })));
  assert.ok(!isClosed(c({ callCount: 1, lastOutcome: 'bad_number', nextCallDate: TODAY })));
  assert.equal(contactBucket(c({ doNotCall: true })), 'do_not_call');
  assert.equal(contactBucket(c()), 'uncalled');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'voicemail' })), 'retry');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'bad_number', nextCallDate: TODAY })), 'retry');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'bad_number' })), 'done');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'callback' })), 'follow_up');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'referred' })), 'done');
});

test('buildQueue order: due → uncalled (priority, sheet, createdAt) → retry; skipped-today last; excludes', () => {
  const contacts: Contact[] = [
    c({ id: 'dnc', doNotCall: true }),
    c({ id: 'uB', priority: 'B', sortOrder: 1 }),
    c({ id: 'uA2', priority: 'A', sortOrder: 5 }),
    c({ id: 'uA1', priority: 'A', sortOrder: 2 }),
    c({ id: 'uA1ref', priority: 'A', sortOrder: 2, createdAt: '2026-09-06T21:00:00.000Z', source: 'referral' }),
    c({ id: 'uSkipped', priority: 'A', sortOrder: 0, lastSkippedAt: NOW }),
    c({ id: 'due1', callCount: 1, lastOutcome: 'callback', nextCallDate: '2026-09-05' }),
    c({ id: 'due2', callCount: 1, lastOutcome: 'no_answer', nextCallDate: TODAY }),
    c({ id: 'future', callCount: 1, lastOutcome: 'callback', nextCallDate: '2026-09-20' }),
    c({ id: 'retryOld', callCount: 1, lastOutcome: 'voicemail', nextCallDate: '2026-09-09', lastCalledAt: '2026-09-04T00:00:00.000Z' }),
    c({ id: 'retryNew', callCount: 1, lastOutcome: 'no_answer', nextCallDate: '2026-09-08', lastCalledAt: '2026-09-05T00:00:00.000Z' }),
    c({ id: 'closed', callCount: 1, lastOutcome: 'not_interested' }),
    c({ id: 'meeting', callCount: 1, lastOutcome: 'meeting_booked', nextCallDate: '2026-09-01' }),
  ];
  assert.deepEqual(buildQueue(contacts, TODAY), [
    'due1', 'due2',
    'uA1', 'uA1ref', 'uA2', 'uB', 'uSkipped',
    'retryOld', 'retryNew',
  ]);
});

test('referralContactFrom copies org fields, names the referral, sorts after source', () => {
  const src = c({ id: 'src', orgType: 'Adult Team', city: 'Kelowna', province: 'BC', priority: 'B', contactName: 'Pat' });
  const r = referralContactFrom(src, log({ outcome: 'referred', referral: { name: 'Sam Lee', role: 'Treasurer', phone: '250 555 0100', email: 's@x.ca' } }), '2026-09-06T21:00:00.000Z');
  assert.equal(r.source, 'referral');
  assert.equal(r.referredFromContactId, 'src');
  assert.equal(r.sortOrder, src.sortOrder);
  assert.equal(r.contactName, 'Sam Lee');
  assert.equal(r.role, 'Treasurer');
  assert.equal(r.phone, '250 555 0100');
  assert.equal(r.orgName, 'Org');
  assert.equal(r.city, 'Kelowna');
  assert.equal(r.priority, 'B');
  assert.equal(r.leadSource, 'Referral');
  assert.match(r.notes, /Referred by Pat/);
  assert.equal(r.callCount, 0);
});

test('defaultNotNowMonth: ordering month this year if ahead, else next year; unknown → next month', () => {
  assert.equal(defaultNotNowMonth(c({ orderingMonth: 'Nov' }), '2026-09-06'), '2026-11');
  assert.equal(defaultNotNowMonth(c({ orderingMonth: 'Sep' }), '2026-09-06'), '2027-09');
  assert.equal(defaultNotNowMonth(c({ orderingMonth: 'Jun' }), '2026-09-06'), '2027-06');
  assert.equal(defaultNotNowMonth(c({ orderingMonth: '' }), '2026-12-06'), '2027-01');
});

test('validateCallLog blocking and warnings', () => {
  const k = c();
  const base = blankCallLogInput(NOW);
  assert.deepEqual(validateCallLog({ ...base, outcome: 'no_answer' }, k, { replacing: false }).blocking, {});
  assert.ok(validateCallLog({ ...base, outcome: 'nonsense' as never }, k, { replacing: false }).blocking.outcome);
  assert.ok(validateCallLog({ ...base, outcome: 'no_answer', leadRating: 7 as never }, k, { replacing: false }).blocking.leadRating);
  assert.ok(validateCallLog({ ...base, outcome: 'callback' }, k, { replacing: false }).blocking['followUp.date']);
  assert.ok(validateCallLog({ ...base, outcome: 'callback', followUp: { date: '9/9/2026', time: '', note: '' } }, k, { replacing: false }).blocking['followUp.date']);
  assert.ok(validateCallLog({ ...base, outcome: 'callback', followUp: { date: '2026-09-09', time: '7pm', note: '' } }, k, { replacing: false }).blocking['followUp.time']);
  assert.ok(validateCallLog({ ...base, outcome: 'referred' }, k, { replacing: false }).blocking.referral);
  assert.deepEqual(validateCallLog({ ...base, outcome: 'referred', referral: { name: 'X', role: '', phone: '', email: '' } }, k, { replacing: false }).blocking, {});
  assert.ok(validateCallLog({ ...base, outcome: 'send_info', followUp: { date: '2026-09-13', time: '', note: '' } }, k, { replacing: false }).blocking.email);
  assert.ok(validateCallLog({ ...base, outcome: 'not_now' }, k, { replacing: false }).blocking['followUp.date']);
  assert.ok(validateCallLog({ ...base, outcome: 'no_answer', durationSeconds: -1 }, k, { replacing: false }).blocking.durationSeconds);
  assert.ok(validateCallLog({ ...base, outcome: 'no_answer' }, c({ doNotCall: true }), { replacing: false }).blocking.outcome);
  assert.deepEqual(validateCallLog({ ...base, outcome: 'do_not_call' }, c({ doNotCall: true }), { replacing: false }).blocking, {});
  assert.ok(validateCallLog({ ...base, outcome: 'callback', followUp: { date: '2026-09-09', time: '', note: '' } }, c({ callCount: 1, lastOutcome: 'do_not_call', doNotCall: true }), { replacing: true }).blocking.outcome);

  const w = validateCallLog({ ...base, outcome: 'interested', followUp: { date: '2026-09-13', time: '', note: '' }, email: 'not-an-email' }, k, { replacing: false });
  assert.deepEqual(w.blocking, {});
  assert.ok(w.warnings.email);
  const w2 = validateCallLog({ ...base, outcome: 'interested', followUp: { date: '2026-09-13', time: '', note: '' } }, k, { replacing: false });
  assert.ok(w2.warnings.email);
  const w3 = validateCallLog({ ...base, outcome: 'bad_number', newPhone: '123' }, k, { replacing: false });
  assert.ok(w3.warnings.newPhone);
});

test('sessionTally counts today by caller', () => {
  const logs: CallLog[] = [
    log({ id: '1', outcome: 'voicemail', callerName: 'Keenan', endedAt: '2026-09-06T15:00:00.000Z' }),
    log({ id: '2', outcome: 'callback', callerName: 'Keenan', endedAt: '2026-09-06T16:00:00.000Z' }),
    log({ id: '3', outcome: 'send_info', callerName: 'Keenan', endedAt: '2026-09-06T17:00:00.000Z' }),
    log({ id: '4', outcome: 'interested', callerName: 'Someone Else', endedAt: '2026-09-06T17:00:00.000Z' }),
    log({ id: '5', outcome: 'interested', callerName: 'Keenan', endedAt: '2026-09-05T17:00:00.000Z' }),
  ];
  assert.deepEqual(sessionTally(logs, 'Keenan', '2026-09-06'), { calls: 3, reached: 2, voicemails: 1, callbacks: 1, infoSent: 1 });
});

test('healContact backfills a row written before a field existed', () => {
  const partial = { id: 'x', listId: 'l', orgName: 'O' } as unknown as Contact;
  const h = healContact(partial);
  assert.equal(h.callCount, 0);
  assert.equal(h.skipCount, 0);
  assert.equal(h.priority, '');
  assert.deepEqual(h.raw, {});
  assert.equal(h.doNotCall, false);
  assert.equal(h.source, 'sheet');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --import tsx --test tests/sales/sales-logic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/data/sales-logic.ts`**

```ts
/**
 * Sales rules — pure functions, no I/O. Both stores and the sales actions call
 * these so the two backends can't disagree. Kept out of ./logic.ts only
 * because that file is already 700 lines of order rules; the contract is the
 * same: nothing here reads or writes anything.
 *
 * Design: docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md §5–§6, §8.
 */
import type {
  CalendarDate,
} from '@/lib/dates';
import { addDays, isCalendarDate, timestampDay } from '@/lib/dates';
import type {
  CallList, CallLog, CallOutcome, Contact, ContactBucket, ImportReport, ScriptItem,
} from '@/lib/types';
import { CALL_OUTCOMES } from '@/lib/types';
import { BUSINESS_TIMEZONE, PRIORITY_RANK } from '@/lib/constants';
import { isNorthAmerican } from '@/lib/sales/phone';

export type CallLogInput = Omit<CallLog, 'id' | 'listId' | 'contactId' | 'createdAt' | 'updatedAt'>;

export const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/* ------------------------------------------------------------------ *
 * Factories and healing
 * ------------------------------------------------------------------ */

export function blankContact(listId: string, sortOrder: number, now: string): Contact {
  return {
    id: '', listId, sortOrder, source: 'sheet', referredFromContactId: null,
    orgName: '', orgType: '', contactName: '', role: '', phone: '', altPhone: '', email: '',
    city: '', province: '', timezoneOverride: '', league: '', ageDivisions: '', teams: null,
    players: null, seasonStartMonth: '', orderingMonth: '', currentSupplier: '', lastOrderedYear: '',
    colours: '', website: '', social: '', leadSource: '', priority: '', bestTimeToCall: '',
    doNotCall: false, notes: '', raw: {},
    lastOutcome: null, lastCalledAt: null, callCount: 0, skipCount: 0, lastSkippedAt: null,
    nextCallDate: null, leadRating: null,
    createdAt: now, updatedAt: now,
  };
}

export function blankCallList(id: string, name: string, sourceFileName: string, createdBy: string, now: string): CallList {
  return {
    id, name, sourceFileName, script: [],
    importReport: { imported: 0, skipped: [], warnings: [] },
    createdBy, createdAt: now, updatedAt: now, deletedAt: null,
  };
}

export function blankCallLogInput(startedAt: string): CallLogInput {
  return {
    outcome: 'no_answer', leadRating: null, notes: '', answers: {}, checklist: [],
    startedAt, endedAt: startedAt, durationSeconds: 0, callerName: '',
    followUp: { date: null, time: '', note: '' }, email: '', reason: '',
    referral: { name: '', role: '', phone: '', email: '' }, newPhone: '',
  };
}

/** ADD A LINE HERE whenever a new non-optional field goes on Contact. */
export function healContact(c: Contact): Contact {
  const b = blankContact(c.listId ?? '', c.sortOrder ?? 0, c.createdAt ?? new Date().toISOString());
  for (const k of Object.keys(b) as Array<keyof Contact>) {
    if (c[k] === undefined) (c as unknown as Record<string, unknown>)[k] = b[k];
  }
  return c;
}

export function healCallList(l: CallList): CallList {
  l.script ??= [];
  l.script.forEach((s: ScriptItem) => { s.options ??= []; s.response ??= ''; s.showWhen ??= ''; });
  l.importReport ??= { imported: 0, skipped: [], warnings: [] } as ImportReport;
  l.createdBy ??= '';
  l.deletedAt ??= null;
  return l;
}

export function healCallLog(g: CallLog): CallLog {
  const b = blankCallLogInput(g.startedAt ?? g.createdAt ?? new Date().toISOString());
  for (const k of Object.keys(b) as Array<keyof CallLogInput>) {
    if (g[k] === undefined) (g as unknown as Record<string, unknown>)[k] = b[k];
  }
  return g;
}

/* ------------------------------------------------------------------ *
 * State transitions
 * ------------------------------------------------------------------ */

const CLOSED_OUTCOMES: ReadonlySet<CallOutcome> = new Set(['not_interested', 'do_not_call', 'referred', 'meeting_booked']);

/** Out of the queue for good (§5). bad_number only closes when no new number was given. */
export function isClosed(c: Contact): boolean {
  if (!c.lastOutcome) return false;
  if (c.lastOutcome === 'bad_number') return c.nextCallDate === null;
  return CLOSED_OUTCOMES.has(c.lastOutcome);
}

export function contactBucket(c: Contact): ContactBucket {
  if (c.doNotCall) return 'do_not_call';
  if (c.callCount === 0) return 'uncalled';
  switch (c.lastOutcome) {
    case 'no_answer': case 'voicemail': return 'retry';
    case 'bad_number': return c.nextCallDate ? 'retry' : 'done';
    case 'callback': case 'send_info': case 'interested': case 'meeting_booked': case 'not_now': return 'follow_up';
    default: return 'done';
  }
}

export function nextCallDateFor(input: CallLogInput, _contact: Contact, today: CalendarDate): CalendarDate | null {
  switch (input.outcome) {
    case 'no_answer': return addDays(today, 2);
    case 'voicemail': return addDays(today, 4);
    case 'bad_number': return input.newPhone.trim() ? today : null;
    case 'callback': case 'send_info': case 'interested': case 'meeting_booked': case 'not_now':
      return input.followUp.date;
    default: return null;
  }
}

/**
 * The only thing that writes a contact's call state. `replacing` = the log is
 * an edit of the contact's most recent call, so it is not a second call.
 */
export function applyCallLog(contact: Contact, log: CallLog, today: CalendarDate, opts: { replacing: boolean }): Partial<Contact> {
  const patch: Partial<Contact> = {
    lastOutcome: log.outcome,
    nextCallDate: nextCallDateFor(log, contact, today),
    updatedAt: log.endedAt,
  };
  if (!opts.replacing) {
    patch.callCount = contact.callCount + 1;
    patch.lastCalledAt = log.endedAt;
  }
  if (log.leadRating) patch.leadRating = log.leadRating;
  if ((log.outcome === 'send_info' || log.outcome === 'interested') && log.email.trim()) patch.email = log.email.trim();
  if (log.outcome === 'bad_number' && log.newPhone.trim()) {
    patch.phone = log.newPhone.trim();
    patch.altPhone = [contact.altPhone, contact.phone].map((s) => s.trim()).filter(Boolean).join(', ');
  }
  if (log.outcome === 'do_not_call') patch.doNotCall = true;
  return patch;
}

export function applySkip(contact: Contact, now: string): Partial<Contact> {
  return { skipCount: contact.skipCount + 1, lastSkippedAt: now, updatedAt: now };
}

/* ------------------------------------------------------------------ *
 * Queue (§5)
 * ------------------------------------------------------------------ */

const skippedToday = (c: Contact, today: CalendarDate) =>
  !!c.lastSkippedAt && timestampDay(c.lastSkippedAt, BUSINESS_TIMEZONE) === today;

export function buildQueue(contacts: Contact[], today: CalendarDate): string[] {
  const live = contacts.filter((c) => !c.doNotCall);
  const due = live
    .filter((c) => c.callCount > 0 && !!c.nextCallDate && c.nextCallDate <= today && !isClosed(c))
    .sort((a, b) => a.nextCallDate!.localeCompare(b.nextCallDate!) || a.sortOrder - b.sortOrder);
  const uncalled = live
    .filter((c) => c.callCount === 0)
    .sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const retry = live
    .filter((c) => c.callCount > 0 && contactBucket(c) === 'retry' && !!c.nextCallDate && c.nextCallDate > today)
    .sort((a, b) => (a.lastCalledAt ?? '').localeCompare(b.lastCalledAt ?? ''));
  const withSkipsLast = (bucket: Contact[]) => [
    ...bucket.filter((c) => !skippedToday(c, today)),
    ...bucket.filter((c) => skippedToday(c, today)),
  ];
  return [...withSkipsLast(due), ...withSkipsLast(uncalled), ...withSkipsLast(retry)].map((c) => c.id);
}

/* ------------------------------------------------------------------ *
 * Referral (§6)
 * ------------------------------------------------------------------ */

export function referralContactFrom(source: Contact, log: CallLog, now: string): Contact {
  const r = log.referral;
  return {
    ...blankContact(source.listId, source.sortOrder, now),
    source: 'referral',
    referredFromContactId: source.id,
    orgName: source.orgName, orgType: source.orgType, city: source.city, province: source.province,
    timezoneOverride: source.timezoneOverride, league: source.league, ageDivisions: source.ageDivisions,
    teams: source.teams, players: source.players, seasonStartMonth: source.seasonStartMonth,
    orderingMonth: source.orderingMonth, currentSupplier: source.currentSupplier,
    lastOrderedYear: source.lastOrderedYear, colours: source.colours, website: source.website,
    social: source.social, leadSource: 'Referral', priority: source.priority,
    bestTimeToCall: source.bestTimeToCall,
    contactName: r.name.trim(), role: r.role.trim(), phone: r.phone.trim(), email: r.email.trim(),
    notes: `Referred by ${source.contactName.trim() || source.orgName.trim() || 'a previous contact'}`,
  };
}

/* ------------------------------------------------------------------ *
 * Defaults and validation (§6, §8)
 * ------------------------------------------------------------------ */

/** `YYYY-MM`: the ordering month, this year if still ahead, else next year; unknown month → next month. */
export function defaultNotNowMonth(contact: Contact, today: CalendarDate): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const wanted = MONTH_INDEX[contact.orderingMonth.trim().slice(0, 3).toLowerCase()];
  if (!wanted) {
    const nm = m === 12 ? 1 : m + 1;
    return `${m === 12 ? y + 1 : y}-${String(nm).padStart(2, '0')}`;
  }
  const year = wanted > m ? y : y + 1;
  return `${year}-${String(wanted).padStart(2, '0')}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NEEDS_DATE: ReadonlySet<CallOutcome> = new Set(['callback', 'send_info', 'interested', 'meeting_booked', 'not_now']);

export function validateCallLog(
  input: CallLogInput,
  contact: Contact,
  opts: { replacing: boolean },
): { blocking: Record<string, string>; warnings: Record<string, string> } {
  const blocking: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!(CALL_OUTCOMES as readonly string[]).includes(input.outcome)) blocking.outcome = 'Pick an outcome';
  if (input.leadRating !== null && !(Number.isInteger(input.leadRating) && input.leadRating >= 1 && input.leadRating <= 5)) {
    blocking.leadRating = 'Rating must be 1–5';
  }
  if (input.followUp.date !== null && !isCalendarDate(input.followUp.date)) blocking['followUp.date'] = 'Date must be YYYY-MM-DD';
  if (input.followUp.time !== '' && !TIME_RE.test(input.followUp.time)) blocking['followUp.time'] = 'Time must be HH:MM';
  if (NEEDS_DATE.has(input.outcome) && !input.followUp.date) {
    blocking['followUp.date'] = input.outcome === 'not_now' ? 'Pick the month to call back' : 'Pick a date';
  }
  if (input.outcome === 'referred' && !input.referral.name.trim() && !input.referral.phone.trim()) {
    blocking.referral = 'Give the referral a name or a phone number';
  }
  if (input.outcome === 'send_info' && !input.email.trim()) blocking.email = 'Where should the catalogue go?';
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 0) blocking.durationSeconds = 'Bad duration';
  if (contact.doNotCall && input.outcome !== 'do_not_call') blocking.outcome = 'This contact is marked Do Not Call';
  if (opts.replacing && contact.lastOutcome === 'do_not_call' && input.outcome !== 'do_not_call') {
    blocking.outcome = 'Do Not Call cannot be undone by editing the call';
  }

  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) warnings.email = "That doesn't look like an email";
  if (input.outcome === 'interested' && !input.email.trim()) warnings.email = 'No email captured — follow-up will be harder';
  if (input.referral.phone.trim() && !isNorthAmerican(input.referral.phone)) warnings['referral.phone'] = 'Not a 10-digit number';
  if (input.newPhone.trim() && !isNorthAmerican(input.newPhone)) warnings.newPhone = 'Not a 10-digit number';

  return { blocking, warnings };
}

/* ------------------------------------------------------------------ *
 * Session tally (§7 footer)
 * ------------------------------------------------------------------ */

export function sessionTally(logs: CallLog[], callerName: string, today: CalendarDate) {
  const mine = logs.filter((g) => g.callerName === callerName && timestampDay(g.endedAt, BUSINESS_TIMEZONE) === today);
  const talked = new Set<CallOutcome>(['callback', 'send_info', 'interested', 'meeting_booked', 'not_now', 'not_interested', 'do_not_call']);
  return {
    calls: mine.length,
    reached: mine.filter((g) => talked.has(g.outcome)).length,
    voicemails: mine.filter((g) => g.outcome === 'voicemail').length,
    callbacks: mine.filter((g) => g.outcome === 'callback').length,
    infoSent: mine.filter((g) => g.outcome === 'send_info').length,
  };
}
```
`BUSINESS_TIMEZONE` exists in `constants.ts` (`'America/Edmonton'`); `timestampDay(iso, timeZone)` exists in `dates.ts`. If `CalendarDate` is not exported as a type from `dates.ts` under that name, import it from wherever `types.ts` gets it.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass. The `buildQueue` expectation is the contract — if it fails, fix the sort, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/sales-logic.ts tests/sales/sales-logic.test.ts
git commit -m "Sales: call-state rules, queue, validation (pure)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The blank template, the shipped script, and the test fixtures

**Files:**
- Create: `src/lib/sales/default-script.json`, `scripts/build-call-template.mjs`
- Generate (committed): `public/templates/powerplay-call-list-template.xlsx`, `tests/sales/fixtures/sample-list.xlsx`, `tests/sales/fixtures/sample-list.csv`
- Modify: `package.json` (script `build:template`)

**Interfaces:**
- Consumes: `CONTACT_COLUMNS` (Task 2), `picklists.json` (Task 1).
- Produces: `default-script.json` — array of `{ section, kind, text, response, options, showWhen }` in Appendix A order; the two `.xlsx` files; `npm run build:template`.
- The sample fixture's exact rows (Task 6's tests depend on them): header row is sheet line 1; data lines 2–7:

| line | Org Name | Org Type | Contact Name | Role | Phone | Alt Phone | Email | City | Province | Timezone Override | League / Level | Age Divisions | Teams (#) | Players (approx) | Season Start (month) | Ordering Window (month) | Current Supplier | Last Ordered (year) | Colours | Website | Social | Lead Source | Priority | Best Time to Call | Do Not Call | Notes | Rink |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | Ennismore Eagles | Minor Hockey Association | Jamie Ouellette | Equipment Manager | (705) 555-0142 | | jamie@example.ca | Ennismore | ON | | OMHA | U9, U11, U13 | 14 | 210 | Sep | Jun | XYZ Sports | 2023 | navy/gold | https://ennismoreeagles.ca | | Web research | A | Weekday evening | N | Board meets Tuesdays | Ennismore CC |
| 3 | Kelowna Kodiaks | Adult Team | Pat Singh | Captain/Organiser | 250 555 0100 | 250 555 0101 | | Kelowna | BC | | KAHL Div 2 | Adult | 1 | 18 | Oct | Sep | | | red/black | | @kodiakshockey | Social | B | Weekend | | | Rutland Arena |
| 4 | | | Nobody Reachable | | | | | | | | | | | | | | | | | | | | | | | This row has no org and no phone | |
| 5 | Ennismore Eagles | Minor Hockey Association | Jamie Ouellette | Equipment Manager | 705-555-0142 | | | Ennismore | ON | | | | | | | | | | | | | | | | | duplicate of line 2 | |
| 6 | Prairie Storm | MHA | Chris Roy | President | 306 555 0199 | | chris@example.ca | Regina | sk | | | U7, U9 | 12 | 150 | Sep | Jul | | 2021 | | | | Referral | | Weekday daytime | Y | asked not to be called | |
| 7 | Lloydminster Lakers | Junior Team | Sam Lee | Head Coach | 555-0100 | | | Lloydminster | AB | Central | AJHL | U21 | 1 | 25 | Aug | Jun | Local Shop | 2024 | | | | Tournament | C | Weekday daytime | N | | |

- [ ] **Step 1: Create `src/lib/sales/default-script.json`** (Appendix A, verbatim)

```json
[
  { "section": "opening", "kind": "reminder", "text": "Say your name and \"Powerplay Customs\" clearly before anything else.", "response": "", "options": [], "showWhen": "" },
  { "section": "opening", "kind": "read", "text": "Hi [Name], it's [Rep] from Powerplay Customs — we make custom sublimated hockey jerseys, socks and pant shells for teams. I know I'm calling out of the blue; can I take thirty seconds to say why, and you tell me if it's worth a longer chat?", "response": "", "options": [], "showWhen": "" },
  { "section": "opening", "kind": "read", "text": "The reason I'm calling: most teams and associations we work with are sorting out jersey sets for next season around now, and I wanted to find out who handles that for [Org] and when you're next looking.", "response": "", "options": [], "showWhen": "" },
  { "section": "opening", "kind": "reminder", "text": "Mention the current promotion.", "response": "", "options": [], "showWhen": "" },
  { "section": "opening", "kind": "reminder", "text": "Ask when their AGM or budget meeting is.", "response": "", "options": [], "showWhen": "Org Type = Minor Hockey Association" },
  { "section": "opening", "kind": "reminder", "text": "Ask whether a sponsor covers the jerseys.", "response": "", "options": [], "showWhen": "Org Type = Adult Team, Adult League (organiser)" },
  { "section": "discovery", "kind": "question", "text": "Who looks after jerseys for [Org] — is that you, an equipment manager, or does the board decide?", "response": "", "options": ["This person", "Equipment manager", "Board vote", "Coach/manager per team", "Parent committee", "Other"], "showWhen": "" },
  { "section": "discovery", "kind": "question", "text": "When do you usually place your jersey order — and when's the next one?", "response": "", "options": ["This season", "Next season", "No plan yet", "Unknown"], "showWhen": "" },
  { "section": "discovery", "kind": "question", "text": "Who are you using today, and how's that going?", "response": "", "options": ["Happy", "Fine", "Unhappy", "No supplier"], "showWhen": "" },
  { "section": "discovery", "kind": "question", "text": "What's in a typical order — jerseys only, socks, pant shells? One set or home and away?", "response": "", "options": ["Jerseys only", "Jerseys + socks", "Jerseys + socks + pants", "Home & away sets", "Association-wide"], "showWhen": "" },
  { "section": "discovery", "kind": "question", "text": "Roughly how many teams and players are we talking?", "response": "", "options": [], "showWhen": "" },
  { "section": "discovery", "kind": "question", "text": "When you pick a supplier, what matters most?", "response": "", "options": ["Turnaround", "Durability", "Design help", "Low minimums", "Price", "Other"], "showWhen": "" },
  { "section": "objections", "kind": "objection", "text": "We already have a supplier.", "response": "Makes sense — most teams we work with did too. What do you like about them, and if you could change one thing, what would it be? Would a second quote on the next order be useful as a comparison?", "options": [], "showWhen": "" },
  { "section": "objections", "kind": "objection", "text": "There's no budget for that.", "response": "Understood. When does the next budget get set — the AGM, or the team meeting in the fall? I'll make sure you have something to table for it.", "options": [], "showWhen": "" },
  { "section": "objections", "kind": "objection", "text": "The board decides.", "response": "Who usually brings the proposal to the board, and when's the next meeting? I can send a one-pager they can table.", "options": [], "showWhen": "" },
  { "section": "objections", "kind": "objection", "text": "Call back after the season / after tryouts.", "response": "Happy to — what week works? One thing worth knowing: September is when everyone orders, so teams that lock a design in early skip the rush.", "options": [], "showWhen": "" },
  { "section": "objections", "kind": "objection", "text": "Just send me something.", "response": "Will do — what's the best email? I'll send the catalogue today. Is Thursday or Friday next week better for me to check back?", "options": [], "showWhen": "" },
  { "section": "close", "kind": "read", "text": "Great — I'll send the catalogue over today and check back next week. What's the best email to use?", "response": "", "options": [], "showWhen": "" },
  { "section": "close", "kind": "reminder", "text": "Read the email address back to them.", "response": "", "options": [], "showWhen": "" },
  { "section": "close", "kind": "reminder", "text": "Pick the outcome and rate the lead before moving on.", "response": "", "options": [], "showWhen": "" }
]
```

- [ ] **Step 2: Create `scripts/build-call-template.mjs`**

```js
/**
 * Builds the blank call-list template (and, with --sample <path>, a filled
 * sample used by the import tests). Run through tsx so it can read the TS
 * column map — the sheet and the importer must never disagree on headers:
 *
 *   npm run build:template
 *   node --import tsx scripts/build-call-template.mjs --sample tests/sales/fixtures/sample-list.xlsx --csv tests/sales/fixtures/sample-list.csv
 *
 * --csv writes the sample's Contacts tab as CSV too, so the two fixtures can't drift.
 */
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CONTACT_COLUMNS } from '../src/lib/sales/columns.ts';
import picklists from '../src/lib/sales/picklists.json' with { type: 'json' };
import defaultScript from '../src/lib/sales/default-script.json' with { type: 'json' };

const SCRIPT_HEADERS = ['Section', 'Kind', 'Text', 'Response', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Option 6', 'Show When'];
const MAX_ROWS = 2000;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const samplePath = flag('--sample');
const csvPath = flag('--csv');
const outPath = samplePath ?? 'public/templates/powerplay-call-list-template.xlsx';

const col = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(64 + ((n - 1) % 26) + 1) + s; return s; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const wb = new ExcelJS.Workbook();
wb.creator = 'Powerplay Customs';

/* ---- Lists ---- */
const lists = wb.addWorksheet('Lists');
const listKeys = Object.keys(picklists);
lists.columns = listKeys.map((k) => ({ header: k, key: k, width: 28 }));
lists.getRow(1).font = { bold: true };
listKeys.forEach((k, i) => picklists[k].forEach((v, r) => { lists.getCell(r + 2, i + 1).value = v; }));
const listRange = (k) => { const i = listKeys.indexOf(k); const L = col(i); return `Lists!$${L}$2:$${L}$${picklists[k].length + 1}`; };

/* ---- Contacts ---- */
const contacts = wb.addWorksheet('Contacts');
contacts.columns = CONTACT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === 'notes' ? 40 : 20 }));
contacts.getRow(1).font = { bold: true };
contacts.views = [{ state: 'frozen', ySplit: 1 }];
for (const [i, c] of CONTACT_COLUMNS.entries()) {
  if (c.key === 'phone' || c.key === 'altPhone' || c.key === 'lastOrderedYear') contacts.getColumn(i + 1).numFmt = '@';
  if (c.picklist) {
    contacts.dataValidations.add(`${col(i)}2:${col(i)}${MAX_ROWS}`, {
      type: 'list', allowBlank: true, showErrorMessage: !c.multi, errorStyle: 'warning',
      formulae: [listRange(c.picklist)],
    });
  }
}

/* ---- Script ---- */
const script = wb.addWorksheet('Script');
script.columns = SCRIPT_HEADERS.map((h) => ({ header: h, key: h, width: h === 'Text' || h === 'Response' ? 60 : 18 }));
script.getRow(1).font = { bold: true };
script.views = [{ state: 'frozen', ySplit: 1 }];
script.dataValidations.add(`A2:A${MAX_ROWS}`, { type: 'list', allowBlank: true, formulae: ['"Opening,Discovery,Objections,Close"'] });
script.dataValidations.add(`B2:B${MAX_ROWS}`, { type: 'list', allowBlank: true, formulae: ['"Read,Reminder,Question,Objection"'] });
for (const item of defaultScript) {
  script.addRow([cap(item.section), cap(item.kind), item.text, item.response, ...Array.from({ length: 6 }, (_, i) => item.options[i] ?? ''), item.showWhen]);
}
script.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
script.getColumn(4).alignment = { wrapText: true, vertical: 'top' };

/* ---- Read Me ---- */
const readme = wb.addWorksheet('Read Me');
readme.columns = [{ header: 'Powerplay Customs — Call List Template', key: 'a', width: 120 }];
readme.getRow(1).font = { bold: true, size: 14 };
[
  '',
  'CONTACTS TAB — one row per person you want to call. Only Org Name or Phone is required; a row with neither is skipped on upload (you are told which line).',
  'Columns with a dropdown pull their choices from the Lists tab. Type something else if you must — it is kept as typed and flagged as a warning, never thrown away.',
  'Age Divisions: pick one from the dropdown or type several separated by commas (U9, U11, U13).',
  'Phone: any format. The app dials it and shows it as (705) 555-0142 when it is a 10-digit number.',
  'Province sets the contact\'s local clock. Use Timezone Override only when the province default is wrong (e.g. Lloydminster on Central).',
  'Ordering Window (month) is used as the default month when you log "Not Now".',
  'Do Not Call = Y means the app never queues that contact and hides the number.',
  'Notes: your research. It shows on the call screen, read-only. Any extra column you add (say "Rink") also shows, under Other info.',
  '',
  'SCRIPT TAB — one row per line of the call, top to bottom within each Section (Opening, Discovery, Objections, Close).',
  'Kind = Read: text to say. Reminder: a tick box. Question: a multiple-choice prompt (fill Option 1–6; leave all blank for a free-text answer). Objection: what they say (Text) and what you say back (Response).',
  'Placeholders in Text/Response: [Name] first name (or "there"), [Full Name], [Org], [City], [Rep] (the caller), [Supplier], or any Contacts column in brackets, e.g. [Rink].',
  'Show When: leave blank to always show. Otherwise a rule like  Org Type = Minor Hockey Association  or  Role != Head Coach  — several values with commas (any of), several rules with semicolons (all of).',
  '',
  'UPLOADING — save this file and upload it on the Sales page. Each upload makes a new list; re-upload to change the script or add people. Results come back out with Export CSV.',
].forEach((line) => readme.addRow([line]));
readme.getColumn(1).alignment = { wrapText: true, vertical: 'top' };

/* ---- Sample rows for the test fixture ---- */
if (samplePath) {
  contacts.getCell(1, CONTACT_COLUMNS.length + 1).value = 'Rink';
  contacts.getCell(1, CONTACT_COLUMNS.length + 1).font = { bold: true };
  const row = (obj, rink = '') => contacts.addRow([...CONTACT_COLUMNS.map((c) => obj[c.key] ?? ''), rink]);
  row({ orgName: 'Ennismore Eagles', orgType: 'Minor Hockey Association', contactName: 'Jamie Ouellette', role: 'Equipment Manager', phone: '(705) 555-0142', email: 'jamie@example.ca', city: 'Ennismore', province: 'ON', league: 'OMHA', ageDivisions: 'U9, U11, U13', teams: 14, players: 210, seasonStartMonth: 'Sep', orderingMonth: 'Jun', currentSupplier: 'XYZ Sports', lastOrderedYear: '2023', colours: 'navy/gold', website: 'https://ennismoreeagles.ca', leadSource: 'Web research', priority: 'A', bestTimeToCall: 'Weekday evening', doNotCall: 'N', notes: 'Board meets Tuesdays' }, 'Ennismore CC');
  row({ orgName: 'Kelowna Kodiaks', orgType: 'Adult Team', contactName: 'Pat Singh', role: 'Captain/Organiser', phone: '250 555 0100', altPhone: '250 555 0101', city: 'Kelowna', province: 'BC', league: 'KAHL Div 2', ageDivisions: 'Adult', teams: 1, players: 18, seasonStartMonth: 'Oct', orderingMonth: 'Sep', colours: 'red/black', social: '@kodiakshockey', leadSource: 'Social', priority: 'B', bestTimeToCall: 'Weekend' }, 'Rutland Arena');
  row({ contactName: 'Nobody Reachable', notes: 'This row has no org and no phone' });
  row({ orgName: 'Ennismore Eagles', orgType: 'Minor Hockey Association', contactName: 'Jamie Ouellette', role: 'Equipment Manager', phone: '705-555-0142', city: 'Ennismore', province: 'ON', notes: 'duplicate of line 2' });
  row({ orgName: 'Prairie Storm', orgType: 'MHA', contactName: 'Chris Roy', role: 'President', phone: '306 555 0199', email: 'chris@example.ca', city: 'Regina', province: 'sk', ageDivisions: 'U7, U9', teams: 12, players: 150, seasonStartMonth: 'Sep', orderingMonth: 'Jul', lastOrderedYear: '2021', leadSource: 'Referral', bestTimeToCall: 'Weekday daytime', doNotCall: 'Y', notes: 'asked not to be called' });
  row({ orgName: 'Lloydminster Lakers', orgType: 'Junior Team', contactName: 'Sam Lee', role: 'Head Coach', phone: '555-0100', city: 'Lloydminster', province: 'AB', timezoneOverride: 'Central', league: 'AJHL', ageDivisions: 'U21', teams: 1, players: 25, seasonStartMonth: 'Aug', orderingMonth: 'Jun', currentSupplier: 'Local Shop', lastOrderedYear: '2024', leadSource: 'Tournament', priority: 'C', bestTimeToCall: 'Weekday daytime', doNotCall: 'N' });
}

mkdirSync(path.dirname(outPath), { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log(`wrote ${outPath}`);
if (samplePath && csvPath) {
  mkdirSync(path.dirname(csvPath), { recursive: true });
  await wb.csv.writeFile(csvPath, { sheetName: 'Contacts' });
  console.log(`wrote ${csvPath}`);
}
```
If Node rejects `with { type: 'json' }`, replace those two imports with `JSON.parse(readFileSync(new URL('../src/lib/sales/picklists.json', import.meta.url), 'utf8'))` (and the same for the script), importing `readFileSync` from `node:fs`.

- [ ] **Step 3: Add the npm script and build both files**

In `package.json` scripts add:
```json
    "build:template": "node --import tsx scripts/build-call-template.mjs"
```
Run:
```bash
npm run build:template && node --import tsx scripts/build-call-template.mjs --sample tests/sales/fixtures/sample-list.xlsx --csv tests/sales/fixtures/sample-list.csv
```
Expected: three `wrote …` lines. Open `tests/sales/fixtures/sample-list.csv` in an editor: 7 lines, the header ends with `Rink`, line 4 starts with `,,Nobody Reachable`.

- [ ] **Step 4: Open the template in Excel (or LibreOffice) and check by eye**

Contacts: bold frozen header, dropdowns on Org Type / Role / Province / Timezone Override / Age Divisions / months / Lead Source / Priority / Best Time to Call / Do Not Call, Phone column is text (typing `+1 705…` keeps the `+`). Script: 20 rows pre-filled, dropdowns on Section and Kind. Lists: 11 columns. Read Me: readable. If a dropdown is missing, the `formulae` range letter is wrong — print `listRange(k)` for each key and compare with the Lists tab.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales/default-script.json scripts/build-call-template.mjs package.json public/templates/powerplay-call-list-template.xlsx tests/sales/fixtures/sample-list.xlsx tests/sales/fixtures/sample-list.csv
git commit -m "Sales: blank call-list template, shipped script, import fixtures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Import — file bytes → list + contacts

**Files:**
- Create: `src/lib/sales/import.ts`
- Test: `tests/sales/import.test.ts`

**Interfaces:**
- Consumes: `read-excel-file/node` default export (`readExcelFile(buffer) → Promise<Array<{ sheet: string; data: unknown[][] }>>`), `parseCsv` (`src/lib/csv.ts`), `CONTACT_COLUMNS`/`keyForHeader` (Task 2), `blankContact`/`blankCallList` (Task 4), `parseShowWhen` (Task 3), `phoneDigits`/`isNorthAmerican` (Task 2), `newId` (`src/lib/order-utils.ts`), `SCRIPT_KINDS`/`SCRIPT_SECTIONS` (Task 1), `picklists.json`.
- Produces:
  - `type ImportResult = { ok: true; list: CallList; contacts: Contact[] } | { ok: false; error: string }`
  - `parseCallListFile(opts: { fileName: string; bytes: Uint8Array; listId: string; listName: string; createdBy: string; now: string }): Promise<ImportResult>`
  - `contactsFromRows(rows: string[][], listId: string, now: string, idFor?: () => string): { contacts: Contact[]; skipped: ImportReport['skipped']; warnings: ImportReport['warnings'] }`
  - `scriptFromRows(rows: string[][]): { items: ScriptItem[]; skipped: ImportReport['skipped']; warnings: ImportReport['warnings'] }`
  - `cellText(v: unknown): string`

- [ ] **Step 1: Write the tests**

Create `tests/sales/import.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCallListFile, contactsFromRows, scriptFromRows, cellText } from '@/lib/sales/import';

const NOW = '2026-09-06T20:00:00.000Z';
const opts = (fileName: string) => ({
  fileName, bytes: new Uint8Array(readFileSync(`tests/sales/fixtures/${fileName}`)),
  listId: 'list-1', listName: 'Sample', createdBy: 'Keenan Huber', now: NOW,
});

for (const fileName of ['sample-list.xlsx', 'sample-list.csv']) {
  test(`${fileName}: rows, skips, warnings, normalisation`, async () => {
    const r = await parseCallListFile(opts(fileName));
    assert.ok(r.ok, r.ok ? '' : r.error);
    if (!r.ok) return;
    const { list, contacts } = r;

    assert.equal(list.id, 'list-1');
    assert.equal(list.name, 'Sample');
    assert.equal(list.sourceFileName, fileName);
    assert.equal(contacts.length, 5);
    assert.equal(list.importReport.imported, 5);
    assert.deepEqual(list.importReport.skipped.map((s) => s.line), [4]);
    assert.match(list.importReport.skipped[0].reason, /no org and no phone/i);
    assert.match(list.importReport.skipped[0].raw, /Nobody Reachable/);

    const [eagles, kodiaks, dup, storm, lakers] = contacts;
    assert.equal(eagles.orgName, 'Ennismore Eagles');
    assert.equal(eagles.sortOrder, 1);
    assert.equal(eagles.listId, 'list-1');
    assert.ok(eagles.id.length > 10);
    assert.equal(eagles.teams, 14);
    assert.equal(eagles.players, 210);
    assert.equal(eagles.priority, 'A');
    assert.equal(eagles.doNotCall, false);
    assert.equal(eagles.raw['Rink'], 'Ennismore CC');
    assert.equal(eagles.raw['Org Name'], 'Ennismore Eagles');
    assert.equal(eagles.ageDivisions, 'U9, U11, U13');
    assert.equal(eagles.lastOrderedYear, '2023');
    assert.equal(kodiaks.altPhone, '250 555 0101');
    assert.equal(kodiaks.priority, 'B');
    assert.equal(dup.notes, 'duplicate of line 2');
    assert.equal(storm.province, 'SK');
    assert.equal(storm.orgType, 'MHA');
    assert.equal(storm.doNotCall, true);
    assert.equal(storm.priority, '');
    assert.equal(lakers.timezoneOverride, 'Central');
    assert.equal(lakers.teams, 1);

    const reasons = list.importReport.warnings.map((w) => `${w.line}:${w.reason}`).join('\n');
    assert.match(reasons, /^5:.*duplicate/im);
    assert.match(reasons, /^6:.*Org Type/im);
    assert.match(reasons, /^6:.*Do Not Call/im);
    assert.match(reasons, /^7:.*phone/im);
  });
}

test('xlsx carries the script; csv has none', async () => {
  const x = await parseCallListFile(opts('sample-list.xlsx'));
  const c = await parseCallListFile(opts('sample-list.csv'));
  assert.ok(x.ok && c.ok);
  if (!x.ok || !c.ok) return;
  assert.equal(x.list.script.length, 20);
  assert.equal(x.list.script[0].id, 's1');
  assert.equal(x.list.script[0].kind, 'reminder');
  assert.equal(x.list.script[6].kind, 'question');
  assert.equal(x.list.script[6].options.length, 6);
  assert.equal(x.list.script[4].showWhen, 'Org Type = Minor Hockey Association');
  assert.equal(x.list.script[12].response.length > 20, true);
  assert.equal(c.list.script.length, 0);
});

test('scriptFromRows: unknown kind/section or blank text is skipped and reported; bad Show When warns', () => {
  const r = scriptFromRows([
    ['Section', 'Kind', 'Text', 'Response', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Option 6', 'Show When'],
    ['Opening', 'Read', 'Hello', '', '', '', '', '', '', '', ''],
    ['Opening', 'Dance', 'Nope', '', '', '', '', '', '', '', ''],
    ['Opening', 'Read', '', '', '', '', '', '', '', '', ''],
    ['discovery', 'QUESTION', 'Q?', '', 'A', '', 'B', '', '', '', 'garbage rule'],
  ]);
  assert.deepEqual(r.items.map((i) => i.id), ['s1', 's2']);
  assert.deepEqual(r.items[1].options, ['A', 'B']);
  assert.equal(r.items[1].section, 'discovery');
  assert.deepEqual(r.skipped.map((s) => s.line), [3, 4]);
  assert.match(r.skipped[0].reason, /^Script:/);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].line, 5);
});

test('contactsFromRows: no recognisable header', () => {
  const r = contactsFromRows([['foo', 'bar'], ['1', '2']], 'l', NOW);
  assert.equal(r.contacts.length, 0);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /header/i);
});

test('cellText', () => {
  assert.equal(cellText(null), '');
  assert.equal(cellText(undefined), '');
  assert.equal(cellText(' x '), 'x');
  assert.equal(cellText(14), '14');
  assert.equal(cellText(true), 'TRUE');
  assert.equal(cellText(new Date(Date.UTC(2026, 8, 6))), '2026-09-06');
});

test('unsupported / empty files', async () => {
  const r1 = await parseCallListFile({ ...opts('sample-list.csv'), fileName: 'list.pdf' });
  assert.ok(!r1.ok);
  const r2 = await parseCallListFile({ ...opts('sample-list.csv'), bytes: new Uint8Array() });
  assert.ok(!r2.ok);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --import tsx --test tests/sales/import.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/sales/import.ts`**

```ts
/**
 * Spreadsheet → call list. Server-only (read-excel-file/node).
 *
 * Rules (spec §4): a row is skipped only with no org AND no phone; every other
 * problem is a warning and the row is stored as typed. Unknown columns land in
 * `raw`. The upload is one step; the report is persisted on the list.
 */
import readExcelFile from 'read-excel-file/node';
import type { CallList, Contact, ImportReport, ScriptItem, ScriptKind, ScriptSection } from '@/lib/types';
import { SCRIPT_KINDS, SCRIPT_SECTIONS } from '@/lib/types';
import { parseCsv } from '@/lib/csv';
import { newId } from '@/lib/order-utils';
import { blankCallList, blankContact } from '@/lib/data/sales-logic';
import { CONTACT_COLUMNS, keyForHeader, type ContactSheetKey } from './columns';
import { parseShowWhen } from './script';
import { isNorthAmerican, phoneDigits } from './phone';
import picklists from './picklists.json';

export type ImportResult = { ok: true; list: CallList; contacts: Contact[] } | { ok: false; error: string };

type Skipped = ImportReport['skipped'];
type Warnings = ImportReport['warnings'];

/** What a spreadsheet cell becomes. Dates are calendar dates, never instants. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

const norm = (s: string) => s.trim().toLowerCase();
const isBlankRow = (r: string[]) => r.every((c) => c === '');

function toNumber(s: string): number | null {
  if (s === '') return null;
  const n = Number(s.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const YES = new Set(['y', 'yes', 'true', '1', 'x']);

/* ------------------------------------------------------------------ *
 * Contacts tab
 * ------------------------------------------------------------------ */

export function contactsFromRows(
  rows: string[][],
  listId: string,
  now: string,
  idFor: () => string = newId,
): { contacts: Contact[]; skipped: Skipped; warnings: Warnings } {
  const skipped: Skipped = [];
  const warnings: Warnings = [];
  const contacts: Contact[] = [];

  const headerIdx = rows.findIndex((r) => !isBlankRow(r));
  const headers = headerIdx === -1 ? [] : rows[headerIdx].map((h) => h.trim());
  const keyAt = headers.map((h) => (h ? keyForHeader(h) : null));
  const known = keyAt.filter(Boolean);
  if (headerIdx === -1 || (!known.includes('orgName') && !known.includes('phone'))) {
    skipped.push({ line: headerIdx === -1 ? 1 : headerIdx + 1, reason: 'No recognisable header row — need at least "Org Name" or "Phone"', raw: headers.join(', ') });
    return { contacts, skipped, warnings };
  }

  const seen = new Map<string, number>();
  let sortOrder = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i].map((c) => c ?? '');
    if (isBlankRow(cells)) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { if (h) raw[h] = cells[j] ?? ''; });

    const get = (key: ContactSheetKey) => { const j = keyAt.indexOf(key); return j === -1 ? '' : (cells[j] ?? '').trim(); };

    if (!get('orgName') && !get('phone')) {
      skipped.push({ line, reason: 'Row has no org and no phone — nothing to call', raw: cells.filter(Boolean).join(' | ') });
      continue;
    }

    sortOrder += 1;
    const c = blankContact(listId, sortOrder, now);
    c.id = idFor();
    c.raw = raw;

    for (const col of CONTACT_COLUMNS) {
      const v = get(col.key);
      switch (col.kind) {
        case 'number': (c as unknown as Record<string, unknown>)[col.key] = toNumber(v); break;
        case 'yesNo': c.doNotCall = YES.has(norm(v)); break;
        case 'priority': {
          const p = v.toUpperCase();
          c.priority = p === 'A' || p === 'B' || p === 'C' ? p : '';
          if (v && !c.priority) warnings.push({ line, reason: `Priority "${v}" isn't A, B or C — left blank` });
          break;
        }
        case 'province': c.province = v.toUpperCase(); break;
        default: (c as unknown as Record<string, unknown>)[col.key] = v;
      }
      if (col.picklist && v) {
        const allowed = new Set((picklists[col.picklist] as string[]).map(norm));
        const values = col.multi ? v.split(',').map(norm).filter(Boolean) : [norm(v)];
        const bad = values.filter((x) => !allowed.has(x));
        if (bad.length && col.kind !== 'priority') {
          warnings.push({ line, reason: `${col.header} "${v}" isn't on the list — kept as typed` });
        }
      }
    }

    if (c.phone && !isNorthAmerican(c.phone)) warnings.push({ line, reason: `Phone "${c.phone}" isn't a 10-digit number — kept as typed` });
    if (c.altPhone && !isNorthAmerican(c.altPhone)) warnings.push({ line, reason: `Alt Phone "${c.altPhone}" isn't a 10-digit number — kept as typed` });
    if (c.doNotCall) warnings.push({ line, reason: 'Do Not Call is set — this contact will never be queued' });

    const dupKey = `${norm(c.orgName)}|${phoneDigits(c.phone)}`;
    if (phoneDigits(c.phone)) {
      const first = seen.get(dupKey);
      if (first) warnings.push({ line, reason: `Looks like a duplicate of line ${first} (same org and phone) — both kept` });
      else seen.set(dupKey, line);
    }

    contacts.push(c);
  }

  return { contacts, skipped, warnings };
}

/* ------------------------------------------------------------------ *
 * Script tab
 * ------------------------------------------------------------------ */

const SCRIPT_KEYS = ['section', 'kind', 'text', 'response', 'option 1', 'option 2', 'option 3', 'option 4', 'option 5', 'option 6', 'show when'] as const;

export function scriptFromRows(rows: string[][]): { items: ScriptItem[]; skipped: Skipped; warnings: Warnings } {
  const items: ScriptItem[] = [];
  const skipped: Skipped = [];
  const warnings: Warnings = [];
  const headerIdx = rows.findIndex((r) => !isBlankRow(r));
  if (headerIdx === -1) return { items, skipped, warnings };
  const header = rows[headerIdx].map(norm);
  const at = (key: (typeof SCRIPT_KEYS)[number], cells: string[]) => { const j = header.indexOf(key); return j === -1 ? '' : (cells[j] ?? '').trim(); };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i].map((c) => c ?? '');
    if (isBlankRow(cells)) continue;
    const section = norm(at('section', cells)) as ScriptSection;
    const kind = norm(at('kind', cells)) as ScriptKind;
    const text = at('text', cells);
    const raw = cells.filter(Boolean).join(' | ');
    if (!(SCRIPT_SECTIONS as readonly string[]).includes(section)) { skipped.push({ line, reason: `Script: Section "${at('section', cells)}" isn't Opening, Discovery, Objections or Close`, raw }); continue; }
    if (!(SCRIPT_KINDS as readonly string[]).includes(kind)) { skipped.push({ line, reason: `Script: Kind "${at('kind', cells)}" isn't Read, Reminder, Question or Objection`, raw }); continue; }
    if (!text) { skipped.push({ line, reason: 'Script: Text is blank', raw }); continue; }
    const showWhen = at('show when', cells);
    const parsed = parseShowWhen(showWhen);
    if (!parsed.ok) warnings.push({ line, reason: `Script: Show When "${showWhen}" — ${parsed.error}. The line will always show.` });
    const options = (['option 1', 'option 2', 'option 3', 'option 4', 'option 5', 'option 6'] as const).map((k) => at(k, cells)).filter(Boolean);
    items.push({ id: `s${items.length + 1}`, section, kind, text, response: at('response', cells), options, showWhen });
  }
  return { items, skipped, warnings };
}

/* ------------------------------------------------------------------ *
 * File → rows
 * ------------------------------------------------------------------ */

async function readSheets(fileName: string, bytes: Uint8Array): Promise<{ contacts: string[][]; script: string[][] | null } | { error: string }> {
  if (bytes.byteLength === 0) return { error: 'The file is empty' };
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    return { contacts: parseCsv(text), script: null };
  }
  if (ext !== 'xlsx') return { error: 'Upload an .xlsx or .csv file' };
  let sheets: Array<{ sheet: string; data: unknown[][] }>;
  try {
    sheets = await readExcelFile(Buffer.from(bytes));
  } catch {
    return { error: "Couldn't read that as an Excel file" };
  }
  if (!sheets.length) return { error: 'The workbook has no sheets' };
  const byName = (n: string) => sheets.find((s) => norm(s.sheet) === n);
  const contacts = byName('contacts') ?? sheets[0];
  const script = byName('script');
  const toText = (data: unknown[][]) => data.map((r) => r.map(cellText));
  return { contacts: toText(contacts.data), script: script ? toText(script.data) : null };
}

export async function parseCallListFile(opts: {
  fileName: string; bytes: Uint8Array; listId: string; listName: string; createdBy: string; now: string;
}): Promise<ImportResult> {
  const read = await readSheets(opts.fileName, opts.bytes);
  if ('error' in read) return { ok: false, error: read.error };

  const c = contactsFromRows(read.contacts, opts.listId, opts.now);
  const s = read.script ? scriptFromRows(read.script) : { items: [], skipped: [], warnings: [] };
  if (c.contacts.length === 0) {
    return { ok: false, error: c.skipped[0]?.reason ?? 'No contacts found in the sheet' };
  }

  const list = blankCallList(opts.listId, opts.listName.trim() || opts.fileName.replace(/\.[^.]+$/, ''), opts.fileName, opts.createdBy, opts.now);
  list.script = s.items;
  list.importReport = {
    imported: c.contacts.length,
    skipped: [...c.skipped, ...s.skipped],
    warnings: [...c.warnings, ...s.warnings].sort((a, b) => a.line - b.line),
  };
  return { ok: true, list, contacts: c.contacts };
}
```
If `readExcelFile(Buffer)` throws "unsupported input", wrap the buffer: `import { Readable } from 'node:stream'; await readExcelFile(Readable.from(Buffer.from(bytes)))`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass. If the xlsx `teams` assertion fails because the cell came back as a number `14` — `cellText` handles it (`'14'` → `toNumber` → `14`); if it fails because the sheet name lookup misses, print `sheets.map(s => s.sheet)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales/import.ts tests/sales/import.test.ts
git commit -m "Sales: xlsx/csv import with skip/warn report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Repository interface, JSON store, seed, index, migration script

**Files:**
- Modify: `src/lib/data/repository.ts` (add `CallListBundle` after `OrderBundle`; add a `/* Sales */` block at the end of the `Repository` interface, before its closing `}`)
- Modify: `src/lib/data/json-store.ts` (`Database` interface; `heal()`; methods appended inside `jsonStore` after `listUsers`)
- Modify: `src/lib/data/seed.ts` (the returned `Database` literal)
- Modify: `src/lib/data/index.ts` (re-export `CallListBundle`)
- Modify: `scripts/migrate-to-supabase.mjs` (push + verify)

**Interfaces:**
- Produces on `Repository`:
```ts
listCallLists(): Promise<CallList[]>;
getCallList(id: string): Promise<CallListBundle | null>;
getContact(id: string): Promise<Contact | null>;
latestCallLogFor(contactId: string): Promise<CallLog | null>;
createCallList(list: CallList, contacts: Contact[], actor: Actor): Promise<CallList>;
addCallLog(log: CallLog, contactPatch: Partial<Contact>, referral: Contact | null, actor: Actor): Promise<void>;
updateCallLog(log: CallLog, contactPatch: Partial<Contact>, actor: Actor): Promise<void>;
updateContact(id: string, patch: Partial<Contact>, actor: Actor): Promise<Contact>;
softDeleteCallList(id: string, actor: Actor): Promise<void>;
```
- `CallListBundle = { list: CallList; contacts: Contact[]; logs: CallLog[] }` — contacts sorted by `sortOrder` then `createdAt`; logs newest first (`startedAt` desc).

- [ ] **Step 1: Extend `src/lib/data/repository.ts`**

Add to the `import type { … } from '@/lib/types'` list: `CallList, CallLog, Contact`. After the `OrderBundle` interface add:
```ts
/** A call list with everything the sales pages need. Contacts in sheet order, logs newest first. */
export interface CallListBundle {
  list: CallList;
  contacts: Contact[];
  logs: CallLog[];
}
```
Inside `Repository`, after the `listUsers()` line and before the closing `}`:
```ts

  /* Sales — cold calling ------------------------------------------------ */
  listCallLists(): Promise<CallList[]>;
  getCallList(id: string): Promise<CallListBundle | null>;
  getContact(id: string): Promise<Contact | null>;
  latestCallLogFor(contactId: string): Promise<CallLog | null>;
  /** List row first, then contacts — a failure part-way leaves an empty list, visible and deletable. */
  createCallList(list: CallList, contacts: Contact[], actor: Actor): Promise<CallList>;
  /**
   * Log first, then the contact patch, then the referral (if any). The rules
   * that produce the patch and the referral are in ./sales-logic.ts; the store
   * only writes. A failure after the log leaves a contact that looks uncalled —
   * you might ring twice. The other order would lose the notes.
   */
  addCallLog(log: CallLog, contactPatch: Partial<Contact>, referral: Contact | null, actor: Actor): Promise<void>;
  updateCallLog(log: CallLog, contactPatch: Partial<Contact>, actor: Actor): Promise<void>;
  updateContact(id: string, patch: Partial<Contact>, actor: Actor): Promise<Contact>;
  softDeleteCallList(id: string, actor: Actor): Promise<void>;
```

- [ ] **Step 2: Re-export from `src/lib/data/index.ts`**

Change the last line to:
```ts
export type { Repository, Actor, OrderBundle, OrderListFilters, PublicOrderView, CallListBundle } from './repository';
```

- [ ] **Step 3: JSON store — tables, healing, methods**

In `src/lib/data/json-store.ts`:

(a) Extend the type import from `@/lib/types` with `CallList, CallLog, Contact`, and the `./repository` import with `CallListBundle`. Add:
```ts
import { healCallList, healCallLog, healContact } from './sales-logic';
```

(b) `Database` gains three arrays:
```ts
export interface Database {
  orders: Order[];
  roster: RosterEntry[];
  assets: OrderAsset[];
  submissions: ClientRosterSubmission[];
  history: ChangeLogEntry[];
  users: AppUser[];
  callLists: CallList[];
  callContacts: Contact[];
  callLogs: CallLog[];
}
```

(c) `heal()` — an existing `data/db.json` predates these keys:
```ts
function heal(db: Database): Database {
  db.orders.forEach(healOrder);
  db.submissions.forEach(healSubmission);
  db.roster.forEach(healRosterEntry);
  (db.callLists ??= []).forEach(healCallList);
  (db.callContacts ??= []).forEach(healContact);
  (db.callLogs ??= []).forEach(healCallLog);
  return db;
}
```

(d) Inside the `jsonStore` object literal, after the `listUsers` method (before the closing `};`):
```ts

  /* Sales ------------------------------------------------------------ */

  async listCallLists() {
    const db = await load();
    return db.callLists
      .filter((l) => !l.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getCallList(id) {
    const db = await load();
    const list = db.callLists.find((l) => l.id === id && !l.deletedAt);
    if (!list) return null;
    const contacts = db.callContacts
      .filter((c) => c.listId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const logs = db.callLogs
      .filter((g) => g.listId === id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return { list, contacts, logs };
  },

  async getContact(id) {
    const db = await load();
    return db.callContacts.find((c) => c.id === id) ?? null;
  },

  async latestCallLogFor(contactId) {
    const db = await load();
    return db.callLogs
      .filter((g) => g.contactId === contactId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  },

  async createCallList(list, contacts, _actor) {
    return withWrite((db) => {
      db.callLists.push(list);
      db.callContacts.push(...contacts);
      return list;
    });
  },

  async addCallLog(log, contactPatch, referral, _actor) {
    await withWrite((db) => {
      db.callLogs.push(log);
      const idx = db.callContacts.findIndex((c) => c.id === log.contactId);
      if (idx === -1) throw new Error(`Contact ${log.contactId} not found`);
      db.callContacts[idx] = { ...db.callContacts[idx], ...contactPatch };
      if (referral) db.callContacts.push(referral);
    });
  },

  async updateCallLog(log, contactPatch, _actor) {
    await withWrite((db) => {
      const gi = db.callLogs.findIndex((g) => g.id === log.id);
      if (gi === -1) throw new Error(`Call log ${log.id} not found`);
      db.callLogs[gi] = log;
      const ci = db.callContacts.findIndex((c) => c.id === log.contactId);
      if (ci === -1) throw new Error(`Contact ${log.contactId} not found`);
      db.callContacts[ci] = { ...db.callContacts[ci], ...contactPatch };
    });
  },

  async updateContact(id, patch, _actor) {
    return withWrite((db) => {
      const idx = db.callContacts.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error(`Contact ${id} not found`);
      db.callContacts[idx] = { ...db.callContacts[idx], ...patch, updatedAt: new Date().toISOString() };
      return db.callContacts[idx];
    });
  },

  async softDeleteCallList(id, _actor) {
    await withWrite((db) => {
      const l = db.callLists.find((x) => x.id === id);
      if (!l) throw new Error(`Call list ${id} not found`);
      l.deletedAt = new Date().toISOString();
      l.updatedAt = l.deletedAt;
    });
  },
```

- [ ] **Step 4: Seed — three empty arrays**

In `src/lib/data/seed.ts`, in the returned literal add after `users: [ … ],`:
```ts
    callLists: [],
    callContacts: [],
    callLogs: [],
```

- [ ] **Step 5: Migration script — push and verify**

In `scripts/migrate-to-supabase.mjs`, after the `await push('app_users', …)` line add:
```js
// Sales — lists first, then their contacts and logs (foreign keys).
const listIds = new Set((local.callLists ?? []).map((l) => l.id));
await push('call_lists', (local.callLists ?? []).map((l) => ({ id: l.id, data: l })), 'call lists');
await push(
  'call_contacts',
  (local.callContacts ?? []).filter((c) => listIds.has(c.listId)).map((c) => ({ id: c.id, list_id: c.listId, data: c })),
  'call contacts',
);
await push(
  'call_logs',
  (local.callLogs ?? []).filter((g) => listIds.has(g.listId)).map((g) => ({ id: g.id, list_id: g.listId, contact_id: g.contactId, data: g })),
  'call logs',
);
```
And in the verify loop's array add three entries after `['change_log', …]`:
```js
  ['call_lists', (local.callLists ?? []).length],
  ['call_contacts', (local.callContacts ?? []).filter((c) => listIds.has(c.listId)).length],
  ['call_logs', (local.callLogs ?? []).filter((g) => listIds.has(g.listId)).length],
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/lib/data/supabase-store.ts` ("Property 'listCallLists' is missing…") — that's Task 8. Anything else is a mistake here.

- [ ] **Step 7: Smoke the JSON store by hand**

Run (from the repo root; uses the dev `data/db.json`, so it adds one list you will delete on the landing page later):
```bash
node --import tsx -e "
import { repo } from './src/lib/data/index.ts';
import { parseCallListFile } from './src/lib/sales/import.ts';
import { readFileSync } from 'node:fs';
const r = await parseCallListFile({ fileName: 'sample-list.xlsx', bytes: new Uint8Array(readFileSync('tests/sales/fixtures/sample-list.xlsx')), listId: crypto.randomUUID(), listName: 'Smoke', createdBy: 'smoke', now: new Date().toISOString() });
if (!r.ok) throw new Error(r.error);
await repo.createCallList(r.list, r.contacts, { email: 'x', name: 'smoke' });
const b = await repo.getCallList(r.list.id);
console.log(b.contacts.length, 'contacts;', b.list.script.length, 'script items');
await repo.softDeleteCallList(r.list.id, { email: 'x', name: 'smoke' });
console.log('lists live:', (await repo.listCallLists()).length);
"
```
Expected: `5 contacts; 20 script items` then `lists live: 0` (or however many real lists exist). If it complains `Cannot use import statement`, save the snippet to `scratch-smoke.mts` and run `node --import tsx scratch-smoke.mts`, then delete the file.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/repository.ts src/lib/data/index.ts src/lib/data/json-store.ts src/lib/data/seed.ts scripts/migrate-to-supabase.mjs
git commit -m "Sales: repository methods and JSON store tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Supabase store and migration 0004

**Files:**
- Modify: `src/lib/data/supabase-store.ts`
- Create: `supabase/migrations/0004_sales.sql`

**Interfaces:**
- Consumes: the nine `Repository` methods (Task 7); `unwrap`, `rows`, `Row<T>`, `supabase()` already in the file.
- Produces: tables `call_lists`, `call_contacts`, `call_logs` with row shapes `{ id, data }`, `{ id, list_id, data }`, `{ id, list_id, contact_id, data }`.

- [ ] **Step 1: Write the migration `supabase/migrations/0004_sales.sql`**

```sql
-- Sales — cold calling. Three tables, same shape as the rest: the entity as
-- JSONB in `data`, generated columns only for what is queried.
--
-- QUERY SURFACE: list the live lists newest first; load one list's contacts
-- in sheet order and its logs newest first; find one contact; find a
-- contact's most recent log. Nothing filters on an individual sheet column,
-- so nothing else is generated.
--
-- Requires 0000_immutable_json_casts.sql (ts_utc / date_iso).

create table if not exists public.call_lists (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz generated always as (public.ts_utc(data->>'createdAt')) stored,
  deleted_at timestamptz generated always as (public.ts_utc(data->>'deletedAt')) stored
);

create index if not exists call_lists_live_idx
  on public.call_lists (created_at desc) where deleted_at is null;

create table if not exists public.call_contacts (
  id uuid primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  data jsonb not null,
  sort_order int generated always as ((data->>'sortOrder')::int) stored,
  created_at timestamptz generated always as (public.ts_utc(data->>'createdAt')) stored,
  last_outcome text generated always as (data->>'lastOutcome') stored,
  next_call_date date generated always as (public.date_iso(data->>'nextCallDate')) stored,
  do_not_call boolean generated always as ((data->>'doNotCall')::boolean) stored
);

create index if not exists call_contacts_list_idx
  on public.call_contacts (list_id, sort_order, created_at);

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

-- RLS on, no policies: the publishable key reads nothing. The app uses the
-- service role server-side, same as every other table.
alter table public.call_lists enable row level security;
alter table public.call_contacts enable row level security;
alter table public.call_logs enable row level security;
```

- [ ] **Step 2: Supabase store — consts, helpers, methods**

In `src/lib/data/supabase-store.ts`:

(a) Extend the `@/lib/types` type import with `CallList, CallLog, Contact`; the `./repository` import with `CallListBundle`; add
```ts
import { healCallList, healCallLog, healContact } from './sales-logic';
```

(b) After `const USERS = 'app_users';`:
```ts
const CALL_LISTS = 'call_lists';
const CALL_CONTACTS = 'call_contacts';
const CALL_LOGS = 'call_logs';
```

(c) After `appendHistory`, add the write helpers:
```ts
async function putCallList(l: CallList): Promise<void> {
  const res = await supabase().from(CALL_LISTS).upsert({ id: l.id, data: l });
  if (res.error) throw new Error(`save call list: ${res.error.message}`);
}

async function putContacts(cs: Contact[]): Promise<void> {
  if (cs.length === 0) return;
  const res = await supabase()
    .from(CALL_CONTACTS)
    .upsert(cs.map((c) => ({ id: c.id, list_id: c.listId, data: c })));
  if (res.error) throw new Error(`save contacts: ${res.error.message}`);
}

async function putCallLog(g: CallLog): Promise<void> {
  const res = await supabase()
    .from(CALL_LOGS)
    .upsert({ id: g.id, list_id: g.listId, contact_id: g.contactId, data: g });
  if (res.error) throw new Error(`save call log: ${res.error.message}`);
}

async function contactById(id: string): Promise<Contact | null> {
  const res = await supabase().from(CALL_CONTACTS).select('id, data').eq('id', id).maybeSingle();
  if (res.error) throw new Error(`find contact: ${res.error.message}`);
  return res.data ? healContact((res.data as Row<Contact>).data) : null;
}
```

(d) Inside the `supabaseStore` object literal, after `listUsers`:
```ts

  /* Sales ------------------------------------------------------------ */

  async listCallLists() {
    const res = await supabase()
      .from(CALL_LISTS)
      .select('id, data')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    return rows<CallList>(unwrap(res, 'list call lists')).map(healCallList);
  },

  async getCallList(id) {
    const found = await supabase().from(CALL_LISTS).select('id, data').eq('id', id).is('deleted_at', null).maybeSingle();
    if (found.error) throw new Error(`find call list: ${found.error.message}`);
    if (!found.data) return null;
    const list = healCallList((found.data as Row<CallList>).data);
    const [cs, gs] = await Promise.all([
      supabase().from(CALL_CONTACTS).select('id, data').eq('list_id', id).order('sort_order').order('created_at'),
      supabase().from(CALL_LOGS).select('id, data').eq('list_id', id).order('started_at', { ascending: false }),
    ]);
    return {
      list,
      contacts: rows<Contact>(unwrap(cs, 'load contacts')).map(healContact),
      logs: rows<CallLog>(unwrap(gs, 'load call logs')).map(healCallLog),
    };
  },

  async getContact(id) {
    return contactById(id);
  },

  async latestCallLogFor(contactId) {
    const res = await supabase()
      .from(CALL_LOGS)
      .select('id, data')
      .eq('contact_id', contactId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) throw new Error(`find call log: ${res.error.message}`);
    return res.data ? healCallLog((res.data as Row<CallLog>).data) : null;
  },

  /*
   * List row first, then contacts. A failure after the first step leaves an
   * empty list — visible on the Sales page and deletable. The other order
   * would leave orphan contacts nobody can see.
   */
  async createCallList(list, contacts, _actor) {
    await putCallList(list);
    await putContacts(contacts);
    return list;
  },

  /*
   * Log first, then the contact, then the referral. See repository.ts — a
   * failure after the log leaves a contact that looks uncalled (you might ring
   * twice); the other order loses the notes. The referral is also inside the
   * log's `referral` field, so a failure before it is visible in history.
   */
  async addCallLog(log, contactPatch, referral, _actor) {
    await putCallLog(log);
    const before = await contactById(log.contactId);
    if (!before) throw new Error(`Contact ${log.contactId} not found`);
    await putContacts([{ ...before, ...contactPatch }]);
    if (referral) await putContacts([referral]);
  },

  async updateCallLog(log, contactPatch, _actor) {
    await putCallLog(log);
    const before = await contactById(log.contactId);
    if (!before) throw new Error(`Contact ${log.contactId} not found`);
    await putContacts([{ ...before, ...contactPatch }]);
  },

  async updateContact(id, patch, _actor) {
    const before = await contactById(id);
    if (!before) throw new Error(`Contact ${id} not found`);
    const after: Contact = { ...before, ...patch, updatedAt: new Date().toISOString() };
    await putContacts([after]);
    return after;
  },

  async softDeleteCallList(id, _actor) {
    const found = await supabase().from(CALL_LISTS).select('id, data').eq('id', id).maybeSingle();
    if (found.error) throw new Error(`find call list: ${found.error.message}`);
    if (!found.data) throw new Error(`Call list ${id} not found`);
    const l = healCallList((found.data as Row<CallList>).data);
    l.deletedAt = new Date().toISOString();
    l.updatedAt = l.deletedAt;
    await putCallList(l);
  },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/supabase-store.ts supabase/migrations/0004_sales.sql
git commit -m "Sales: Supabase store and migration 0004

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Server actions

**Files:**
- Create: `src/app/sales/actions.ts`

**Interfaces:**
- Consumes: `repo` (`@/lib/data`), `requireRole`, `currentActor` (`@/lib/auth`), `newId` (`@/lib/order-utils`), `today` (`@/lib/dates`), `BUSINESS_TIMEZONE`, `parseCallListFile` (Task 6), `applyCallLog`, `applySkip`, `referralContactFrom`, `validateCallLog`, `CallLogInput` (Task 4).
- Produces:
```ts
export type UploadResult = { ok: true; listId: string } | { ok: false; error: string };
export async function uploadCallList(formData: FormData): Promise<UploadResult>;
export type LogCallResult =
  | { ok: true; log: CallLog; contact: Contact; referral: Contact | null; warnings: Record<string, string> }
  | { ok: false; error: string; errors?: Record<string, string> };
export async function logCall(listId: string, contactId: string, input: CallLogInput): Promise<LogCallResult>;
export async function updateCallLog(logId: string, contactId: string, input: CallLogInput): Promise<LogCallResult>;
export async function skipContact(listId: string, contactId: string): Promise<{ ok: true } | { ok: false; error: string }>;
export async function deleteCallList(listId: string): Promise<void>;
```

- [ ] **Step 1: Create `src/app/sales/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';
import { newId } from '@/lib/order-utils';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import type { CallLog, Contact } from '@/lib/types';
import { parseCallListFile } from '@/lib/sales/import';
import {
  applyCallLog, applySkip, referralContactFrom, validateCallLog, type CallLogInput,
} from '@/lib/data/sales-logic';

/*
 * Every mutation for /sales. Same shape as orders/actions.ts: requireRole,
 * actor, rules from sales-logic, repo, revalidate. Validation is two-tier —
 * blocking means nothing is saved; warnings are saved and returned.
 */

/** A spreadsheet is a few hundred KB. Far under Vercel's body cap; the artwork rule does not apply. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadResult = { ok: true; listId: string } | { ok: false; error: string };

export async function uploadCallList(formData: FormData): Promise<UploadResult> {
  await requireRole('staff');
  const actor = await currentActor();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose an .xlsx or .csv file' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'That file is over 5 MB — a call list should be far smaller' };
  const listName = String(formData.get('name') ?? '');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const listId = newId();
  const parsed = await parseCallListFile({
    fileName: file.name, bytes, listId, listName, createdBy: actor.name, now: new Date().toISOString(),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  await repo.createCallList(parsed.list, parsed.contacts, actor);
  revalidatePath('/sales');
  return { ok: true, listId };
}

export type LogCallResult =
  | { ok: true; log: CallLog; contact: Contact; referral: Contact | null; warnings: Record<string, string> }
  | { ok: false; error: string; errors?: Record<string, string> };

/** Blank date inputs arrive as '' and must be stored as null — a generated date column rejects ''. */
function normaliseInput(input: CallLogInput): CallLogInput {
  return {
    ...input,
    followUp: { ...input.followUp, date: input.followUp.date ? input.followUp.date : null },
    leadRating: input.leadRating ? input.leadRating : null,
    durationSeconds: Math.max(0, Math.round(Number(input.durationSeconds) || 0)),
  };
}

export async function logCall(listId: string, contactId: string, raw: CallLogInput): Promise<LogCallResult> {
  await requireRole('staff');
  const actor = await currentActor();

  const contact = await repo.getContact(contactId);
  if (!contact || contact.listId !== listId) return { ok: false, error: 'Contact not found on this list' };

  const input = normaliseInput(raw);
  const { blocking, warnings } = validateCallLog(input, contact, { replacing: false });
  if (Object.keys(blocking).length) return { ok: false, error: 'Some fields need fixing', errors: blocking };

  const now = new Date().toISOString();
  const log: CallLog = { ...input, id: newId(), listId, contactId, callerName: input.callerName.trim() || actor.name, createdAt: now, updatedAt: now };
  const patch = applyCallLog(contact, log, today(BUSINESS_TIMEZONE), { replacing: false });
  const referral = log.outcome === 'referred' ? { ...referralContactFrom(contact, log, now), id: newId() } : null;

  await repo.addCallLog(log, patch, referral, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${listId}`);
  return { ok: true, log, contact: { ...contact, ...patch }, referral, warnings };
}

/** Only a contact's most recent call can be edited (spec §6), and Do Not Call can't be undone this way. */
export async function updateCallLog(logId: string, contactId: string, raw: CallLogInput): Promise<LogCallResult> {
  await requireRole('staff');
  const actor = await currentActor();

  const contact = await repo.getContact(contactId);
  const existing = contact ? await repo.latestCallLogFor(contactId) : null;
  if (!existing || !contact) return { ok: false, error: 'Call not found' };
  if (existing.id !== logId) return { ok: false, error: 'Only the most recent call for a contact can be edited' };

  const input = normaliseInput(raw);
  const { blocking, warnings } = validateCallLog(input, contact, { replacing: true });
  if (Object.keys(blocking).length) return { ok: false, error: 'Some fields need fixing', errors: blocking };

  const log: CallLog = { ...existing, ...input, id: existing.id, listId: existing.listId, contactId: existing.contactId, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
  const patch = applyCallLog(contact, log, today(BUSINESS_TIMEZONE), { replacing: true });

  await repo.updateCallLog(log, patch, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${existing.listId}`);
  return { ok: true, log, contact: { ...contact, ...patch }, referral: null, warnings };
}

export async function skipContact(listId: string, contactId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  const contact = await repo.getContact(contactId);
  if (!contact || contact.listId !== listId) return { ok: false, error: 'Contact not found on this list' };
  await repo.updateContact(contactId, applySkip(contact, new Date().toISOString()), actor);
  revalidatePath(`/sales/${listId}`);
  return { ok: true };
}

export async function deleteCallList(listId: string): Promise<void> {
  await requireRole('admin');
  const actor = await currentActor();
  await repo.softDeleteCallList(listId, actor);
  revalidatePath('/sales');
}
```
- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: silent. If `today` complains about its argument, check its signature in `src/lib/dates.ts` (`today(timeZone = 'America/Edmonton')`) — pass nothing if it takes none.

- [ ] **Step 3: Commit**

```bash
git add src/app/sales/actions.ts
git commit -m "Sales: server actions — upload, log, edit, skip, delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `/sales` landing — nav link, caller name, upload, list cards

**Files:**
- Modify: `src/app/layout.tsx` (nav)
- Create: `src/components/sales/use-caller-name.ts`, `src/components/sales/caller-name-field.tsx`, `src/components/sales/upload-form.tsx`, `src/components/sales/delete-list-button.tsx`, `src/components/sales/list-card.tsx`, `src/app/sales/page.tsx`

**Interfaces:**
- Consumes: `uploadCallList`, `deleteCallList` (Task 9); `repo.listCallLists`, `repo.getCallList` (Task 7); `currentUser` (`@/lib/auth`); `Button`, `Card`, `EmptyState` (`@/components/ui`); `isClosed` (Task 4); `CALL_OUTCOME_META` (Task 1); `today`, `formatShort`, `timestampDay` (`@/lib/dates`); `BUSINESS_TIMEZONE`.
- Produces: `useCallerName(fallback): [string, (v: string) => void]` (localStorage key `ppc.callerName`) — Task 12 uses it.

- [ ] **Step 1: Nav link**

In `src/app/layout.tsx`, after the Production `<Link>` (before `<form action={lock}>`):
```tsx
                <Link
                  href="/sales"
                  className="rounded-lg px-3 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold"
                >
                  Sales
                </Link>
```

- [ ] **Step 2: Caller name hook and field**

Create `src/components/sales/use-caller-name.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';

const KEY = 'ppc.callerName';

/**
 * Who is on the phone. There is no per-person login yet, so the name is a
 * per-device preference stamped on every call log. Defaults to the access
 * code holder's name.
 */
export function useCallerName(fallback: string): [string, (v: string) => void] {
  const [name, setName] = useState(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v && v.trim()) setName(v);
    } catch { /* private mode etc. — keep the fallback */ }
  }, []);
  const set = (v: string) => {
    setName(v);
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  };
  return [name, set];
}
```

Create `src/components/sales/caller-name-field.tsx`:
```tsx
'use client';

import { useCallerName } from './use-caller-name';

export function CallerNameField({ fallback }: { fallback: string }) {
  const [name, setName] = useCallerName(fallback);
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="shrink-0 font-medium text-muted">Calling as</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="max-w-xs"
        aria-label="Caller name"
      />
    </label>
  );
}
```

- [ ] **Step 3: Upload form**

Create `src/components/sales/upload-form.tsx`:
```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadCallList } from '@/app/sales/actions';

/**
 * One step: pick the file, name the list, upload. The action parses and
 * creates the list; you land on it with the import report. No preview — a
 * bad upload is one delete away, and the report is persisted on the list.
 */
export function UploadForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState('');
  const form = useRef<HTMLFormElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setFileName(f?.name ?? '');
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set('name', name);
    start(async () => {
      const res = await uploadCallList(fd);
      if (res.ok) router.push(`/sales/${res.listId}`);
      else setError(res.error);
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">Spreadsheet (.xlsx or .csv)</span>
          <input type="file" name="file" accept=".xlsx,.csv" required onChange={onFile} className="mt-1 block w-full text-sm" />
          {fileName && <span className="mt-1 block truncate text-xs text-muted">{fileName}</span>}
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">List name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. OMHA associations — fall 2026" className="mt-1" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-muted">
        Start from the{' '}
        <a href="/templates/powerplay-call-list-template.xlsx" download className="font-semibold text-ppc-gold hover:underline">
          blank template
        </a>
        {' '}— contacts on one tab, the call script on another. Each upload makes a new list.
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Delete button (client, confirm) and list card (server)**

Create `src/components/sales/delete-list-button.tsx`:
```tsx
'use client';

import { useTransition } from 'react';
import { deleteCallList } from '@/app/sales/actions';

export function DeleteListButton({ listId, name }: { listId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete the list "${name}"? Calls already logged are kept but hidden with it.`)) return;
        start(() => deleteCallList(listId));
      }}
      className="rounded-lg border border-red-500/50 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
    >
      Delete
    </button>
  );
}
```

Create `src/components/sales/list-card.tsx`:
```tsx
import type { CallList, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { formatShort, timestampDay } from '@/lib/dates';
import { BUSINESS_TIMEZONE, CALL_OUTCOME_META } from '@/lib/constants';
import { isClosed } from '@/lib/data/sales-logic';
import { Button, Card } from '@/components/ui';
import { DeleteListButton } from './delete-list-button';

export function ListCard({ list, contacts, today }: { list: CallList; contacts: Contact[]; today: CalendarDate }) {
  const total = contacts.length;
  const called = contacts.filter((c) => c.callCount > 0).length;
  const reached = contacts.filter((c) => c.lastOutcome && CALL_OUTCOME_META[c.lastOutcome].group === 'talked').length;
  const voicemails = contacts.filter((c) => c.lastOutcome === 'voicemail').length;
  const dueToday = contacts.filter((c) => c.callCount > 0 && !c.doNotCall && !!c.nextCallDate && c.nextCallDate <= today && !isClosed(c)).length;
  const dnc = contacts.filter((c) => c.doNotCall).length;
  const pct = total ? Math.round((called / total) * 100) : 0;
  const problems = list.importReport.skipped.length + list.importReport.warnings.length;

  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-ppc-gold/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{list.name}</h3>
          <p className="text-xs text-muted">
            Uploaded {formatShort(timestampDay(list.createdAt, BUSINESS_TIMEZONE))} by {list.createdBy || '—'}
            {problems > 0 && <> · <span className="text-amber-300">{problems} import note{problems === 1 ? '' : 's'}</span></>}
          </p>
        </div>
        <DeleteListButton listId={list.id} name={list.name} />
      </div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">{called} of {total} called</span>
          <span className="tabular-nums text-muted">{pct}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-ppc-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Count label="Reached" n={reached} />
        <Count label="Voicemail" n={voicemails} />
        <Count label="Due today" n={dueToday} accent />
        <Count label="Do not call" n={dnc} />
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button href={`/sales/${list.id}/call`} variant="primary">Start calling</Button>
        <Button href={`/sales/${list.id}`}>Contacts</Button>
        <Button href={`/api/sales/${list.id}/export.csv`}>Export CSV</Button>
      </div>
    </Card>
  );
}

function Count({ label, n, accent = false }: { label: string; n: number; accent?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${accent && n > 0 ? 'text-ppc-gold' : ''}`}>{n}</dd>
    </div>
  );
}
```

- [ ] **Step 5: The page**

Create `src/app/sales/page.tsx`:
```tsx
import { repo } from '@/lib/data';
import { currentUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { Card, EmptyState } from '@/components/ui';
import { CallerNameField } from '@/components/sales/caller-name-field';
import { UploadForm } from '@/components/sales/upload-form';
import { ListCard } from '@/components/sales/list-card';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const user = await currentUser();
  const lists = await repo.listCallLists();
  const bundles = (await Promise.all(lists.map((l) => repo.getCallList(l.id)))).filter((b) => b !== null);
  const day = today(BUSINESS_TIMEZONE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-sm text-muted">Cold calling. Upload a list, start at the top, log every call.</p>
        </div>
        <CallerNameField fallback={user?.name ?? ''} />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">New call list</h2>
        <UploadForm />
      </Card>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2 border-b border-line pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">Your lists</h2>
          <span className="text-sm tabular-nums text-muted">{bundles.length}</span>
        </div>
        {bundles.length === 0 ? (
          <EmptyState title="No call lists yet" hint="Fill in the blank template and upload it above." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b) => <ListCard key={b.list.id} list={b.list} contacts={b.contacts} today={day} />)}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run the dev server and upload the sample**

Run: `npx tsc --noEmit` (silent), then start the app (`.claude/launch.json` has a `dev` config, or `npm run dev`) and open `http://localhost:3000/sales` after unlocking. Upload `tests/sales/fixtures/sample-list.xlsx` named "Sample". Expected: redirected to `/sales/<id>` (404 for now — Task 11 builds it; the URL is enough), and back on `/sales` a card "Sample" showing "0 of 5 called", "Do not call 1", "4 import notes". If the upload errors with a bundling message about `read-excel-file`, add to `next.config.ts`: `serverExternalPackages: ['read-excel-file']` and restart.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/app/sales/page.tsx src/components/sales/use-caller-name.ts src/components/sales/caller-name-field.tsx src/components/sales/upload-form.tsx src/components/sales/delete-list-button.tsx src/components/sales/list-card.tsx next.config.ts
git commit -m "Sales landing: upload, caller name, list cards, nav link

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `/sales/[id]` — contacts table, import report, badges, stars

**Files:**
- Create: `src/components/sales/outcome-badge.tsx`, `src/components/sales/star-rating.tsx`, `src/components/sales/import-report.tsx`, `src/app/sales/[id]/page.tsx`

**Interfaces:**
- Produces: `OutcomeBadge({ outcome, size? })` (server-safe), `StarRating({ value, onChange?, size? })` (server-safe when no `onChange`; interactive from client modules — the `captaincy.tsx` trick), `ImportReportPanel({ report })`.
- Consumes: `contactBucket`, `isClosed` (Task 4), `phoneDisplay` (Task 2), `CALL_OUTCOME_META`.

- [ ] **Step 1: Outcome badge**

Create `src/components/sales/outcome-badge.tsx`:
```tsx
import type { CallOutcome } from '@/lib/types';
import { CALL_OUTCOME_META } from '@/lib/constants';

/** No 'use client' — rendered from server pages and from the client call view alike. */
export function OutcomeBadge({ outcome, size = 'sm' }: { outcome: CallOutcome | null; size?: 'sm' | 'lg' }) {
  if (!outcome) return <span className="text-xs text-muted">Not called</span>;
  const m = CALL_OUTCOME_META[outcome];
  const pad = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${pad} ${m.className}`}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}
```

- [ ] **Step 2: Star rating**

Create `src/components/sales/star-rating.tsx`:
```tsx
import type { LeadRating } from '@/lib/types';

/**
 * 1–5 stars. Display-only when `onChange` is absent (server pages), a picker
 * otherwise (client modules only — no 'use client' here on purpose, so the
 * badge version doesn't drag React client code into the table page).
 */
export function StarRating({
  value, onChange, size = 'sm', label = 'Lead rating',
}: { value: LeadRating | null; onChange?: (v: LeadRating | null) => void; size?: 'sm' | 'lg'; label?: string }) {
  const stars = [1, 2, 3, 4, 5] as const;
  const cls = size === 'lg' ? 'text-2xl' : 'text-sm';
  if (!onChange) {
    if (!value) return <span className="text-xs text-muted">—</span>;
    return (
      <span className={`${cls} tabular-nums text-ppc-gold`} aria-label={`${label}: ${value} of 5`}>
        {'★'.repeat(value)}<span className="text-line">{'★'.repeat(5 - value)}</span>
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(value === n ? null : n)}
          className={`${cls} leading-none transition-colors ${value && n <= value ? 'text-ppc-gold' : 'text-line hover:text-ppc-gold/60'}`}
        >
          ★
        </button>
      ))}
      {value && <span className="ml-1 text-xs text-muted">{value}/5</span>}
    </div>
  );
}
```

- [ ] **Step 3: Import report panel**

Create `src/components/sales/import-report.tsx`:
```tsx
import type { ImportReport } from '@/lib/types';

export function ImportReportPanel({ report }: { report: ImportReport }) {
  const n = report.skipped.length + report.warnings.length;
  if (n === 0) return null;
  return (
    <details className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-200">
      <summary className="cursor-pointer font-semibold">
        {report.imported} imported · {report.skipped.length} skipped · {report.warnings.length} warning{report.warnings.length === 1 ? '' : 's'}
      </summary>
      <div className="mt-2 space-y-2 text-amber-100/90">
        {report.skipped.length > 0 && (
          <div>
            <p className="font-semibold">Skipped rows (fix the sheet and re-upload):</p>
            <ul className="ml-4 list-disc">
              {report.skipped.map((s, i) => <li key={i}>Line {s.line}: {s.reason}{s.raw ? <span className="text-amber-200/70"> — {s.raw}</span> : null}</li>)}
            </ul>
          </div>
        )}
        {report.warnings.length > 0 && (
          <div>
            <p className="font-semibold">Kept as typed, worth a look:</p>
            <ul className="ml-4 list-disc">
              {report.warnings.map((w, i) => <li key={i}>Line {w.line}: {w.reason}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
```

- [ ] **Step 4: The contacts page**

Create `src/app/sales/[id]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import type { Contact, ContactBucket } from '@/lib/types';
import { today, formatShort } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { contactBucket, isClosed } from '@/lib/data/sales-logic';
import { phoneDisplay } from '@/lib/sales/phone';
import { Button, Card, EmptyState } from '@/components/ui';
import { OutcomeBadge } from '@/components/sales/outcome-badge';
import { StarRating } from '@/components/sales/star-rating';
import { ImportReportPanel } from '@/components/sales/import-report';

export const dynamic = 'force-dynamic';

type Search = { q?: string; bucket?: string };

const BUCKETS: Array<{ key: ContactBucket | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'uncalled', label: 'Uncalled' },
  { key: 'retry', label: 'Retry' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'done', label: 'Done' },
  { key: 'do_not_call', label: 'Do not call' },
];

function matches(c: Contact, q: string): boolean {
  if (!q) return true;
  const hay = [c.orgName, c.contactName, c.phone, c.altPhone, c.city, c.email].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default async function ContactsPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const bundle = await repo.getCallList(id);
  if (!bundle) notFound();

  const day = today(BUSINESS_TIMEZONE);
  const q = (sp.q ?? '').trim();
  const bucket = (BUCKETS.some((b) => b.key === sp.bucket) ? sp.bucket : 'all') as ContactBucket | 'all';

  const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<ContactBucket | 'all', number>;
  for (const c of bundle.contacts) { counts.all += 1; counts[contactBucket(c)] += 1; }

  const due = bundle.contacts.filter((c) => c.callCount > 0 && !c.doNotCall && !!c.nextCallDate && c.nextCallDate <= day && !isClosed(c));
  const shown = bundle.contacts.filter((c) => (bucket === 'all' || contactBucket(c) === bucket) && matches(c, q));
  const link = (patch: Partial<Search>) => {
    const p = new URLSearchParams();
    const next = { q, bucket, ...patch };
    if (next.q) p.set('q', next.q);
    if (next.bucket && next.bucket !== 'all') p.set('bucket', next.bucket);
    const s = p.toString();
    return `/sales/${id}${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/sales" className="text-sm text-muted hover:text-ppc-gold">← Sales</Link>
          <h1 className="truncate text-2xl font-bold">{bundle.list.name}</h1>
          <p className="text-sm text-muted">{bundle.contacts.length} contacts · {bundle.list.script.length} script lines</p>
        </div>
        <div className="flex gap-2">
          <Button href={`/sales/${id}/call`} variant="primary">Start calling</Button>
          <Button href={`/api/sales/${id}/export.csv`}>Export CSV</Button>
        </div>
      </div>

      <ImportReportPanel report={bundle.list.importReport} />

      {due.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">Due today <span className="ml-1 text-muted">{due.length}</span></h2>
          <ul className="divide-y divide-line">
            {due.map((c) => (
              <li key={c.id}>
                <Link href={`/sales/${id}/call?c=${c.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-ppc-gold">
                  <span className="min-w-0 truncate"><span className="font-semibold">{c.contactName || '—'}</span> · {c.orgName}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted"><OutcomeBadge outcome={c.lastOutcome} /> {c.nextCallDate ? formatShort(c.nextCallDate) : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
        <form className="flex items-center gap-2 sm:flex-1" action={`/sales/${id}`}>
          <input name="q" defaultValue={q} placeholder="Search org, name, phone, city…" className="min-w-[12rem] flex-1" />
          {bucket !== 'all' && <input type="hidden" name="bucket" value={bucket} />}
          <Button type="submit">Search</Button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <Link
            key={b.key}
            href={link({ bucket: b.key })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucket === b.key ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold' : 'border-line text-muted hover:border-ppc-gold/50'}`}
          >
            {b.label} <span className="tabular-nums opacity-70">{counts[b.key]}</span>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No contacts match" hint={q ? 'Try a different search.' : 'Nothing in this group yet.'} />
      ) : (
        <>
          {/* Wide: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3">Org</th><th className="py-2 pr-3">Contact</th><th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Phone</th><th className="py-2 pr-3">City</th><th className="py-2 pr-3">Rating</th>
                  <th className="py-2 pr-3">Last outcome</th><th className="py-2 pr-3 text-right">Calls</th><th className="py-2">Next call</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 hover:bg-surface-2">
                    <td className="py-2 pr-3 font-semibold"><Link href={`/sales/${id}/call?c=${c.id}`} className="hover:text-ppc-gold">{c.orgName || '—'}</Link></td>
                    <td className="py-2 pr-3">{c.contactName || '—'}</td>
                    <td className="py-2 pr-3 text-muted">{c.role || '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{c.doNotCall ? <span className="text-red-300">hidden</span> : phoneDisplay(c.phone) || '—'}</td>
                    <td className="py-2 pr-3 text-muted">{[c.city, c.province].filter(Boolean).join(', ') || '—'}</td>
                    <td className="py-2 pr-3"><StarRating value={c.leadRating} /></td>
                    <td className="py-2 pr-3"><OutcomeBadge outcome={c.doNotCall ? 'do_not_call' : c.lastOutcome} /></td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.callCount}{c.skipCount ? <span className="text-muted"> · {c.skipCount} skip</span> : null}</td>
                    <td className="py-2 tabular-nums text-muted">{c.nextCallDate ? formatShort(c.nextCallDate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phone: cards, not a sideways table. */}
          <div className="space-y-3 md:hidden">
            {shown.map((c) => (
              <Link key={c.id} href={`/sales/${id}/call?c=${c.id}`} className="block">
                <Card className="p-3 hover:border-ppc-gold/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.orgName || '—'}</p>
                      <p className="truncate text-sm text-muted">{[c.contactName, c.role].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <OutcomeBadge outcome={c.doNotCall ? 'do_not_call' : c.lastOutcome} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span className="tabular-nums">{c.doNotCall ? 'number hidden' : phoneDisplay(c.phone)}</span>
                    <StarRating value={c.leadRating} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Check in the browser**

`npx tsc --noEmit` silent. Open the Sample list from `/sales`: import report shows "5 imported · 1 skipped · 4 warnings" with line 4 skipped; chips read All 5 · Uncalled 4 · Do not call 1; Prairie Storm's phone shows "hidden"; the search `kelowna` leaves one row; the phone layout (narrow window) shows cards.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales/outcome-badge.tsx src/components/sales/star-rating.tsx src/components/sales/import-report.tsx "src/app/sales/[id]/page.tsx"
git commit -m "Sales: contacts table with buckets, due-today, import report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Calling view — shell, contact panel, script panel, drafts, timers, navigation

**Files:**
- Create: `src/app/sales/[id]/call/page.tsx`, `src/components/sales/call-view/use-draft.ts`, `use-timers.ts`, `contact-panel.tsx`, `script-panel.tsx`, `history.tsx`, `index.tsx`

**Interfaces:**
- Consumes: `buildQueue`, `applicableItems`, `fillPlaceholders`, `localTimeFor`, `phoneDisplay`, `telHref`, `useCallerName`, `OutcomeBadge`, `StarRating`, `ChoiceGroup`/`TextArea`/`Toggle` from `@/components/order-form/fields`, `Warning`, `EmptyState`, `formatTimestamp` (`@/lib/dates`).
- Produces:
  - `CallDraft` and `blankDraft(startedAt)`, `useDraft(contactId)` → `{ draft, patch(p: Partial<CallDraft>), replace(d: CallDraft), clear() }`
  - `useSessionTimer(listId)` → `{ seconds, clear() }`, `useElapsedSince(iso | null)` → seconds, `formatClock(seconds)`, `useNow(ms)` → `Date`
  - `ContactPanel({ contact, logs, script, callerName })`, `ScriptPanel({ items, answers, checklist, onAnswer, onTick, disabled })`, `CallHistory({ logs, script })`
  - `CallView` props: `{ list: CallList; contacts: Contact[]; logs: CallLog[]; queue: string[]; startId: string | null; callerDefault: string; today: CalendarDate }`
  - Inside `index.tsx` this task leaves a placeholder-free but minimal right column: notes + a footer with Previous / Skip; Task 13 adds outcome, rating, save, keyboard. Every function referenced exists in this task.

- [ ] **Step 1: Draft hook**

Create `src/components/sales/call-view/use-draft.ts`:
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallOutcome, FollowUp, LeadRating, Referral } from '@/lib/types';

/** Everything typed during a call, before the outcome is saved. */
export interface CallDraft {
  startedAt: string;
  outcome: CallOutcome | null;
  leadRating: LeadRating | null;
  notes: string;
  answers: Record<string, string>;
  checklist: string[];
  followUp: FollowUp;
  email: string;
  reason: string;
  referral: Referral;
  newPhone: string;
}

export function blankDraft(startedAt: string): CallDraft {
  return {
    startedAt, outcome: null, leadRating: null, notes: '', answers: {}, checklist: [],
    followUp: { date: null, time: '', note: '' }, email: '', reason: '',
    referral: { name: '', role: '', phone: '', email: '' }, newPhone: '',
  };
}

const KEY = (id: string) => `ppc.callDraft.${id}`;
const SAVE_MS = 1000;

/**
 * Per-contact draft in localStorage, saved ~1 s after a change (the order
 * form's debounce). A closed tab loses nothing; reopening the contact restores
 * it. Cleared when the call is saved.
 */
export function useDraft(contactId: string | null) {
  const [draft, setDraft] = useState<CallDraft>(() => blankDraft(new Date().toISOString()));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!contactId) return;
    let restored: CallDraft | null = null;
    try {
      const raw = localStorage.getItem(KEY(contactId));
      if (raw) restored = JSON.parse(raw) as CallDraft;
    } catch { /* ignore */ }
    loadedFor.current = contactId;
    setDraft(restored ?? blankDraft(new Date().toISOString()));
  }, [contactId]);

  useEffect(() => {
    if (!contactId || loadedFor.current !== contactId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { localStorage.setItem(KEY(contactId), JSON.stringify(draft)); } catch { /* ignore */ }
    }, SAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draft, contactId]);

  const patch = useCallback((p: Partial<CallDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const replace = useCallback((d: CallDraft) => setDraft(d), []);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (contactId) { try { localStorage.removeItem(KEY(contactId)); } catch { /* ignore */ } }
  }, [contactId]);

  return { draft, patch, replace, clear };
}
```

- [ ] **Step 2: Timers**

Create `src/components/sales/call-view/use-timers.ts`:
```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const SESSION_KEY = (listId: string) => `ppc.callSession.${listId}`;

/** Ticks every `ms`. */
export function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Seconds since `iso`; 0 when null. */
export function useElapsedSince(iso: string | null): number {
  const now = useNow(1000);
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
}

/**
 * "Calling for h:mm:ss" — starts when the view mounts if no start is stored,
 * survives refresh (sessionStorage), cleared by the back link.
 */
export function useSessionTimer(listId: string): { seconds: number; clear: () => void } {
  const [startedAt, setStartedAt] = useState<string | null>(null);
  useEffect(() => {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY(listId));
      if (existing) { setStartedAt(existing); return; }
      const now = new Date().toISOString();
      sessionStorage.setItem(SESSION_KEY(listId), now);
      setStartedAt(now);
    } catch { setStartedAt(new Date().toISOString()); }
  }, [listId]);
  const seconds = useElapsedSince(startedAt);
  const clear = useCallback(() => { try { sessionStorage.removeItem(SESSION_KEY(listId)); } catch { /* ignore */ } }, [listId]);
  return { seconds, clear };
}

export function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 3: History**

Create `src/components/sales/call-view/history.tsx`:
```tsx
import type { CallLog, ScriptItem } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { OutcomeBadge } from '../outcome-badge';
import { StarRating } from '../star-rating';

export function CallHistory({ logs, script }: { logs: CallLog[]; script: ScriptItem[] }) {
  if (logs.length === 0) return <p className="text-sm text-muted">No calls yet.</p>;
  const label = (id: string) => script.find((s) => s.id === id)?.text ?? id;
  return (
    <ol className="space-y-3">
      {logs.map((g) => (
        <li key={g.id} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted">{formatTimestamp(g.endedAt, BUSINESS_TIMEZONE)} · {g.callerName || '—'} · {Math.round(g.durationSeconds / 60)} min</span>
            <span className="flex items-center gap-2"><StarRating value={g.leadRating} /><OutcomeBadge outcome={g.outcome} /></span>
          </div>
          {g.followUp.date && <p className="mt-1 text-xs text-muted">Follow up {g.followUp.date}{g.followUp.time ? ` ${g.followUp.time}` : ''}{g.followUp.note ? ` — ${g.followUp.note}` : ''}</p>}
          {g.email && <p className="mt-1 text-xs text-muted">Email: {g.email}</p>}
          {g.reason && <p className="mt-1 text-xs text-muted">Reason: {g.reason}</p>}
          {(g.referral.name || g.referral.phone) && <p className="mt-1 text-xs text-muted">Referred to {g.referral.name}{g.referral.role ? ` (${g.referral.role})` : ''} {g.referral.phone}</p>}
          {g.newPhone && <p className="mt-1 text-xs text-muted">New number: {g.newPhone}</p>}
          {g.notes && <p className="mt-2 whitespace-pre-wrap">{g.notes}</p>}
          {Object.keys(g.answers).length > 0 && (
            <dl className="mt-2 space-y-1 text-xs">
              {Object.entries(g.answers).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="inline text-muted">{label(k)} </dt><dd className="inline font-semibold">{v}</dd></div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Contact panel**

Create `src/components/sales/call-view/contact-panel.tsx`:
```tsx
'use client';

import type { CallLog, Contact, ScriptItem } from '@/lib/types';
import { keyForHeader } from '@/lib/sales/columns';
import { phoneDisplay, telHref } from '@/lib/sales/phone';
import { localTimeFor } from '@/lib/sales/timezones';
import { StarRating } from '../star-rating';
import { CallHistory } from './history';
import { useNow } from './use-timers';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === '' || children === null || children === undefined) return null;
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function ContactPanel({ contact: c, logs, script }: { contact: Contact; logs: CallLog[]; script: ScriptItem[] }) {
  const now = useNow(60_000);
  const local = localTimeFor(c, now);
  const tel = telHref(c.phone);
  const altTel = telHref(c.altPhone);
  const extra = Object.entries(c.raw ?? {}).filter(([h, v]) => v && !keyForHeader(h));
  const orgLine = [c.orgName, c.orgType].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold leading-tight">{c.contactName || <span className="text-muted">No contact name</span>}</h2>
        <p className="text-sm text-muted">{[c.role, orgLine].filter(Boolean).join(' — ')}</p>
        {c.source === 'referral' && <p className="mt-1 text-xs text-violet-300">Referral</p>}
      </div>

      <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
        {c.doNotCall ? (
          <p className="text-sm font-semibold text-red-300">Number hidden — Do Not Call</p>
        ) : (
          <>
            <p className="text-xl font-bold tabular-nums">
              {tel ? <a href={tel} className="hover:text-ppc-gold">{phoneDisplay(c.phone)}</a> : <span className="text-muted">No phone</span>}
              {c.altPhone && <span className="ml-3 text-sm font-normal text-muted">alt {altTel ? <a href={altTel} className="hover:text-ppc-gold">{phoneDisplay(c.altPhone)}</a> : c.altPhone}</span>}
            </p>
          </>
        )}
        <p className="text-sm">{c.email ? <a href={`mailto:${c.email}`} className="hover:text-ppc-gold">{c.email}</a> : <span className="text-muted">No email</span>}</p>
        <p className="text-sm text-muted">
          {[c.city, c.province].filter(Boolean).join(', ') || 'Location unknown'}
          {local && <> · <span className="font-semibold text-foreground">{local}</span> local</>}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {c.priority && <span>Priority <span className="font-semibold text-foreground">{c.priority}</span></span>}
          {c.bestTimeToCall && <span>Best: {c.bestTimeToCall}</span>}
          {c.leadSource && <span>Source: {c.leadSource}</span>}
          <span className="flex items-center gap-1">Rating <StarRating value={c.leadRating} /></span>
        </p>
      </div>

      <dl className="space-y-1.5">
        <Row label="League">{c.league}</Row>
        <Row label="Divisions">{c.ageDivisions}</Row>
        <Row label="Size">{[c.teams !== null ? `${c.teams} team${c.teams === 1 ? '' : 's'}` : '', c.players !== null ? `~${c.players} players` : ''].filter(Boolean).join(' · ')}</Row>
        <Row label="Season">{[c.seasonStartMonth ? `starts ${c.seasonStartMonth}` : '', c.orderingMonth ? `orders ${c.orderingMonth}` : ''].filter(Boolean).join(' · ')}</Row>
        <Row label="Supplier">{[c.currentSupplier, c.lastOrderedYear ? `last ${c.lastOrderedYear}` : ''].filter(Boolean).join(' · ')}</Row>
        <Row label="Colours">{c.colours}</Row>
        <Row label="Web">{c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="text-ppc-gold hover:underline">{c.website}</a> : ''}</Row>
        <Row label="Social">{c.social}</Row>
        <Row label="Sheet notes">{c.notes}</Row>
        {extra.map(([h, v]) => <Row key={h} label={h}>{v}</Row>)}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">History <span className="ml-1 text-muted">{logs.length}</span></h3>
        <CallHistory logs={logs} script={script} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Script panel**

Create `src/components/sales/call-view/script-panel.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { ScriptItem, ScriptSection } from '@/lib/types';
import { SCRIPT_SECTIONS } from '@/lib/types';
import { ChoiceGroup, Toggle } from '@/components/order-form/fields';

const SECTION_LABEL: Record<ScriptSection, string> = {
  opening: 'Opening', discovery: 'Discovery', objections: 'Objections', close: 'Close',
};

/**
 * The script for THIS contact: items already filtered by Show When and with
 * placeholders filled (index.tsx does that). Reminders tick, questions answer,
 * objections stay folded until needed.
 */
export function ScriptPanel({
  items, answers, checklist, onAnswer, onTick, disabled,
}: {
  items: ScriptItem[];
  answers: Record<string, string>;
  checklist: string[];
  onAnswer: (id: string, value: string) => void;
  onTick: (id: string, on: boolean) => void;
  disabled: boolean;
}) {
  const [objectionsOpen, setObjectionsOpen] = useState(false);
  if (items.length === 0) return <p className="text-sm text-muted">This list has no script. Add a Script tab to the sheet and re-upload.</p>;

  return (
    <div className="space-y-5">
      {SCRIPT_SECTIONS.map((section) => {
        const rows = items.filter((i) => i.section === section);
        if (rows.length === 0) return null;
        if (section === 'objections') {
          return (
            <div key={section}>
              <button
                type="button"
                onClick={() => setObjectionsOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-sm font-bold uppercase tracking-wide text-ppc-gold hover:border-ppc-gold/60"
                aria-expanded={objectionsOpen}
              >
                <span>Objections <span className="ml-1 text-muted">{rows.length}</span></span>
                <span aria-hidden>{objectionsOpen ? '▾' : '▸'}</span>
              </button>
              {objectionsOpen && (
                <dl className="mt-2 space-y-3">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-lg border border-line p-3 text-sm">
                      <dt className="font-semibold">“{r.text}”</dt>
                      <dd className="mt-1 text-muted">{r.response || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
        }
        return (
          <div key={section} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{SECTION_LABEL[section]}</h3>
            {rows.map((r) => {
              switch (r.kind) {
                case 'read':
                  return <p key={r.id} className="rounded-lg border-l-2 border-ppc-gold/60 bg-surface-2 px-3 py-2 text-[0.95rem] leading-relaxed">{r.text}</p>;
                case 'reminder':
                  return (
                    <div key={r.id} className={disabled ? 'pointer-events-none opacity-60' : ''}>
                      <Toggle label={r.text} checked={checklist.includes(r.id)} onChange={(on) => onTick(r.id, on)} />
                    </div>
                  );
                case 'question':
                  return r.options.length > 0 ? (
                    <div key={r.id} className={disabled ? 'pointer-events-none opacity-60' : ''}>
                      <ChoiceGroup
                        label={r.text}
                        choices={r.options.map((o) => ({ value: o, label: o }))}
                        value={answers[r.id] ?? null}
                        onChange={(v) => onAnswer(r.id, v ?? '')}
                        columns={3}
                        allowClear
                      />
                    </div>
                  ) : (
                    <label key={r.id} className="block text-sm">
                      <span className="font-medium">{r.text}</span>
                      <input className="mt-1" value={answers[r.id] ?? ''} disabled={disabled} placeholder="Answer" onChange={(e) => onAnswer(r.id, e.target.value)} />
                    </label>
                  );
                default:
                  return null;
              }
            })}
          </div>
        );
      })}
    </div>
  );
}
```
Check `ChoiceGroup`'s and `Toggle`'s actual prop names in `src/components/order-form/fields.tsx` (`ChoiceGroup<T>({ label, choices, value, onChange, columns?, allowClear? })`, `Toggle({ label, checked, onChange })`) and adjust if they differ.

- [ ] **Step 6: The server shell**

Create `src/app/sales/[id]/call/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { currentUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { buildQueue } from '@/lib/data/sales-logic';
import { CallView } from '@/components/sales/call-view';

export const dynamic = 'force-dynamic';

/**
 * Thin shell: load, order the queue, pick the starting contact, hand off.
 * `?c=` opens a specific contact — the only way a Do Not Call contact is ever
 * shown (disabled). Nothing is created here; a GET must stay side-effect free.
 */
export default async function CallPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const { id } = await params;
  const { c } = await searchParams;
  const bundle = await repo.getCallList(id);
  if (!bundle) notFound();
  const user = await currentUser();
  const day = today(BUSINESS_TIMEZONE);
  const queue = buildQueue(bundle.contacts, day);
  const startId = c && bundle.contacts.some((x) => x.id === c) ? c : (queue[0] ?? null);
  if (c && !bundle.contacts.some((x) => x.id === c)) notFound();

  return (
    <CallView
      list={bundle.list}
      contacts={bundle.contacts}
      logs={bundle.logs}
      queue={queue}
      startId={startId}
      callerDefault={user?.name ?? ''}
      today={day}
    />
  );
}
```

- [ ] **Step 7: The orchestrator (navigation, drafts, timers; outcome/save arrive in Task 13)**

Create `src/components/sales/call-view/index.tsx`:
```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CallList, CallLog, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { skipContact } from '@/app/sales/actions';
import { applicableItems, fillPlaceholders } from '@/lib/sales/script';
import { isClosed } from '@/lib/data/sales-logic';
import { TextArea } from '@/components/order-form/fields';
import { EmptyState, Warning } from '@/components/ui';
import { useCallerName } from '../use-caller-name';
import { ContactPanel } from './contact-panel';
import { ScriptPanel } from './script-panel';
import { useDraft } from './use-draft';
import { formatClock, useElapsedSince, useSessionTimer } from './use-timers';

export interface CallViewProps {
  list: CallList;
  contacts: Contact[];
  logs: CallLog[];
  queue: string[];
  startId: string | null;
  callerDefault: string;
  today: CalendarDate;
}

export function CallView(props: CallViewProps) {
  const { list, today } = props;
  const [callerName] = useCallerName(props.callerDefault);
  const [contacts, setContacts] = useState<Record<string, Contact>>(() => Object.fromEntries(props.contacts.map((c) => [c.id, c])));
  const [logs] = useState<CallLog[]>(props.logs);
  const [queue, setQueue] = useState<string[]>(props.queue);
  const [currentId, setCurrentId] = useState<string | null>(props.startId);
  const [history, setHistory] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const session = useSessionTimer(list.id);
  const { draft, patch } = useDraft(currentId);
  const elapsed = useElapsedSince(currentId ? draft.startedAt : null);

  const current = currentId ? contacts[currentId] : null;
  const contactLogs = useMemo(() => (current ? logs.filter((g) => g.contactId === current.id) : []), [logs, current]);
  const script = useMemo(
    () => (current ? applicableItems(list.script, current).map((i) => ({ ...i, text: fillPlaceholders(i.text, current, callerName), response: fillPlaceholders(i.response, current, callerName) })) : []),
    [list.script, current, callerName],
  );
  const position = current ? queue.indexOf(current.id) : -1;
  const waitingOnDate = useMemo(
    () => Object.values(contacts).filter((c) => !c.doNotCall && c.callCount > 0 && !!c.nextCallDate && c.nextCallDate > today && !isClosed(c)).length,
    [contacts, today],
  );

  const goTo = useCallback((id: string | null) => {
    setHistory((h) => (currentId ? [...h, currentId] : h));
    setCurrentId(id);
    setNotice(null);
  }, [currentId]);

  const nextAfter = useCallback((id: string | null, q: string[]) => q.find((x) => x !== id) ?? null, []);

  function skip() {
    if (!current) return;
    const id = current.id;
    const q = [...queue.filter((x) => x !== id), id];
    setQueue(q);
    setContacts((m) => ({ ...m, [id]: { ...m[id], skipCount: m[id].skipCount + 1, lastSkippedAt: new Date().toISOString() } }));
    skipContact(list.id, id).then((r) => { if (!r.ok) setNotice(r.error); });
    goTo(nextAfter(id, q));
  }

  function previous() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setCurrentId(prev);
    setNotice(null);
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/sales/${list.id}`} onClick={session.clear} className="text-muted hover:text-ppc-gold">← {list.name}</Link>
        <div className="flex items-center gap-4 tabular-nums text-muted">
          <span>{position >= 0 ? `${position + 1} of ${queue.length} in queue` : current ? 'Not in queue' : `${queue.length} in queue`}</span>
          <span>⏱ calling for <span className="font-semibold text-foreground">{formatClock(session.seconds)}</span></span>
          {current && <span><span className="font-semibold text-foreground">{formatClock(elapsed)}</span> here</span>}
        </div>
      </div>

      {notice && <Warning>{notice}</Warning>}

      {!current ? (
        <EmptyState
          title="Nothing left in the queue"
          hint={`${waitingOnDate} contact${waitingOnDate === 1 ? ' is' : 's are'} waiting on a future date. Open the contacts table to pick someone directly.`}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="rounded-xl border border-line bg-surface p-4">
            {current.doNotCall && <div className="mb-3"><Warning>Do Not Call — this contact asked not to be contacted. Outcomes are disabled.</Warning></div>}
            <ContactPanel contact={current} logs={contactLogs} script={list.script} />
          </section>
          <section className="space-y-6">
            <div className="rounded-xl border border-line bg-surface p-4">
              <ScriptPanel
                items={script}
                answers={draft.answers}
                checklist={draft.checklist}
                onAnswer={(id, v) => patch({ answers: { ...draft.answers, [id]: v } })}
                onTick={(id, on) => patch({ checklist: on ? [...new Set([...draft.checklist, id])] : draft.checklist.filter((x) => x !== id) })}
                disabled={current.doNotCall}
              />
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <TextArea label="Notes" value={draft.notes} onChange={(v) => patch({ notes: v })} rows={4} placeholder="What they said, what you promised…" />
              <p className="mt-1 text-xs text-muted">Drafts save automatically on this device.</p>
            </div>
          </section>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex gap-2">
            <button type="button" disabled={history.length === 0} onClick={previous} className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">← Previous</button>
            <button type="button" disabled={!current} onClick={skip} className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">Skip →</button>
          </div>
          <span className="text-xs text-muted">Outcome & save arrive in the next step</span>
        </div>
      </div>
    </div>
  );
}
```
(This interim footer is replaced wholesale by Task 13, which rewrites `index.tsx`.)

- [ ] **Step 8: Check in the browser**

`npx tsc --noEmit` silent. Open Start calling on the Sample list. Expected: Ennismore Eagles first (priority A). Left: name, `(705) 555-0142` as a `tel:` link, "Ennismore, ON · <time> local", League OMHA, Rink under the details, "No calls yet". Right: Opening shows the AGM reminder (MHA) and NOT the sponsor reminder; the first Read line says "Hi Jamie, it's Keenan from Powerplay…". Tick a reminder, type a note, reload — both restored. Skip → Kelowna Kodiaks (priority B) shows the sponsor reminder, not the AGM one. Previous → Eagles again. Both timers tick. Open `?c=<Prairie Storm id>` (from the table) → red Do Not Call banner, number hidden.

- [ ] **Step 9: Commit**

```bash
git add "src/app/sales/[id]/call/page.tsx" src/components/sales/call-view
git commit -m "Sales calling view: contact, script, drafts, timers, skip/previous

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Calling view — outcome panel, rating, save/edit, footer, keyboard

**Files:**
- Create: `src/components/sales/call-view/outcome-panel.tsx`, `footer-bar.tsx`, `use-keyboard.ts`
- Modify: `src/components/sales/call-view/index.tsx`

**Interfaces:**
- Consumes: `logCall`, `updateCallLog` (Task 9), `validateCallLog`, `defaultNotNowMonth`, `sessionTally`, `CallLogInput` (Task 4), `MISSED_OUTCOMES`, `TALKED_OUTCOMES`, `CALL_OUTCOME_OPTIONS`, `CALL_OUTCOME_META`, `OUTCOME_HOTKEYS`, `NOT_INTERESTED_REASONS`, `SALES_PICKLISTS`, `addDays`, `formatTimestamp`.
- Produces: `OutcomePanel({ draft, onChange, contact, today, disabled, errors, warnings })`, `FooterBar({ … })`, `useCallKeys(handlers)`, and `inputFromDraft(draft, callerName, now): CallLogInput`, `draftFromLog(log): CallDraft` (exported from `index.tsx`).

- [ ] **Step 1: Outcome panel**

Create `src/components/sales/call-view/outcome-panel.tsx`:
```tsx
'use client';

import type { CallOutcome, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { addDays } from '@/lib/dates';
import {
  CALL_OUTCOME_META, CALL_OUTCOME_OPTIONS, MISSED_OUTCOMES, TALKED_OUTCOMES, OUTCOME_HOTKEYS,
  NOT_INTERESTED_REASONS, SALES_PICKLISTS,
} from '@/lib/constants';
import { defaultNotNowMonth } from '@/lib/data/sales-logic';
import { StarRating } from '../star-rating';
import type { CallDraft } from './use-draft';

function Field({ label, error, warning, children }: { label: string; error?: string; warning?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs text-red-300">{error}</span> : warning ? <span className="mt-1 block text-xs text-amber-300">{warning}</span> : null}
    </label>
  );
}

/** Choosing an outcome seeds the prompt's defaults (§6) without overwriting anything typed. */
export function seedForOutcome(draft: CallDraft, outcome: CallOutcome, contact: Contact, today: CalendarDate): Partial<CallDraft> {
  const p: Partial<CallDraft> = { outcome };
  const fu = { ...draft.followUp };
  if ((outcome === 'send_info' || outcome === 'interested') && !fu.date) fu.date = addDays(today, 7);
  if (outcome === 'not_now' && !fu.date) fu.date = `${defaultNotNowMonth(contact, today)}-01`;
  p.followUp = fu;
  if ((outcome === 'send_info' || outcome === 'interested') && !draft.email && contact.email) p.email = contact.email;
  return p;
}

export function OutcomePanel({
  draft, onChange, contact, today, disabled, errors, warnings,
}: {
  draft: CallDraft;
  onChange: (p: Partial<CallDraft>) => void;
  contact: Contact;
  today: CalendarDate;
  disabled: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}) {
  const pick = (o: CallOutcome) => onChange(seedForOutcome(draft, o, contact, today));
  const fu = (p: Partial<CallDraft['followUp']>) => onChange({ followUp: { ...draft.followUp, ...p } });
  const ref = (p: Partial<CallDraft['referral']>) => onChange({ referral: { ...draft.referral, ...p } });
  const key = (o: CallOutcome) => OUTCOME_HOTKEYS[CALL_OUTCOME_OPTIONS.indexOf(o)];

  // A plain render function, not a nested component — a component defined inside
  // render is a new type every render and React remounts its subtree each time.
  const renderRow = (title: string, outcomes: CallOutcome[]) => (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {outcomes.map((o) => {
          const m = CALL_OUTCOME_META[o];
          const active = draft.outcome === o;
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => pick(o)}
              aria-pressed={active}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40 ${active ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold' : 'border-line bg-surface-2 hover:border-ppc-gold/50'}`}
            >
              <span><span aria-hidden className="mr-1.5">{m.emoji}</span>{m.label}</span>
              <kbd className="rounded border border-line px-1 text-[0.65rem] text-muted">{key(o)}</kbd>
            </button>
          );
        })}
      </div>
    </div>
  );

  const month = draft.followUp.date ? draft.followUp.date.slice(0, 7) : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">Lead rating <span className="text-muted/70">(Shift+1…5)</span></span>
        <StarRating value={draft.leadRating} onChange={(v) => onChange({ leadRating: v })} size="lg" />
      </div>
      {errors.leadRating && <p className="text-xs text-red-300">{errors.leadRating}</p>}

      {renderRow("Didn't reach them", MISSED_OUTCOMES)}
      {renderRow('Talked to them', TALKED_OUTCOMES)}
      {errors.outcome && <p className="text-sm text-red-300">{errors.outcome}</p>}

      {draft.outcome && (
        <div className="rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 p-3">
          {draft.outcome === 'callback' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Call back on" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} /></Field>
              <Field label="At (their time)" error={errors['followUp.time']}><input type="time" value={draft.followUp.time} onChange={(e) => fu({ time: e.target.value })} /></Field>
              <Field label="Note"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="e.g. after their board meeting" /></Field>
            </div>
          )}
          {(draft.outcome === 'send_info' || draft.outcome === 'interested') && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Email" error={errors.email} warning={warnings.email}><input type="email" value={draft.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="them@example.ca" /></Field>
              <Field label="Follow up on" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} /></Field>
              <Field label="Follow-up note"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder={draft.outcome === 'interested' ? 'what they want to see' : 'send the catalogue'} /></Field>
            </div>
          )}
          {draft.outcome === 'meeting_booked' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Meeting date" error={errors['followUp.date']}><input type="date" value={draft.followUp.date ?? ''} onChange={(e) => fu({ date: e.target.value || null })} /></Field>
              <Field label="Time" error={errors['followUp.time']}><input type="time" value={draft.followUp.time} onChange={(e) => fu({ time: e.target.value })} /></Field>
              <Field label="Where / how"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="call, rink visit…" /></Field>
            </div>
          )}
          {draft.outcome === 'not_now' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Try again in" error={errors['followUp.date']}><input type="month" value={month} onChange={(e) => fu({ date: e.target.value ? `${e.target.value}-01` : null })} /></Field>
              <Field label="Why"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} placeholder="after tryouts, budget in spring…" /></Field>
            </div>
          )}
          {draft.outcome === 'not_interested' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reason">
                <select value={draft.reason} onChange={(e) => onChange({ reason: e.target.value })}>
                  <option value="">—</option>
                  {NOT_INTERESTED_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Detail"><input value={draft.followUp.note} onChange={(e) => fu({ note: e.target.value })} /></Field>
            </div>
          )}
          {draft.outcome === 'referred' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Referred to (name)" error={errors.referral}><input value={draft.referral.name} onChange={(e) => ref({ name: e.target.value })} /></Field>
              <Field label="Their role">
                <select value={draft.referral.role} onChange={(e) => ref({ role: e.target.value })}>
                  <option value="">—</option>
                  {SALES_PICKLISTS.role.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Phone" warning={warnings['referral.phone']}><input type="tel" value={draft.referral.phone} onChange={(e) => ref({ phone: e.target.value })} /></Field>
              <Field label="Email"><input type="email" value={draft.referral.email} onChange={(e) => ref({ email: e.target.value })} /></Field>
              <p className="text-xs text-muted sm:col-span-2">Saving adds them to this list right after this contact.</p>
            </div>
          )}
          {draft.outcome === 'bad_number' && (
            <Field label="New number, if they gave one" warning={warnings.newPhone}><input type="tel" value={draft.newPhone} onChange={(e) => onChange({ newPhone: e.target.value })} placeholder="leave blank to close the contact" /></Field>
          )}
          {draft.outcome === 'do_not_call' && (
            <p className="text-sm text-red-300">Saving marks this contact Do Not Call: removed from every queue, number hidden. It can't be undone from here.</p>
          )}
          {(draft.outcome === 'no_answer' || draft.outcome === 'voicemail') && (
            <p className="text-xs text-muted">Back in the queue in {draft.outcome === 'no_answer' ? 'two' : 'four'} days.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Footer bar**

Create `src/components/sales/call-view/footer-bar.tsx`:
```tsx
'use client';

export type SaveState = 'idle' | 'saving' | 'error';

export function FooterBar({
  canPrevious, onPrevious, canSkip, onSkip, canSave, onSave, saveLabel, saveState, error, missing, tally, onHelp,
}: {
  canPrevious: boolean; onPrevious: () => void;
  canSkip: boolean; onSkip: () => void;
  canSave: boolean; onSave: () => void; saveLabel: string; saveState: SaveState;
  error: string | null; missing: string | null;
  tally: { calls: number; reached: number; voicemails: number; callbacks: number; infoSent: number };
  onHelp: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex gap-2">
          <button type="button" disabled={!canPrevious} onClick={onPrevious} title="Ctrl+←" className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">← Previous</button>
          <button type="button" disabled={!canSkip} onClick={onSkip} title="Ctrl+→" className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60 disabled:opacity-30">Skip →</button>
        </div>
        <div className="hidden items-center gap-3 text-xs tabular-nums text-muted sm:flex">
          <span>Calls <b className="text-foreground">{tally.calls}</b></span>
          <span>Reached <b className="text-foreground">{tally.reached}</b></span>
          <span>Voicemails <b className="text-foreground">{tally.voicemails}</b></span>
          <span>Callbacks <b className="text-foreground">{tally.callbacks}</b></span>
          <span>Info sent <b className="text-foreground">{tally.infoSent}</b></span>
          <button type="button" onClick={onHelp} className="rounded border border-line px-1.5 text-[0.7rem] hover:text-ppc-gold" title="Keyboard shortcuts">?</button>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${saveState === 'error' ? 'text-red-300' : 'text-muted'}`}>
            {saveState === 'saving' ? 'Saving…' : error ?? (canSave ? '' : missing ?? '')}
          </span>
          <button
            type="button"
            disabled={!canSave || saveState === 'saving'}
            onClick={onSave}
            title="Ctrl+Enter"
            className="rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Keyboard hook**

Create `src/components/sales/call-view/use-keyboard.ts`:
```ts
'use client';

import { useEffect } from 'react';
import { OUTCOME_HOTKEYS } from '@/lib/constants';

export interface CallKeyHandlers {
  onOutcome: (index: number) => void;
  onRating: (n: 1 | 2 | 3 | 4 | 5) => void;
  onSave: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onFocusNotes: () => void;
  onHelp: () => void;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Keys only fire when focus is NOT in a text control — a "1" typed into the
 * notes must never log an outcome. Ctrl+Enter / Ctrl+arrows work everywhere.
 */
export function useCallKeys(h: CallKeyHandlers, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (TYPING.has(t.tagName) || t.isContentEditable);
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') { e.preventDefault(); h.onSave(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); h.onSkip(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); h.onPrevious(); }
        return;
      }
      if (typing) {
        if (e.key === 'Escape') (t as HTMLElement).blur();
        return;
      }
      if (e.shiftKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); h.onRating(Number(e.key) as 1 | 2 | 3 | 4 | 5); return; }
      // Shift+1 arrives as "!" on US layouts — map the symbol row too.
      const shifted = ['!', '@', '#', '$', '%'].indexOf(e.key);
      if (e.shiftKey && shifted !== -1) { e.preventDefault(); h.onRating((shifted + 1) as 1 | 2 | 3 | 4 | 5); return; }
      const idx = (OUTCOME_HOTKEYS as readonly string[]).indexOf(e.key);
      if (idx !== -1) { e.preventDefault(); h.onOutcome(idx); return; }
      if (e.key === '/') { e.preventDefault(); h.onFocusNotes(); return; }
      if (e.key === '?') { e.preventDefault(); h.onHelp(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h, enabled]);
}
```

- [ ] **Step 4: Wire it into `index.tsx`**

Replace the whole of `src/components/sales/call-view/index.tsx` with:
```tsx
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CallList, CallLog, Contact, LeadRating } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE, CALL_OUTCOME_OPTIONS } from '@/lib/constants';
import { logCall, skipContact, updateCallLog } from '@/app/sales/actions';
import { applicableItems, fillPlaceholders } from '@/lib/sales/script';
import { isClosed, sessionTally, validateCallLog, type CallLogInput } from '@/lib/data/sales-logic';
import { TextArea } from '@/components/order-form/fields';
import { EmptyState, Warning } from '@/components/ui';
import { useCallerName } from '../use-caller-name';
import { OutcomeBadge } from '../outcome-badge';
import { ContactPanel } from './contact-panel';
import { ScriptPanel } from './script-panel';
import { OutcomePanel, seedForOutcome } from './outcome-panel';
import { FooterBar, type SaveState } from './footer-bar';
import { useCallKeys } from './use-keyboard';
import { blankDraft, useDraft, type CallDraft } from './use-draft';
import { formatClock, useElapsedSince, useSessionTimer } from './use-timers';

export interface CallViewProps {
  list: CallList;
  contacts: Contact[];
  logs: CallLog[];
  queue: string[];
  startId: string | null;
  callerDefault: string;
  today: CalendarDate;
}

export function inputFromDraft(d: CallDraft, callerName: string, now: string): CallLogInput {
  const started = new Date(d.startedAt).getTime();
  return {
    outcome: d.outcome ?? 'no_answer',
    leadRating: d.leadRating,
    notes: d.notes,
    answers: d.answers,
    checklist: d.checklist,
    startedAt: d.startedAt,
    endedAt: now,
    durationSeconds: Math.max(0, Math.round((new Date(now).getTime() - started) / 1000)),
    callerName,
    followUp: d.followUp,
    email: d.email,
    reason: d.reason,
    referral: d.referral,
    newPhone: d.newPhone,
  };
}

export function draftFromLog(g: CallLog): CallDraft {
  return {
    ...blankDraft(g.startedAt),
    outcome: g.outcome, leadRating: g.leadRating, notes: g.notes, answers: { ...g.answers },
    checklist: [...g.checklist], followUp: { ...g.followUp }, email: g.email, reason: g.reason,
    referral: { ...g.referral }, newPhone: g.newPhone,
  };
}

const SHORTCUTS: Array<[string, string]> = [
  ['1–9, 0, -', 'Pick an outcome (on-screen order)'], ['Shift+1…5', 'Rate the lead'], ['Ctrl+Enter', 'Save & Next'],
  ['Ctrl+→', 'Skip'], ['Ctrl+←', 'Previous'], ['/', 'Jump to notes'], ['Esc', 'Leave a text box'], ['?', 'This sheet'],
];

export function CallView(props: CallViewProps) {
  const { list, today } = props;
  const [callerName] = useCallerName(props.callerDefault);
  const [contacts, setContacts] = useState<Record<string, Contact>>(() => Object.fromEntries(props.contacts.map((c) => [c.id, c])));
  const [logs, setLogs] = useState<CallLog[]>(props.logs);
  const [queue, setQueue] = useState<string[]>(props.queue);
  const [currentId, setCurrentId] = useState<string | null>(props.startId);
  const [history, setHistory] = useState<string[]>([]);
  const [sessionLogs, setSessionLogs] = useState<Record<string, string>>({}); // contactId → logId written this session
  const [editing, setEditing] = useState<CallLog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [help, setHelp] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  const session = useSessionTimer(list.id);
  const { draft, patch, replace, clear } = useDraft(currentId);
  const elapsed = useElapsedSince(currentId ? draft.startedAt : null);

  const current = currentId ? contacts[currentId] : null;
  const contactLogs = useMemo(() => (current ? logs.filter((g) => g.contactId === current.id) : []), [logs, current]);
  const script = useMemo(
    () => (current ? applicableItems(list.script, current).map((i) => ({ ...i, text: fillPlaceholders(i.text, current, callerName), response: fillPlaceholders(i.response, current, callerName) })) : []),
    [list.script, current, callerName],
  );
  const position = current ? queue.indexOf(current.id) : -1;
  const waitingOnDate = useMemo(
    () => Object.values(contacts).filter((c) => !c.doNotCall && c.callCount > 0 && !!c.nextCallDate && c.nextCallDate > today && !isClosed(c)).length,
    [contacts, today],
  );
  const tally = useMemo(() => sessionTally(logs, callerName, today), [logs, callerName, today]);
  const loggedThisSession = current ? logs.find((g) => g.id === sessionLogs[current.id]) ?? null : null;
  const showingSummary = !!loggedThisSession && !editing;

  const validation = useMemo(
    () => (current && draft.outcome ? validateCallLog(inputFromDraft(draft, callerName, new Date().toISOString()), current, { replacing: !!editing }) : null),
    [current, draft, callerName, editing],
  );
  const missing = !current ? null : current.doNotCall && draft.outcome !== 'do_not_call' ? 'Do Not Call' : !draft.outcome ? 'Pick an outcome' : (validation && Object.values(validation.blocking)[0]) || null;
  const canSave = !!current && !showingSummary && !missing;

  const goTo = useCallback((id: string | null) => {
    setHistory((h) => (currentId ? [...h, currentId] : h));
    setCurrentId(id);
    setEditing(null);
    setNotice(null);
    setError(null);
    setFieldErrors({});
    setWarnings({});
  }, [currentId]);

  const nextAfter = (id: string | null, q: string[]) => q.find((x) => x !== id) ?? null;

  function skip() {
    if (!current) return;
    const id = current.id;
    const q = [...queue.filter((x) => x !== id), id];
    setQueue(q);
    setContacts((m) => ({ ...m, [id]: { ...m[id], skipCount: m[id].skipCount + 1, lastSkippedAt: new Date().toISOString() } }));
    skipContact(list.id, id).then((r) => { if (!r.ok) setNotice(r.error); });
    goTo(nextAfter(id, q));
  }

  function previous() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setCurrentId(prev);
    setEditing(null);
    setError(null);
  }

  function startEdit() {
    if (!loggedThisSession) return;
    replace(draftFromLog(loggedThisSession));
    setEditing(loggedThisSession);
  }

  async function save() {
    if (!current || !canSave) return;
    setSaveState('saving');
    setError(null);
    const input = inputFromDraft(draft, callerName, new Date().toISOString());
    const res = editing ? await updateCallLog(editing.id, current.id, input) : await logCall(list.id, current.id, input);
    if (!res.ok) {
      setSaveState('error');
      setError(res.error);
      setFieldErrors(res.errors ?? {});
      return;
    }
    setSaveState('idle');
    setWarnings(res.warnings);
    setLogs((l) => (editing ? l.map((g) => (g.id === res.log.id ? res.log : g)) : [res.log, ...l]));
    setContacts((m) => ({ ...m, [res.contact.id]: res.contact, ...(res.referral ? { [res.referral.id]: res.referral } : {}) }));
    setSessionLogs((s) => ({ ...s, [res.contact.id]: res.log.id }));
    const q = queue.filter((x) => x !== res.contact.id);
    const nextQueue = res.referral ? [res.referral.id, ...q] : q;
    setQueue(nextQueue);
    clear();
    setEditing(null);
    goTo(nextAfter(res.contact.id, nextQueue));
  }

  useCallKeys({
    onOutcome: (i) => { if (current && !current.doNotCall && !showingSummary) patch(seedForOutcome(draft, CALL_OUTCOME_OPTIONS[i], current, today)); },
    onRating: (n) => { if (current && !showingSummary) patch({ leadRating: (draft.leadRating === n ? null : n) as LeadRating | null }); },
    onSave: () => { void save(); },
    onSkip: skip,
    onPrevious: previous,
    onFocusNotes: () => notesRef.current?.querySelector('textarea')?.focus(),
    onHelp: () => setHelp((h) => !h),
  }, !!current);

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/sales/${list.id}`} onClick={session.clear} className="text-muted hover:text-ppc-gold">← {list.name}</Link>
        <div className="flex items-center gap-4 tabular-nums text-muted">
          <span>{position >= 0 ? `${position + 1} of ${queue.length} in queue` : current ? 'Not in queue' : `${queue.length} in queue`}</span>
          <span>⏱ calling for <span className="font-semibold text-foreground">{formatClock(session.seconds)}</span></span>
          {current && <span><span className="font-semibold text-foreground">{formatClock(elapsed)}</span> here</span>}
        </div>
      </div>

      {notice && <Warning>{notice}</Warning>}
      {help && (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <div className="mb-2 flex items-center justify-between"><span className="font-bold uppercase tracking-wide text-ppc-gold">Keyboard</span><button type="button" onClick={() => setHelp(false)} className="text-muted hover:text-ppc-gold">close</button></div>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {SHORTCUTS.map(([k, v]) => <div key={k} className="flex gap-3"><dt className="w-24 shrink-0 font-mono text-xs text-ppc-gold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
          </dl>
        </div>
      )}

      {!current ? (
        <EmptyState
          title="Nothing left in the queue"
          hint={`${waitingOnDate} contact${waitingOnDate === 1 ? ' is' : 's are'} waiting on a future date. Open the contacts table to pick someone directly.`}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="rounded-xl border border-line bg-surface p-4">
            {current.doNotCall && <div className="mb-3"><Warning>Do Not Call — this contact asked not to be contacted. Outcomes are disabled.</Warning></div>}
            <ContactPanel contact={current} logs={contactLogs} script={list.script} />
          </section>
          <section className="space-y-6">
            <div className="rounded-xl border border-line bg-surface p-4">
              <ScriptPanel
                items={script}
                answers={draft.answers}
                checklist={draft.checklist}
                onAnswer={(id, v) => patch({ answers: { ...draft.answers, [id]: v } })}
                onTick={(id, on) => patch({ checklist: on ? [...new Set([...draft.checklist, id])] : draft.checklist.filter((x) => x !== id) })}
                disabled={current.doNotCall || showingSummary}
              />
            </div>
            <div ref={notesRef} className="rounded-xl border border-line bg-surface p-4">
              <TextArea label="Notes" value={draft.notes} onChange={(v) => patch({ notes: v })} rows={4} placeholder="What they said, what you promised…" />
              <p className="mt-1 text-xs text-muted">Drafts save automatically on this device. Press / to jump here.</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">Outcome</h3>
              {showingSummary && loggedThisSession ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
                  <span>Logged as <OutcomeBadge outcome={loggedThisSession.outcome} /> <span className="text-muted">{formatTimestamp(loggedThisSession.endedAt, BUSINESS_TIMEZONE)}</span></span>
                  <button type="button" onClick={startEdit} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold">Edit</button>
                </div>
              ) : (
                <>
                  {editing && <p className="mb-3 text-xs text-amber-300">Editing the call logged at {formatTimestamp(editing.endedAt, BUSINESS_TIMEZONE)} — saving replaces it.</p>}
                  <OutcomePanel draft={draft} onChange={patch} contact={current} today={today} disabled={current.doNotCall} errors={fieldErrors} warnings={warnings} />
                </>
              )}
            </div>
          </section>
        </div>
      )}

      <FooterBar
        canPrevious={history.length > 0}
        onPrevious={previous}
        canSkip={!!current}
        onSkip={skip}
        canSave={canSave}
        onSave={() => { void save(); }}
        saveLabel={editing ? 'Update call' : 'Save & Next →'}
        saveState={saveState}
        error={error}
        missing={missing}
        tally={tally}
        onHelp={() => setHelp((h) => !h)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Check in the browser (the full loop)**

`npx tsc --noEmit` silent. On the Sample list:
1. Eagles: pick **Left Voicemail** (key `2`), rate 3 stars (`Shift+3`), type a note, **Save & Next** (Ctrl+Enter) → Kodiaks. Footer tally: Calls 1 · Voicemails 1.
2. Kodiaks: **Callback** → date required; Save is disabled with "Pick a date"; set tomorrow, Save → next.
3. **Previous** twice → Eagles shows "Logged as Left Voicemail … Edit". Edit → change to **Send Info** → email required, prefilled from the sheet (`jamie@example.ca`), date defaults +7 → **Update call**. The table page shows Eagles as Send Info with 1 call (not 2).
4. Lakers: **Gatekeeper / Referred**, name "Sam's Manager", phone `780 555 0100` → Save → the next contact IS the new referral (same org, Referral label, uncalled).
5. Referral: **Not Now** → month defaults to `2027-06` (ordering month Jun, already past this year) → Save.
6. Skip once; open the table: skip count shows.
7. Open Prairie Storm via `?c=`: outcomes disabled, Save disabled ("Do Not Call").
8. Reload mid-draft: notes restored. `?` shows the sheet. `/` focuses notes; typing `1` in notes does NOT pick an outcome.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales/call-view
git commit -m "Sales calling view: outcomes, rating, save/edit, keyboard, tally

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Export CSV

**Files:**
- Modify: `src/lib/csv.ts` (export `escapeCell`)
- Create: `src/lib/sales/export.ts`, `src/app/api/sales/[id]/export.csv/route.ts`
- Test: `tests/sales/export.test.ts`

**Interfaces:**
- Produces: `callListToCsv(bundle: CallListBundle): string` — BOM + `\r\n`, header = the 26 template headers, then `Lead Rating, Last Outcome, Calls, Skips, Last Called, Next Call Date, Last Notes, Source`, then `Q: <question text>` per script question, then raw-only headers (in first-seen order).
- Consumes: `CONTACT_COLUMNS`, `sheetValue`, `keyForHeader` (Task 2), `CALL_OUTCOME_META`, `escapeCell`, `formatTimestamp`.

- [ ] **Step 1: Export `escapeCell` from `src/lib/csv.ts`**

Change `function escapeCell(v: unknown): string {` to `export function escapeCell(v: unknown): string {`.

- [ ] **Step 2: Write the test**

Create `tests/sales/export.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCallListFile } from '@/lib/sales/import';
import { callListToCsv } from '@/lib/sales/export';
import { parseCsv } from '@/lib/csv';
import type { CallLog } from '@/lib/types';
import { blankCallLogInput } from '@/lib/data/sales-logic';

test('export round-trips headers, adds outcome columns and question columns', async () => {
  const r = await parseCallListFile({
    fileName: 'sample-list.xlsx', bytes: new Uint8Array(readFileSync('tests/sales/fixtures/sample-list.xlsx')),
    listId: 'l1', listName: 'S', createdBy: 'K', now: '2026-09-06T20:00:00.000Z',
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const eagles = r.contacts[0];
  eagles.lastOutcome = 'send_info'; eagles.callCount = 1; eagles.leadRating = 4; eagles.nextCallDate = '2026-09-13'; eagles.email = 'new@example.ca';
  const log: CallLog = {
    ...blankCallLogInput('2026-09-06T20:00:00.000Z'), id: 'g1', listId: 'l1', contactId: eagles.id, outcome: 'send_info',
    notes: 'wants the catalogue', answers: { s7: 'Board vote' }, endedAt: '2026-09-06T20:05:00.000Z',
    createdAt: '2026-09-06T20:05:00.000Z', updatedAt: '2026-09-06T20:05:00.000Z',
  };
  const csv = callListToCsv({ list: r.list, contacts: r.contacts, logs: [log] });
  assert.ok(csv.startsWith('\uFEFF'));
  const rows = parseCsv(csv.slice(1));
  const header = rows[0];
  assert.equal(header[0], 'Org Name');
  assert.equal(header[25], 'Notes');
  assert.equal(header[26], 'Lead Rating');
  assert.equal(header[33], 'Source');
  assert.ok(header.includes('Q: Who looks after jerseys for [Org] — is that you, an equipment manager, or does the board decide?'));
  assert.equal(header[header.length - 1], 'Rink');
  const row = rows[1];
  assert.equal(row[0], 'Ennismore Eagles');
  assert.equal(row[6], 'new@example.ca');
  assert.equal(row[26], '4');
  assert.equal(row[27], 'Send Info');
  assert.equal(row[28], '1');
  assert.equal(row[31], '2026-09-13');
  assert.equal(row[32], 'wants the catalogue');
  assert.equal(row[header.indexOf('Q: Who looks after jerseys for [Org] — is that you, an equipment manager, or does the board decide?')], 'Board vote');
  assert.equal(row[header.length - 1], 'Ennismore CC');
  assert.equal(rows.length, 6);
});
```

- [ ] **Step 3: Create `src/lib/sales/export.ts`**

```ts
import type { CallListBundle } from '@/lib/data/repository';
import type { CallLog, Contact } from '@/lib/types';
import { escapeCell } from '@/lib/csv';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE, CALL_OUTCOME_META } from '@/lib/constants';
import { CONTACT_COLUMNS, keyForHeader, sheetValue } from './columns';

const RESULT_HEADERS = ['Lead Rating', 'Last Outcome', 'Calls', 'Skips', 'Last Called', 'Next Call Date', 'Last Notes', 'Source'] as const;

/**
 * The list back out as a sheet: the template's 26 columns (current values — a
 * captured email replaces the sheet's), the call state, one column per script
 * question with the latest answer, then any columns the sheet had that we
 * don't know. Re-uploading this works: template headers map, the rest lands
 * in `raw`. UTF-8 BOM so Excel reads accents; CRLF so Excel on Windows behaves.
 */
export function callListToCsv(bundle: CallListBundle): string {
  const { list, contacts, logs } = bundle;
  const questions = list.script.filter((s) => s.kind === 'question');
  const rawOnly: string[] = [];
  for (const c of contacts) for (const h of Object.keys(c.raw ?? {})) if (!keyForHeader(h) && !rawOnly.includes(h)) rawOnly.push(h);

  const byContact = new Map<string, CallLog[]>();
  for (const g of [...logs].sort((a, b) => b.endedAt.localeCompare(a.endedAt))) {
    byContact.set(g.contactId, [...(byContact.get(g.contactId) ?? []), g]);
  }
  const latestAnswer = (c: Contact, qid: string) => (byContact.get(c.id) ?? []).find((g) => g.answers[qid])?.answers[qid] ?? '';

  const header = [
    ...CONTACT_COLUMNS.map((col) => col.header),
    ...RESULT_HEADERS,
    ...questions.map((q) => `Q: ${q.text}`),
    ...rawOnly,
  ];
  const lines = [header.map(escapeCell).join(',')];
  for (const c of contacts) {
    const latest = (byContact.get(c.id) ?? [])[0];
    const cells = [
      ...CONTACT_COLUMNS.map((col) => sheetValue(c, col.key)),
      c.leadRating ?? '',
      c.lastOutcome ? CALL_OUTCOME_META[c.lastOutcome].label : '',
      c.callCount,
      c.skipCount,
      c.lastCalledAt ? formatTimestamp(c.lastCalledAt, BUSINESS_TIMEZONE) : '',
      c.nextCallDate ?? '',
      latest?.notes ?? '',
      c.source === 'referral' ? 'Referral' : 'Sheet',
      ...questions.map((q) => latestAnswer(c, q.id)),
      ...rawOnly.map((h) => c.raw?.[h] ?? ''),
    ];
    lines.push(cells.map(escapeCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Route handler**

Create `src/app/api/sales/[id]/export.csv/route.ts`:
```ts
import { repo } from '@/lib/data';
import { requireRole } from '@/lib/auth';
import { callListToCsv } from '@/lib/sales/export';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole('staff');
  const { id } = await params;
  const bundle = await repo.getCallList(id);
  if (!bundle) return new Response('Not found', { status: 404 });

  const csv = callListToCsv(bundle);
  const slug = (bundle.list.name || 'call-list').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-calls.csv"`,
    },
  });
}
```

- [ ] **Step 5: Run tests, check the download**

Run: `npm test` — all pass. In the browser, **Export CSV** on the Sample list downloads `sample-calls.csv`; open it in Excel: 26 template columns, then the result columns, then `Q:` columns, then `Rink`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/csv.ts src/lib/sales/export.ts "src/app/api/sales/[id]/export.csv/route.ts" tests/sales/export.test.ts
git commit -m "Sales: CSV export of a call list with outcomes and answers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Docs, production build, end-to-end walkthrough

**Files:**
- Modify: `CLAUDE.md`
- No new code. Removes nothing.

- [ ] **Step 1: CLAUDE.md — Sales section**

In `CLAUDE.md`, add to the "Where things are" tree after the `src/app/roster/[token]/` line:
```
src/app/sales/            cold calling: landing (upload, lists), contacts table, calling view
src/app/sales/actions.ts  every sales mutation — upload, log, edit, skip, delete
src/lib/data/sales-logic.ts  sales rules (queue, call state, validation) — pure, both stores use it
src/lib/sales/            columns (the sheet), import, export, script rules, phone, timezones
src/components/sales/     landing pieces + call-view/ (the one-contact-at-a-time screen)
scripts/build-call-template.mjs  regenerates public/templates/… and the test fixture
```
And a new section before "Not built yet":
```markdown
## Sales — cold calling

Design: `docs/superpowers/specs/2026-09-06-sales-cold-calling-design.md`.

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
  most recent call, and can't undo Do Not Call.
- **Do Not Call is enforced twice**: `buildQueue` drops the contact and the
  server refuses any other outcome for it. The screen hides the number.
- **Write order on Supabase**: list before contacts; log before contact patch
  before referral. Read the comments in `supabase-store.ts` before reordering.
- **Drafts live in `localStorage`** per contact until saved; the session
  timer in `sessionStorage` per list. Both are per-device conveniences.
- **The template and the importer share one column map** (`sales/columns.ts`)
  and one pick-list file (`sales/picklists.json`). Change either, run
  `npm run build:template`, commit the regenerated `.xlsx`.
- `npm test` covers the pure modules (`tests/sales/`). Stores and pages are
  checked by `tsc` and the browser walkthrough.
```

- [ ] **Step 2: Full verification**

Run, in order:
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: tests all pass; tsc silent; lint clean (fix any `no-unused-vars` it raises in the sales files by removing the import, never by adding a dummy use); build succeeds with `/sales`, `/sales/[id]`, `/sales/[id]/call`, `/api/sales/[id]/export.csv` listed as dynamic routes.

- [ ] **Step 3: Walkthrough against the production build**

`npm run start`, then in the browser (locked → `/sales` redirects to `/unlock?next=/sales`; unlock):
1. `/sales` — Sales appears in the nav; Calling as shows the code holder's name; change it, reload, it sticks.
2. Upload `tests/sales/fixtures/sample-list.csv` (CSV path) and `.xlsx` (xlsx path) as two lists. The CSV list shows "0 script lines".
3. On the xlsx list: report (1 skipped line 4, 4 warnings); Due today empty; chips count 5/4/0/0/0/1.
4. Start calling → Eagles → Voicemail → Save; Kodiaks → Callback tomorrow → Save; Lakers → Referred → new contact next; referral → Not Now → Save; queue exhausted message shows "waiting on a future date" count 3 (Eagles retry, Kodiaks callback, referral not-now).
5. Table: Retry 1 (Eagles), Follow-up 2, Done 1 (Lakers referred), Do not call 1; Export CSV opens with the right columns.
6. Delete both lists (confirm); `/sales` shows the empty state.
7. Phone width (DevTools, 390px): landing, table (cards), calling view (stacked) all usable; buttons ≥ 44px.

- [ ] **Step 4: Commit and push readiness**

```bash
git add CLAUDE.md
git commit -m "Sales: document the cold-calling module

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Then report: `git log --oneline` for the Sales commits, `npm test` summary, and the two go-live steps for Keenan — run `supabase/migrations/0004_sales.sql` in the Supabase SQL editor, then `git push` (Vercel builds; `npm install` there picks up `read-excel-file`). Hand over `public/templates/powerplay-call-list-template.xlsx` for him to fill in.

---

## Self-review (done while writing; recorded here)

**Spec coverage.** §2 entities → Task 1. §3 sheet (tabs, columns, pick-lists, Show When, placeholders, pre-filled script, Read Me) → Tasks 2, 3, 5. §4 import (formats, aliases, skip/warn rules, normalisation, script tab, one-step) → Tasks 6, 9, 10. §5 queue → Task 4 (`buildQueue`, `isClosed`, `contactBucket`). §6 outcomes (prompts, effects, next-call dates, rating, editing rule, skip) → Tasks 4, 9, 13. §7 pages: landing → Task 10; table → Task 11; calling view (layout, timers, script filtering, drafts, outcome panel, skip, previous/edit, DNC, local time, keyboard, tally, exhausted state) → Tasks 12–13; export → Task 14. §8 actions + validation → Tasks 4, 9. §9 repo, logic file, write order, JSON/Supabase stores, migrate script → Tasks 7, 8. §10 migration → Task 8. §11 failure handling → Tasks 6, 9, 13 (red footer, draft retained), 12 (`?c=` from another list → 404). §12 tests → Tasks 0–6, 14 (`node --test`), Task 15 (walkthrough). §13 files → File map. Appendix A → Task 5.

**Type consistency.** `CallLogInput` (Task 4) is what Tasks 9 and 13 pass; `logCall(listId, contactId, input)` and `updateCallLog(logId, contactId, input)` match between Task 9 and Task 13; `LogCallResult` carries `log, contact, referral, warnings` and Task 13 reads exactly those; `CallListBundle` (Task 7) is what Task 14's `callListToCsv` takes; `useCallerName` (Task 10) is used in Task 12/13; `seedForOutcome` is exported from `outcome-panel.tsx` and imported in `index.tsx`; `StarRating`'s `onChange` contract (Task 11) is used by the panel; `formatClock`/`useElapsedSince`/`useSessionTimer` names match between Task 12's hook file and `index.tsx`.

**Known judgment calls made in the plan (not in the spec):** `getContact` and `latestCallLogFor` were added to the repository so the actions don't load a whole bundle to log one call; a `Skip` on a contact opened via `?c=` that isn't in the queue simply moves to the queue's first item; the referral contact goes to the *front* of the remaining queue rather than "right after its source" (its source has just been closed, so front-of-queue is the same place).
