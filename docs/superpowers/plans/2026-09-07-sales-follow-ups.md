# Sales Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five follow-up changes to the Sales cold-calling section: ultra-wide Sales layout, a "Call finished" dialog for the outcome, a jersey-manager question that flags and links contacts at the same team, a read-only contact page, and a session log.

**Architecture:** Same layering as the first release — types in `types.ts`, pure rules in `src/lib/data/sales-logic.ts`, both stores behind `Repository`, server actions in `src/app/sales/actions.ts`, client components under `src/components/sales/`. Linked contacts are derived from the organisation name (no new storage); sessions are one small row each with an id on every call log.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, `node --test` via tsx, exceljs (template), read-excel-file (import).

**Spec:** `docs/superpowers/specs/2026-09-07-sales-follow-ups-design.md` (extends `2026-09-06-sales-cold-calling-design.md`).

## Global Constraints

- No pricing, money or deal-value field anywhere.
- Calendar dates are `YYYY-MM-DD` strings through `src/lib/dates.ts`; instants are ISO strings; never `new Date('YYYY-MM-DD')`.
- Never discard user input; an unanswered jersey-manager question changes nothing.
- Rules only in `src/lib/data/sales-logic.ts` (pure); stores only read and write; every action `requireRole('staff')` → `currentActor()` → `repo` → `revalidatePath`.
- Contacts at the same team are linked by `orgKey(orgName)` and never merged; at most one `isJerseyManager` per linked team.
- Width change applies to Sales routes only (`body:has(.sales-wide)`).
- Session storage cost: one `CallSession` row per session, one `sessionId` per log, nothing else.
- Enums are `as const` arrays; `SCRIPT_KINDS` gains `'jersey_manager'`; the sheet label is "Jersey manager".
- Typecheck: `npx tsc --noEmit 2>&1 | grep -v "api/import/base44"` must be empty (three pre-existing errors in that file are out of scope). `npm test` must stay green (37 before this plan).
- Commit after every task; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File map

| Path | Responsibility |
|---|---|
| `src/lib/types.ts` (modify) | `'jersey_manager'` kind; `Contact.isJerseyManager`; `JerseyManagerAnswer`; `CallLog.sessionId`, `CallLog.jerseyManager`; `CallSession` |
| `src/lib/constants.ts` (modify) | `SCRIPT_KIND_LABELS` (sheet labels ↔ kinds) |
| `src/lib/data/sales-logic.ts` (modify) | `orgKey`, `linkedContacts`, `contactFromPerson`, `planJerseyManager`, `sessionTallyFor`, `sessionEnd`, `blankCallSession`, heal + validation updates |
| `src/lib/data/repository.ts`, `json-store.ts`, `supabase-store.ts`, `seed.ts` (modify) | sessions; `addCallLog` extra patches; bundle.sessions |
| `supabase/migrations/0005_call_sessions.sql` (new), `scripts/migrate-to-supabase.mjs` (modify) | the table |
| `src/app/sales/actions.ts` (modify) | `logCall` plan wiring; `startSession`; `endSession` |
| `src/lib/sales/import.ts`, `export.ts`, `default-script.json`, `scripts/build-call-template.mjs` (modify) | kind label mapping; two export columns; shipped q1; Kind dropdown |
| `src/app/sales/layout.tsx` (new), `src/app/globals.css` (modify) | width |
| `src/components/sales/call-view/finish-dialog.tsx`, `call-summary.tsx` (new); `index.tsx`, `use-keyboard.ts`, `use-draft.ts`, `use-timers.ts`, `footer-bar.tsx`, `script-panel.tsx`, `contact-panel.tsx`, `history.tsx` (modify) | dialog, summary, question UI, linked list, sessions |
| `src/app/sales/[id]/contacts/[contactId]/page.tsx` (new); `src/app/sales/[id]/page.tsx`, `src/app/sales/page.tsx` (modify); `src/components/sales/sessions-panel.tsx` (new) | contact page, links, Mgr chip, sessions list |
| `tests/sales/follow-ups.test.ts` (new); `export.test.ts`, `import.test.ts`, `sales-logic.test.ts` (modify) | coverage |

---

### Task 1: Types, labels, rules

**Files:** Modify `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/data/sales-logic.ts`, `tests/sales/sales-logic.test.ts` (rename `referralContactFrom` usage); Create `tests/sales/follow-ups.test.ts`.

**Interfaces produced:**
```ts
// types.ts
SCRIPT_KINDS = ['read','reminder','question','objection','jersey_manager'] as const
Contact.isJerseyManager: boolean
interface JerseyManagerAnswer { answer: '' | 'self' | 'other'; existingContactId: string; person: { name; role; phone; email; note } }
CallLog.sessionId: string | null; CallLog.jerseyManager: JerseyManagerAnswer
interface CallSession { id; listId; callerName; startedAt; endedAt: string | null; createdAt; updatedAt }
// constants.ts
SCRIPT_KIND_LABELS: Record<ScriptKind, string> = { read:'Read', reminder:'Reminder', question:'Question', objection:'Objection', jersey_manager:'Jersey manager' }
// sales-logic.ts
blankJerseyManager(): JerseyManagerAnswer
blankCallSession(id, listId, callerName, now): CallSession
healCallSession(s)
orgKey(name: string): string
linkedContacts(contact: Contact, all: Contact[]): Contact[]
contactFromPerson(source: Contact, person: {name;role;phone;email;note?}, now: string, opts: { isJerseyManager: boolean; reason: string }): Contact
planJerseyManager(contact, linked, log, now): { currentPatch: Partial<Contact>; otherPatches: Array<{id; patch: Partial<Contact>}>; newContact: Contact | null }
sessionTallyFor(logs, sessionId): { calls; reached; voicemails; callbacks; infoSent }
sessionEnd(session, logs): string
validateCallLog(input, contact, opts: { replacing: boolean; linkedIds?: string[]; sessionIds?: string[] })
```
`referralContactFrom(source, log, now)` is kept as a thin wrapper: `contactFromPerson(source, log.referral, now, { isJerseyManager: false, reason: \`Referred by ${name}\` })`.

- [ ] **Step 1: Write `tests/sales/follow-ups.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallLog, CallSession, Contact } from '@/lib/types';
import {
  blankContact, blankCallLogInput, orgKey, linkedContacts, contactFromPerson, planJerseyManager,
  sessionTallyFor, sessionEnd, healContact, healCallLog, validateCallLog, blankCallSession,
} from '@/lib/data/sales-logic';

const NOW = '2026-09-07T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Ennismore Eagles', contactName: 'Jamie', phone: '705', ...over });
const g = (over: Partial<CallLog> = {}): CallLog => ({ ...blankCallLogInput(NOW), id: 'g1', listId: 'l1', contactId: 'c1', endedAt: NOW, createdAt: NOW, updatedAt: NOW, ...over });

test('orgKey and linkedContacts', () => {
  assert.equal(orgKey('  Ennismore   Eagles '), 'ennismore eagles');
  const all = [c(), c({ id: 'c2', orgName: 'ennismore eagles', contactName: 'Pat', sortOrder: 3 }), c({ id: 'c3', orgName: 'Kelowna', listId: 'l1' }), c({ id: 'c4', listId: 'l2' }), c({ id: 'c5', sortOrder: 2 })];
  assert.deepEqual(linkedContacts(all[0], all).map((x) => x.id), ['c5', 'c2']);
  assert.deepEqual(linkedContacts(c({ id: 'zz', orgName: '' }), all), []);
});

test('contactFromPerson copies the team, names the person, flags manager when asked', () => {
  const n = contactFromPerson(c({ city: 'Ennismore', priority: 'A' }), { name: 'Sam Lee', role: 'Treasurer', phone: '705 555 0100', email: 's@x.ca', note: 'evenings' }, NOW, { isJerseyManager: true, reason: 'Named as jersey manager by Jamie' });
  assert.equal(n.orgName, 'Ennismore Eagles'); assert.equal(n.city, 'Ennismore'); assert.equal(n.priority, 'A');
  assert.equal(n.contactName, 'Sam Lee'); assert.equal(n.role, 'Treasurer'); assert.equal(n.phone, '705 555 0100');
  assert.equal(n.isJerseyManager, true); assert.equal(n.source, 'referral'); assert.equal(n.referredFromContactId, 'c1');
  assert.match(n.notes, /Named as jersey manager by Jamie/); assert.match(n.notes, /evenings/);
  assert.equal(n.sortOrder, 1); assert.equal(n.callCount, 0);
});

test('planJerseyManager: self, other-existing, other-new, other-empty, unanswered', () => {
  const me = c(); const pat = c({ id: 'c2', contactName: 'Pat', isJerseyManager: true }); const linked = [pat];
  const self = planJerseyManager(me, linked, g({ jerseyManager: { answer: 'self', existingContactId: '', person: { name: '', role: '', phone: '', email: '', note: '' } } }), NOW);
  assert.equal(self.currentPatch.isJerseyManager, true); assert.deepEqual(self.otherPatches, [{ id: 'c2', patch: { isJerseyManager: false } }]); assert.equal(self.newContact, null);
  const existing = planJerseyManager(c({ isJerseyManager: true }), [c({ id: 'c2', contactName: 'Pat' })], g({ jerseyManager: { answer: 'other', existingContactId: 'c2', person: { name: '', role: '', phone: '', email: '', note: '' } } }), NOW);
  assert.equal(existing.currentPatch.isJerseyManager, false); assert.deepEqual(existing.otherPatches, [{ id: 'c2', patch: { isJerseyManager: true } }]); assert.equal(existing.newContact, null);
  const fresh = planJerseyManager(me, linked, g({ jerseyManager: { answer: 'other', existingContactId: '', person: { name: 'Sam', role: '', phone: '', email: '', note: '' } } }), NOW);
  assert.equal(fresh.currentPatch.isJerseyManager, false); assert.deepEqual(fresh.otherPatches, [{ id: 'c2', patch: { isJerseyManager: false } }]); assert.equal(fresh.newContact?.contactName, 'Sam'); assert.equal(fresh.newContact?.isJerseyManager, true);
  const empty = planJerseyManager(me, linked, g({ jerseyManager: { answer: 'other', existingContactId: '', person: { name: '', role: '', phone: '', email: '', note: '' } } }), NOW);
  assert.deepEqual(empty, { currentPatch: {}, otherPatches: [], newContact: null });
  const none = planJerseyManager(me, linked, g(), NOW);
  assert.deepEqual(none, { currentPatch: {}, otherPatches: [], newContact: null });
});

test('sessionTallyFor and sessionEnd', () => {
  const logs = [g({ id: '1', sessionId: 's1', outcome: 'voicemail', endedAt: '2026-09-07T20:10:00.000Z' }), g({ id: '2', sessionId: 's1', outcome: 'callback', endedAt: '2026-09-07T20:20:00.000Z' }), g({ id: '3', sessionId: 's2', outcome: 'send_info' }), g({ id: '4', sessionId: null, outcome: 'interested' })];
  assert.deepEqual(sessionTallyFor(logs, 's1'), { calls: 2, reached: 1, voicemails: 1, callbacks: 1, infoSent: 0 });
  const open: CallSession = blankCallSession('s1', 'l1', 'Keenan', '2026-09-07T20:00:00.000Z');
  assert.equal(sessionEnd(open, logs), '2026-09-07T20:20:00.000Z');
  assert.equal(sessionEnd({ ...open, endedAt: '2026-09-07T21:00:00.000Z' }, logs), '2026-09-07T21:00:00.000Z');
  assert.equal(sessionEnd({ ...open, id: 's9' }, logs), '2026-09-07T20:00:00.000Z');
});

test('heal defaults and validation of foreign ids', () => {
  assert.equal(healContact({ id: 'x', listId: 'l', orgName: 'O' } as unknown as Contact).isJerseyManager, false);
  const h = healCallLog({ id: 'g', outcome: 'no_answer' } as unknown as CallLog);
  assert.equal(h.sessionId, null); assert.equal(h.jerseyManager.answer, '');
  const base = { ...blankCallLogInput(NOW), outcome: 'no_answer' as const };
  assert.ok(validateCallLog({ ...base, jerseyManager: { answer: 'other', existingContactId: 'nope', person: base.jerseyManager.person } }, c(), { replacing: false, linkedIds: ['c2'] }).blocking.jerseyManager);
  assert.deepEqual(validateCallLog({ ...base, jerseyManager: { answer: 'other', existingContactId: 'c2', person: base.jerseyManager.person } }, c(), { replacing: false, linkedIds: ['c2'] }).blocking, {});
  assert.ok(validateCallLog({ ...base, sessionId: 'zz' }, c(), { replacing: false, sessionIds: ['s1'] }).blocking.sessionId);
  assert.deepEqual(validateCallLog({ ...base, sessionId: 's1' }, c(), { replacing: false, sessionIds: ['s1'] }).blocking, {});
  assert.deepEqual(validateCallLog({ ...base, sessionId: null }, c(), { replacing: false, sessionIds: [] }).blocking, {});
});
```

- [ ] **Step 2: Run it — expect module/export failures.** `node --import tsx --test tests/sales/follow-ups.test.ts`

- [ ] **Step 3: Types and labels.** In `types.ts`: extend `SCRIPT_KINDS`; add `isJerseyManager: boolean` to `Contact` after `notes`/`raw`; add `JerseyManagerAnswer`; add `sessionId: string | null` and `jerseyManager: JerseyManagerAnswer` to `CallLog` after `newPhone`; add `CallSession`. In `constants.ts` add `SCRIPT_KIND_LABELS` (import `ScriptKind`).

- [ ] **Step 4: Rules in `sales-logic.ts`.** Add to `blankContact`: `isJerseyManager: false`. `blankJerseyManager()`; `blankCallLogInput` gains `sessionId: null, jerseyManager: blankJerseyManager()`. `healCallLog` fills both (it iterates the blank's keys, so it already does once the blank has them; add `g.jerseyManager.person ??= …` guard). `healCallSession(s)`: `s.endedAt ??= null`. Then:

```ts
export function orgKey(name: string): string { return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }

/** Same list, same organisation, not itself. Linked by name on purpose: nothing to type, nothing to store. */
export function linkedContacts(contact: Contact, all: Contact[]): Contact[] {
  const key = orgKey(contact.orgName);
  if (!key) return [];
  return all
    .filter((x) => x.id !== contact.id && x.listId === contact.listId && orgKey(x.orgName) === key)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export interface NamedPerson { name: string; role: string; phone: string; email: string; note?: string }

export function contactFromPerson(source: Contact, p: NamedPerson, now: string, opts: { isJerseyManager: boolean; reason: string }): Contact {
  return {
    ...blankContact(source.listId, source.sortOrder, now),
    source: 'referral', referredFromContactId: source.id,
    orgName: source.orgName, orgType: source.orgType, city: source.city, province: source.province,
    timezoneOverride: source.timezoneOverride, league: source.league, ageDivisions: source.ageDivisions,
    teams: source.teams, players: source.players, seasonStartMonth: source.seasonStartMonth,
    orderingMonth: source.orderingMonth, currentSupplier: source.currentSupplier,
    lastOrderedYear: source.lastOrderedYear, colours: source.colours, website: source.website,
    social: source.social, leadSource: 'Referral', priority: source.priority, bestTimeToCall: source.bestTimeToCall,
    contactName: p.name.trim(), role: p.role.trim(), phone: p.phone.trim(), email: p.email.trim(),
    isJerseyManager: opts.isJerseyManager,
    notes: [opts.reason, (p.note ?? '').trim()].filter(Boolean).join(' — '),
  };
}

export function referralContactFrom(source: Contact, log: CallLog, now: string): Contact {
  return contactFromPerson(source, log.referral, now, { isJerseyManager: false, reason: `Referred by ${source.contactName.trim() || source.orgName.trim() || 'a previous contact'}` });
}

export interface JerseyManagerPlan { currentPatch: Partial<Contact>; otherPatches: Array<{ id: string; patch: Partial<Contact> }>; newContact: Contact | null }

export function planJerseyManager(contact: Contact, linked: Contact[], log: CallLog, now: string): JerseyManagerPlan {
  const jm = log.jerseyManager;
  const nothing: JerseyManagerPlan = { currentPatch: {}, otherPatches: [], newContact: null };
  if (jm.answer === '') return nothing;
  const clearOthers = (except?: string) => linked.filter((x) => x.id !== except && x.isJerseyManager).map((x) => ({ id: x.id, patch: { isJerseyManager: false } as Partial<Contact> }));
  if (jm.answer === 'self') return { currentPatch: { isJerseyManager: true }, otherPatches: clearOthers(), newContact: null };
  if (jm.existingContactId) {
    const target = linked.find((x) => x.id === jm.existingContactId);
    if (!target) return nothing;
    return { currentPatch: { isJerseyManager: false }, otherPatches: [...clearOthers(target.id), { id: target.id, patch: { isJerseyManager: true } }], newContact: null };
  }
  if (jm.person.name.trim() || jm.person.phone.trim()) {
    const who = contact.contactName.trim() || contact.orgName.trim() || 'a previous contact';
    return { currentPatch: { isJerseyManager: false }, otherPatches: clearOthers(), newContact: contactFromPerson(contact, jm.person, now, { isJerseyManager: true, reason: `Named as jersey manager by ${who}` }) };
  }
  return nothing;
}
```
Note the "other-existing" test expects `[{ id: 'c2', patch: { isJerseyManager: true } }]` only — `clearOthers(target.id)` yields nothing there because c2 is the target and no other linked contact has the flag; keep the order `[...clearOthers, target]`.

```ts
export function blankCallSession(id: string, listId: string, callerName: string, now: string): CallSession {
  return { id, listId, callerName, startedAt: now, endedAt: null, createdAt: now, updatedAt: now };
}
export function healCallSession(s: CallSession): CallSession { s.endedAt ??= null; s.callerName ??= ''; return s; }

const TALKED: ReadonlySet<CallOutcome> = new Set(['callback','send_info','interested','meeting_booked','not_now','not_interested','do_not_call']);
export function sessionTallyFor(logs: CallLog[], sessionId: string | null) {
  const mine = sessionId ? logs.filter((g) => g.sessionId === sessionId) : [];
  return { calls: mine.length, reached: mine.filter((g) => TALKED.has(g.outcome)).length, voicemails: mine.filter((g) => g.outcome === 'voicemail').length, callbacks: mine.filter((g) => g.outcome === 'callback').length, infoSent: mine.filter((g) => g.outcome === 'send_info').length };
}
/** When a session ended: as recorded, else its last call, else its start. */
export function sessionEnd(session: CallSession, logs: CallLog[]): string {
  if (session.endedAt) return session.endedAt;
  const last = logs.filter((g) => g.sessionId === session.id).map((g) => g.endedAt).sort().at(-1);
  return last ?? session.startedAt;
}
```
Validation: extend `opts` with `linkedIds?: string[]; sessionIds?: string[]`; blocking `jerseyManager` when `answer` invalid or (`existingContactId` && `linkedIds` given && not included); blocking `sessionId` when non-null and `sessionIds` given and not included. Reuse the existing `sessionTally` — leave it (tests use it).

- [ ] **Step 5: Run `npm test` — expect 43 passing (37 + 6).** Update `tests/sales/sales-logic.test.ts` only if `referralContactFrom` moved; it stays.

- [ ] **Step 6: Commit** `Sales follow-ups: types and rules — linked contacts, jersey manager, sessions`

---

### Task 2: Storage — sessions, extra patches, migration 0005

**Files:** Modify `src/lib/data/repository.ts`, `json-store.ts`, `supabase-store.ts`, `seed.ts`, `index.ts` (no change needed unless a type is added), `scripts/migrate-to-supabase.mjs`; Create `supabase/migrations/0005_call_sessions.sql`.

**Interfaces produced:**
```ts
CallListBundle.sessions: CallSession[]            // newest first
listCallSessions(listId): Promise<CallSession[]>
createCallSession(session: CallSession, actor): Promise<CallSession>
endCallSession(id: string, endedAt: string, actor): Promise<void>
addCallLog(log, contactPatch, newContact: Contact | null, actor, extraPatches?: Array<{ id: string; patch: Partial<Contact> }>): Promise<void>
```
Write order in both stores: log → current contact → each extra patch → new contact. `Database` gains `callSessions: CallSession[]` (heal `??= []`, `healCallSession`); seed adds `callSessions: []`. Supabase: const `CALL_SESSIONS = 'call_sessions'`, `putCallSession`, reads `select('id, data')` ordered by `started_at desc`. Migration:

```sql
-- Sales — calling sessions. One tiny row per session; each call log carries sessionId inside its data.
create table if not exists public.call_sessions (
  id uuid primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  data jsonb not null,
  started_at timestamptz generated always as (public.ts_utc(data->>'startedAt')) stored
);
create index if not exists call_sessions_list_idx on public.call_sessions (list_id, started_at desc);
alter table public.call_sessions enable row level security;
```
Migrate script: push `call_sessions` rows `{ id, list_id, data }` after `call_logs`, and add to the verify loop.

- [ ] Implement; `npx tsc --noEmit | grep -v base44` empty; `npm test` 43; smoke via `node --import tsx scratch.mts` creating a session in the JSON store and reading the bundle; delete the scratch file.
- [ ] Commit `Sales follow-ups: sessions table, extra contact patches in both stores`

---

### Task 3: Actions

**Files:** Modify `src/app/sales/actions.ts`.

- `logCall`: after validation (pass `linkedIds` = `linkedContacts(contact, bundle.contacts).map(id)` and `sessionIds` = `bundle.sessions.map(id)` — load the bundle with `repo.getCallList(listId)`), compute `plan = planJerseyManager(contact, linked, log, now)`; `contactPatch = { ...applyCallLog(...), ...plan.currentPatch }`; `newContact = log.outcome === 'referred' ? { ...referralContactFrom(contact, log, now), id: newId() } : plan.newContact ? { ...plan.newContact, id: newId() } : null` (a Referred call that also names a new manager: the manager wins — the referral is still recorded on the log); `repo.addCallLog(log, contactPatch, newContact, actor, plan.otherPatches)`. Return `{ ok, log, contact, referral: newContact, warnings, others: plan.otherPatches }` so the client can update linked contacts' flags locally.
- `updateCallLog`: unchanged except `sessionIds` validation (pass `[]`? no — pass the bundle's ids; an edit keeps its original `sessionId`: `log = { ...existing, ...input, sessionId: existing.sessionId }`).
- `startSession(listId, callerName)`: `requireRole`; bundle; end every open session in the list at `sessionEnd(s, bundle.logs)`; create `blankCallSession(newId(), listId, callerName.trim() || actor.name, now)`; `revalidatePath('/sales/[id]')`; return `{ ok: true, session }`.
- `endSession(listId, sessionId)`: ends it at now if it belongs to the list and is open; idempotent.
- [ ] tsc clean; commit `Sales follow-ups: actions — session start/end, manager plan wiring`

---

### Task 4: Sheet — kind label, shipped question, template, export

**Files:** Modify `src/lib/sales/import.ts` (`scriptFromRows`: map the Kind cell through a reverse of `SCRIPT_KIND_LABELS`, case-insensitive, before the enum check), `src/lib/sales/default-script.json` (item 7 → `"kind": "jersey_manager"`, text `"Who handles the jerseys for [Org] — is that you, or someone else?"`, `options: []`), `scripts/build-call-template.mjs` (Kind dropdown `"Read,Reminder,Question,Objection,Jersey manager"`; write `SCRIPT_KIND_LABELS[item.kind]` instead of `cap(item.kind)` — import the labels from `../src/lib/constants.ts`), `src/lib/sales/export.ts` (columns `Jersey Manager` (Y/N) and `Linked Contacts` after `Source`; `linkedContacts(c, contacts).map(x => x.contactName || x.role || '—').join('; ')`), tests: `import.test.ts` (script[6].kind === 'jersey_manager', options.length 0; a `scriptFromRows` row with Kind "Jersey manager" → kind `jersey_manager`), `export.test.ts` (header[33] 'Source', header[34] 'Jersey Manager', header[35] 'Linked Contacts'; the Eagles rows link to each other: `row[35]` contains 'Jamie Ouellette').
- [ ] Regenerate: `npm run build:template && node --import tsx scripts/build-call-template.mjs --sample tests/sales/fixtures/sample-list.xlsx --csv tests/sales/fixtures/sample-list.csv`; `npm test` green (46 expected: +2 import, +1 export).
- [ ] Commit `Sales follow-ups: Jersey manager script kind, export columns, template`

---

### Task 5: Ultra-wide Sales layout

**Files:** Create `src/app/sales/layout.tsx`; Modify `src/app/globals.css`, `src/app/sales/page.tsx` (grid `2xl:grid-cols-4`), `src/components/sales/call-view/footer-bar.tsx` (`max-w-[120rem]`), `src/components/sales/call-view/index.tsx` (grid: `lg:grid-cols-2 2xl:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,4fr)]`; three `<section>`s: contact; script; notes+summary with `lg:col-start-2 2xl:col-start-3 2xl:row-start-1`).

`layout.tsx`:
```tsx
export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return <div className="sales-wide">{children}</div>;
}
```
`globals.css` (after the body rule):
```css
/* Sales is used on an ultra-wide monitor: let those routes use the width. */
body:has(.sales-wide) :is(header > div, main) { max-width: 120rem; }
```
- [ ] Verify in the browser at 1280 and 2000px widths. Commit `Sales follow-ups: ultra-wide layout for Sales routes`

---

### Task 6: Call finished dialog

**Files:** Create `src/components/sales/call-view/finish-dialog.tsx`, `call-summary.tsx`; Modify `index.tsx`, `use-keyboard.ts`, `footer-bar.tsx`.

`FinishDialog({ open, contact, draft, onChange, editing, errors, warnings, missing, canSave, saveState, error, saveLabel, onCancel, onSave, today })` — overlay `fixed inset-0 z-50 bg-black/70`, panel `max-w-3xl` with `role="dialog" aria-modal="true" aria-labelledby`, auto-focus the panel, `Esc` → `onCancel`, Tab loop within the panel's focusables. Body: `StarRating` + `OutcomePanel` (unchanged component) + missing/error line + buttons.

`CallSummary({ draft, onOpen, loggedThisSession, onEdit })`: card "Call" — when a session log exists: "Logged as <badge> <time> · Edit"; else rating stars (read-only) + outcome chip or "No outcome yet" + `Change…`/`Call finished` button.

`FooterBar`: replace `canSave/onSave/saveLabel/saveState/error/missing` with `onFinish`, `finishLabel` ('Call finished' | 'Edit call'), `finishDisabled` (DNC or summary-showing), keep tally/help. `useCallKeys` handlers gain `onFinish`; mapping: `Ctrl+Enter` → `onFinish` (index decides: open dialog, or save if open and canSave); outcome keys → `onOutcome(i)` (index: select and open); `Esc` outside text → `onEscape` (close dialog).

`index.tsx`: state `finishOpen`; `openFinish()`; `save()` closes the dialog on success; `startEdit()` opens it; the page's right column renders notes + `CallSummary`.
- [ ] Browser: open by button, by `2`, by Ctrl+Enter (synthetic); Esc closes and keeps the choice; save advances; edit through the dialog. Commit `Sales follow-ups: Call finished dialog`

---

### Task 7: Jersey manager question UI, linked contacts, badges

**Files:** Modify `use-draft.ts` (`CallDraft.jerseyManager: JerseyManagerAnswer`, blank via `blankJerseyManager`), `script-panel.tsx` (kind `jersey_manager`; props gain `linked: Contact[]`, `jerseyManager`, `onJerseyManager(patch)`), `contact-panel.tsx` (props gain `linked: Contact[]`, `listId`; badge + "Also at this team" list linking to `/sales/${listId}/contacts/${id}`), `index.tsx` (compute `linked = linkedContacts(current, Object.values(contacts))`; `inputFromDraft` carries `jerseyManager`; on save apply `res.others` to local contacts; `draftFromLog` copies `jerseyManager`), `src/app/sales/[id]/page.tsx` (Mgr chip).

Question UI: two buttons (`ChoiceGroup`-style) "This person" / "Someone else" → sets `jerseyManager.answer` and `answers[qid]` label. When `other`: if `linked.length` a `<select>` "Who?" with `''` → "— choose —", each linked contact, and `__new__` → "Someone new…"; when `__new__` or no linked: fields Name, Role (select from `SALES_PICKLISTS.role`), Phone, Email, Note.
- [ ] Browser: all three branches on the sample list (Eagles has a duplicate row → linked). Commit `Sales follow-ups: jersey manager question, linked contacts, manager badge`

---

### Task 8: Contact page and links

**Files:** Create `src/app/sales/[id]/contacts/[contactId]/page.tsx`; Modify `src/app/sales/[id]/page.tsx` (row and Due-today links → contact page).

Page: `force-dynamic`; await params; bundle or 404; contact or 404; `linked`; `logs` for the contact; sessions map; header with back link, name, org, Mgr/DNC badges; `Button href=… variant="primary"` "Start call" → `/sales/${id}/call?c=${contactId}` (hidden for DNC); `<Card className="p-4"><ContactPanel contact logs script linked listId sessionsById /></Card>`.
- [ ] Browser: table row → page; Start call → calling view at that contact; linked names cross-link. Commit `Sales follow-ups: read-only contact page`

---

### Task 9: Sessions — lifecycle, tally, list panel, history

**Files:** Modify `use-timers.ts` (`useCallSession(listId, callerName)` → `{ session: {id, startedAt} | null, seconds, end(): Promise<void> }` using `startSession`/`endSession`; storage key JSON), `index.tsx` (session id into `inputFromDraft`; footer tally `sessionTallyFor(logs, session?.id)`; back link `onClick` → `end()`), `history.tsx` (show "Session <start time>" when `sessionsById[log.sessionId]`), `contact-panel.tsx` (pass through), `src/app/sales/[id]/page.tsx` (render `SessionsPanel`), Create `src/components/sales/sessions-panel.tsx` (server-safe: `sessions`, `logs`, `contacts`, `listId`; `<details>` per session; "open" when `endedAt` null and started < 12 h ago).
- [ ] Browser: start calling → session row appears on the list page with calls after saving; back link ends it; a second start after that creates a new one. Commit `Sales follow-ups: session log`

---

### Task 10: Docs, verification, migration, merge

- [ ] `CLAUDE.md` Sales section: add bullets — linked contacts are derived from the organisation name and never merged; the jersey manager is a flag with at most one per team; sessions are one row each; the dialog is the only place an outcome is chosen; `next build` note unchanged.
- [ ] `npm test` (46), filtered tsc empty, `npm run lint` (no new warnings in sales files), `npm run build` (expected to fail only on the Base44 route).
- [ ] Browser walkthrough of every item at two widths.
- [ ] Ask Keenan before applying `0005_call_sessions.sql` to Supabase; apply via the connector; verify tables.
- [ ] Finish: merge to main (ff), remove worktree, hand over.

---

## Self-review

Spec coverage: §2 → T1/T2; §3 → T1; §4 → T2/T3; §5 width → T5, dialog → T6, question/linked/badges → T7, contact page → T8, sessions → T9, export/template → T4; §6 tests → T1/T4 + browser in T6–T9; §7 files → map. Type consistency: `contactFromPerson(source, person, now, { isJerseyManager, reason })` used in T1 and T3; `planJerseyManager` return shape used in T3 and T7 (`res.others`); `addCallLog` fifth parameter in T2 and T3; `sessionTallyFor(logs, sessionId)` in T1 and T9; `SCRIPT_KIND_LABELS` in T1 and T4; `useCallSession` in T9 only. Placeholders: none.
