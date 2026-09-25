# Customer Order Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers see a timeline of their order on the team's page and the order sheet, and Keenan sends a short branded email at each stage from a panel on the staff order page, with the approval action moving the order into production on its own.

**Architecture:** Two pure modules do the thinking: `timeline.ts` turns an order plus its change log into timeline steps, and `customer-updates-logic.ts` decides which emails are due and where an approval sends the order. `update-mail.ts` composes the twelve emails on a layout shared with the confirmation email. One server module (`customer-updates.ts`) composes, sends, records. Pages render `Timeline`; the staff page adds `SendUpdatePanel`. Settings are one row with three strings.

**Tech Stack:** Next.js (app router, server actions), TypeScript, node:test via `npm test` (`node --import tsx --test "tests/**/*.test.ts"`, `@/` → `src/`), nodemailer via `src/lib/mail.ts`, Supabase (jsonb rows) or the JSON store, Tailwind classes already in use (`text-ppc-gold`, `border-line`, `bg-surface`, `text-muted`, `bg-surface-2`).

Spec: `docs/superpowers/specs/2026-09-25-customer-order-status-design.md`.

## Global Constraints

- **Money rule** (CLAUDE.md): "No pricing, money, or invoicing anywhere." The one exception: the three request emails (`initial_deposit_requested`, `production_deposit_requested`, `final_payment_requested`) carry an `amount` string typed into the send panel. It goes into that email only. It is never stored on the order, never on the timeline, never in the change log, never on a form. Tests assert `$` appears in no other email.
- **Dates never pass through a timezone.** Calendar dates are `YYYY-MM-DD` strings; use `formatLong`, `today`, `timestampDay` from `src/lib/dates.ts`. Never `new Date(str)` a date-only string.
- **Emails ask first.** Nothing sends on a status change. Only `approval_confirmed` is automatic (inside `approveOrder`).
- **Best effort mail.** A failed send is a log line and a message in the panel, never a thrown error that breaks a page or an approval.
- **Contact details never render on a public page** except the existing contact block on `/share`. The timeline carries no email addresses.
- **Copy voice:** plain words, short sentences, first name, "Keenan" by name. Company facts to use where they fit: made in Calgary; free mockup the same day; production usually 2 to 4 weeks; free shipping across Canada; cross-border orders can be held at customs; reorders next season use the same design with no setup.
- **How to pay default:** "E-transfer to info@powerplaycustoms.ca (no fee), or pay by card (3% processing fee). Put your team name in the message."
- Run `npx tsc --noEmit -p .` and `npm test` before every commit. All existing tests must keep passing (105 at the start).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

Create:
- `src/lib/data/timeline.ts` — pure: `timelineOf`, `everInStatus`, `PRODUCTION_NOTE`, step definitions.
- `src/lib/data/customer-updates-logic.ts` — pure: `dueUpdates`, `recipientOf`, `statusAfterApproval`, `MONEY_STAGES`.
- `src/lib/data/mail-layout.ts` — pure: the shared HTML shell and pieces; constants moved out of `intake-mail.ts`.
- `src/lib/data/update-mail.ts` — pure: `composeUpdateMail` for the twelve stages.
- `src/lib/customer-updates.ts` — server: `sendCustomerUpdate`.
- `src/app/orders/[id]/update-actions.ts` — server actions `sendUpdateAction`.
- `src/app/settings/page.tsx`, `src/app/settings/actions.ts` — the settings page.
- `src/components/timeline.tsx`, `src/components/send-update-panel.tsx`.
- `supabase/migrations/0006_app_settings.sql`.
- Tests under `tests/status/`.

Modify:
- `src/lib/types.ts` — `UpdateStage`, `CustomerEmailRecord`, `AppSettings`, `Order.customerEmails`, `ChangeAction`.
- `src/lib/order-utils.ts` — `blankOrder` gets `customerEmails: []`.
- `src/lib/data/logic.ts` — `healOrder`, `UNLOGGED`, `healSettings`, `rosterLinkView` and `publicViewOf` gain `timeline`.
- `src/lib/data/repository.ts` — `recordCustomerEmail`, `getSettings`, `saveSettings`, `timeline` on the two public views.
- `src/lib/data/json-store.ts`, `src/lib/data/supabase-store.ts` — implement the three methods; pass history into the views.
- `src/lib/data/intake-mail.ts` — refactored onto `mail-layout.ts`, same output.
- `src/app/share/[token]/actions.ts` — approval moves the status and sends the receipt.
- `src/app/roster/[token]/page.tsx`, `src/app/share/[token]/page.tsx`, `src/app/orders/[id]/page.tsx` — render the timeline (and the panel).
- `src/app/layout.tsx` — Settings link.
- `CLAUDE.md` — one sentence on the money exception.

---

### Task 1: Types, defaults, healing

**Files:**
- Modify: `src/lib/types.ts` (after `ORDER_STATUSES`, and in `Order`, and `ChangeAction`)
- Modify: `src/lib/order-utils.ts:344` (`blankOrder`)
- Modify: `src/lib/data/logic.ts:44` (`healOrder`), `:94` (`UNLOGGED`)
- Test: `tests/status/types.test.ts`

**Interfaces:**
- Produces: `UpdateStage`, `UPDATE_STAGES`, `UPDATE_STAGE_LABEL`, `CustomerEmailRecord`, `AppSettings`, `DEFAULT_APP_SETTINGS`, `Order.customerEmails`, `ChangeAction` member `'customer_emailed'`, `healSettings(s)`.

- [ ] **Step 1: Write the failing test**

`tests/status/types.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healOrder, healSettings } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import { DEFAULT_APP_SETTINGS, UPDATE_STAGES, UPDATE_STAGE_LABEL } from '@/lib/types';
import type { Order } from '@/lib/types';

test('a blank order has no customer emails yet, and old rows are healed to the same', () => {
  assert.deepEqual(blankOrder().customerEmails, []);
  const o = blankOrder() as Partial<Order>;
  delete o.customerEmails;
  assert.deepEqual(healOrder(o as Order).customerEmails, []);
});

test('there are twelve stages and every one has a label', () => {
  assert.equal(UPDATE_STAGES.length, 12);
  for (const s of UPDATE_STAGES) assert.ok(UPDATE_STAGE_LABEL[s].length > 3, s);
});

test('settings heal to the defaults, and the default how-to-pay names both ways to pay', () => {
  const s = healSettings({});
  assert.deepEqual(s, DEFAULT_APP_SETTINGS);
  assert.match(s.howToPay, /info@powerplaycustoms\.ca/);
  assert.match(s.howToPay, /3%/);
  assert.equal(healSettings({ howToPay: 'cash' }).howToPay, 'cash');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test 2>&1 | grep -E "types.test|fail"`
Expected: fails to compile / import (`healSettings`, `UPDATE_STAGES` not exported).

- [ ] **Step 3: Add the types**

In `src/lib/types.ts`, directly after `export type OrderStatus = ...`:
```ts
/* ------------------------------------------------------------------ *
 * Customer updates
 *
 * The emails Keenan can send a team as their order moves, one per stage.
 * Design: docs/superpowers/specs/2026-09-25-customer-order-status-design.md
 * ------------------------------------------------------------------ */

export const UPDATE_STAGES = [
  'design_talk',
  'finalizing_details',
  'initial_deposit_requested',
  'initial_deposit_received',
  'proof_ready',
  'approval_confirmed',
  'production_deposit_requested',
  'production_deposit_received',
  'in_production',
  'final_payment_requested',
  'shipped',
  'completed',
] as const;
export type UpdateStage = (typeof UPDATE_STAGES)[number];

/** How the staff panel and the history name each email. */
export const UPDATE_STAGE_LABEL: Record<UpdateStage, string> = {
  design_talk: 'Send us your logos and inspiration',
  finalizing_details: 'Roster and contact details',
  initial_deposit_requested: 'Initial deposit requested',
  initial_deposit_received: 'Initial deposit received',
  proof_ready: 'Proof ready to approve',
  approval_confirmed: 'Approval confirmed',
  production_deposit_requested: 'Pre-production deposit requested',
  production_deposit_received: 'Pre-production deposit received',
  in_production: 'In production',
  final_payment_requested: 'Final payment requested',
  shipped: 'Shipped',
  completed: 'Thanks and review',
};

/** One email that went out. No amount is ever recorded here — see the money rule. */
export interface CustomerEmailRecord {
  stage: UpdateStage;
  /** ISO instant. */
  sentAt: string;
  to: string;
  messageId: string;
}

/** One row of app-wide settings. Three strings Keenan writes once. */
export interface AppSettings {
  /** Prefilled into the three request emails, editable before sending. */
  howToPay: string;
  /** The Google review link; empty hides the button in the Completed email. */
  googleReviewUrl: string;
  /** The referral sentence in the Completed email; empty hides it. */
  referralLine: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  howToPay:
    'E-transfer to info@powerplaycustoms.ca (no fee), or pay by card (3% processing fee). Put your team name in the message.',
  googleReviewUrl: '',
  referralLine:
    "Know another team that needs jerseys? Send them our way and mention your team, and we'll look after you both.",
};
```

In `Order` (after `deliveryConcern: string;`):
```ts
  /** The update emails sent to this team, one record per send. */
  customerEmails: CustomerEmailRecord[];
```

In `ChangeAction`, add a member after `'approved'`:
```ts
  | 'customer_emailed'
```

- [ ] **Step 4: Defaults and healing**

`src/lib/order-utils.ts`, inside `blankOrder()` after `deliveryConcern: '',`:
```ts
    customerEmails: [],
```

`src/lib/data/logic.ts`: import `AppSettings, DEFAULT_APP_SETTINGS` from `@/lib/types` (add to the existing import). In `healOrder`, after `o.enquiry ??= null;`:
```ts
  o.customerEmails ??= [];
```
Change `UNLOGGED` to:
```ts
const UNLOGGED = new Set(['updatedAt', 'createdAt', 'id', 'shareToken', 'rosterToken', 'sets', 'customerEmails']);
```
Add after `healRosterEntry`:
```ts
/** Settings rows written before a field existed get the default for it. */
export function healSettings(s: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    howToPay: s?.howToPay ?? DEFAULT_APP_SETTINGS.howToPay,
    googleReviewUrl: s?.googleReviewUrl ?? DEFAULT_APP_SETTINGS.googleReviewUrl,
    referralLine: s?.referralLine ?? DEFAULT_APP_SETTINGS.referralLine,
  };
}
```

- [ ] **Step 5: Type-check and test**

Run: `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `pass 108`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/order-utils.ts src/lib/data/logic.ts tests/status/types.test.ts
git commit -m "Customer updates: stages, email records and settings types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The timeline (pure)

**Files:**
- Create: `src/lib/data/timeline.ts`
- Test: `tests/status/timeline.test.ts`

**Interfaces:**
- Consumes: `STATUS_META` from `@/lib/constants`; `formatLong`, `timestampDay` from `@/lib/dates`; `ChangeLogEntry`, `Order`, `OrderStatus` from `@/lib/types`.
- Produces:
  ```ts
  export const PRODUCTION_NOTE: string;
  export type TimelineStepKey = 'received'|'designing'|'finalizing'|'initial_deposit'|'proof'|'production_deposit'|'in_production'|'final_check'|'final_payment'|'shipped'|'delivered';
  export interface TimelineStep { key: TimelineStepKey; label: string; state: 'done'|'current'|'upcoming'; copy: string; date: string|null; detail: string|null; note: string|null; }
  export type TimelineInput = Pick<Order,'status'|'estimatedFinishDate'|'trackingCode'|'approvedBy'|'approvedDate'|'approvalRecord'|'createdAt'>;
  export function everInStatus(status: OrderStatus, history: ChangeLogEntry[], current: OrderStatus): boolean;
  export function timelineOf(order: TimelineInput, history: ChangeLogEntry[]): TimelineStep[];
  ```

- [ ] **Step 1: Write the failing tests**

`tests/status/timeline.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION_NOTE, everInStatus, timelineOf } from '@/lib/data/timeline';
import { blankOrder } from '@/lib/order-utils';
import type { ChangeLogEntry, OrderStatus } from '@/lib/types';

function moved(from: OrderStatus, to: OrderStatus, at: string): ChangeLogEntry {
  return {
    id: `${from}-${to}`, orderId: 'o1', action: 'status_changed', field: 'status',
    fromValue: from, toValue: to, summary: `Status changed from ${from} to ${to}`,
    actorEmail: 'k', actorName: 'Keenan', at,
  };
}

function order(status: OrderStatus, extra: Partial<ReturnType<typeof blankOrder>> = {}) {
  return { ...blankOrder(), status, createdAt: '2026-09-20T15:00:00.000Z', ...extra };
}

test('a draft shows ten steps with the first current and the rest upcoming', () => {
  const steps = timelineOf(order('draft'), []);
  assert.equal(steps.length, 10);
  assert.deepEqual(steps.map((s) => s.key), [
    'received', 'designing', 'finalizing', 'proof', 'production_deposit', 'in_production',
    'final_check', 'final_payment', 'shipped', 'delivered',
  ]);
  assert.equal(steps[0].state, 'current');
  assert.equal(steps[0].date, '2026-09-20');
  assert.ok(steps.slice(1).every((s) => s.state === 'upcoming'));
});

test('the initial deposit step only appears for orders that have been through it', () => {
  const never = timelineOf(order('in_production'), [moved('draft', 'in_production', '2026-09-21T10:00:00Z')]);
  assert.ok(!never.some((s) => s.key === 'initial_deposit'));
  const once = timelineOf(order('in_production'), [
    moved('design_talk', 'waiting_for_deposit', '2026-09-21T10:00:00Z'),
    moved('waiting_for_deposit', 'waiting_for_approval', '2026-09-22T10:00:00Z'),
  ]);
  const step = once.find((s) => s.key === 'initial_deposit');
  assert.ok(step);
  assert.equal(step.state, 'done');
  assert.equal(step.copy, 'Initial deposit received.');
  assert.equal(step.date, '2026-09-21');
  assert.equal(timelineOf(order('waiting_for_deposit'), []).find((s) => s.key === 'initial_deposit')?.state, 'current');
});

test('done, current and upcoming follow the status order, with dates from the log', () => {
  const steps = timelineOf(order('in_production', { estimatedFinishDate: '2026-10-15' }), [
    moved('draft', 'design_talk', '2026-09-21T10:00:00Z'),
    moved('design_talk', 'in_production', '2026-09-25T10:00:00Z'),
  ]);
  const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
  assert.equal(byKey.designing.state, 'done');
  assert.equal(byKey.designing.date, '2026-09-21');
  assert.equal(byKey.finalizing.state, 'done');
  assert.equal(byKey.finalizing.date, null);
  assert.equal(byKey.in_production.state, 'current');
  assert.equal(byKey.in_production.date, '2026-09-25');
  assert.match(byKey.in_production.detail ?? '', /October 15, 2026|Oct 15, 2026/);
  assert.equal(byKey.in_production.note, PRODUCTION_NOTE);
  assert.equal(byKey.shipped.state, 'upcoming');
  assert.equal(byKey.shipped.detail, null);
});

test('proof says who approved and when; shipped shows tracking only once shipped', () => {
  const approved = order('in_production', {
    approvedBy: 'Sam Carter', approvedDate: '2026-09-24',
    approvalRecord: { signedName: 'Sam Carter', signatureDataUrl: 'data:', signedAt: '2026-09-24T18:00:00Z', termsAccepted: true, termsUrl: '', statement: '', ipAddress: '', userAgent: '' },
  });
  const proof = timelineOf(approved, []).find((s) => s.key === 'proof')!;
  assert.equal(proof.state, 'done');
  assert.match(proof.copy, /Approved by Sam Carter on September 24, 2026/);
  const inProd = timelineOf(order('in_production', { trackingCode: 'CP123' }), []).find((s) => s.key === 'shipped')!;
  assert.equal(inProd.detail, null);
  const shipped = timelineOf(order('shipped', { trackingCode: 'CP123' }), []).find((s) => s.key === 'shipped')!;
  assert.equal(shipped.state, 'current');
  assert.equal(shipped.detail, 'Tracking number: CP123');
  assert.equal(timelineOf(order('completed'), []).at(-1)!.state, 'current');
});

test('everInStatus reads the log and the current status', () => {
  assert.equal(everInStatus('waiting_for_deposit', [], 'draft'), false);
  assert.equal(everInStatus('waiting_for_deposit', [], 'waiting_for_deposit'), true);
  assert.equal(everInStatus('waiting_for_deposit', [moved('draft', 'waiting_for_deposit', '2026-09-21T10:00:00Z')], 'shipped'), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test 2>&1 | grep -E "timeline|fail"` — Expected: module not found.

- [ ] **Step 3: Implement**

`src/lib/data/timeline.ts`:
```ts
import { STATUS_META } from '@/lib/constants';
import { formatLong, timestampDay } from '@/lib/dates';
import type { ChangeLogEntry, Order, OrderStatus } from '@/lib/types';

/**
 * The customer's view of where their order is.
 *
 * Pure: an order plus its change log in, a list of steps out. Nothing is
 * stored — the steps are re-derived on every page load, so an order that was
 * moved backwards or skipped a status still reads correctly.
 *
 * Design: docs/superpowers/specs/2026-09-25-customer-order-status-design.md
 */

export const PRODUCTION_NOTE =
  "We don't usually hear from production until the jerseys are done. If they send us anything in between, Keenan will pass it along.";

export type TimelineStepKey =
  | 'received' | 'designing' | 'finalizing' | 'initial_deposit' | 'proof' | 'production_deposit'
  | 'in_production' | 'final_check' | 'final_payment' | 'shipped' | 'delivered';

export interface TimelineStep {
  key: TimelineStepKey;
  label: string;
  state: 'done' | 'current' | 'upcoming';
  /** One line under the label. */
  copy: string;
  /** Calendar date the step was reached, when the log knows it. */
  date: string | null;
  /** A fact that belongs to the step: estimated finish, tracking number. */
  detail: string | null;
  /** A longer aside, only on In production. */
  note: string | null;
}

export type TimelineInput = Pick<
  Order,
  'status' | 'estimatedFinishDate' | 'trackingCode' | 'approvedBy' | 'approvedDate' | 'approvalRecord' | 'createdAt'
>;

interface StepDef {
  key: TimelineStepKey;
  status: OrderStatus;
  label: string;
  current: string;
  done: string;
  optional?: boolean;
}

const STEPS: StepDef[] = [
  { key: 'received', status: 'draft', label: 'Enquiry received', current: "We've got your enquiry. Keenan will be in touch.", done: 'Enquiry received.' },
  { key: 'designing', status: 'design_talk', label: 'Designing your jerseys', current: 'Keenan is working on your design. Logos and inspiration go here.', done: 'Design settled.' },
  { key: 'finalizing', status: 'finalizing_details', label: 'Finalizing details', current: "Roster, sizes and shipping details. Fill them in here when you're ready.", done: 'Details in.' },
  { key: 'initial_deposit', status: 'waiting_for_deposit', label: 'Initial deposit', current: 'Waiting on your initial deposit.', done: 'Initial deposit received.', optional: true },
  { key: 'proof', status: 'waiting_for_approval', label: 'Proof approval', current: 'Your proof is ready to approve.', done: 'Approved.' },
  { key: 'production_deposit', status: 'waiting_for_production_deposit', label: 'Pre-production deposit', current: 'Waiting on the pre-production deposit.', done: 'Deposit received.' },
  { key: 'in_production', status: 'in_production', label: 'In production', current: 'Your jerseys are being made.', done: 'Made.' },
  { key: 'final_check', status: 'waiting_for_final_approval', label: 'Final check', current: 'Photos of the finished jerseys are on their way to you.', done: 'Final check done.' },
  { key: 'final_payment', status: 'waiting_for_payment', label: 'Final payment', current: 'Waiting on the final payment.', done: 'Paid, thank you.' },
  { key: 'shipped', status: 'shipped', label: 'Shipped', current: 'On its way.', done: 'Shipped.' },
  { key: 'delivered', status: 'completed', label: 'Delivered', current: 'Enjoy the jerseys.', done: 'Delivered.' },
];

const pos = (s: OrderStatus) => STATUS_META[s].order;

/** Has the order ever sat in this status? The log remembers; the current status counts too. */
export function everInStatus(status: OrderStatus, history: ChangeLogEntry[], current: OrderStatus): boolean {
  if (current === status) return true;
  return history.some((h) => h.action === 'status_changed' && h.toValue === status);
}

/** The day the order most recently entered a status, from the log. */
function enteredOn(status: OrderStatus, history: ChangeLogEntry[]): string | null {
  const hits = history
    .filter((h) => h.action === 'status_changed' && h.toValue === status)
    .sort((a, b) => b.at.localeCompare(a.at));
  return hits[0] ? timestampDay(hits[0].at) : null;
}

export function timelineOf(order: TimelineInput, history: ChangeLogEntry[]): TimelineStep[] {
  // 'incomplete' sits before draft; both read as "enquiry received".
  const current = order.status === 'incomplete' ? 'draft' : order.status;
  const here = pos(current);
  const approved = Boolean(order.approvedDate || order.approvalRecord);

  return STEPS.filter((d) => !d.optional || everInStatus(d.status, history, current)).map((d) => {
    const p = pos(d.status);
    const state: TimelineStep['state'] = p < here ? 'done' : p === here ? 'current' : 'upcoming';
    let copy = state === 'done' ? d.done : state === 'current' ? d.current : '';
    let date: string | null = null;
    let detail: string | null = null;
    let note: string | null = null;

    if (state !== 'upcoming') {
      date = d.key === 'received' ? timestampDay(order.createdAt) : enteredOn(d.status, history);
    }

    if (d.key === 'proof' && approved) {
      const who = order.approvedBy || order.approvalRecord?.signedName || 'your team';
      const when = order.approvedDate ?? (order.approvalRecord ? timestampDay(order.approvalRecord.signedAt) : null);
      copy = `Approved by ${who}${when ? ` on ${formatLong(when)}` : ''}.`;
      date = when ?? date;
    }

    if (d.key === 'in_production' && state === 'current') {
      detail = order.estimatedFinishDate ? `Estimated finish: ${formatLong(order.estimatedFinishDate)}` : null;
      note = PRODUCTION_NOTE;
    }

    if (d.key === 'shipped' && state !== 'upcoming' && order.trackingCode) {
      detail = `Tracking number: ${order.trackingCode}`;
    }

    return { key: d.key, label: d.label, state, copy, date, detail, note };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"`
Expected: all pass (113). If the `formatLong` output is "Oct 15, 2026" rather than the long month, the test's regex allows both.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/timeline.ts tests/status/timeline.test.ts
git commit -m "Timeline: the customer's view of an order, derived from the change log

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Which emails are due, and where approval sends the order (pure)

**Files:**
- Create: `src/lib/data/customer-updates-logic.ts`
- Test: `tests/status/due-updates.test.ts`

**Interfaces:**
- Consumes: `everInStatus` (Task 2), `STATUS_META`, types from Task 1.
- Produces:
  ```ts
  export const MONEY_STAGES: ReadonlySet<UpdateStage>;
  export interface DueUpdate { stage: UpdateStage; needsAmount: boolean; blocked: string | null }
  export type DueInput = Pick<Order,'status'|'trackingCode'|'customerEmails'|'approvedDate'|'approvalRecord'|'contactEmail'|'enquiry'>;
  export function recipientOf(order: Pick<Order,'contactEmail'|'enquiry'>): string;   // '' when none
  export function dueUpdates(order: DueInput, history: ChangeLogEntry[]): DueUpdate[];
  export function statusAfterApproval(status: OrderStatus, history: ChangeLogEntry[]): OrderStatus | null;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/status/due-updates.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONEY_STAGES, dueUpdates, recipientOf, statusAfterApproval } from '@/lib/data/customer-updates-logic';
import { blankOrder } from '@/lib/order-utils';
import type { ChangeLogEntry, OrderStatus, UpdateStage } from '@/lib/types';

function moved(from: OrderStatus, to: OrderStatus, at = '2026-09-21T10:00:00Z'): ChangeLogEntry {
  return { id: `${from}-${to}-${at}`, orderId: 'o1', action: 'status_changed', field: 'status', fromValue: from, toValue: to, summary: '', actorEmail: 'k', actorName: 'Keenan', at };
}
function order(status: OrderStatus, extra: Partial<ReturnType<typeof blankOrder>> = {}) {
  return { ...blankOrder(), status, contactEmail: 'sam@example.com', ...extra };
}
const stages = (o: ReturnType<typeof order>, h: ChangeLogEntry[] = []) => dueUpdates(o, h).map((d) => d.stage);

test('recipient is the contact email, else the enquiry email, else nothing', () => {
  assert.equal(recipientOf({ contactEmail: ' a@b.c ', enquiry: null }), 'a@b.c');
  const o = blankOrder();
  o.contactEmail = '';
  assert.equal(recipientOf(o), '');
});

test('each status offers its own email, once', () => {
  const cases: Array<[OrderStatus, UpdateStage]> = [
    ['design_talk', 'design_talk'], ['finalizing_details', 'finalizing_details'],
    ['waiting_for_deposit', 'initial_deposit_requested'], ['waiting_for_approval', 'proof_ready'],
    ['waiting_for_production_deposit', 'production_deposit_requested'], ['in_production', 'in_production'],
    ['waiting_for_payment', 'final_payment_requested'], ['completed', 'completed'],
  ];
  for (const [status, stage] of cases) {
    assert.deepEqual(stages(order(status)), [stage], status);
    const sent = order(status, { customerEmails: [{ stage, sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
    assert.deepEqual(stages(sent), [], `${status} already sent`);
  }
  assert.deepEqual(stages(order('draft')), []);
  assert.deepEqual(stages(order('waiting_for_final_approval')), []);
});

test('the three request emails need an amount, nothing else does', () => {
  assert.deepEqual([...MONEY_STAGES].sort(), ['final_payment_requested', 'initial_deposit_requested', 'production_deposit_requested']);
  assert.equal(dueUpdates(order('waiting_for_deposit'), [])[0].needsAmount, true);
  assert.equal(dueUpdates(order('in_production'), [])[0].needsAmount, false);
});

test('shipped waits for a tracking code; no recipient blocks everything', () => {
  const [d] = dueUpdates(order('shipped'), []);
  assert.equal(d.stage, 'shipped');
  assert.match(d.blocked ?? '', /tracking/i);
  assert.equal(dueUpdates(order('shipped', { trackingCode: 'CP1' }), [])[0].blocked, null);
  const [n] = dueUpdates(order('in_production', { contactEmail: '' }), []);
  assert.match(n.blocked ?? '', /no customer email/i);
});

test('the deposit-received follow-ups appear after the gate and go away once far past it', () => {
  const past = [moved('design_talk', 'waiting_for_deposit'), moved('waiting_for_deposit', 'waiting_for_approval', '2026-09-22T10:00:00Z')];
  assert.deepEqual(stages(order('waiting_for_approval'), past).sort(), ['initial_deposit_received', 'proof_ready']);
  assert.ok(!stages(order('in_production'), past).includes('initial_deposit_received'));
  const prod = [moved('waiting_for_approval', 'waiting_for_production_deposit'), moved('waiting_for_production_deposit', 'in_production', '2026-09-22T10:00:00Z')];
  assert.deepEqual(stages(order('in_production'), prod).sort(), ['in_production', 'production_deposit_received']);
  assert.ok(!stages(order('waiting_for_payment'), prod).includes('production_deposit_received'));
});

test('proof ready is not offered once approved; the receipt is offered only if it never went out', () => {
  const approved = order('waiting_for_approval', { approvedDate: '2026-09-24' });
  assert.deepEqual(stages(approved), ['approval_confirmed']);
  const receipted = order('waiting_for_approval', { approvedDate: '2026-09-24', customerEmails: [{ stage: 'approval_confirmed', sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
  assert.deepEqual(stages(receipted), []);
  assert.ok(!stages(order('shipped', { approvedDate: '2026-09-24', trackingCode: 'x' })).includes('approval_confirmed'));
});

test('approval moves the order to production, or to the deposit gate first', () => {
  assert.equal(statusAfterApproval('waiting_for_approval', []), 'waiting_for_production_deposit');
  assert.equal(statusAfterApproval('finalizing_details', []), 'waiting_for_production_deposit');
  const paidThenApproving = [moved('finalizing_details', 'waiting_for_production_deposit'), moved('waiting_for_production_deposit', 'waiting_for_approval', '2026-09-22T10:00:00Z')];
  assert.equal(statusAfterApproval('waiting_for_approval', paidThenApproving), 'in_production');
  assert.equal(statusAfterApproval('waiting_for_production_deposit', []), null);
  assert.equal(statusAfterApproval('in_production', []), null);
  assert.equal(statusAfterApproval('shipped', []), null);
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test 2>&1 | grep -E "due-updates|fail"` → module not found.

- [ ] **Step 3: Implement**

`src/lib/data/customer-updates-logic.ts`:
```ts
import { STATUS_META } from '@/lib/constants';
import type { ChangeLogEntry, Order, OrderStatus, UpdateStage } from '@/lib/types';
import { everInStatus } from './timeline';

/**
 * Which update emails the staff panel should offer for an order, and where an
 * approval sends it. Pure; the sending lives in src/lib/customer-updates.ts.
 *
 * Every email is offered at most once per order (customerEmails remembers
 * what went out). Nothing here sends anything.
 */

export const MONEY_STAGES: ReadonlySet<UpdateStage> = new Set<UpdateStage>([
  'initial_deposit_requested', 'production_deposit_requested', 'final_payment_requested',
]);

export interface DueUpdate {
  stage: UpdateStage;
  /** The panel must collect an amount before this one can send. */
  needsAmount: boolean;
  /** Why Send is not offered, or null when it can go. */
  blocked: string | null;
}

export type DueInput = Pick<
  Order,
  'status' | 'trackingCode' | 'customerEmails' | 'approvedDate' | 'approvalRecord' | 'contactEmail' | 'enquiry'
>;

const pos = (s: OrderStatus) => STATUS_META[s].order;
const GATE = 'waiting_for_production_deposit' as const;

/** The contact email, trimmed. Website orders always have one; hand-made orders may not. */
export function recipientOf(order: Pick<Order, 'contactEmail' | 'enquiry'>): string {
  return (order.contactEmail ?? '').trim();
}

export function dueUpdates(order: DueInput, history: ChangeLogEntry[]): DueUpdate[] {
  const sent = new Set(order.customerEmails.map((r) => r.stage));
  const s = order.status;
  const p = pos(s);
  const approved = Boolean(order.approvedDate || order.approvalRecord);
  const out: DueUpdate[] = [];
  const offer = (stage: UpdateStage, blocked: string | null = null) => {
    if (sent.has(stage)) return;
    out.push({ stage, needsAmount: MONEY_STAGES.has(stage), blocked });
  };

  if (s === 'design_talk') offer('design_talk');
  if (s === 'finalizing_details') offer('finalizing_details');
  if (s === 'waiting_for_deposit') offer('initial_deposit_requested');
  if (everInStatus('waiting_for_deposit', history, s) && p > pos('waiting_for_deposit') && p < pos('in_production')) {
    offer('initial_deposit_received');
  }
  if (s === 'waiting_for_approval' && !approved) offer('proof_ready');
  if (approved && p <= pos('in_production')) offer('approval_confirmed');
  if (s === GATE) offer('production_deposit_requested');
  if (everInStatus(GATE, history, s) && p > pos(GATE) && p < pos('waiting_for_payment')) {
    offer('production_deposit_received');
  }
  if (s === 'in_production') offer('in_production');
  if (s === 'waiting_for_payment') offer('final_payment_requested');
  if (s === 'shipped') offer('shipped', order.trackingCode.trim() ? null : 'Add a tracking code first.');
  if (s === 'completed') offer('completed');

  if (!recipientOf(order)) {
    for (const d of out) d.blocked = 'No customer email on this order. Add one under Contact, then come back.';
  }
  return out;
}

/**
 * After a signature: into production if the pre-production deposit is in,
 * otherwise to the deposit gate. "In" means the order has sat in the gate
 * status and left it — Keenan moves an order out of the gate when the money
 * arrives, in whichever direction he moves it.
 */
export function statusAfterApproval(status: OrderStatus, history: ChangeLogEntry[]): OrderStatus | null {
  if (pos(status) >= pos('in_production')) return null;
  if (status === GATE) return null;
  const leftGate = history.some((h) => h.action === 'status_changed' && h.fromValue === GATE);
  return leftGate ? 'in_production' : GATE;
}
```

- [ ] **Step 4: Run tests** — `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/customer-updates-logic.ts tests/status/due-updates.test.ts
git commit -m "Customer updates: which email is due, and where approval sends the order

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: One mail layout for every email

**Files:**
- Create: `src/lib/data/mail-layout.ts`
- Modify: `src/lib/data/intake-mail.ts` (whole file; output must keep passing `tests/intake/intake-mail.test.ts`)

**Interfaces:**
- Produces (all pure):
  ```ts
  export const INFO_EMAIL, PHONE_DISPLAY, PHONE_TEL, SITE_URL, COMPARE_URL, FAQ_URL, SPECIALIST: string;
  export const IMAGES: { logo; heroDesktop; heroPhone; compare; faq };
  export const MAIL_FF: string;                       // "font-family:'Montserrat',Arial,Helvetica,sans-serif;"
  export function esc(s: string): string;
  export function firstNameOf(full: string): string;
  export function mp(inner: string, extra?: string): string;       // body paragraph
  export function mMuted(inner: string, extra?: string): string;   // 14px grey paragraph
  export function mEyebrow(inner: string, colour?: string): string;
  export function mButton(href: string, label: string, dark?: boolean): string;  // gold button, or dark with gold text
  export function mBox(eyebrow: string, inner: string): string;    // bordered aside (how to pay, tracking, note)
  export function mailShell(o: { subject: string; preheader: string; hero: boolean; body: string; footerNote?: string }): string;
  export function textFooter(): string[];                          // the plain-text sign-off lines
  ```

- [ ] **Step 1: Create the layout module**

`src/lib/data/mail-layout.ts` — move the constants, `esc`, `firstNameOf`, `IMAGES` and the shell out of `intake-mail.ts` verbatim (the HTML head, styles, logo band, hero rows, outer tables and footer are exactly the ones in `composeEnquiryMail` today), and add the small helpers:
```ts
/**
 * The one email layout. The confirmation email and every update email are
 * built from these pieces so they always look like the same sender.
 *
 * Table-based HTML with inline styles because that is what mail clients
 * render. 700px wide on a desktop, one column on a phone; the hero photo
 * swaps to a taller crop under 720px.
 */
export const INFO_EMAIL = 'info@powerplaycustoms.ca';
export const PHONE_DISPLAY = '+1 (403) 895-9915';
export const PHONE_TEL = '+14038959915';
export const SITE_URL = 'https://www.powerplaycustoms.ca';
export const COMPARE_URL = `${SITE_URL}/pages/hockey-comparison-chart`;
export const FAQ_URL = `${SITE_URL}/pages/faqs-page-oflrac`;
export const SPECIALIST = 'Keenan';

const CDN = 'https://cdn.shopify.com/s/files/1/0654/5349/0385/files';
const TEAM_PHOTO = `${CDN}/gempages_566822059041096785-ee8eb7a8-6bf8-484b-8ca3-a30968a1aa69.jpg`;
export const IMAGES = {
  logo: `${SITE_URL}/cdn/shop/files/PPC_Logo_Lower_RES.png?width=480`,
  heroDesktop: `${TEAM_PHOTO}?width=1400&height=600&crop=center`,
  heroPhone: `${TEAM_PHOTO}?width=800&height=600&crop=center`,
  compare: `${CDN}/jersey-1200.jpg?width=600&height=400&crop=center`,
  faq: `${CDN}/gallery-jersey-01.jpg?width=600&height=400&crop=center`,
} as const;

export const MAIL_FF = "font-family:'Montserrat',Arial,Helvetica,sans-serif;";

export function firstNameOf(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? '';
  return first || 'there';
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const mp = (inner: string, extra = '') =>
  `<p style="margin:0;${MAIL_FF}font-size:16px;line-height:26px;color:#1c1c1c;${extra}">${inner}</p>`;
export const mMuted = (inner: string, extra = '') =>
  `<p style="margin:0;${MAIL_FF}font-size:14px;line-height:22px;color:#6b6b6b;${extra}">${inner}</p>`;
export const mEyebrow = (inner: string, colour = '#8a8a8a') =>
  `<p style="margin:0;${MAIL_FF}font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${colour};">${inner}</p>`;

export function mButton(href: string, label: string, dark = false): string {
  const bg = dark ? '#1c1c1c' : '#fcbd00';
  const fg = dark ? '#fcbd00' : '#1c1c1c';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 14px;"><tr><td style="background:${bg};border-radius:8px;"><a href="${esc(href)}" style="display:inline-block;padding:15px 28px;${MAIL_FF}font-size:16px;font-weight:800;color:${fg};text-decoration:none;">${label}&nbsp;&rarr;</a></td></tr></table>`;
}

/** A bordered aside with a gold rule on top: how to pay, a tracking number, the production note. */
export function mBox(eyebrow: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-top:2px solid #fcbd00;border-bottom:1px solid #e6e6e6;"><tr><td style="padding:14px 0 16px;">${mEyebrow(eyebrow)}<p style="margin:6px 0 0;${MAIL_FF}font-size:16px;line-height:26px;color:#1c1c1c;">${inner}</p></td></tr></table>`;
}

export function textFooter(): string[] {
  return [
    `Prefer email? Write to ${INFO_EMAIL} with your team name in the subject.`,
    `Questions? Reply to this email, or call or text ${PHONE_DISPLAY}.`,
    '',
    SPECIALIST,
    `Powerplay Customs · Calgary, Alberta · ${SITE_URL}`,
  ];
}

export function mailShell(o: { subject: string; preheader: string; hero: boolean; body: string; footerNote?: string }): string {
  const hero = o.hero
    ? `<tr><td style="background:#1c1c1c;">
<div class="hero-desk"><img src="${esc(IMAGES.heroDesktop)}" width="700" height="300" alt="A team in their Powerplay Customs jerseys" style="width:100%;height:auto;max-width:700px;border:0;display:block;"></div>
<!--[if !mso]><!--><div class="hero-mob" style="display:none;max-height:0;overflow:hidden;"><img src="${esc(IMAGES.heroPhone)}" width="700" alt="A team in their Powerplay Customs jerseys" style="width:100%;height:auto;border:0;display:block;"></div><!--<![endif]-->
</td></tr>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(o.subject)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&amp;display=swap">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap');
  body { margin:0; padding:0; background:#f2f2f0; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; display:block; }
  .col { display:inline-block; width:300px; vertical-align:top; }
  @media only screen and (max-width:720px) {
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:28px !important; line-height:34px !important; }
    .col { width:100% !important; }
    .col-gap { height:22px !important; }
    .hero-desk { display:none !important; }
    .hero-mob { display:block !important; max-height:none !important; overflow:visible !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:#f2f2f0;${MAIL_FF}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f2f2f0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f0;"><tr><td align="center" style="padding:24px 12px 36px;">
<table role="presentation" width="700" cellpadding="0" cellspacing="0" style="max-width:700px;width:100%;">
<tr><td align="center" style="background:#1c1c1c;border-radius:12px 12px 0 0;padding:22px 28px 20px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${esc(IMAGES.logo)}" width="200" height="60" alt="Powerplay Customs" style="width:200px;height:60px;margin:0 auto;border:0;display:block;"></a></td></tr>
${hero}
${o.body}
<tr><td class="pad" style="background:#ffffff;border-top:1px solid #e6e6e6;border-radius:0 0 12px 12px;padding:20px 40px 24px;">
${mMuted(`Prefer email? Write to <a href="mailto:${INFO_EMAIL}" style="color:#1c1c1c;font-weight:600;">${INFO_EMAIL}</a> with your team name in the subject. Questions? Reply to this email, or call or text <a href="tel:${PHONE_TEL}" style="color:#1c1c1c;font-weight:600;text-decoration:none;">${PHONE_DISPLAY}</a>.`)}
</td></tr>
<tr><td class="pad" align="center" style="padding:20px 40px 0;">
<p style="margin:0 0 4px;${MAIL_FF}font-size:12px;line-height:18px;color:#8a8a8a;">Powerplay Customs &middot; Calgary, Alberta &middot; <a href="${SITE_URL}" style="color:#8a8a8a;">powerplaycustoms.ca</a></p>
<p style="margin:0;${MAIL_FF}font-size:12px;line-height:18px;color:#8a8a8a;">${esc(o.footerNote ?? "If this wasn't meant for you, ignore this email.")}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
```

- [ ] **Step 2: Refactor the confirmation email onto it**

Rewrite `src/lib/data/intake-mail.ts` so it imports everything above from `./mail-layout` and re-exports the names its tests use:
```ts
export { INFO_EMAIL, PHONE_DISPLAY, PHONE_TEL, SITE_URL, COMPARE_URL, FAQ_URL, SPECIALIST, IMAGES, esc, firstNameOf } from './mail-layout';
```
Keep `EnquiryMailInput`, `MailContent`, `STEPS`, `REPLACED_LINE`, `PROMISE`, `ASSIGNED`, the `text` array and the body rows exactly as they are, but build the HTML as `mailShell({ subject, preheader, hero: true, body, footerNote: "If this enquiry wasn't you, ignore this email." })` where `body` is the rows from the headline `<tr>` through the tiles `<tr>` (everything between the hero row and the footer row in today's file). Use `mp`/`mMuted`/`mEyebrow` for the paragraphs and `mButton(i.rosterUrl, "Open your team's page", true)` for the dark button. Drop the local `FF`, `body`, `muted`, `eyebrow` helpers.

- [ ] **Step 3: Run the existing tests**

Run: `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"`
Expected: all pass, including `tests/intake/intake-mail.test.ts` unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/mail-layout.ts src/lib/data/intake-mail.ts
git commit -m "Mail: one layout module for the confirmation and the update emails

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The twelve update emails (pure)

**Files:**
- Create: `src/lib/data/update-mail.ts`
- Test: `tests/status/update-mail.test.ts`

**Interfaces:**
- Consumes: Task 4 helpers, `PRODUCTION_NOTE` (Task 2), `UPDATE_STAGE_LABEL`, `MailContent` (from `intake-mail.ts`).
- Produces:
  ```ts
  export interface UpdateMailInput {
    teamName: string; firstName: string;          // already resolved; '' → 'there'
    rosterUrl: string; shareUrl: string;
    amount: string;                                // only read on the three request stages
    howToPay: string;
    estimatedFinishDate: string | null;            // CalendarDate
    trackingCode: string;
    paymentReceivedFirst: boolean;                 // shipped: open with "Payment received"
    nextAfterApproval: 'production' | 'deposit';   // approval_confirmed
    approvedBy: string;
    googleReviewUrl: string; referralLine: string;
  }
  export function composeUpdateMail(stage: UpdateStage, i: UpdateMailInput): MailContent;
  ```

- [ ] **Step 1: Write the failing tests**

`tests/status/update-mail.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { PRODUCTION_NOTE } from '@/lib/data/timeline';
import { UPDATE_STAGES } from '@/lib/types';

const base: UpdateMailInput = {
  teamName: 'Ice Cats', firstName: 'Sam',
  rosterUrl: 'https://orders.powerplaycustoms.ca/roster/' + 'a'.repeat(64),
  shareUrl: 'https://orders.powerplaycustoms.ca/share/' + 'b'.repeat(64),
  amount: '$250', howToPay: 'E-transfer to info@powerplaycustoms.ca (no fee), or by card (3% fee).',
  estimatedFinishDate: '2026-10-15', trackingCode: 'CP123456789CA',
  paymentReceivedFirst: false, nextAfterApproval: 'production', approvedBy: 'Sam Carter',
  googleReviewUrl: 'https://g.page/r/abc/review', referralLine: 'Know another team? Send them our way.',
};

test('every stage composes a subject with the team, and both bodies link the team page or the order sheet', () => {
  for (const stage of UPDATE_STAGES) {
    const m = composeUpdateMail(stage, base);
    assert.match(m.subject, /Ice Cats/, stage);
    for (const body of [m.text, m.html]) {
      assert.ok(body.includes(base.rosterUrl) || body.includes(base.shareUrl), `${stage} link`);
      assert.ok(body.includes('+1 (403) 895-9915'), `${stage} phone`);
    }
    assert.ok(!/<[a-z]/i.test(m.text), `${stage} text has no tags`);
  }
});

test('only the three request emails carry the amount and how to pay; nothing else mentions money', () => {
  for (const stage of UPDATE_STAGES) {
    const m = composeUpdateMail(stage, base);
    const money = ['initial_deposit_requested', 'production_deposit_requested', 'final_payment_requested'].includes(stage);
    assert.equal(m.text.includes('$250'), money, `${stage} amount in text`);
    assert.equal(m.html.includes('$250'), money, `${stage} amount in html`);
    assert.equal(m.text.includes('3% fee'), money, `${stage} how to pay`);
    if (!money) assert.ok(!/\$\s?\d/.test(m.text) && !/\$\s?\d/.test(m.html), `${stage} has no dollar figure`);
  }
});

test('in production carries the estimate and the production note; shipped carries tracking', () => {
  const prod = composeUpdateMail('in_production', base);
  assert.ok(prod.text.includes(PRODUCTION_NOTE) && prod.html.includes(PRODUCTION_NOTE));
  assert.match(prod.text, /October 15, 2026|Oct 15, 2026/);
  const noDate = composeUpdateMail('in_production', { ...base, estimatedFinishDate: null });
  assert.doesNotMatch(noDate.text, /Estimated finish/);
  const ship = composeUpdateMail('shipped', base);
  assert.ok(ship.text.includes('CP123456789CA') && ship.html.includes('CP123456789CA'));
  assert.doesNotMatch(ship.text, /Payment received/);
  assert.match(composeUpdateMail('shipped', { ...base, paymentReceivedFirst: true }).text, /Payment received/);
});

test('approval confirmed says what comes next; completed shows the review button and referral only when set', () => {
  assert.match(composeUpdateMail('approval_confirmed', base).text, /production/i);
  assert.match(composeUpdateMail('approval_confirmed', { ...base, nextAfterApproval: 'deposit' }).text, /deposit/i);
  const done = composeUpdateMail('completed', base);
  assert.ok(done.html.includes(base.googleReviewUrl) && done.text.includes(base.googleReviewUrl));
  assert.ok(done.text.includes(base.referralLine));
  const bare = composeUpdateMail('completed', { ...base, googleReviewUrl: '', referralLine: '' });
  assert.doesNotMatch(bare.text, /review/i);
  assert.ok(!bare.text.includes('Send them our way'));
});

test('what people typed is escaped in the HTML', () => {
  const m = composeUpdateMail('initial_deposit_requested', { ...base, teamName: 'Ice <Cats> & "Co"', amount: '<b>$1</b>', howToPay: 'a < b' });
  assert.ok(m.html.includes('Ice &lt;Cats&gt; &amp; &quot;Co&quot;'));
  assert.ok(!m.html.includes('<b>$1</b>') && m.html.includes('&lt;b&gt;$1&lt;/b&gt;'));
  assert.ok(m.html.includes('a &lt; b'));
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement**

`src/lib/data/update-mail.ts`:
```ts
import type { UpdateStage } from '@/lib/types';
import { formatLong } from '@/lib/dates';
import type { MailContent } from './intake-mail';
import { PRODUCTION_NOTE } from './timeline';
import { INFO_EMAIL, MAIL_FF, SPECIALIST, esc, mBox, mButton, mMuted, mailShell, mp, textFooter } from './mail-layout';

/**
 * The email for each stage of an order. Pure: input in, subject/text/html out.
 *
 * Short on purpose: a headline, a line or two, the one fact that matters, one
 * button. Money appears only in the three request emails, and only as the
 * amount Keenan typed — see the money rule in CLAUDE.md.
 */

export interface UpdateMailInput {
  teamName: string;
  firstName: string;
  rosterUrl: string;
  shareUrl: string;
  amount: string;
  howToPay: string;
  estimatedFinishDate: string | null;
  trackingCode: string;
  paymentReceivedFirst: boolean;
  nextAfterApproval: 'production' | 'deposit';
  approvedBy: string;
  googleReviewUrl: string;
  referralLine: string;
}

interface Draft {
  subject: string;
  preheader: string;
  headline: string;
  /** Plain sentences, in order. Each becomes a paragraph. */
  lines: string[];
  /** A boxed aside: [eyebrow, text]. */
  box?: [string, string];
  button: { href: string; label: string; dark?: boolean };
  /** A second button, only Completed uses it. */
  button2?: { href: string; label: string };
  /** Quiet closing line. */
  muted?: string;
  hero: boolean;
}

function draft(stage: UpdateStage, i: UpdateMailInput): Draft {
  const team = i.teamName.trim() || 'your team';
  const first = i.firstName.trim() || 'there';
  const pay: [string, string] = ['How to pay', i.howToPay];
  switch (stage) {
    case 'design_talk':
      return {
        subject: `Your design is underway — ${team}`,
        preheader: 'Send your logo, colours and any looks you like, and Keenan will draw it up.',
        headline: `Let's design your jerseys, ${first}.`,
        lines: [
          `${SPECIALIST} has started on the ${team} design. The fastest way to a mockup you love is to send everything you've got: your logo in any format, your colours, and pictures of looks you like.`,
          "No logo yet is fine. Tell us the idea and we'll draw it.",
        ],
        button: { href: i.rosterUrl, label: 'Send logos and inspiration' },
        muted: "Free mockup the same day, and we keep going until it's right.",
        hero: false,
      };
    case 'finalizing_details':
      return {
        subject: `Roster and details, please — ${team}`,
        preheader: 'Names, numbers, sizes and where the box should go.',
        headline: `Nearly there, ${first}.`,
        lines: [
          `The design is settled. To build the ${team} order we need each player's name as it should print, their number, and jersey and sock sizes, plus the contact and shipping details for the box.`,
        ],
        button: { href: i.rosterUrl, label: 'Fill in roster and details' },
        muted: 'Type it in or upload the list you already have. You can change it right up until production.',
        hero: false,
      };
    case 'initial_deposit_requested':
      return {
        subject: `Initial deposit for ${team}`,
        preheader: 'A small deposit to keep the design work moving. It comes off your total.',
        headline: 'A small deposit to keep things moving.',
        lines: [
          `To keep the design work going on ${team}, we ask for an initial deposit of ${i.amount}. It comes straight off your total.`,
        ],
        box: pay,
        button: { href: i.shareUrl, label: 'See your order' },
        muted: `Reply to this email once it's sent and ${SPECIALIST} will confirm.`,
        hero: false,
      };
    case 'initial_deposit_received':
      return {
        subject: `Deposit received — ${team}`,
        preheader: 'Your initial deposit has landed. Design work carries on.',
        headline: `Got it, thanks ${first}.`,
        lines: [`Your initial deposit for ${team} has landed. Design work carries on, and you'll hear from ${SPECIALIST} with the next mockup.`],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        hero: false,
      };
    case 'proof_ready':
      return {
        subject: `Your proof is ready to approve — ${team}`,
        preheader: 'Check every name, number and size, then sign off.',
        headline: `Ready for your sign-off, ${first}.`,
        lines: [
          `The ${team} proof is ready. Check the design, every name and number, the sizes and the shipping address, then sign off.`,
          "Once it's approved nothing changes, so look twice.",
        ],
        button: { href: i.shareUrl, label: 'Review and approve' },
        muted: 'Spot something wrong? Reply to this email before you approve.',
        hero: false,
      };
    case 'approval_confirmed':
      return {
        subject: `Approved. Thanks, ${(i.approvedBy || first).split(/\s+/)[0]} — ${team}`,
        preheader: 'Your sign-off is recorded. Here is what happens next.',
        headline: 'Approved.',
        lines: [
          `${team} is signed off. From here nothing on the order changes.`,
          i.nextAfterApproval === 'production'
            ? "Next up: production. You'll get a note when it starts, with the estimated finish."
            : `Next up: the pre-production deposit. ${SPECIALIST} will send the details.`,
        ],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        hero: false,
      };
    case 'production_deposit_requested':
      return {
        subject: `Deposit before production — ${team}`,
        preheader: 'One step before we start making them.',
        headline: 'One step before we start making them.',
        lines: [`${team} is approved and ready for production. To start, we need the pre-production deposit of ${i.amount}.`],
        box: pay,
        button: { href: i.shareUrl, label: 'See your order' },
        muted: `Reply to this email once it's sent and ${SPECIALIST} will get production started.`,
        hero: false,
      };
    case 'production_deposit_received':
      return {
        subject: `Deposit received, production is next — ${team}`,
        preheader: "Your deposit is in. The order goes to production next.",
        headline: `Thanks, ${first}. We're on it.`,
        lines: [`Your deposit for ${team} is in. The order goes to production next, and you'll get a note when it starts.`],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        hero: false,
      };
    case 'in_production':
      return {
        subject: `Your jerseys are in production — ${team}`,
        preheader: "They're being made. Here's what to expect.",
        headline: "They're being made.",
        lines: [
          `${team} is in production.${i.estimatedFinishDate ? ` Estimated finish: ${formatLong(i.estimatedFinishDate)}.` : ''}`,
        ],
        box: ['While they are being made', PRODUCTION_NOTE],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: 'Production usually takes 2 to 4 weeks. Shipping across Canada is free.',
        hero: true,
      };
    case 'final_payment_requested':
      return {
        subject: `Final payment — ${team}`,
        preheader: 'The jerseys are done. The final payment releases them.',
        headline: `The jerseys are done, ${first}.`,
        lines: [`${team} is finished and ready to ship. The final payment of ${i.amount} releases it.`],
        box: pay,
        button: { href: i.shareUrl, label: 'See your order' },
        muted: `Reply to this email once it's sent and ${SPECIALIST} will get it on its way.`,
        hero: false,
      };
    case 'shipped':
      return {
        subject: `Your jerseys have shipped — ${team}`,
        preheader: `On their way. Tracking: ${i.trackingCode}`,
        headline: i.paymentReceivedFirst ? "Payment received, and they're on their way." : "They're on their way.",
        lines: [`${team} has shipped.`],
        box: ['Tracking number', i.trackingCode],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: "Give it a day for the carrier's site to update. Shipping across Canada is free; cross-border orders can be held at customs for a few days.",
        hero: false,
      };
    case 'completed':
      return {
        subject: `Thanks from Powerplay Customs — ${team}`,
        preheader: 'Enjoy the jerseys. Two small asks, if you have a minute.',
        headline: `Enjoy the jerseys, ${first}.`,
        lines: [
          `It was a pleasure making them for ${team}.${i.googleReviewUrl || i.referralLine ? ' Two small asks, if you have a minute:' : ''}`,
          ...(i.referralLine ? [i.referralLine] : []),
        ],
        button: i.googleReviewUrl ? { href: i.googleReviewUrl, label: 'Review us on Google' } : { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: "Next season: reply to this email and we'll reorder from your design, no setup.",
        hero: true,
      };
  }
}

export function composeUpdateMail(stage: UpdateStage, i: UpdateMailInput): MailContent {
  const d = draft(stage, i);

  const text = [
    d.headline,
    '',
    ...d.lines,
    ...(d.box ? ['', `${d.box[0]}: ${d.box[1]}`] : []),
    '',
    `${d.button.label}: ${d.button.href}`,
    ...(d.muted ? ['', d.muted] : []),
    '',
    ...textFooter(),
  ].join('\n');

  const body = `<tr><td class="pad" style="background:#ffffff;padding:34px 40px 30px;">
<h1 class="h1" style="margin:0 0 14px;${MAIL_FF}font-size:32px;line-height:38px;font-weight:800;color:#1c1c1c;">${esc(d.headline)}</h1>
${d.lines.map((l, n) => mp(esc(l), n < d.lines.length - 1 ? 'margin-bottom:12px;' : '')).join('\n')}
${d.box ? mBox(esc(d.box[0]), esc(d.box[1])) : ''}
${mButton(d.button.href, esc(d.button.label), d.button.dark)}
${d.muted ? mMuted(esc(d.muted)) : ''}
</td></tr>`;

  const html = mailShell({ subject: d.subject, preheader: d.preheader, hero: d.hero, body });
  return { subject: d.subject, text, html };
}
```
Note `INFO_EMAIL` is imported for the footer via `textFooter()`; remove the unused import if the linter complains.

- [ ] **Step 4: Run tests** — `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/update-mail.ts tests/status/update-mail.test.ts
git commit -m "Update emails: twelve short stage emails on the shared layout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Settings row, both stores, the page and the nav link

**Files:**
- Modify: `src/lib/data/repository.ts` (interface), `src/lib/data/json-store.ts` (`Database`, `heal`, two methods), `src/lib/data/supabase-store.ts` (two methods)
- Create: `supabase/migrations/0006_app_settings.sql`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`
- Modify: `src/app/layout.tsx` (nav)

**Interfaces:**
- Produces: `Repository.getSettings(): Promise<AppSettings>`, `Repository.saveSettings(settings: AppSettings, actor: Actor): Promise<void>`, server action `saveSettingsAction(formData: FormData)`.

- [ ] **Step 1: Interface and stores**

`repository.ts`: import `AppSettings` from `@/lib/types`; add to `Repository` after the History section:
```ts
  /* Settings ----------------------------------------------------------- */
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings, actor: Actor): Promise<void>;
```

`json-store.ts`: add `settings?: AppSettings;` to `Database`; import `AppSettings`; import `healSettings` from `./logic`; in `heal()` add `db.settings = healSettings(db.settings);`. Add methods:
```ts
  async getSettings() {
    const db = await load();
    return healSettings(db.settings);
  },

  async saveSettings(settings, _actor) {
    await withWrite((db) => { db.settings = healSettings(settings); });
  },
```

`supabase-store.ts`: add `const SETTINGS = 'app_settings';` and methods:
```ts
  async getSettings() {
    const res = await supabase().from(SETTINGS).select('data').eq('id', 'app').maybeSingle();
    if (res.error) throw new Error(`load settings: ${res.error.message}`);
    return healSettings((res.data?.data as Partial<AppSettings> | undefined) ?? null);
  },

  async saveSettings(settings, _actor) {
    const res = await supabase().from(SETTINGS).upsert({ id: 'app', data: healSettings(settings) });
    if (res.error) throw new Error(`save settings: ${res.error.message}`);
  },
```

`supabase/migrations/0006_app_settings.sql`:
```sql
-- App-wide settings: one row, id 'app', three strings Keenan writes once
-- (how to pay, Google review link, referral line). Read on every send.
create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null
);

-- RLS on, no policies, like every other table: the service role is the only reader.
alter table public.app_settings enable row level security;
```

- [ ] **Step 2: The page and action**

`src/app/settings/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';

export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireRole('staff');
  const actor = await currentActor();
  const str = (k: string) => String(formData.get(k) ?? '').trim();
  await repo.saveSettings(
    { howToPay: str('howToPay'), googleReviewUrl: str('googleReviewUrl'), referralLine: str('referralLine') },
    actor,
  );
  revalidatePath('/settings');
}
```

`src/app/settings/page.tsx`:
```tsx
import { repo } from '@/lib/data';
import { Button, Section } from '@/components/ui';
import { saveSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

/** Three strings the customer emails use. Written once, edited here. */
export default async function SettingsPage() {
  const s = await repo.getSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">What the customer emails say. Save once; every send uses it.</p>
      </div>
      <form action={saveSettingsAction}>
        <Section title="Customer emails">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="howToPay">How to pay</label>
              <textarea id="howToPay" name="howToPay" rows={3} className="mt-1 w-full" defaultValue={s.howToPay} />
              <p className="mt-1 text-xs text-muted">Prefilled into the three deposit and payment emails. You can edit it before each send.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="googleReviewUrl">Google review link</label>
              <input id="googleReviewUrl" name="googleReviewUrl" className="mt-1 w-full" defaultValue={s.googleReviewUrl} placeholder="https://g.page/r/…/review" />
              <p className="mt-1 text-xs text-muted">The button in the Thanks email. Leave empty to hide it.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="referralLine">Referral line</label>
              <textarea id="referralLine" name="referralLine" rows={2} className="mt-1 w-full" defaultValue={s.referralLine} />
              <p className="mt-1 text-xs text-muted">One sentence in the Thanks email. Leave empty to hide it.</p>
            </div>
            <Button type="submit" variant="primary">Save settings</Button>
          </div>
        </Section>
      </form>
    </div>
  );
}
```

`src/app/layout.tsx`: after the Sales link, add:
```tsx
                <Link
                  href="/settings"
                  className="rounded-lg px-3 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold"
                >
                  Settings
                </Link>
```

- [ ] **Step 3: Check it renders**

Run: `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → pass. Then `npm run dev` briefly and open `http://localhost:3000/settings` after unlocking; save a change; reload; the value persists (JSON store writes `data/db.json`). Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/repository.ts src/lib/data/json-store.ts src/lib/data/supabase-store.ts supabase/migrations/0006_app_settings.sql src/app/settings src/app/layout.tsx
git commit -m "Settings: how to pay, review link and referral line, one row and a page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The stores remember sends, and the public views carry the timeline

**Files:**
- Modify: `src/lib/data/repository.ts` (`recordCustomerEmail`; `timeline` on `PublicOrderView` and the roster view)
- Modify: `src/lib/data/logic.ts` (`rosterLinkView`, `publicViewOf` take `history`)
- Modify: `src/lib/data/json-store.ts`, `src/lib/data/supabase-store.ts`
- Test: `tests/status/views.test.ts`

**Interfaces:**
- Produces: `Repository.recordCustomerEmail(orderId: string, record: CustomerEmailRecord, actor: Actor): Promise<void>`; `PublicOrderView.timeline: TimelineStep[]`; roster view `timeline: TimelineStep[]`; `rosterLinkView(o, existingRosterCount, history = [])`; `publicViewOf(o, roster, assets, history = [])`.

- [ ] **Step 1: Write the failing test**

`tests/status/views.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicViewOf, rosterLinkView } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';

test('both customer views carry the timeline, and neither carries the email records', () => {
  const o = { ...blankOrder(), status: 'in_production' as const, customerEmails: [{ stage: 'in_production' as const, sentAt: 'x', to: 'sam@example.com', messageId: '' }] };
  const roster = rosterLinkView(o, 0, []);
  const share = publicViewOf(o, [], [], []);
  for (const v of [roster, share]) {
    assert.equal(v.timeline.find((s) => s.key === 'in_production')?.state, 'current');
    assert.ok(!('customerEmails' in v));
  }
  assert.equal(rosterLinkView(o, 0).timeline.length, 10, 'history defaults to empty');
});
```

- [ ] **Step 2: Run to verify it fails** — `timeline` missing.

- [ ] **Step 3: Implement**

`logic.ts`: import `timelineOf, type TimelineStep` from `./timeline` and `ChangeLogEntry` (already imported). Add `history: ChangeLogEntry[] = []` as the last parameter of both functions; add `timeline: TimelineStep[]` to the roster view's return type and `timeline: timelineOf(o, history),` to both returned objects.

`repository.ts`: import `TimelineStep` from `./timeline` and `CustomerEmailRecord` from `@/lib/types`; add `timeline: TimelineStep[];` to `PublicOrderView` (after `contact`) and to the `getByRosterToken` return shape (after `existingRosterCount`). Add to `Repository` after `getHistory`:
```ts
  /** One update email went out: remember it on the order and in the history. */
  recordCustomerEmail(orderId: string, record: CustomerEmailRecord, actor: Actor): Promise<void>;
```

`json-store.ts`: pass history into the views:
```ts
  async getByShareToken(token): Promise<PublicOrderView | null> {
    const db = await load();
    const o = db.orders.find((x) => x.shareToken === token && !x.deletedAt);
    if (!o) return null;
    return publicViewOf(
      o,
      db.roster.filter((r) => r.orderId === o.id),
      db.assets.filter((a) => a.orderId === o.id),
      db.history.filter((h) => h.orderId === o.id),
    );
  },

  async getByRosterToken(token) {
    const db = await load();
    const o = db.orders.find((x) => x.rosterToken === token && !x.deletedAt);
    if (!o) return null;
    return rosterLinkView(o, db.roster.filter((r) => r.orderId === o.id).length, db.history.filter((h) => h.orderId === o.id));
  },
```
and add:
```ts
  async recordCustomerEmail(orderId, record, actor) {
    await withWrite((db) => {
      const o = db.orders.find((x) => x.id === orderId);
      if (!o) throw new Error(`Order ${orderId} not found`);
      (o.customerEmails ??= []).push(record);
      o.updatedAt = new Date().toISOString();
      db.history.push(
        logEntry({
          orderId, action: 'customer_emailed', field: record.stage,
          summary: `Emailed ${record.to}: ${UPDATE_STAGE_LABEL[record.stage]}`,
          actorEmail: actor.email, actorName: actor.name,
        }),
      );
    });
  },
```
(import `UPDATE_STAGE_LABEL` from `@/lib/types`.)

`supabase-store.ts`:
```ts
  async getByShareToken(token): Promise<PublicOrderView | null> {
    const o = await orderByToken('share_token', token);
    if (!o) return null;
    const [roster, assets, history] = await Promise.all([rosterOf(o.id), assetsOf(o.id), this.getHistory(o.id)]);
    return publicViewOf(o, roster, assets, history);
  },

  async getByRosterToken(token) {
    const o = await orderByToken('roster_token', token);
    if (!o) return null;
    const [roster, history] = await Promise.all([rosterOf(o.id), this.getHistory(o.id)]);
    return rosterLinkView(o, roster.length, history);
  },

  async recordCustomerEmail(orderId, record, actor) {
    const o = await orderById(orderId, true);
    if (!o) throw new Error(`Order ${orderId} not found`);
    o.customerEmails = [...(o.customerEmails ?? []), record];
    o.updatedAt = new Date().toISOString();
    await putOrder(o);
    await appendHistory([
      logEntry({
        orderId, action: 'customer_emailed', field: record.stage,
        summary: `Emailed ${record.to}: ${UPDATE_STAGE_LABEL[record.stage]}`,
        actorEmail: actor.email, actorName: actor.name,
      }),
    ]);
  },
```
If `this` is not usable inside the object literal's methods in this file's style, call the module-level history loader the file already uses for `getHistory` instead (copy its four lines into a local `historyOf(orderId)` helper).

- [ ] **Step 4: Run tests** — `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"` → all pass (the route-copy tests still call `rosterLinkView(x, 0)`, which now defaults history).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/repository.ts src/lib/data/logic.ts src/lib/data/json-store.ts src/lib/data/supabase-store.ts tests/status/views.test.ts
git commit -m "Stores: record sent customer emails; customer views carry the timeline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Sending (server) and the server actions

**Files:**
- Create: `src/lib/customer-updates.ts`, `src/app/orders/[id]/update-actions.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7; `sendMail`, `mailConfigured` from `@/lib/mail`; `baseUrl` from `@/lib/base-url`.
- Produces:
  ```ts
  // src/lib/customer-updates.ts
  export interface SendUpdateOptions { amount?: string; howToPay?: string; force?: boolean }
  export function mailInputFor(order: Order, history: ChangeLogEntry[], settings: AppSettings, base: string, opts: SendUpdateOptions): UpdateMailInput;
  export function sendCustomerUpdate(orderId: string, stage: UpdateStage, opts: SendUpdateOptions, actor: Actor): Promise<{ sent: true; id: string } | { sent: false; reason: string }>;
  // src/app/orders/[id]/update-actions.ts
  export async function sendUpdateAction(orderId: string, stage: UpdateStage, input: { amount?: string; howToPay?: string; force?: boolean }): Promise<{ ok: boolean; error?: string }>;
  ```

- [ ] **Step 1: The sender**

`src/lib/customer-updates.ts`:
```ts
import { repo } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { MONEY_STAGES, dueUpdates, recipientOf, statusAfterApproval } from '@/lib/data/customer-updates-logic';
import { everInStatus } from '@/lib/data/timeline';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { firstNameOf } from '@/lib/data/mail-layout';
import { mailConfigured, sendMail } from '@/lib/mail';
import { baseUrl } from '@/lib/base-url';
import type { AppSettings, ChangeLogEntry, Order, UpdateStage } from '@/lib/types';

/**
 * Send one stage email to the team, and remember that it went.
 *
 * Best effort, like the confirmation: a failure is a return value and a log
 * line, never a throw. The amount for a request email exists only in `opts`
 * and in the message; nothing here stores it.
 */

export interface SendUpdateOptions {
  amount?: string;
  howToPay?: string;
  /** Resend: skip the once-only check. */
  force?: boolean;
}

export function mailInputFor(order: Order, history: ChangeLogEntry[], settings: AppSettings, base: string, opts: SendUpdateOptions): UpdateMailInput {
  return {
    teamName: order.teamName,
    firstName: firstNameOf(order.contactFirstName),
    rosterUrl: `${base}/roster/${order.rosterToken}`,
    shareUrl: `${base}/share/${order.shareToken}`,
    amount: (opts.amount ?? '').trim(),
    howToPay: (opts.howToPay ?? settings.howToPay).trim(),
    estimatedFinishDate: order.estimatedFinishDate,
    trackingCode: order.trackingCode.trim(),
    paymentReceivedFirst: everInStatus('waiting_for_payment', history, order.status),
    nextAfterApproval: statusAfterApproval(order.status, history) === 'in_production' || order.status === 'in_production' ? 'production' : 'deposit',
    approvedBy: order.approvedBy,
    googleReviewUrl: settings.googleReviewUrl.trim(),
    referralLine: settings.referralLine.trim(),
  };
}

export async function sendCustomerUpdate(
  orderId: string,
  stage: UpdateStage,
  opts: SendUpdateOptions,
  actor: Actor,
): Promise<{ sent: true; id: string } | { sent: false; reason: string }> {
  if (!mailConfigured()) return { sent: false, reason: 'Email is not set up on the server (SMTP_USER / SMTP_PASS).' };
  const bundle = await repo.getOrder(orderId);
  if (!bundle) return { sent: false, reason: 'Order not found.' };
  const { order } = bundle;
  const history = await repo.getHistory(orderId);

  const to = recipientOf(order);
  if (!to) return { sent: false, reason: 'No customer email on this order.' };
  if (MONEY_STAGES.has(stage) && !(opts.amount ?? '').trim()) return { sent: false, reason: 'Type the amount first.' };
  if (!opts.force) {
    const due = dueUpdates(order, history).find((d) => d.stage === stage);
    if (!due) return { sent: false, reason: 'That email is not due for this order (already sent, or the order is at a different stage).' };
    if (due.blocked) return { sent: false, reason: due.blocked };
  }

  const settings = await repo.getSettings();
  const mail = composeUpdateMail(stage, mailInputFor(order, history, settings, await baseUrl(), opts));
  const result = await sendMail({ to, ...mail });
  if (!result.sent) {
    console.error(`[updates] ${stage} NOT sent to ${to} for order ${orderId}: ${result.reason}`);
    return result;
  }
  await repo.recordCustomerEmail(orderId, { stage, sentAt: new Date().toISOString(), to, messageId: result.id }, actor);
  console.log(`[updates] ${stage} sent to ${to} for order ${orderId} (${result.id})`);

  // The two link emails promise a page that collects something. Make sure it does.
  const open = SECTIONS_OPENED_BY[stage];
  if (open) {
    await repo.updateOrder(
      orderId,
      { requestClientDetails: true, clientLinkSections: { ...order.clientLinkSections, ...open } },
      actor,
    );
  }
  return result;
}

/** Which client-link sections a link email switches on when it goes out. */
const SECTIONS_OPENED_BY: Partial<Record<UpdateStage, Partial<Order['clientLinkSections']>>> = {
  design_talk: { logos: true, inspiration: true },
  finalizing_details: { roster: true, personalDetails: true },
};
```

- [ ] **Step 2: The action**

`src/app/orders/[id]/update-actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { currentActor, requireRole } from '@/lib/auth';
import { sendCustomerUpdate } from '@/lib/customer-updates';
import { UPDATE_STAGES, type UpdateStage } from '@/lib/types';

export async function sendUpdateAction(
  orderId: string,
  stage: UpdateStage,
  input: { amount?: string; howToPay?: string; force?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  if (!(UPDATE_STAGES as readonly string[]).includes(stage)) return { ok: false, error: 'Unknown email' };
  const r = await sendCustomerUpdate(orderId, stage, input, actor);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/history`);
  return r.sent ? { ok: true } : { ok: false, error: r.reason };
}
```

- [ ] **Step 3: Type-check and test** — `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/customer-updates.ts "src/app/orders/[id]/update-actions.ts"
git commit -m "Customer updates: compose, send, record

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Approval moves the order on and sends the receipt

**Files:**
- Modify: `src/app/share/[token]/actions.ts:107-121`

- [ ] **Step 1: Change the tail of `approveOrder`**

Replace everything from `await repo.updateOrder(` to `return { ok: true };` with:
```ts
  const client = { email: 'client', name: signedName || view.teamName || 'Client' };
  await repo.updateOrder(
    view.orderId,
    {
      approvedBy: signedName,
      // A calendar date for display, alongside the exact instant on the record.
      approvedDate: today(),
      approvalRecord: record,
    },
    client,
  );

  /*
   * A signature is the go-ahead. Into production if the pre-production deposit
   * is already in, otherwise to the deposit gate; Keenan then sends the deposit
   * email from the panel. Best effort from here: the signature is saved.
   */
  const system = { email: 'system', name: 'Approval' };
  try {
    const history = await repo.getHistory(view.orderId);
    const next = statusAfterApproval(view.status, history);
    if (next) await repo.updateOrder(view.orderId, { status: next }, system);
    await sendCustomerUpdate(view.orderId, 'approval_confirmed', {}, system);
  } catch (e) {
    console.error(`[updates] after approval of ${view.orderId}: ${(e as Error).message}`);
  }

  revalidatePath(`/share/${token}`);
  revalidatePath(`/roster/${token}`);
  revalidatePath(`/orders/${view.orderId}`);
  return { ok: true };
```
Add imports: `import { statusAfterApproval } from '@/lib/data/customer-updates-logic';` and `import { sendCustomerUpdate } from '@/lib/customer-updates';`.

- [ ] **Step 2: Type-check and test** — `npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → pass (the pure rule is tested in Task 3).

- [ ] **Step 3: Commit**

```bash
git add "src/app/share/[token]/actions.ts"
git commit -m "Approval moves the order to production or the deposit gate, and emails the receipt

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The timeline on the customer pages

**Files:**
- Create: `src/components/timeline.tsx`
- Modify: `src/app/roster/[token]/page.tsx` (after the heading `<div>`), `src/app/share/[token]/page.tsx` (replace the `StatusBadge` at the top)

- [ ] **Step 1: The component**

`src/components/timeline.tsx`:
```tsx
import { formatLong } from '@/lib/dates';
import type { TimelineStep } from '@/lib/data/timeline';

/**
 * Where the order is, as a vertical list. Done steps ticked, the current step
 * gold with its line and detail, the rest grey. Server component, no state.
 */
export function Timeline({ steps, compact = false }: { steps: TimelineStep[]; compact?: boolean }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, n) => {
        const last = n === steps.length - 1;
        const dot =
          s.state === 'done'
            ? 'bg-ppc-gold text-black'
            : s.state === 'current'
              ? 'border-2 border-ppc-gold bg-background text-ppc-gold'
              : 'border border-line bg-surface text-muted';
        const rail = s.state === 'done' ? 'bg-ppc-gold/60' : 'bg-line';
        return (
          <li key={s.key} className="relative flex gap-3">
            <div className="flex w-6 shrink-0 flex-col items-center">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${dot}`} aria-hidden>
                {s.state === 'done' ? '✓' : s.state === 'current' ? '●' : ''}
              </span>
              {!last && <span className={`w-px flex-1 ${rail}`} style={{ minHeight: compact ? 14 : 22 }} />}
            </div>
            <div className={`min-w-0 flex-1 ${last ? 'pb-0' : compact ? 'pb-3' : 'pb-5'}`}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <p className={`text-sm ${s.state === 'current' ? 'font-bold text-ppc-gold' : s.state === 'done' ? 'font-semibold' : 'text-muted'}`}>
                  {s.label}
                </p>
                {s.date && <p className="text-xs text-muted">{formatLong(s.date)}</p>}
              </div>
              {s.state === 'current' && s.copy && <p className="mt-0.5 text-sm text-fg">{s.copy}</p>}
              {s.state === 'done' && !compact && s.copy && s.key === 'proof' && <p className="mt-0.5 text-xs text-muted">{s.copy}</p>}
              {s.detail && <p className="mt-1 text-sm font-semibold">{s.detail}</p>}
              {s.note && <p className="mt-1 text-xs text-muted">{s.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: The team's page**

`src/app/roster/[token]/page.tsx`: import `Timeline` from `@/components/timeline`. Directly after the closing `</div>` of the heading block (the one that ends with the `ROUTE_COPY` branch, line 69), insert:
```tsx
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">Where your order is</p>
        <Timeline steps={link.timeline} />
      </div>
```
Also change the locked panel so it points at the timeline instead of a dead end: in the `link.locked` branch replace the first paragraph's text with `Your order is being made.` (unchanged) and the second with:
```tsx
            Everything you sent is locked in. The timeline above shows where it is; if something needs changing, reply to any of our emails and we&apos;ll tell you straight away what&apos;s still possible.
```

- [ ] **Step 3: The order sheet**

`src/app/share/[token]/page.tsx`: import `Timeline`. Replace `<StatusBadge status={view.status} size="lg" />` in the header with nothing, and insert before `<Section title="Order Information">`:
```tsx
      <Section title="Where your order is">
        <Timeline steps={view.timeline} />
      </Section>
```
Remove `StatusBadge` from the `@/components/ui` import if it is now unused.

- [ ] **Step 4: Look at it**

`npm run dev`; open the roster and share links of any order from the orders list (Copy Share Link / Copy Client Form Link on an order page). Both show the timeline; the current step is gold. Phone width (390px) has no horizontal scroll. Stop the server.

- [ ] **Step 5: Type-check, test, commit**

```bash
npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
git add src/components/timeline.tsx "src/app/roster/[token]/page.tsx" "src/app/share/[token]/page.tsx"
git commit -m "Timeline on the team's page and the order sheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The staff order page: timeline, send panel, sent list

**Files:**
- Create: `src/components/send-update-panel.tsx`
- Modify: `src/app/orders/[id]/page.tsx` (Operational section)

- [ ] **Step 1: The panel (client)**

`src/components/send-update-panel.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import type { DueUpdate } from '@/lib/data/customer-updates-logic';
import { UPDATE_STAGE_LABEL, type CustomerEmailRecord, type UpdateStage } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { sendUpdateAction } from '@/app/orders/[id]/update-actions';

/**
 * "Email the customer this update?" One card per due email: recipient,
 * subject, a preview, the amount box for the three request emails, Send and
 * Not now. Below it, what has already gone, each with Resend.
 */
export function SendUpdatePanel({
  orderId,
  to,
  due,
  sent,
  preview,
}: {
  orderId: string;
  to: string;
  due: DueUpdate[];
  sent: CustomerEmailRecord[];
  /** Everything the composer needs except the amount, which is typed here. */
  preview: UpdateMailInput;
}) {
  const [hidden, setHidden] = useState<Set<UpdateStage>>(new Set());
  const [open, setOpen] = useState<UpdateStage | null>(null);
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [howToPay, setHowToPay] = useState(preview.howToPay);
  const [msg, setMsg] = useState<{ stage: string; text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();

  function send(stage: UpdateStage, force = false) {
    setMsg(null);
    start(async () => {
      const r = await sendUpdateAction(orderId, stage, { amount: amount[stage] ?? '', howToPay, force });
      setMsg({ stage, text: r.ok ? 'Sent.' : r.error ?? 'Could not send', ok: r.ok });
    });
  }

  const visible = due.filter((d) => !hidden.has(d.stage));
  const chips = due.filter((d) => hidden.has(d.stage));

  return (
    <div className="space-y-3">
      {visible.map((d) => {
        const m = composeUpdateMail(d.stage, { ...preview, amount: amount[d.stage] ?? '', howToPay });
        const canSend = !d.blocked && (!d.needsAmount || (amount[d.stage] ?? '').trim().length > 0);
        return (
          <div key={d.stage} className="rounded-xl border border-ppc-gold/50 bg-ppc-gold/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Email the customer?</p>
            <p className="mt-1 text-base font-bold">{UPDATE_STAGE_LABEL[d.stage]}</p>
            <p className="text-sm text-muted">To {to || 'nobody yet'} · Subject: {m.subject}</p>
            {d.blocked && <p className="mt-2 text-sm text-amber-300">{d.blocked}</p>}
            {d.needsAmount && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted">Amount, exactly as it should read</label>
                  <input className="mt-1 w-full" placeholder="$250" value={amount[d.stage] ?? ''} onChange={(e) => setAmount((a) => ({ ...a, [d.stage]: e.target.value }))} />
                  <p className="mt-1 text-xs text-muted">Goes into this email only. Not saved anywhere.</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">How to pay</label>
                  <textarea className="mt-1 w-full" rows={3} value={howToPay} onChange={(e) => setHowToPay(e.target.value)} />
                </div>
              </div>
            )}
            <button type="button" className="mt-3 text-xs font-semibold text-ppc-gold hover:underline" onClick={() => setOpen(open === d.stage ? null : d.stage)}>
              {open === d.stage ? 'Hide preview' : 'Preview'}
            </button>
            {open === d.stage && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-xs">{m.text}</pre>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={!canSend || pending} className="rounded-lg bg-ppc-gold px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-50" onClick={() => send(d.stage)}>
                {pending ? 'Sending…' : 'Send'}
              </button>
              <button type="button" className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted" onClick={() => setHidden((h) => new Set(h).add(d.stage))}>
                Not now
              </button>
              {msg?.stage === d.stage && <span className={`text-xs font-semibold ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</span>}
            </div>
          </div>
        );
      })}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((d) => (
            <button key={d.stage} type="button" className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:border-ppc-gold/60 hover:text-ppc-gold" onClick={() => setHidden((h) => { const n = new Set(h); n.delete(d.stage); return n; })}>
              {UPDATE_STAGE_LABEL[d.stage]} email not sent · Send
            </button>
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted">Sent to the customer</p>
          <ul className="mt-1 space-y-1 text-sm">
            {[...sent].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).map((r, n) => (
              <li key={`${r.stage}-${r.sentAt}-${n}`} className="flex flex-wrap items-center gap-x-3">
                <span className="font-semibold">{UPDATE_STAGE_LABEL[r.stage]}</span>
                <span className="text-muted">{formatTimestamp(r.sentAt)} · {r.to}</span>
                <button type="button" disabled={pending} className="text-xs font-semibold text-ppc-gold hover:underline" onClick={() => send(r.stage, true)}>Resend</button>
                {msg?.stage === r.stage && <span className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.length === 0 && chips.length === 0 && sent.length === 0 && (
        <p className="text-sm text-muted">Nothing to send at this stage.</p>
      )}
    </div>
  );
}
```
If importing a server-action file into a client component by its bracketed path fails to resolve, move `update-actions.ts` to `src/app/orders/update-actions.ts` and import from `@/app/orders/update-actions`.

- [ ] **Step 2: Wire the order page**

In `src/app/orders/[id]/page.tsx`: add imports
```ts
import { Timeline } from '@/components/timeline';
import { SendUpdatePanel } from '@/components/send-update-panel';
import { dueUpdates, recipientOf } from '@/lib/data/customer-updates-logic';
import { timelineOf } from '@/lib/data/timeline';
import { mailInputFor } from '@/lib/customer-updates';
```
After `const history = await repo.getHistory(order.id);` add:
```ts
  const settings = await repo.getSettings();
  const timeline = timelineOf(order, history);
  const due = dueUpdates(order, history);
  const preview = mailInputFor(order, history, settings, BASE_URL, {});
```
Replace the `<Section title="Operational">…</Section>` block with:
```tsx
      <Section title="Operational">
        <OperationalControls
          orderId={order.id}
          status={order.status}
          estimatedFinishDate={order.estimatedFinishDate}
          productionStartDate={order.productionStartDate}
          productionFinishDate={order.productionFinishDate}
          jerseyType={order.jerseyType}
          trackingCode={order.trackingCode}
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">What the customer sees</p>
            <Timeline steps={timeline} compact />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Customer emails</p>
            <SendUpdatePanel orderId={order.id} to={recipientOf(order)} due={due} sent={order.customerEmails} preview={preview} />
          </div>
        </div>
      </Section>
```
`mailInputFor` is a plain function in a server module; importing it into a server component is fine. The `preview` object is all strings/booleans/null, so it serialises to the client.

- [ ] **Step 3: Try it**

`npm run dev`; open an order; set its status to Design Talk in the dropdown; reload; the panel offers "Send us your logos and inspiration" with a preview. With no SMTP locally, Send reports "Email is not set up on the server". Set the status to Waiting for Initial Deposit; the amount box appears and Send stays disabled until it's filled. Stop the server.

- [ ] **Step 4: Type-check, test, commit**

```bash
npx tsc --noEmit -p . && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
git add src/components/send-update-panel.tsx "src/app/orders/[id]/page.tsx"
git commit -m "Order page: the customer's timeline and the send-update panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: The money-rule sentence, deploy, and the live walk-through

**Files:**
- Modify: `CLAUDE.md:40-41`

- [ ] **Step 1: Record the exception**

After the money rule's two lines in `CLAUDE.md`, add:
```
  The one exception, decided 2026-09-25: the three request emails (initial
  deposit, pre-production deposit, final payment) carry an amount Keenan types
  into the send panel. It goes into that email and nowhere else.
```

- [ ] **Step 2: Push and deploy**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: the one money exception, the amount in a request email

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin main
```
Then apply the migration to the Supabase project (paste `supabase/migrations/0006_app_settings.sql` into the SQL editor, the way 0005 was applied) and confirm the deployment is Ready: `npx vercel ls ppc-order-manager --scope work-base`.

- [ ] **Step 3: Live walk-through**

1. Open `/settings` on orders.powerplaycustoms.ca, confirm the default how-to-pay text, save.
2. Create a test order "Status Test — ignore" with contact email `info@powerplaycustoms.ca`, a jersey type, and 12 jerseys.
3. Move it through Design Talk → Finalizing Details → Waiting for Initial Deposit ($50) → Waiting for Approval → (sign from the roster link) → confirm it lands in Pre-Production Deposit and the receipt arrived → send the deposit email ($400) → In Production (set a finish date) → Waiting for Final Approval → Final Payment Due ($400) → Shipped (tracking `TEST123`) → Completed. Send each offered email. Read each one in the info@ mailbox and check the button opens the right page.
4. Open the roster and share links at every stage on a phone.
5. Delete the test order.

- [ ] **Step 4: Note it**

Append a dated line to `K:\PP Customs\Website\STATUS.md` saying the feature is live, what was verified, and anything left.
