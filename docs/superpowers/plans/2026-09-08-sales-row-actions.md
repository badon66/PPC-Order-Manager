# Sales Row Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double-click a row of a list's contacts table for *Change status*, *Quick edit* and *Delete*.

**Architecture:** One client component (`row-actions.tsx`) wraps each table row and owns the menu and three dialogs. Change status builds a zero-duration `CallLogInput` and goes through the existing `logCall` rule; quick edit writes an eight-field allowlist through `updateContact`; delete is a new repository method (logs first, then the contact). Pure helpers and tests in `sales-logic.ts`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-08-sales-row-actions-design.md`

## Global Constraints

- Call state is written only through `applyCallLog` (via `logCall`); the quick status never patches `lastOutcome` directly.
- Quick edit writes only `QUICK_EDIT_FIELDS` plus `updatedAt`; never `raw`, call state, flags or ids.
- Every action: `requireRole('staff')` → `currentActor()` → rules → `repo` → `revalidatePath`.
- Typecheck gate: `npx tsc --noEmit 2>&1 | grep -v "api/import/base44"` prints nothing. `npm test` passes.

---

### Task 1: Pure helpers and tests

**Files:** Modify `src/lib/data/sales-logic.ts` (after `planImport`); Test `tests/sales/row-actions.test.ts`.

**Produces:**
```ts
export const QUICK_EDIT_FIELDS = ['contactName', 'role', 'phone', 'altPhone', 'email', 'bestTimeToCall', 'priority', 'notes'] as const;
export type QuickEditField = (typeof QUICK_EDIT_FIELDS)[number];
export type QuickEditPatch = Pick<Contact, QuickEditField>;
export function quickEditPatch(raw: Record<string, unknown>): { ok: true; patch: QuickEditPatch } | { ok: false; error: string };
export function quickLogInput(input: CallLogInput, callerName: string, now: string): CallLogInput;
```

- [ ] Write `tests/sales/row-actions.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contact } from '@/lib/types';
import { blankContact, blankCallLogInput, quickEditPatch, quickLogInput, validateCallLog, QUICK_EDIT_FIELDS } from '@/lib/data/sales-logic';

const NOW = '2026-09-08T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', phone: '705 555 0142', ...over });

test('quickEditPatch keeps only the allowlisted fields, trimmed', () => {
  const r = quickEditPatch({ contactName: '  Jamie ', role: 'Coach', phone: '705 555 0142 ', altPhone: '', email: 'J@x.ca', bestTimeToCall: 'Evenings', priority: 'b', notes: 'n', callCount: 99, isJerseyManager: true, raw: { x: 1 } });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(Object.keys(r.patch).sort(), [...QUICK_EDIT_FIELDS].sort());
  assert.equal(r.patch.contactName, 'Jamie');
  assert.equal(r.patch.phone, '705 555 0142');
  assert.equal(r.patch.priority, 'B');
  assert.equal('callCount' in r.patch, false);
});

test('quickEditPatch: missing fields become empty, bad priority is refused', () => {
  const r = quickEditPatch({});
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.patch.contactName, '');
  const bad = quickEditPatch({ priority: 'Z' });
  assert.ok(!bad.ok);
});

test('quickLogInput is a zero-duration call stamped with the caller, no session', () => {
  const q = quickLogInput({ ...blankCallLogInput('2026-01-01T00:00:00.000Z'), outcome: 'voicemail', notes: 'left msg', sessionId: 'stale', durationSeconds: 500 }, 'Keenan', NOW);
  assert.equal(q.startedAt, NOW);
  assert.equal(q.endedAt, NOW);
  assert.equal(q.durationSeconds, 0);
  assert.equal(q.sessionId, null);
  assert.equal(q.callerName, 'Keenan');
  assert.equal(q.outcome, 'voicemail');
  assert.equal(q.notes, 'left msg');
  assert.deepEqual(validateCallLog(q, c(), { replacing: false }).blocking, {});
  const dnc = validateCallLog(q, c({ doNotCall: true }), { replacing: false });
  assert.ok(Object.keys(dnc.blocking).length > 0, 'a Do Not Call contact refuses other outcomes');
});
```

- [ ] Run `node --import tsx --test tests/sales/row-actions.test.ts` → fails (not exported).
- [ ] Add to `sales-logic.ts`:

```ts
/* ------------------------------------------------------------------ *
 * Row actions on the contacts table
 * ------------------------------------------------------------------ */

/** What Quick edit may change. Team fields stay as uploaded; call state and flags are never here. */
export const QUICK_EDIT_FIELDS = ['contactName', 'role', 'phone', 'altPhone', 'email', 'bestTimeToCall', 'priority', 'notes'] as const;
export type QuickEditField = (typeof QUICK_EDIT_FIELDS)[number];
export type QuickEditPatch = Pick<Contact, QuickEditField>;

export function quickEditPatch(raw: Record<string, unknown>): { ok: true; patch: QuickEditPatch } | { ok: false; error: string } {
  const text = (k: string) => String(raw[k] ?? '').trim();
  const p = text('priority').toUpperCase();
  if (p !== '' && p !== 'A' && p !== 'B' && p !== 'C') return { ok: false, error: 'Priority is A, B, C or blank' };
  return {
    ok: true,
    patch: {
      contactName: text('contactName'), role: text('role'), phone: text('phone'), altPhone: text('altPhone'),
      email: text('email'), bestTimeToCall: text('bestTimeToCall'), priority: p, notes: text('notes'),
    },
  };
}

/** A status set from the table: the same log as a call, with no time on the line and no session. */
export function quickLogInput(input: CallLogInput, callerName: string, now: string): CallLogInput {
  return { ...input, startedAt: now, endedAt: now, durationSeconds: 0, callerName, sessionId: null };
}
```

- [ ] Test passes → `git commit -m "Sales: quick edit allowlist and quick status input"`.

### Task 2: Repository `deleteContact`

**Files:** `src/lib/data/repository.ts` (sales section), `src/lib/data/json-store.ts`, `src/lib/data/supabase-store.ts`.

- [ ] Interface, after `updateContact`:
```ts
  /** Logs first, then the contact — a failure part-way leaves a contact with no history, visible and deletable again. */
  deleteContact(id: string, actor: Actor): Promise<void>;
```
- [ ] json-store:
```ts
  async deleteContact(id, _actor) {
    await withWrite((db) => {
      db.callLogs = db.callLogs.filter((g) => g.contactId !== id);
      db.callContacts = db.callContacts.filter((c) => c.id !== id);
    });
  },
```
- [ ] supabase-store:
```ts
  /* Logs first, then the contact. See repository.ts. */
  async deleteContact(id, _actor) {
    const logs = await supabase().from(CALL_LOGS).delete().eq('contact_id', id);
    if (logs.error) throw new Error(`delete call logs: ${logs.error.message}`);
    const row = await supabase().from(CALL_CONTACTS).delete().eq('id', id);
    if (row.error) throw new Error(`delete contact: ${row.error.message}`);
  },
```
- [ ] tsc clean → commit `Sales: deleteContact in both stores`.

### Task 3: Actions

**Files:** `src/app/sales/actions.ts`.

- [ ] Add imports `quickEditPatch, quickLogInput, type QuickEditPatch` from sales-logic; add after `updateCallLog`:

```ts
/** Status set from the contacts table: a zero-duration call through the same rule as the calling view. */
export async function quickStatus(listId: string, contactId: string, raw: CallLogInput, callerName: string): Promise<LogCallResult> {
  await requireRole('staff');
  const actor = await currentActor();
  return logCall(listId, contactId, quickLogInput(raw, String(callerName ?? '').trim() || actor.name, new Date().toISOString()));
}

export async function quickEditContact(listId: string, contactId: string, raw: Record<string, unknown>): Promise<{ ok: true; contact: Contact } | { ok: false; error: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  const r = quickEditPatch(raw);
  if (!r.ok) return r;
  const contact = await repo.updateContact(contactId, r.patch satisfies QuickEditPatch, actor);
  revalidatePath(`/sales/${listId}`);
  revalidatePath(`/sales/${listId}/contacts/${contactId}`);
  return { ok: true, contact };
}

export async function deleteContact(listId: string, contactId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  const existing = await repo.getContact(contactId);
  if (!existing || existing.listId !== listId) return { ok: false, error: 'That contact is gone' };
  await repo.deleteContact(contactId, actor);
  revalidatePath('/sales');
  revalidatePath(`/sales/${listId}`);
  return { ok: true };
}
```
- [ ] tsc clean → commit `Sales: quickStatus, quickEditContact, deleteContact actions`.

### Task 4: Row actions UI

**Files:** Create `src/components/sales/row-actions.tsx`; modify `src/app/sales/[id]/page.tsx` (table rows).

- [ ] `row-actions.tsx` (client): `RowActions({ listId, contact, callCount, today, callerDefault, children })` renders `<tr onDoubleClick>` with a positioned menu (`fixed`, at the pointer, `role="menu"`), and three dialogs sharing the `finish-dialog` look:
  - **Status**: `useState<CallDraft>(blankDraft(now))`; `OutcomePanel` with `seedForOutcome` on pick; `StarRating` is inside the panel; note field = `draft.notes`; Save calls `quickStatus(listId, contact.id, inputFromDraft(draft, callerName, now, null), callerName)`; shows `res.error` / `res.errors` on failure; on success closes and `router.refresh()`. Do Not Call contacts get the same panel (the server refuses other outcomes; the panel's disabled prop stays false so the reason can be typed) — show a one-line note above.
  - **Quick edit**: eight inputs (role and best time as `<select>` from `SALES_PICKLISTS`, priority as a select of blank/A/B/C, notes a textarea); Save calls `quickEditContact`.
  - **Delete**: text "Delete {name} · {org}? {n} logged call(s) go with it." Cancel / Delete (red); calls `deleteContact`.
  - Caller name via `useCallerName(callerDefault)`.
- [ ] Page: pass `today={day}` and `callerDefault={user?.name ?? ''}` (add `currentUser` import); count logs per contact once (`const logCounts = …`); render each `<tr>` through `<RowActions>` keeping the existing cells as children. Add a hint under the table: "Double-click a row for status, edit and delete."
- [ ] tsc, lint, `npm test`; browser: double-click opens the menu; status → Voicemail saves, row badge and calls count update; quick edit changes the phone; delete removes the row after confirm; Esc closes everything.
- [ ] Commit `Sales: double-click row actions — status, quick edit, delete`.

### Task 5: Docs and finish

- [ ] CLAUDE.md Sales section: one bullet on row actions (quick status is a real log; quick edit allowlist; delete removes logs).
- [ ] `npm test`, filtered tsc, `npm run build` (Base44 failure only), commit, finishing-a-development-branch (merge to local main).
