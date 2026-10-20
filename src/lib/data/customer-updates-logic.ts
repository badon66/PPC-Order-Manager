import { STATUS_META } from '@/lib/constants';
import type { ChangeLogEntry, MockupVersion, Order, OrderStatus, PaymentKind, UpdateStage } from '@/lib/types';

/**
 * A typed deposit amount as the email prints it. The staff box shows the $
 * already, so Keenan types just the number ("250" becomes "$250"); a $ typed
 * anyway isn't doubled, and anything that isn't a number ("half the total")
 * goes through as typed.
 */
export function formatAmount(raw: string): string {
  const t = raw.trim();
  const rest = t.replace(/^\$\s*/, '');
  return /^\d/.test(rest) ? `$${rest}` : t;
}

/**
 * Which update emails the staff panel should offer for an order, and where an
 * approval sends it. Pure; the sending lives in src/lib/customer-updates.ts.
 *
 * Every email is offered at most once per order (customerEmails remembers
 * what went out), except `payment_received` — repeatable, since it confirms
 * whichever payment (initial deposit, pre-production deposit, final payment)
 * last arrived, and each is worth its own confirmation. It's offered at every
 * status: teams pay early, sometimes all of it during Design Talk (Keenan,
 * 2026-10-16), and the email says what an early payment covers. Nothing here
 * sends anything.
 */

export const MONEY_STAGES: ReadonlySet<UpdateStage> = new Set<UpdateStage>([
  'initial_deposit_requested', 'production_deposit_requested', 'final_payment_requested',
]);

/**
 * `messageId` on a sent-email row that was recorded by hand ("Already sent")
 * rather than by an actual send. Tells the panel not to show a recipient or
 * offer a plain Resend for it.
 */
export const MANUAL_MESSAGE_ID = 'manual';

export interface DueUpdate {
  stage: UpdateStage;
  /** The panel must collect an amount before this one can send. */
  needsAmount: boolean;
  /** Why Send is not offered, or null when it can go. */
  blocked: string | null;
  /** Whether this one may be offered again after already being sent. */
  repeatable: boolean;
  /** Which kind of payment this is, for stages that record one. */
  paymentKind: PaymentKind | null;
  /** For `mockup_ready`: the round to offer next, one past the last one sent. */
  mockupVersion: MockupVersion | null;
}

/** The next mockup round, from what has already gone: nothing sent → V1, V2 sent → V3, V4 sent → V4 again. */
export function nextMockupVersion(sent: Array<{ stage: UpdateStage; detail?: string }>): MockupVersion {
  const versions: readonly MockupVersion[] = ['V1', 'V2', 'V3', 'V4'];
  let top = -1;
  for (const r of sent) {
    if (r.stage !== 'mockup_ready') continue;
    const n = versions.indexOf((r.detail ?? '') as MockupVersion);
    if (n > top) top = n;
  }
  return versions[Math.min(top + 1, versions.length - 1)];
}

export type DueInput = Pick<
  Order,
  'status' | 'trackingCode' | 'customerEmails' | 'approvedDate' | 'approvalRecord' | 'contactEmail'
>;

const pos = (s: OrderStatus) => STATUS_META[s].order;
const GATE = 'waiting_for_production_deposit' as const;

/** The contact email, trimmed. Website orders always have one; hand-made orders may not. */
export function recipientOf(order: Pick<Order, 'contactEmail'>): string {
  return (order.contactEmail ?? '').trim();
}

/** Which payment a "payment received" email should default to, given where the order sits. Keenan can pick any of the three. */
export function defaultPaymentKind(status: OrderStatus): PaymentKind {
  const p = pos(status);
  if (p <= pos('waiting_for_deposit')) return 'initial_deposit';
  if (p <= pos('in_production')) return 'production_deposit';
  return 'final_payment';
}

export function dueUpdates(order: DueInput, _history: ChangeLogEntry[]): DueUpdate[] {
  const sent = new Set(order.customerEmails.map((r) => r.stage));
  const s = order.status;
  const p = pos(s);
  const approved = Boolean(order.approvedDate || order.approvalRecord);
  const out: DueUpdate[] = [];
  const offer = (
    stage: UpdateStage,
    blocked: string | null = null,
    extra: { repeatable?: boolean; paymentKind?: PaymentKind | null; mockupVersion?: MockupVersion | null } = {}
  ) => {
    if (!extra.repeatable && sent.has(stage)) return;
    out.push({
      stage,
      needsAmount: MONEY_STAGES.has(stage),
      blocked,
      repeatable: !!extra.repeatable,
      paymentKind: extra.paymentKind ?? null,
      mockupVersion: extra.mockupVersion ?? null,
    });
  };

  if (s === 'design_talk') offer('design_talk');
  // Optional and repeatable: one per round of the mockup, only while designing.
  if (s === 'design_talk') offer('mockup_ready', null, { repeatable: true, mockupVersion: nextMockupVersion(order.customerEmails) });
  if (s === 'finalizing_details') offer('finalizing_details');
  if (s === 'waiting_for_deposit') offer('initial_deposit_requested');
  if (s === 'waiting_for_approval' && !approved) offer('proof_ready');
  if (approved && p <= pos('in_production')) offer('approval_confirmed');
  if (s === GATE) offer('production_deposit_requested');
  if (s === 'in_production') offer('in_production');
  // "The jerseys are done" goes out with the photos as soon as production
  // finishes, before the money — and stays on offer until it's sent.
  if (s === 'waiting_for_final_approval' || s === 'waiting_for_payment') offer('final_payment_requested');
  if (s === 'shipped') offer('shipped', order.trackingCode.trim() ? null : 'Add a tracking code first.');
  if (s === 'completed') offer('completed');
  // Any of the three payments, at any stage — paid early is common. The kind
  // only defaults from the status; the panel offers all three.
  offer('payment_received', null, { repeatable: true, paymentKind: defaultPaymentKind(s) });
  if (s === 'completed') offer('review_request');

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
