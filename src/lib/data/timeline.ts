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
  /** Where this step's own stage page lives, only while it's the current step. */
  href: string | null;
  /** Label for the link above, paired with href. */
  linkLabel: string | null;
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

export function timelineOf(
  order: TimelineInput,
  history: ChangeLogEntry[],
  opts: { designUrl?: string; detailsUrl?: string } = {},
): TimelineStep[] {
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

    let href: string | null = null;
    let linkLabel: string | null = null;
    if (state === 'current' && d.key === 'designing') {
      href = opts.designUrl ?? null;
      linkLabel = 'Send logos and inspiration';
    } else if (state === 'current' && d.key === 'finalizing') {
      href = opts.detailsUrl ?? null;
      linkLabel = 'Fill in roster and details';
    }

    return { key: d.key, label: d.label, state, copy, date, detail, note, href, linkLabel };
  });
}
