# Sales Master Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lists are created by name and grown by repeat uploads that fill blanks on matching contacts (same phone or email), never duplicate, and flag the same person in another list.

**Architecture:** `CallList` stays the unit; it gains `imports: ImportRecord[]` (newest first, max 10) and loses `sourceFileName`/`importReport`. Matching (`sales/match.ts`) and merging (`sales/merge.ts`) are pure modules; `planImport` in `data/sales-logic.ts` turns a parsed sheet plus the current list into `{ list, newContacts, updatedContacts, record }`, which one repository call writes (list → updated contacts → new contacts). "Also in" is computed per render from the same matcher, never stored.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, `node --test` via tsx, read-excel-file, exceljs (template).

**Spec:** `docs/superpowers/specs/2026-09-08-sales-master-lists-design.md`

## Global Constraints

- Rules live in pure modules (`src/lib/sales/match.ts`, `src/lib/sales/merge.ts`, `src/lib/data/sales-logic.ts`); stores only read and write.
- Every server action: `requireRole('staff')` → `currentActor()` → rules → `repo` → `revalidatePath`.
- An upload never changes call state, `isJerseyManager`, `doNotCall`, `source`, `referredFromContactId`, `sortOrder`, ids or `createdAt` of an existing contact.
- Phone match: digits only, leading `1` dropped from 11 digits, fewer than 7 digits → no key. Email match: trimmed, lowercased, must contain `@`.
- A row matching another list is still added/merged here and listed under `alsoIn`. Deleted lists never count.
- Script tab with ≥1 item replaces the list's script; otherwise the script is untouched.
- `imports` keeps the newest 10 records.
- Typecheck gate: `npx tsc --noEmit 2>&1 | grep -v "api/import/base44"` prints nothing (the Base44 leftover is out of scope). Tests: `npm test`.
- Work in a worktree branch; commit per task; Keenan pushes.

---

### Task 1: Types and the matcher

**Files:**
- Modify: `src/lib/types.ts` (lines 647–663: `ImportReport`, `CallList`)
- Create: `src/lib/sales/match.ts`
- Test: `tests/sales/match.test.ts`

**Interfaces:**
- Produces: `ImportRecord`, `CallList.imports: ImportRecord[]` (no `sourceFileName`, no `importReport`, `ImportReport` deleted); `phoneKey(raw): string`, `emailKey(raw): string`, `identityKeys(c: Contact): Set<string>`, `matches(a: Contact, b: Contact): boolean`, `findMatch(row: Contact, existing: Contact[]): Contact | null`, `AlsoIn`, `alsoIn(contact, others: Array<{ list: CallList; contacts: Contact[] }>): AlsoIn[]`.

- [ ] **Step 1: Replace `ImportReport` and the list fields in `src/lib/types.ts`**

Replace lines 647–663 with:

```ts
/** One upload into a list. Kept on the list, newest first, capped at 10. */
export interface ImportRecord {
  at: string;                 // instant
  by: string;                 // caller name
  fileName: string;
  added: number;              // new contacts
  merged: Array<{ line: number; contactId: string; filled: string[] }>;
  alsoIn: Array<{ line: number; contactId: string; listId: string; listName: string }>;
  skipped: Array<{ line: number; reason: string; raw: string }>;
  warnings: Array<{ line: number; reason: string }>;
  scriptReplaced: boolean;
}

export interface CallList {
  id: string;
  name: string;
  script: ScriptItem[];
  imports: ImportRecord[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

- [ ] **Step 2: Write the failing matcher test `tests/sales/match.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallList, Contact } from '@/lib/types';
import { blankContact, blankCallList } from '@/lib/data/sales-logic';
import { phoneKey, emailKey, identityKeys, matches, findMatch, alsoIn } from '@/lib/sales/match';

const NOW = '2026-09-08T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', ...over });

test('phoneKey: digits only, leading 1 dropped, short numbers are no key', () => {
  assert.equal(phoneKey('(705) 555-0142'), '7055550142');
  assert.equal(phoneKey('1 705 555 0142'), '7055550142');
  assert.equal(phoneKey('+1-705-555-0142'), '7055550142');
  assert.equal(phoneKey('555-01'), '');
  assert.equal(phoneKey(''), '');
});

test('emailKey: trimmed and lowercased; no @ is no key', () => {
  assert.equal(emailKey('  Jamie@Example.CA '), 'jamie@example.ca');
  assert.equal(emailKey('not an email'), '');
  assert.equal(emailKey(''), '');
});

test('identityKeys and matches', () => {
  const a = c({ phone: '705 555 0142', altPhone: '705 555 0199', email: 'J@x.ca' });
  assert.deepEqual([...identityKeys(a)].sort(), ['7055550142', '7055550199', 'j@x.ca']);
  assert.ok(matches(a, c({ id: 'p', phone: '(705) 555-0142' })), 'phone');
  assert.ok(matches(a, c({ id: 'e', email: 'j@X.ca' })), 'email');
  assert.ok(matches(a, c({ id: 'alt', phone: '7055550199' })), 'their phone against our alt phone');
  assert.ok(!matches(a, c({ id: 'n', phone: '705 555 0000', email: 'other@x.ca' })));
  assert.ok(!matches(c({ phone: '', email: '' }), c({ id: 'z', phone: '', email: '' })), 'no keys match nothing');
});

test('findMatch: first by sortOrder then createdAt', () => {
  const existing = [
    c({ id: 'late', sortOrder: 3, phone: '705 555 0142' }),
    c({ id: 'early', sortOrder: 2, phone: '705 555 0142' }),
    c({ id: 'other', sortOrder: 1, phone: '705 555 0001' }),
  ];
  assert.equal(findMatch(c({ id: 'row', phone: '7055550142' }), existing)?.id, 'early');
  assert.equal(findMatch(c({ id: 'row', phone: '7055550999' }), existing), null);
});

test('alsoIn: other non-deleted lists only, one entry per list', () => {
  const beer: CallList = blankCallList('l2', 'Beer league', 'Keenan', NOW);
  const gone: CallList = { ...blankCallList('l3', 'Old', 'Keenan', NOW), deletedAt: NOW };
  const me = c({ listId: 'l1', phone: '705 555 0142' });
  const others = [
    { list: blankCallList('l1', 'Youth', 'Keenan', NOW), contacts: [me] },
    { list: beer, contacts: [c({ id: 'b1', listId: 'l2', phone: '7055550142' }), c({ id: 'b2', listId: 'l2', phone: '7055550142' })] },
    { list: gone, contacts: [c({ id: 'g1', listId: 'l3', phone: '7055550142' })] },
  ];
  assert.deepEqual(alsoIn(me, others), [{ listId: 'l2', listName: 'Beer league', contactId: 'b1' }]);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --import tsx --test tests/sales/match.test.ts`
Expected: FAIL — cannot find module `@/lib/sales/match` (and `blankCallList` arity errors under tsc until Task 3).

- [ ] **Step 4: Create `src/lib/sales/match.ts`**

```ts
import type { CallList, Contact } from '@/lib/types';
import { phoneDigits } from './phone';

/**
 * Who is the same person. Two contacts match when a phone (either number) or
 * the email agrees. Pure; the importer and every "also in" line use it, so
 * nothing about matches is ever stored.
 */

/** Digits only; a leading 1 on an 11-digit number is dropped; under 7 digits is not a number. */
export function phoneKey(raw: string): string {
  let d = phoneDigits(raw ?? '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length >= 7 ? d : '';
}

export function emailKey(raw: string): string {
  const e = (raw ?? '').trim().toLowerCase();
  return e.includes('@') ? e : '';
}

export function identityKeys(c: Contact): Set<string> {
  return new Set([phoneKey(c.phone), phoneKey(c.altPhone), emailKey(c.email)].filter(Boolean));
}

export function matches(a: Contact, b: Contact): boolean {
  const ka = identityKeys(a);
  if (ka.size === 0) return false;
  for (const k of identityKeys(b)) if (ka.has(k)) return true;
  return false;
}

/** The first existing contact (sheet order) the row matches, or null. */
export function findMatch(row: Contact, existing: Contact[]): Contact | null {
  const ordered = [...existing].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return ordered.find((e) => matches(row, e)) ?? null;
}

export interface AlsoIn { listId: string; listName: string; contactId: string }

/** The other lists this person appears in — the same rule as the importer, computed on every render. */
export function alsoIn(contact: Contact, others: Array<{ list: CallList; contacts: Contact[] }>): AlsoIn[] {
  const out: AlsoIn[] = [];
  for (const o of others) {
    if (o.list.id === contact.listId || o.list.deletedAt) continue;
    const m = findMatch(contact, o.contacts);
    if (m) out.push({ listId: o.list.id, listName: o.list.name, contactId: m.id });
  }
  return out;
}
```

- [ ] **Step 5: Temporarily keep the tree compiling**

`blankCallList` still has the old 5-argument signature and builds `importReport`. Update it now (Task 3 finishes the logic file) — in `src/lib/data/sales-logic.ts` replace lines 44–50 with:

```ts
export function blankCallList(id: string, name: string, createdBy: string, now: string): CallList {
  return { id, name, script: [], imports: [], createdBy, createdAt: now, updatedAt: now, deletedAt: null };
}
```

and replace line 90 (`l.importReport ??= …`) inside `healCallList` with `l.imports ??= [];` (Task 3 replaces this with the real conversion). Remove `ImportReport` from the types import at the top of that file.

- [ ] **Step 6: Run the matcher test**

Run: `node --import tsx --test tests/sales/match.test.ts`
Expected: 5 passing. (`npm test` and `tsc` still fail elsewhere — import.ts, stores, UI — until Tasks 3–7.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/sales/match.ts src/lib/data/sales-logic.ts tests/sales/match.test.ts
git commit -m "Sales: ImportRecord on the list; phone/email matcher"
```

---

### Task 2: Fill-blanks merge

**Files:**
- Create: `src/lib/sales/merge.ts`
- Test: `tests/sales/merge.test.ts`

**Interfaces:**
- Consumes: `CONTACT_COLUMNS`, `keyForHeader` from `src/lib/sales/columns.ts`.
- Produces: `fillBlanks(existing: Contact, row: Contact): { patch: Partial<Contact>; filled: string[] }`.

- [ ] **Step 1: Write the failing test `tests/sales/merge.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contact } from '@/lib/types';
import { blankContact } from '@/lib/data/sales-logic';
import { fillBlanks } from '@/lib/sales/merge';

const NOW = '2026-09-08T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', ...over });

test('fills empty string, null and empty raw cells; never overwrites', () => {
  const existing = c({
    contactName: 'Jamie', email: '', website: 'https://a.ca', teams: null, players: 12, priority: '',
    raw: { 'Org Name': 'Eagles', 'Rink': '', 'Website': 'https://a.ca' },
    callCount: 3, lastOutcome: 'interested', isJerseyManager: true, doNotCall: false,
  });
  const row = c({
    id: 'row', contactName: 'J. Ouellette', email: 'j@x.ca', website: 'https://b.ca', teams: 14, players: 99, priority: 'B',
    raw: { 'Org Name': 'Eagles FC', 'Rink': 'Ennismore CC', 'Website': 'https://b.ca', 'Sponsor': 'Tim Hortons' },
    doNotCall: true,
  });
  const { patch, filled } = fillBlanks(existing, row);
  assert.deepEqual(patch, {
    email: 'j@x.ca', teams: 14, priority: 'B',
    raw: { 'Org Name': 'Eagles', 'Rink': 'Ennismore CC', 'Website': 'https://a.ca', 'Sponsor': 'Tim Hortons' },
  });
  assert.deepEqual(filled, ['Email', 'Teams (#)', 'Priority', 'Rink', 'Sponsor']);
  assert.equal('callCount' in patch, false);
  assert.equal('doNotCall' in patch, false);
  assert.equal('isJerseyManager' in patch, false);
});

test('nothing to fill → empty patch and empty filled', () => {
  const full = c({ email: 'j@x.ca', raw: { 'Org Name': 'Eagles' } });
  const { patch, filled } = fillBlanks(full, c({ id: 'row', email: 'j@x.ca', raw: { 'Org Name': 'Eagles' } }));
  assert.deepEqual(patch, {});
  assert.deepEqual(filled, []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --import tsx --test tests/sales/merge.test.ts`
Expected: FAIL — cannot find module `@/lib/sales/merge`.

- [ ] **Step 3: Create `src/lib/sales/merge.ts`**

```ts
import type { Contact } from '@/lib/types';
import { CONTACT_COLUMNS, keyForHeader } from './columns';

/**
 * An uploaded row that matches an existing contact fills that contact's
 * blanks and changes nothing else. Only the sheet fields and `raw` are
 * considered: call state, the jersey-manager flag, source, order and ids are
 * never in the patch, and Do Not Call is never changed by an upload.
 * `filled` names what changed, for the import report.
 */
export function fillBlanks(existing: Contact, row: Contact): { patch: Partial<Contact>; filled: string[] } {
  const patch: Partial<Contact> = {};
  const filled: string[] = [];
  for (const col of CONTACT_COLUMNS) {
    if (col.key === 'doNotCall') continue;
    const cur = existing[col.key];
    const next = row[col.key];
    const blank = cur === '' || cur === null || cur === undefined;
    const has = next !== '' && next !== null && next !== undefined;
    if (blank && has) {
      (patch as Record<string, unknown>)[col.key] = next;
      filled.push(col.header);
    }
  }
  const raw = { ...(existing.raw ?? {}) };
  let rawChanged = false;
  for (const [header, cell] of Object.entries(row.raw ?? {})) {
    if (cell && !raw[header]) {
      raw[header] = cell;
      rawChanged = true;
      // Known headers were already reported by their field above; only the extra columns get their own label.
      if (!keyForHeader(header)) filled.push(header);
    }
  }
  if (rawChanged) patch.raw = raw;
  return { patch, filled };
}
```

- [ ] **Step 4: Run the test**

Run: `node --import tsx --test tests/sales/merge.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sales/merge.ts tests/sales/merge.test.ts
git commit -m "Sales: fillBlanks merge for matched uploads"
```

---

### Task 3: The import plan, `healCallList`, and the parser split

**Files:**
- Modify: `src/lib/data/sales-logic.ts` (`healCallList` at ~line 87; add `planImport` after `blankCallSession`)
- Modify: `src/lib/sales/import.ts` (`contactsFromRows` return, drop the dup warning, `parseCallListFile` → `parseSheet`)
- Modify: `tests/sales/import.test.ts` (parse tests to the new shape)
- Test: `tests/sales/import-plan.test.ts`

**Interfaces:**
- Consumes: `findMatch` (Task 1), `fillBlanks` (Task 2).
- Produces:
  - `MAX_IMPORT_RECORDS = 10`
  - `healCallList(l)` converts a legacy `importReport` into one `ImportRecord`.
  - `ParsedSheet { contacts: Contact[]; lines: number[]; script: ScriptItem[] | null; skipped; warnings }`
  - `planImport(input: { list: CallList; existing: Contact[]; others: Array<{ list: CallList; contacts: Contact[] }>; parsed: ParsedSheet; fileName: string; by: string; now: string }): ImportPlan`
  - `ImportPlan { list: CallList; newContacts: Contact[]; updatedContacts: Contact[]; record: ImportRecord }`
  - `contactsFromRows(rows, listId, now, idFor?)` now also returns `lines: number[]` (sheet line per contact).
  - `parseSheet({ fileName, bytes, listId, now }): Promise<{ ok: true } & ParsedSheet | { ok: false; error: string }>` (replaces `parseCallListFile`).

- [ ] **Step 1: Write the failing test `tests/sales/import-plan.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallList, Contact, ScriptItem } from '@/lib/types';
import { blankContact, blankCallList, healCallList, planImport, MAX_IMPORT_RECORDS } from '@/lib/data/sales-logic';

const NOW = '2026-09-08T20:00:00.000Z';
const list = (): CallList => blankCallList('l1', 'Youth', 'Keenan', '2026-09-01T00:00:00.000Z');
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', ...over });
const item: ScriptItem = { id: 's1', section: 'opening', kind: 'read', text: 'Hi', response: '', options: [], showWhen: '' };
const parsed = (contacts: Contact[], script: ScriptItem[] | null = null) => ({
  contacts, lines: contacts.map((_, i) => i + 2), script, skipped: [], warnings: [],
});
const plan = (existing: Contact[], rows: Contact[], extra: Partial<Parameters<typeof planImport>[0]> = {}) =>
  planImport({ list: list(), existing, others: [], parsed: parsed(rows), fileName: 'more.xlsx', by: 'Keenan', now: NOW, ...extra });

test('new rows are added with sortOrder after the existing ones', () => {
  const p = plan([c({ id: 'e1', sortOrder: 7, phone: '705 555 0001' })], [c({ id: 'r1', phone: '705 555 0002' }), c({ id: 'r2', phone: '705 555 0003' })]);
  assert.deepEqual(p.newContacts.map((x) => [x.id, x.sortOrder]), [['r1', 8], ['r2', 9]]);
  assert.equal(p.record.added, 2);
  assert.deepEqual(p.updatedContacts, []);
  assert.equal(p.list.imports.length, 1);
  assert.equal(p.list.imports[0], p.record);
  assert.equal(p.record.fileName, 'more.xlsx');
  assert.equal(p.record.by, 'Keenan');
  assert.equal(p.record.at, NOW);
  assert.equal(p.list.updatedAt, NOW);
});

test('a row matching an existing contact fills its blanks and is not added', () => {
  const existing = c({ id: 'e1', phone: '705 555 0001', email: '', callCount: 2 });
  const p = plan([existing], [c({ id: 'r1', phone: '(705) 555-0001', email: 'j@x.ca', city: 'Ennismore' })]);
  assert.equal(p.record.added, 0);
  assert.deepEqual(p.newContacts, []);
  assert.equal(p.updatedContacts.length, 1);
  assert.equal(p.updatedContacts[0].id, 'e1');
  assert.equal(p.updatedContacts[0].email, 'j@x.ca');
  assert.equal(p.updatedContacts[0].callCount, 2);
  assert.equal(p.updatedContacts[0].updatedAt, NOW);
  assert.deepEqual(p.record.merged, [{ line: 2, contactId: 'e1', filled: ['Email', 'City'] }]);
});

test('re-uploading the identical sheet adds nothing and merges with empty filled', () => {
  const existing = [c({ id: 'e1', phone: '705 555 0001', email: 'a@x.ca' }), c({ id: 'e2', sortOrder: 2, phone: '705 555 0002' })];
  const p = plan(existing, [c({ id: 'r1', phone: '705 555 0001', email: 'a@x.ca' }), c({ id: 'r2', phone: '705 555 0002' })]);
  assert.equal(p.record.added, 0);
  assert.deepEqual(p.record.merged.map((m) => [m.contactId, m.filled]), [['e1', []], ['e2', []]]);
  assert.deepEqual(p.updatedContacts, [], 'nothing changed, nothing to write');
});

test('two matching rows in one upload become one contact', () => {
  const p = plan([], [c({ id: 'r1', phone: '705 555 0001', email: '' }), c({ id: 'r2', phone: '1-705-555-0001', email: 'j@x.ca' })]);
  assert.equal(p.record.added, 1);
  assert.equal(p.newContacts.length, 1);
  assert.equal(p.newContacts[0].email, 'j@x.ca');
  assert.deepEqual(p.record.merged, [{ line: 3, contactId: 'r1', filled: ['Email'] }]);
});

test('a match in another list is added here and listed under alsoIn; deleted lists ignored', () => {
  const beer = blankCallList('l2', 'Beer league', 'Keenan', NOW);
  const gone = { ...blankCallList('l3', 'Old', 'Keenan', NOW), deletedAt: NOW };
  const others = [
    { list: beer, contacts: [c({ id: 'b1', listId: 'l2', phone: '705 555 0001' })] },
    { list: gone, contacts: [c({ id: 'g1', listId: 'l3', phone: '705 555 0001' })] },
  ];
  const p = plan([], [c({ id: 'r1', phone: '705 555 0001' })], { others });
  assert.equal(p.record.added, 1);
  assert.deepEqual(p.record.alsoIn, [{ line: 2, contactId: 'b1', listId: 'l2', listName: 'Beer league' }]);
});

test('script: replaced only when the sheet has one with items', () => {
  const l = { ...list(), script: [item] };
  const keep = planImport({ list: l, existing: [], others: [], parsed: parsed([], null), fileName: 'x.csv', by: 'K', now: NOW });
  assert.deepEqual(keep.list.script, [item]);
  assert.equal(keep.record.scriptReplaced, false);
  const empty = planImport({ list: l, existing: [], others: [], parsed: parsed([], []), fileName: 'x.xlsx', by: 'K', now: NOW });
  assert.deepEqual(empty.list.script, [item]);
  assert.equal(empty.record.scriptReplaced, false);
  const next: ScriptItem = { ...item, id: 's1', text: 'Hello' };
  const replaced = planImport({ list: l, existing: [], others: [], parsed: parsed([], [next]), fileName: 'x.xlsx', by: 'K', now: NOW });
  assert.deepEqual(replaced.list.script, [next]);
  assert.equal(replaced.record.scriptReplaced, true);
});

test('imports keep the newest MAX_IMPORT_RECORDS', () => {
  let l = list();
  for (let i = 0; i < MAX_IMPORT_RECORDS + 2; i++) {
    l = planImport({ list: l, existing: [], others: [], parsed: parsed([]), fileName: `f${i}.csv`, by: 'K', now: NOW }).list;
  }
  assert.equal(l.imports.length, MAX_IMPORT_RECORDS);
  assert.equal(l.imports[0].fileName, `f${MAX_IMPORT_RECORDS + 1}.csv`);
});

test('healCallList turns a legacy importReport into one ImportRecord', () => {
  const legacy = {
    id: 'l9', name: 'Old', sourceFileName: 'old.xlsx', script: [], createdBy: 'Keenan',
    createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z', deletedAt: null,
    importReport: { imported: 25, skipped: [{ line: 4, reason: 'no org', raw: 'x' }], warnings: [{ line: 5, reason: 'w' }] },
  } as unknown as CallList;
  const healed = healCallList(legacy);
  assert.equal(healed.imports.length, 1);
  assert.deepEqual(healed.imports[0], {
    at: '2026-09-07T00:00:00.000Z', by: 'Keenan', fileName: 'old.xlsx', added: 25, merged: [], alsoIn: [],
    skipped: [{ line: 4, reason: 'no org', raw: 'x' }], warnings: [{ line: 5, reason: 'w' }], scriptReplaced: true,
  });
  assert.equal('importReport' in healed, false);
  assert.equal('sourceFileName' in healed, false);
  assert.deepEqual(healCallList(blankCallList('n', 'New', 'K', NOW)).imports, []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --import tsx --test tests/sales/import-plan.test.ts`
Expected: FAIL — `planImport` / `MAX_IMPORT_RECORDS` not exported.

- [ ] **Step 3: Implement in `src/lib/data/sales-logic.ts`**

Add to the imports at the top:

```ts
import type { ImportRecord, ScriptItem } from '@/lib/types';   // merge into the existing type import
import type { CallList } from '@/lib/types';
import { findMatch } from '@/lib/sales/match';
import { fillBlanks } from '@/lib/sales/merge';
```

Replace `healCallList`:

```ts
export const MAX_IMPORT_RECORDS = 10;

/** Lists written before repeat uploads had one report and a source file name; they become one ImportRecord. */
export function healCallList(l: CallList): CallList {
  l.script ??= [];
  l.script.forEach((s: ScriptItem) => { s.options ??= []; s.response ??= ''; s.showWhen ??= ''; });
  l.createdBy ??= '';
  l.deletedAt ??= null;
  const legacy = l as unknown as { importReport?: { imported: number; skipped: ImportRecord['skipped']; warnings: ImportRecord['warnings'] }; sourceFileName?: string };
  if (!l.imports) {
    l.imports = legacy.importReport
      ? [{
          at: l.createdAt, by: l.createdBy, fileName: legacy.sourceFileName ?? '', added: legacy.importReport.imported,
          merged: [], alsoIn: [], skipped: legacy.importReport.skipped ?? [], warnings: legacy.importReport.warnings ?? [], scriptReplaced: true,
        }]
      : [];
  }
  delete legacy.importReport;
  delete legacy.sourceFileName;
  return l;
}
```

Add after `blankCallSession`:

```ts
/* ------------------------------------------------------------------ *
 * Uploads into a list
 * ------------------------------------------------------------------ */

export interface ParsedSheet {
  contacts: Contact[];
  /** Sheet line of each contact, parallel to `contacts`. */
  lines: number[];
  /** null when the sheet has no Script tab. */
  script: ScriptItem[] | null;
  skipped: ImportRecord['skipped'];
  warnings: ImportRecord['warnings'];
}

export interface ImportPlan {
  list: CallList;
  newContacts: Contact[];
  /** Existing contacts with blanks filled — full rows, ready to upsert. */
  updatedContacts: Contact[];
  record: ImportRecord;
}

/**
 * Everything an upload does, decided in one place so both stores write the
 * same thing. Sheet order is walked once: a row that matches a contact in the
 * list fills that contact's blanks; one that matches a row accepted earlier in
 * this upload fills that; otherwise it is a new contact after the existing
 * ones. Matches in other lists are only reported. Call state is never touched.
 */
export function planImport(input: {
  list: CallList;
  existing: Contact[];
  others: Array<{ list: CallList; contacts: Contact[] }>;
  parsed: ParsedSheet;
  fileName: string;
  by: string;
  now: string;
}): ImportPlan {
  const { list, existing, parsed, now } = input;
  const others = input.others.filter((o) => o.list.id !== list.id && !o.list.deletedAt);
  const record: ImportRecord = {
    at: now, by: input.by, fileName: input.fileName, added: 0, merged: [], alsoIn: [],
    skipped: parsed.skipped, warnings: parsed.warnings, scriptReplaced: false,
  };
  const updated = new Map<string, Contact>();
  const accepted: Contact[] = [];
  let sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0);

  parsed.contacts.forEach((row, i) => {
    const line = parsed.lines[i];
    const inList = findMatch(row, existing);
    if (inList) {
      const base = updated.get(inList.id) ?? inList;
      const { patch, filled } = fillBlanks(base, row);
      if (filled.length > 0) updated.set(inList.id, { ...base, ...patch, updatedAt: now });
      record.merged.push({ line, contactId: inList.id, filled });
    } else {
      const inUpload = findMatch(row, accepted);
      if (inUpload) {
        const { patch, filled } = fillBlanks(inUpload, row);
        Object.assign(inUpload, patch);
        record.merged.push({ line, contactId: inUpload.id, filled });
      } else {
        sortOrder += 1;
        accepted.push({ ...row, listId: list.id, sortOrder, createdAt: now, updatedAt: now });
        record.added += 1;
      }
    }
    for (const o of others) {
      const m = findMatch(row, o.contacts);
      if (m) record.alsoIn.push({ line, contactId: m.id, listId: o.list.id, listName: o.list.name });
    }
  });

  const script = parsed.script && parsed.script.length > 0 ? parsed.script : list.script;
  record.scriptReplaced = script !== list.script;
  const nextList: CallList = { ...list, script, imports: [record, ...list.imports].slice(0, MAX_IMPORT_RECORDS), updatedAt: now };
  return { list: nextList, newContacts: accepted, updatedContacts: [...updated.values()], record };
}
```

- [ ] **Step 4: Run the plan test**

Run: `node --import tsx --test tests/sales/import-plan.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Split the parser in `src/lib/sales/import.ts`**

Change the imports: drop `CallList`, `ImportReport`, `blankCallList`; add `ImportRecord`, `ParsedSheet`:

```ts
import type { Contact, ImportRecord, ScriptItem, ScriptKind, ScriptSection } from '@/lib/types';
import { blankContact, type ParsedSheet } from '@/lib/data/sales-logic';
```

Replace the two type aliases and the result type:

```ts
export type ParseResult = ({ ok: true } & ParsedSheet) | { ok: false; error: string };
type Skipped = ImportRecord['skipped'];
type Warnings = ImportRecord['warnings'];
```

In `contactsFromRows`: change the return type to `{ contacts: Contact[]; lines: number[]; skipped: Skipped; warnings: Warnings }`, declare `const lines: number[] = [];` next to `contacts`, push `lines.push(line);` right before `contacts.push(c);`, return `{ contacts, lines, skipped, warnings }` in both return statements, and delete the `seen` map and the `dupKey` block (the six lines from `const dupKey` to the closing `}` of `if (phoneDigits(c.phone))`). Remove `phoneDigits` from the phone import if it is now unused.

Replace `parseCallListFile` with:

```ts
/**
 * Read one sheet. The list it goes into is decided by the caller; `listId`
 * only stamps the rows. A sheet with no contacts and no script is an error;
 * a script-only sheet is allowed (it replaces the list's script).
 */
export async function parseSheet(opts: { fileName: string; bytes: Uint8Array; listId: string; now: string }): Promise<ParseResult> {
  const read = await readSheets(opts.fileName, opts.bytes);
  if ('error' in read) return { ok: false, error: read.error };
  const c = contactsFromRows(read.contacts, opts.listId, opts.now);
  const s = read.script ? scriptFromRows(read.script) : null;
  if (c.contacts.length === 0 && !(s && s.items.length > 0)) {
    return { ok: false, error: c.skipped[0]?.reason ?? 'No contacts found in the sheet' };
  }
  return {
    ok: true,
    contacts: c.contacts,
    lines: c.lines,
    script: s ? s.items : null,
    skipped: [...c.skipped, ...(s?.skipped ?? [])],
    warnings: [...c.warnings, ...(s?.warnings ?? [])].sort((a, b) => a.line - b.line),
  };
}
```

- [ ] **Step 6: Update `tests/sales/import.test.ts`**

Change the import line to `import { parseSheet, contactsFromRows, scriptFromRows, cellText } from '@/lib/sales/import';` and `opts` to:

```ts
const opts = (fileName: string) => ({
  fileName, bytes: new Uint8Array(readFileSync(`tests/sales/fixtures/${fileName}`)), listId: 'list-1', now: NOW,
});
```

In the first test replace `parseCallListFile(opts(fileName))` with `parseSheet(opts(fileName))`, `const { list, contacts } = r;` with `const { contacts } = r;`, delete the `list.id`, `list.name`, `list.sourceFileName` and `list.importReport.imported` assertions, and change `list.importReport.skipped` → `r.skipped`, `list.importReport.warnings` → `r.warnings` everywhere in the file (the warnings test too). Anything asserting the "Looks like a duplicate" warning is deleted — the third fixture row (`dup`) is now merged by Task 3's plan, not warned about here; in this parser test it is still a separate parsed contact, so `contacts.length` stays 5. Where the file asserts on `list.script`, use `r.script` (an array for the .xlsx, `null` for the .csv).

Also add `lines` coverage to the first test:

```ts
    assert.deepEqual(r.lines, [2, 3, 5, 6, 7]);
```

(line 4 is the skipped row; adjust if the fixture's skipped line differs — the existing assertion `skipped.map(s => s.line)` says which.)

- [ ] **Step 7: Run the sales tests that don't touch stores or export**

Run: `node --import tsx --test tests/sales/import.test.ts tests/sales/import-plan.test.ts tests/sales/match.test.ts tests/sales/merge.test.ts`
Expected: all passing. Any other test file that calls `blankCallList` with five arguments or reads `importReport` (check with `grep -rn "blankCallList\|importReport\|sourceFileName" tests`) is updated to the four-argument form / `imports`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/sales-logic.ts src/lib/sales/import.ts tests/sales/import-plan.test.ts tests/sales/import.test.ts
git commit -m "Sales: planImport, legacy report healing, parseSheet"
```

---

### Task 4: Repository and both stores

**Files:**
- Modify: `src/lib/data/repository.ts` (sales section, ~lines 199–214)
- Modify: `src/lib/data/json-store.ts` (~lines 388–394 `createCallList`; add `updateCallList`, `applyImport`)
- Modify: `src/lib/data/supabase-store.ts` (~lines 505–509 `createCallList`; add `updateCallList`, `applyImport`)

**Interfaces:**
- Produces: `createCallList(list: CallList, actor): Promise<CallList>` (no contacts), `updateCallList(list: CallList, actor): Promise<void>`, `applyImport(list: CallList, newContacts: Contact[], updatedContacts: Contact[], actor): Promise<void>`.

- [ ] **Step 1: Change the interface in `repository.ts`**

Replace the `createCallList` line and its comment with:

```ts
  /** An empty named list. Contacts only ever arrive through applyImport. */
  createCallList(list: CallList, actor: Actor): Promise<CallList>;
  /** Rename, script, imports — the whole row is replaced. */
  updateCallList(list: CallList, actor: Actor): Promise<void>;
  /**
   * One upload: the list row (script + the new import record) first, then the
   * existing contacts whose blanks were filled, then the new contacts. A
   * failure part-way leaves the report saying more was added than exists —
   * visible on the list page, and the next upload of the same sheet repairs it
   * (matching rows merge, missing rows get added). The other order would add
   * contacts the report doesn't mention.
   */
  applyImport(list: CallList, newContacts: Contact[], updatedContacts: Contact[], actor: Actor): Promise<void>;
```

- [ ] **Step 2: `json-store.ts`**

Replace `createCallList` with:

```ts
  async createCallList(list, _actor) {
    return withWrite((db) => {
      db.callLists.push(list);
      return list;
    });
  },

  async updateCallList(list, _actor) {
    await withWrite((db) => {
      const idx = db.callLists.findIndex((l) => l.id === list.id);
      if (idx === -1) throw new Error(`Call list ${list.id} not found`);
      db.callLists[idx] = list;
    });
  },

  async applyImport(list, newContacts, updatedContacts, _actor) {
    await withWrite((db) => {
      const idx = db.callLists.findIndex((l) => l.id === list.id);
      if (idx === -1) throw new Error(`Call list ${list.id} not found`);
      db.callLists[idx] = list;
      for (const u of updatedContacts) {
        const i = db.callContacts.findIndex((c) => c.id === u.id);
        if (i === -1) throw new Error(`Contact ${u.id} not found`);
        db.callContacts[i] = u;
      }
      db.callContacts.push(...newContacts);
    });
  },
```

- [ ] **Step 3: `supabase-store.ts`**

Replace `createCallList` with:

```ts
  async createCallList(list, _actor) {
    await putCallList(list);
    return list;
  },

  async updateCallList(list, _actor) {
    await putCallList(list);
  },

  /* List first, then filled-in contacts, then new contacts. See repository.ts. */
  async applyImport(list, newContacts, updatedContacts, _actor) {
    await putCallList(list);
    await putContacts(updatedContacts);
    await putContacts(newContacts);
  },
```

- [ ] **Step 4: Typecheck the data layer**

Run: `npx tsc --noEmit 2>&1 | grep -v "api/import/base44"`
Expected: only errors in `src/app/sales/actions.ts`, `src/components/sales/*`, `src/app/sales/**/page.tsx` (fixed in Tasks 5–8). No errors under `src/lib`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/repository.ts src/lib/data/json-store.ts src/lib/data/supabase-store.ts
git commit -m "Sales: createCallList without contacts; updateCallList; applyImport"
```

---

### Task 5: Server actions

**Files:**
- Modify: `src/app/sales/actions.ts` (lines 10, 22–47: replace `uploadCallList`)

**Interfaces:**
- Consumes: `parseSheet`, `planImport`, `blankCallList`, `repo.createCallList/updateCallList/applyImport/listCallLists/getCallList`.
- Produces: `createCallList(name: string): Promise<{ ok: true; listId: string } | { ok: false; error: string }>`, `renameCallList(listId, name): Promise<{ ok: true } | { ok: false; error: string }>`, `uploadIntoList(listId: string, formData: FormData): Promise<UploadResult>` where `UploadResult = { ok: true; added: number; merged: number; alsoIn: number } | { ok: false; error: string }`.

- [ ] **Step 1: Replace the upload section**

Change the import `import { parseCallListFile } from '@/lib/sales/import';` to `import { parseSheet } from '@/lib/sales/import';` and add `blankCallList, planImport` to the sales-logic import. Replace `UploadResult` and `uploadCallList` with:

```ts
export type ListResult = { ok: true; listId: string } | { ok: false; error: string };

export async function createCallList(name: string): Promise<ListResult> {
  await requireRole('staff');
  const actor = await currentActor();
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Give the list a name' };
  const list = blankCallList(newId(), trimmed, actor.name, new Date().toISOString());
  await repo.createCallList(list, actor);
  revalidatePath('/sales');
  return { ok: true, listId: list.id };
}

export async function renameCallList(listId: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Give the list a name' };
  const bundle = await repo.getCallList(listId);
  if (!bundle) return { ok: false, error: 'That list is gone' };
  await repo.updateCallList({ ...bundle.list, name: trimmed, updatedAt: new Date().toISOString() }, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${listId}`);
  return { ok: true };
}

export type UploadResult = { ok: true; added: number; merged: number; alsoIn: number } | { ok: false; error: string };

/** Add a sheet's rows to an existing list. The rules are planImport's; this only reads, plans and writes. */
export async function uploadIntoList(listId: string, formData: FormData): Promise<UploadResult> {
  await requireRole('staff');
  const actor = await currentActor();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose an .xlsx or .csv file' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'That file is over 5 MB — a call list should be far smaller' };

  const bundle = await repo.getCallList(listId);
  if (!bundle) return { ok: false, error: 'That list is gone' };
  const now = new Date().toISOString();
  const parsed = await parseSheet({ fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), listId, now });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const otherLists = (await repo.listCallLists()).filter((l) => l.id !== listId);
  const others = (await Promise.all(otherLists.map((l) => repo.getCallList(l.id)))).filter((b) => b !== null);

  const plan = planImport({ list: bundle.list, existing: bundle.contacts, others, parsed, fileName: file.name, by: actor.name, now });
  await repo.applyImport(plan.list, plan.newContacts, plan.updatedContacts, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${listId}`);
  return { ok: true, added: plan.record.added, merged: plan.record.merged.length, alsoIn: plan.record.alsoIn.length };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "api/import/base44"`
Expected: no errors under `src/app/sales/actions.ts`; remaining errors only in components/pages.

- [ ] **Step 3: Commit**

```bash
git add src/app/sales/actions.ts
git commit -m "Sales: createCallList, renameCallList, uploadIntoList actions"
```

---

### Task 6: Landing page — New list form and list cards

**Files:**
- Create: `src/components/sales/new-list-form.tsx`
- Delete: `src/components/sales/upload-form.tsx` (its replacement for the list page is Task 7)
- Modify: `src/components/sales/list-card.tsx` (line 17 and the "Uploaded …" line)
- Modify: `src/app/sales/page.tsx` (upload card → new-list card; copy)

- [ ] **Step 1: Create `src/components/sales/new-list-form.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCallList } from '@/app/sales/actions';

/** A list is a name. Contacts come later, by uploading sheets into it. */
export function NewListForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createCallList(name);
      if (res.ok) router.push(`/sales/${res.listId}`);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">List name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beer league, Youth, High school" className="mt-1" required />
        </label>
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">
          {pending ? 'Creating…' : 'Create list'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-muted">One list per kind of team. You add contacts to it by uploading spreadsheets, as many times as you like.</p>
    </form>
  );
}
```

- [ ] **Step 2: Delete `src/components/sales/upload-form.tsx`**

```bash
git rm src/components/sales/upload-form.tsx
```

- [ ] **Step 3: `list-card.tsx`**

Replace line 17 (`const problems = …`) with:

```ts
  const latest = list.imports[0];
  const problems = latest ? latest.skipped.length + latest.warnings.length : 0;
```

Replace the `<p className="text-xs text-muted">Uploaded …</p>` with:

```tsx
          <p className="text-xs text-muted">
            Created {formatShort(timestampDay(list.createdAt, BUSINESS_TIMEZONE))} by {list.createdBy || '—'}
            {' · '}{list.imports.length} upload{list.imports.length === 1 ? '' : 's'}
            {problems > 0 && <> · <span className="text-amber-300">{problems} import note{problems === 1 ? '' : 's'}</span></>}
          </p>
```

- [ ] **Step 4: `src/app/sales/page.tsx`**

Replace the `UploadForm` import with `import { NewListForm } from '@/components/sales/new-list-form';`, the subtitle with `Cold calling. One list per kind of team; upload sheets into it and call from the top.`, the card with:

```tsx
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">New list</h2>
        <NewListForm />
      </Card>
```

and the empty-state hint with `Create a list above, then upload a sheet into it.`

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "api/import/base44"`
Expected: remaining errors only in `src/app/sales/[id]/page.tsx` (`ImportReportPanel`), fixed next.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales/new-list-form.tsx src/components/sales/list-card.tsx src/app/sales/page.tsx
git commit -m "Sales landing: create a list by name; cards show upload count"
```

---

### Task 7: List page — Add contacts, imports panel, rename

**Files:**
- Create: `src/components/sales/add-contacts-form.tsx`
- Create: `src/components/sales/rename-list.tsx`
- Modify: `src/components/sales/import-report.tsx` → replace contents with `ImportsPanel`
- Modify: `src/app/sales/[id]/page.tsx` (header h1, the report line ~75, add the upload card, empty-state copy)

- [ ] **Step 1: `add-contacts-form.tsx`**

```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadIntoList } from '@/app/sales/actions';

/**
 * Upload a sheet into this list. Rows that match a contact already here (same
 * phone or email) fill its blanks; the rest are added. The report is
 * persisted on the list and shown below after the page refreshes.
 */
export function AddContactsForm({ listId }: { listId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const form = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadIntoList(listId, fd);
      if (!res.ok) { setError(res.error); return; }
      setDone(`${res.added} added · ${res.merged} matched existing contacts${res.alsoIn ? ` · ${res.alsoIn} also in another list` : ''}`);
      form.current?.reset();
      setFileName('');
      router.refresh();
    });
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted">Spreadsheet (.xlsx or .csv)</span>
          <input type="file" name="file" accept=".xlsx,.csv" required onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} className="mt-1 block w-full text-sm" />
          {fileName && <span className="mt-1 block truncate text-xs text-muted">{fileName}</span>}
        </label>
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-lg bg-ppc-gold px-4 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {done && <p className="text-sm text-emerald-300">{done}</p>}
      <p className="text-xs text-muted">
        Same{' '}
        <a href="/templates/powerplay-call-list-template.xlsx" download className="font-semibold text-ppc-gold hover:underline">blank template</a>
        {' '}as always. A row with the same phone or email as a contact already here fills in that contact's blanks instead of being added twice. A Script tab replaces this list's script; leave it out to keep the current one.
      </p>
    </form>
  );
}
```

- [ ] **Step 2: `rename-list.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renameCallList } from '@/app/sales/actions';

/** The list's name as the page title, with a pencil that turns it into an input. */
export function RenameList({ listId, name }: { listId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <span className="truncate">{name}</span>
        <button type="button" onClick={() => { setValue(name); setEditing(true); }} className="text-sm font-normal text-muted hover:text-ppc-gold" aria-label="Rename list">✎</button>
      </h1>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await renameCallList(listId, value);
          if (!res.ok) { setError(res.error); return; }
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} className="text-xl font-bold" autoFocus />
      <button type="submit" disabled={pending} className="rounded-lg bg-ppc-gold px-3 py-1.5 text-sm font-bold text-black disabled:opacity-50">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancel</button>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </form>
  );
}
```

- [ ] **Step 3: Replace `import-report.tsx` with the imports panel**

```tsx
import Link from 'next/link';
import type { Contact, ImportRecord } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';

function summary(r: ImportRecord): string {
  const bits = [`${r.added} added`, `${r.merged.length} matched`];
  if (r.alsoIn.length) bits.push(`${r.alsoIn.length} also in another list`);
  if (r.skipped.length) bits.push(`${r.skipped.length} skipped`);
  if (r.warnings.length) bits.push(`${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}`);
  if (r.scriptReplaced) bits.push('script replaced');
  return bits.join(' · ');
}

/**
 * What each upload did. The latest opens to its detail; earlier ones are one
 * line each. No 'use client' — the list page renders it on the server.
 */
export function ImportsPanel({ imports, contacts, listId }: { imports: ImportRecord[]; contacts: Contact[]; listId: string }) {
  if (imports.length === 0) return null;
  const [latest, ...earlier] = imports;
  const nameOf = (id: string) => { const c = contacts.find((x) => x.id === id); return c ? (c.contactName || c.orgName || '—') : 'Removed contact'; };
  const tone = latest.skipped.length + latest.warnings.length > 0 ? 'border-amber-500/50 bg-amber-500/10 text-amber-100/90' : 'border-line bg-surface text-muted';
  return (
    <div className="space-y-2">
      <details className={`rounded-lg border px-3.5 py-2.5 text-sm ${tone}`}>
        <summary className="cursor-pointer font-semibold">
          Last upload: {latest.fileName} — {summary(latest)} <span className="font-normal opacity-70">· {formatTimestamp(latest.at, BUSINESS_TIMEZONE)} by {latest.by || '—'}</span>
        </summary>
        <div className="mt-2 space-y-2">
          {latest.merged.length > 0 && (
            <div>
              <p className="font-semibold">Matched an existing contact:</p>
              <ul className="ml-4 list-disc">
                {latest.merged.map((m, i) => (
                  <li key={i}>Line {m.line} → <Link href={`/sales/${listId}/contacts/${m.contactId}`} className="font-semibold hover:text-ppc-gold">{nameOf(m.contactId)}</Link>{m.filled.length ? ` — filled ${m.filled.join(', ')}` : ' — already up to date'}</li>
                ))}
              </ul>
            </div>
          )}
          {latest.alsoIn.length > 0 && (
            <div>
              <p className="font-semibold">Also in another list:</p>
              <ul className="ml-4 list-disc">
                {latest.alsoIn.map((a, i) => (
                  <li key={i}>Line {a.line} is also in <Link href={`/sales/${a.listId}/contacts/${a.contactId}`} className="font-semibold hover:text-ppc-gold">{a.listName}</Link></li>
                ))}
              </ul>
            </div>
          )}
          {latest.skipped.length > 0 && (
            <div>
              <p className="font-semibold">Skipped rows (fix the sheet and re-upload):</p>
              <ul className="ml-4 list-disc">
                {latest.skipped.map((s, i) => <li key={i}>Line {s.line}: {s.reason}{s.raw ? <span className="opacity-70"> — {s.raw}</span> : null}</li>)}
              </ul>
            </div>
          )}
          {latest.warnings.length > 0 && (
            <div>
              <p className="font-semibold">Kept as typed, worth a look:</p>
              <ul className="ml-4 list-disc">
                {latest.warnings.map((w, i) => <li key={i}>Line {w.line}: {w.reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      </details>
      {earlier.length > 0 && (
        <details className="rounded-lg border border-line px-3.5 py-2 text-sm text-muted">
          <summary className="cursor-pointer">Earlier uploads <span className="ml-1">{earlier.length}</span></summary>
          <ul className="mt-2 space-y-1">
            {earlier.map((r, i) => <li key={i}>{formatTimestamp(r.at, BUSINESS_TIMEZONE)} · {r.fileName} — {summary(r)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `src/app/sales/[id]/page.tsx`**

Change the import to `import { ImportsPanel } from '@/components/sales/import-report';` and add `import { AddContactsForm } from '@/components/sales/add-contacts-form';` and `import { RenameList } from '@/components/sales/rename-list';`. Replace `<h1 className="truncate text-2xl font-bold">{bundle.list.name}</h1>` with `<RenameList listId={id} name={bundle.list.name} />`. Replace `<ImportReportPanel report={bundle.list.importReport} />` with:

```tsx
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">Add contacts</h2>
        <AddContactsForm listId={id} />
      </Card>

      <ImportsPanel imports={bundle.list.imports} contacts={bundle.contacts} listId={id} />
```

In the `EmptyState` for no contacts, change the hint to: `q ? 'Try a different search.' : bundle.contacts.length === 0 ? 'Upload a sheet above to add the first contacts.' : 'Nothing in this group yet.'`.

- [ ] **Step 5: Typecheck and tests**

Run: `npx tsc --noEmit 2>&1 | grep -v "api/import/base44"` → nothing. Run: `npm test` → all passing (fix any test that still builds a `CallList` literal with old fields, e.g. `tests/sales/export.test.ts`).

- [ ] **Step 6: Browser check**

Start the worktree server (`npm run dev -- -p 3001`), unlock, `/sales`: create "Beer league" → lands on its page → upload `tests/sales/fixtures/sample-list.xlsx` → report shows "4 added · 1 matched" (the fixture's line 5 is a deliberate same-phone duplicate of line 2, so it fills that contact's blanks instead of becoming a second Eagles row) → upload the same file again → "0 added · 5 matched", contacts still 4 → rename works. Create "Youth", upload the same sheet: "4 added · 1 matched · 5 also in another list"; the report links to Beer league.

- [ ] **Step 7: Commit**

```bash
git add src/components/sales/add-contacts-form.tsx src/components/sales/rename-list.tsx src/components/sales/import-report.tsx "src/app/sales/[id]/page.tsx"
git commit -m "Sales list page: add contacts by upload, imports panel, rename"
```

---

### Task 8: "Also in" on contact pages

**Files:**
- Create: `src/components/sales/also-in.tsx`
- Modify: `src/app/sales/[id]/contacts/[contactId]/page.tsx`
- Modify: `src/app/sales/[id]/call/page.tsx`
- Modify: `src/components/sales/call-view/index.tsx` (props + ContactPanel call)
- Modify: `src/components/sales/call-view/contact-panel.tsx` (prop + line under the header)

**Interfaces:**
- Consumes: `alsoIn`, `AlsoIn` from `src/lib/sales/match.ts`.
- Produces: `AlsoInLine({ items: AlsoIn[] })`; `CallViewProps.alsoIn: Record<string, AlsoIn[]>`; `ContactPanel` prop `alsoIn?: AlsoIn[]`.

- [ ] **Step 1: `also-in.tsx`**

```tsx
import Link from 'next/link';
import type { AlsoIn } from '@/lib/sales/match';

/** "Also in: Beer league" — the same phone or email in another list. Server-safe. */
export function AlsoInLine({ items }: { items: AlsoIn[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-xs text-muted">
      Also in:{' '}
      {items.map((a, i) => (
        <span key={a.listId}>
          {i > 0 && ', '}
          <Link href={`/sales/${a.listId}/contacts/${a.contactId}`} className="font-semibold text-ppc-gold hover:underline">{a.listName}</Link>
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 2: Contact page**

In `src/app/sales/[id]/contacts/[contactId]/page.tsx` add `import { alsoIn } from '@/lib/sales/match';` and `import { AlsoInLine } from '@/components/sales/also-in';`. After `sessionsById` compute:

```ts
  const otherLists = (await repo.listCallLists()).filter((l) => l.id !== id);
  const others = (await Promise.all(otherLists.map((l) => repo.getCallList(l.id)))).filter((b) => b !== null);
  const elsewhere = alsoIn(contact, others);
```

Render `<AlsoInLine items={elsewhere} />` directly under the "Viewing only" paragraph.

- [ ] **Step 3: Call page**

In `src/app/sales/[id]/call/page.tsx` add the same two imports (`alsoIn`, and `type AlsoIn`), compute after `queue`:

```ts
  const otherLists = (await repo.listCallLists()).filter((l) => l.id !== id);
  const others = (await Promise.all(otherLists.map((l) => repo.getCallList(l.id)))).filter((b) => b !== null);
  const elsewhere: Record<string, AlsoIn[]> = {};
  for (const c of bundle.contacts) { const a = alsoIn(c, others); if (a.length) elsewhere[c.id] = a; }
```

and pass `alsoIn={elsewhere}` to `<CallView>`.

- [ ] **Step 4: CallView and ContactPanel**

`index.tsx`: add `import type { AlsoIn } from '@/lib/sales/match';`, `alsoIn: Record<string, AlsoIn[]>;` to `CallViewProps`, and pass `alsoIn={props.alsoIn[current.id] ?? []}` to `<ContactPanel>`.

`contact-panel.tsx`: add `import { AlsoInLine } from '../also-in';` and `import type { AlsoIn } from '@/lib/sales/match';`, prop `alsoIn?: AlsoIn[]` (default `[]`), and render `<AlsoInLine items={alsoIn} />` right after the `<p className="mt-1 flex flex-wrap gap-2 text-xs">` badges line.

- [ ] **Step 5: Typecheck, tests, browser**

`npx tsc --noEmit 2>&1 | grep -v "api/import/base44"` → nothing; `npm test` → passing. Browser: with Beer league and Youth both holding the sample sheet, open an Eagles contact in Youth → "Also in: Beer league" links to the Beer league row; the calling view shows the same line; a contact in a list on its own shows nothing.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales/also-in.tsx "src/app/sales/[id]/contacts/[contactId]/page.tsx" "src/app/sales/[id]/call/page.tsx" src/components/sales/call-view/index.tsx src/components/sales/call-view/contact-panel.tsx
git commit -m "Sales: Also in — the same person in another list"
```

---

### Task 9: Template note, docs, verification, finish

**Files:**
- Modify: `scripts/build-call-template.mjs` (the Read Me lines), regenerate `public/templates/powerplay-call-list-template.xlsx` and the fixtures
- Modify: `CLAUDE.md` (Sales section: the "One upload = one CallList" bullet; add matching + also-in bullets)
- Modify: `docs/superpowers/plans/2026-09-08-sales-master-lists.md` — tick boxes as you go

- [ ] **Step 1: Template Read Me**

In `scripts/build-call-template.mjs`, find the Read Me line that says each upload makes a new list (grep `new list`) and replace it with: `Upload this into a list on the Sales page as often as you like. A row with the same phone or email as a contact already in the list fills in that contact's blanks instead of being added twice. The Script tab is optional once the list has a script; include it to replace the script.` Then:

```bash
npm run build:template
node --import tsx scripts/build-call-template.mjs --sample tests/sales/fixtures/sample-list.xlsx --csv tests/sales/fixtures/sample-list.csv
npm test
```

- [ ] **Step 2: CLAUDE.md**

Replace the bullet `**One upload = one CallList.** …` with:

```markdown
- **A list is a name; uploads add to it.** `createCallList(name)` makes an
  empty list; `uploadIntoList` appends a sheet. Every upload is an
  `ImportRecord` on `list.imports` (newest first, last 10). `Contact.raw`
  keeps every cell as typed, including columns we don't know — they show
  under *Other info* and export.
- **Same phone or same email = the same person** (`sales/match.ts`:
  digits only, leading 1 dropped, emails lowercased). Inside a list a match
  **fills blanks and changes nothing else** (`sales/merge.ts` — never call
  state, never Do Not Call). Across lists it is added and flagged; *Also in*
  is computed on render by the same matcher and never stored. `planImport`
  in `sales-logic.ts` is the only place these rules meet; stores just write
  list → updated contacts → new contacts.
```

- [ ] **Step 3: Full verification**

```bash
npx tsc --noEmit 2>&1 | grep -v "api/import/base44"   # nothing
npm test                                               # all passing
npm run lint                                           # no new errors in src/app/sales or src/components/sales
npm run build                                          # fails only on src/app/api/import/base44/route.ts (known)
```

Browser walkthrough on the worktree server: landing (create, cards), list page (upload twice, rename, imports panel with merged links), contact page (Also in), calling view (Also in line, everything else unchanged), delete list. Existing list from before this change still opens and shows its old report as "Last upload".

- [ ] **Step 4: Commit and finish**

```bash
git add scripts/build-call-template.mjs public/templates/powerplay-call-list-template.xlsx tests/sales/fixtures CLAUDE.md docs/superpowers/plans/2026-09-08-sales-master-lists.md
git commit -m "Docs: master lists rules; template Read Me"
```

Then use superpowers:finishing-a-development-branch. No database migration is needed: `call_lists.data` is JSONB and `healCallList` converts old rows on read.
