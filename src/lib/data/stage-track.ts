import { STATUS_META, awaitingFinish } from '@/lib/constants';
import { daysBetween, dueStatus, formatShort, timestampDay } from '@/lib/dates';
import { enteredOn } from './timeline';
import { dueUpdates } from './customer-updates-logic';
import { paymentsOn } from '@/lib/payments';
import type { CalendarDate } from '@/lib/dates';
import type { ChangeLogEntry, Order, OrderStatus } from '@/lib/types';

/**
 * Where an order is, for Keenan.
 *
 * The customer timeline (timeline.ts) tells a team what's happening in their
 * words. This is the other side of the counter: every real stage, what it's
 * waiting on, how long it has been waiting, and the things on this order
 * that need a hand before it can move. Pure — an order, its log and today in,
 * a description out — so it reads the same on the board card, the order page
 * and in a test.
 */

/** The stages shown on the track, in order. Incomplete is folded into Draft. */
export const TRACK_STATUSES: OrderStatus[] = [
  'draft',
  'design_talk',
  'finalizing_details',
  'waiting_for_deposit',
  'waiting_for_approval',
  'waiting_for_production_deposit',
  'in_production',
  'waiting_for_final_approval',
  'waiting_for_payment',
  'shipped',
  'completed',
];

/** Short enough to sit under a dot. */
export const TRACK_LABEL: Record<OrderStatus, string> = {
  incomplete: 'Setup',
  draft: 'Setup',
  design_talk: 'Design',
  finalizing_details: 'Details',
  waiting_for_deposit: 'Deposit',
  waiting_for_approval: 'Sign-off',
  waiting_for_production_deposit: 'Pre-prod deposit',
  in_production: 'Production',
  waiting_for_final_approval: 'Final check',
  waiting_for_payment: 'Final payment',
  shipped: 'Shipped',
  completed: 'Completed',
};

export interface StageNode {
  status: OrderStatus;
  label: string;
  state: 'done' | 'current' | 'upcoming';
  /** One short fact under the label: a date it happened, or a thing that's in. */
  fact: string | null;
}

export interface StageSummary {
  nodes: StageNode[];
  current: OrderStatus;
  /** Where on the track we are, 0-based, for meters. */
  index: number;
  /** When the order entered its current stage, when the log knows. */
  inStageSince: CalendarDate | null;
  daysInStage: number | null;
  /** What's happening, in a sentence. */
  headline: string;
  /** What moves it to the next stage. */
  next: string;
  /** Things on THIS order that need a hand. Empty is good news. */
  attention: string[];
  finish: {
    date: CalendarDate | null;
    /** Days until (positive) or past (negative) the estimate; null without a date. */
    delta: number | null;
    tone: 'overdue' | 'due-soon' | 'scheduled' | 'none' | 'done';
  };
}

export type StageInput = Pick<
  Order,
  | 'status' | 'createdAt' | 'estimatedFinishDate' | 'productionStartDate' | 'productionFinishDate'
  | 'approvedDate' | 'approvalRecord' | 'approvedBy' | 'datePaid' | 'completedAt' | 'sentToFactoryAt'
  | 'trackingCode' | 'customerEmails' | 'paymentsReceived' | 'contactEmail' | 'requestApproval'
>;

const pos = (s: OrderStatus) => STATUS_META[s].order;

/** The day the order entered its current stage: the log, or creation if it started there. */
export function inStageSince(order: StageInput, history: ChangeLogEntry[]): CalendarDate | null {
  const hits = history
    .filter((h) => h.action === 'status_changed')
    .sort((a, b) => b.at.localeCompare(a.at));
  if (hits.length === 0) return timestampDay(order.createdAt);
  // The newest status change that landed on the current status. If the newest
  // change isn't to the current status the data's odd; fall back to it anyway.
  const toHere = hits.find((h) => h.toValue === order.status) ?? hits[0];
  return timestampDay(toHere.at);
}

function headlineFor(s: OrderStatus, o: StageInput, pay: ReturnType<typeof paymentsOn>): { headline: string; next: string } {
  const approved = Boolean(o.approvedDate || o.approvalRecord);
  switch (s) {
    case 'incomplete':
      return { headline: 'Not a real order yet.', next: 'Fill in the basics, then start the design conversation.' };
    case 'draft':
      return { headline: 'Drafted, not started.', next: 'Open the design conversation with the team.' };
    case 'design_talk':
      return { headline: 'Working out the design with the team.', next: 'Colours, logos and the look settled → Finalizing Details.' };
    case 'finalizing_details':
      return { headline: 'Nailing down roster, sizes and shipping.', next: 'Roster and address in → ask for the initial deposit.' };
    case 'waiting_for_deposit':
      return pay.initialDeposit
        ? { headline: 'Initial deposit is in.', next: 'Move it on and send the proof.' }
        : { headline: 'Waiting on the initial deposit.', next: 'Deposit lands → mark it received, send the proof.' };
    case 'waiting_for_approval':
      return approved
        ? { headline: `Signed off${o.approvedBy ? ` by ${o.approvedBy}` : ''}.`, next: 'Ask for the pre-production deposit.' }
        : { headline: 'Proof is with the team.', next: 'They sign off → pre-production deposit. Nothing is locked until they do.' };
    case 'waiting_for_production_deposit':
      return pay.productionDeposit
        ? { headline: 'Pre-production deposit is in.', next: 'Send it to the factory.' }
        : { headline: 'Waiting on the pre-production deposit (to 50%).', next: 'Deposit lands → mark it, send to factory, In Production.' };
    case 'in_production':
      return {
        headline: o.sentToFactoryAt ? `At the factory since ${formatShort(o.sentToFactoryAt)}.` : 'At the factory.',
        next: 'Michael sends the done photos → Final Check with the team.',
      };
    case 'waiting_for_final_approval':
      return { headline: 'Done photos are with the team.', next: 'They approve → final payment.' };
    case 'waiting_for_payment':
      return pay.finalPayment
        ? { headline: 'Paid in full.', next: 'Ship it.' }
        : { headline: 'Waiting on the final payment.', next: 'Payment lands → ship, add the UPS number.' };
    case 'shipped':
      return { headline: 'On its way with UPS.', next: 'Delivered and happy → Completed, then the review ask.' };
    case 'completed':
      return { headline: 'Done.', next: 'Nothing. Reorder when they come back.' };
  }
}

export function stageSummary(order: StageInput, history: ChangeLogEntry[], today: CalendarDate): StageSummary {
  const current = order.status === 'incomplete' ? 'draft' : order.status;
  const here = pos(current);
  const pay = paymentsOn(order);
  const approved = Boolean(order.approvedDate || order.approvalRecord);

  const nodes: StageNode[] = TRACK_STATUSES.map((s) => {
    const p = pos(s);
    const state: StageNode['state'] = p < here ? 'done' : p === here ? 'current' : 'upcoming';
    let fact: string | null = null;
    if (state !== 'upcoming') {
      const on = s === 'draft' ? timestampDay(order.createdAt) : enteredOn(s, history);
      fact = on ? formatShort(on) : null;
      switch (s) {
        case 'waiting_for_deposit':
          if (pay.initialDeposit) fact = 'In';
          break;
        case 'waiting_for_approval':
          if (approved) fact = `Signed ${formatShort(order.approvedDate ?? (order.approvalRecord ? timestampDay(order.approvalRecord.signedAt) : null) ?? on ?? today)}`;
          break;
        case 'waiting_for_production_deposit':
          if (pay.productionDeposit) fact = 'In';
          break;
        case 'in_production':
          if (order.sentToFactoryAt) fact = `Out ${formatShort(order.sentToFactoryAt)}`;
          break;
        case 'waiting_for_payment':
          if (pay.finalPayment) fact = order.datePaid ? `Paid ${formatShort(order.datePaid)}` : 'Paid';
          break;
        case 'shipped':
          if (order.completedAt) fact = formatShort(order.completedAt);
          break;
      }
    } else if (s === 'in_production' && order.estimatedFinishDate) {
      fact = `Est. ${formatShort(order.estimatedFinishDate)}`;
    }
    return { status: s, label: TRACK_LABEL[s], state, fact };
  });

  const since = inStageSince(order, history);
  const days = since ? daysBetween(since, today) : null;
  const { headline, next } = headlineFor(order.status, order, pay);

  /* Finish date, read the way the board reads it: a promise until Shipped, history after. */
  const finishing = awaitingFinish(order.status);
  let finish: StageSummary['finish'];
  if (!finishing) {
    finish = { date: order.completedAt, delta: null, tone: 'done' };
  } else if (!order.estimatedFinishDate) {
    finish = { date: null, delta: null, tone: 'none' };
  } else {
    const d = dueStatus(order.estimatedFinishDate, 7, today);
    finish = {
      date: order.estimatedFinishDate,
      delta: daysBetween(today, order.estimatedFinishDate),
      tone: d === 'overdue' ? 'overdue' : d === 'due-soon' ? 'due-soon' : 'scheduled',
    };
  }

  /* What needs a hand on this order, specifically. */
  const attention: string[] = [];
  const live = pos(order.status) >= pos('design_talk') && order.status !== 'completed';
  if (live && finishing && !order.estimatedFinishDate) attention.push('No estimated finish date set.');
  if (finish.tone === 'overdue' && finish.delta !== null) {
    attention.push(`${Math.abs(finish.delta)} day${Math.abs(finish.delta) === 1 ? '' : 's'} past the estimated finish.`);
  }
  const sentStages = new Set(order.customerEmails.map((e) => e.stage));
  if (order.status === 'waiting_for_approval' && !approved && !sentStages.has('proof_ready')) {
    attention.push("Proof email hasn't gone out, so they can't sign off.");
  }
  if (order.status === 'in_production' && !order.sentToFactoryAt) attention.push('Not marked as sent to the factory.');
  if (order.status === 'shipped' && !order.trackingCode.trim()) attention.push('No UPS tracking number on the order.');
  // Payments the stage implies but nobody has marked: the money side goes stale quietly.
  if (pay.source === 'inferred' && !pay.finalPayment) {
    if (pay.initialDeposit) attention.push('Initial deposit looks in but isn’t marked received.');
    if (pay.productionDeposit) attention.push('Pre-production deposit looks in but isn’t marked received.');
  }
  const owed = dueUpdates(order, history).filter((d) => d.stage !== 'payment_received');
  if (owed.length) attention.push(`${owed.length} update${owed.length === 1 ? '' : 's'} owed to the team.`);
  if (!order.contactEmail.trim() && live) attention.push('No customer email on the order.');

  return {
    nodes,
    current,
    index: TRACK_STATUSES.indexOf(current),
    inStageSince: since,
    daysInStage: days,
    headline,
    next,
    attention,
    finish,
  };
}
