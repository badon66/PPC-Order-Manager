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
