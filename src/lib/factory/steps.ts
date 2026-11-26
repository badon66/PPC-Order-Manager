import type { ChangeLogEntry, Order, OrderStatus } from '@/lib/types';
import { STATUS_META } from '@/lib/constants';
import { formatLong } from '@/lib/dates';
import { MONEY_ACTIONS, usd } from './money';

/**
 * Where a job is at the factory (Keenan, 2026-11-25).
 *
 * Michael moves a job through six steps on his dashboard. Keenan is told
 * about every move. Two of them — Completed and Shipped — are REQUESTS: they
 * set off customer emails and money on Keenan's side, so the job only reaches
 * them once Keenan approves.
 *
 * STORED AS HISTORY, like the sheet notes (lib/page-notes.ts): each move, each
 * request, each approval is an append-only change-log entry, and the state is
 * worked out from them here. Nothing the factory does writes the order row,
 * so it can never collide with Keenan's autosave or overwrite a field of his.
 * The one thing that does change the order — its status and tracking number
 * on approval — is written by Keenan's own action, through the normal path.
 */

export const FACTORY_STEPS = ['received', 'prepping', 'in_production', 'almost_finished', 'completed', 'shipped'] as const;
export type FactoryStep = (typeof FACTORY_STEPS)[number];

export const FACTORY_STEP_LABEL: Record<FactoryStep, string> = {
  received: 'Received',
  prepping: 'Prepping',
  in_production: 'In production',
  almost_finished: 'Almost finished',
  completed: 'Completed',
  shipped: 'Shipped',
};

/** The two that need Keenan's approval before they count. */
export const GATED_STEPS: readonly FactoryStep[] = ['completed', 'shipped'];

export const isFactoryStep = (v: unknown): v is FactoryStep => (FACTORY_STEPS as readonly string[]).includes(v as string);
export const isGated = (s: FactoryStep) => GATED_STEPS.includes(s);

/** The history actions this file owns. */
export const FACTORY_ACTIONS = [
  'factory_step', 'factory_step_requested', 'factory_step_approved', 'factory_step_declined',
  'factory_finish_date', 'factory_seen', 'factory_ack',
  // The money between Powerplay and the factory rides in the same history (lib/factory/money.ts).
  ...MONEY_ACTIONS,
] as const;

export interface PendingStep {
  /** The request entry's id — what an approval names. */
  id: string;
  step: FactoryStep;
  tracking: string;
  by: string;
  at: string;
}

export interface FactoryState {
  /** The step the job is at. null = sent, not yet marked Received. */
  step: FactoryStep | null;
  stepAt: string | null;
  stepBy: string;
  /** A Completed / Shipped request Keenan hasn't answered. */
  pending: PendingStep | null;
  /** The factory's own expected finish date (YYYY-MM-DD), or ''. */
  finishDate: string;
  /** When someone at the factory last opened the job. */
  seenAt: string | null;
  /** When Keenan last cleared the factory's activity on this order. */
  ackAt: string | null;
}

const byTime = (a: ChangeLogEntry, b: ChangeLogEntry) => a.at.localeCompare(b.at);

/** The factory's state for one order, from that order's history (any order, any actions). */
export function factoryStateOf(history: ChangeLogEntry[]): FactoryState {
  const s: FactoryState = { step: null, stepAt: null, stepBy: '', pending: null, finishDate: '', seenAt: null, ackAt: null };
  for (const h of [...history].sort(byTime)) {
    switch (h.action) {
      case 'factory_step':
        if (isFactoryStep(h.toValue)) {
          s.step = h.toValue;
          s.stepAt = h.at;
          s.stepBy = h.actorName;
          // Moving on by hand withdraws a request that was waiting.
          s.pending = null;
        }
        break;
      case 'factory_step_requested':
        if (isFactoryStep(h.toValue)) {
          s.pending = { id: h.id, step: h.toValue, tracking: (h.fromValue ?? '').trim(), by: h.actorName, at: h.at };
        }
        break;
      case 'factory_step_approved':
        // Only the request it names, and only while that request is the one waiting.
        if (s.pending && h.field === s.pending.id) {
          s.step = s.pending.step;
          s.stepAt = h.at;
          s.stepBy = s.pending.by;
          s.pending = null;
        }
        break;
      case 'factory_step_declined':
        if (s.pending && h.field === s.pending.id) s.pending = null;
        break;
      case 'factory_finish_date':
        s.finishDate = /^\d{4}-\d{2}-\d{2}$/.test(h.toValue ?? '') ? (h.toValue as string) : '';
        break;
      case 'factory_seen':
        s.seenAt = h.at;
        break;
      case 'factory_ack':
        s.ackAt = h.at;
        break;
    }
  }
  return s;
}

/**
 * Is this order one the factory may see? Sent to the factory, or in
 * production or beyond — never a draft, a design in progress, or a deleted
 * order. EVERY factory read and write checks this; an order id alone opens
 * nothing.
 */
export function isFactoryJob(o: Pick<Order, 'status' | 'sentToFactoryAt' | 'deletedAt'>): boolean {
  if (o.deletedAt) return false;
  if ((o.sentToFactoryAt ?? '').trim()) return true;
  return STATUS_META[o.status].order >= STATUS_META.in_production.order;
}

/** What Michael asked for when he tapped a step: move now, or ask Keenan. */
export function planStepChange(
  state: FactoryState,
  step: FactoryStep,
): { kind: 'move' } | { kind: 'request' } | { kind: 'none'; reason: string } {
  if (state.pending?.step === step) return { kind: 'none', reason: 'Already waiting for Powerplay to approve that.' };
  if (!state.pending && state.step === step) return { kind: 'none', reason: 'The job is already at that step.' };
  return isGated(step) ? { kind: 'request' } : { kind: 'move' };
}

/**
 * What approving a request changes on Keenan's order. Never moves a status
 * BACKWARDS, never overwrites a tracking number with a blank.
 *   Completed → production finished today (if not already dated) and, from In
 *               Production, on to the final check.
 *   Shipped   → the tracking number (when one was given) and, from anything
 *               before it, Shipped.
 */
export function orderPatchOnApproval(
  o: Pick<Order, 'status' | 'productionFinishDate' | 'trackingCode'>,
  pending: Pick<PendingStep, 'step' | 'tracking'>,
  today: string,
): Partial<Order> {
  const patch: Partial<Order> = {};
  const at = (s: OrderStatus) => STATUS_META[s].order;
  if (pending.step === 'completed') {
    if (!o.productionFinishDate) patch.productionFinishDate = today;
    if (o.status === 'in_production') patch.status = 'waiting_for_final_approval';
  } else if (pending.step === 'shipped') {
    if (pending.tracking && pending.tracking !== (o.trackingCode ?? '').trim()) patch.trackingCode = pending.tracking;
    if (!o.productionFinishDate) patch.productionFinishDate = today;
    if (at(o.status) < at('shipped')) patch.status = 'shipped';
  }
  return patch;
}

/** One line of what the factory did, for Keenan's list. Only factory actions; others give null. */
export interface FactoryActivity {
  id: string;
  at: string;
  by: string;
  text: string;
  /** A request still waiting for Keenan. */
  needsApproval: boolean;
}

/** What the factory did on an order, newest first, with whether Keenan has cleared it. */
export function factoryActivityOf(history: ChangeLogEntry[]): { items: FactoryActivity[]; unread: number; state: FactoryState } {
  const state = factoryStateOf(history);
  const items: FactoryActivity[] = [];
  for (const h of history) {
    let text: string | null = null;
    if (h.action === 'factory_step' && isFactoryStep(h.toValue)) text = `Moved to ${FACTORY_STEP_LABEL[h.toValue]}`;
    else if (h.action === 'factory_step_requested' && isFactoryStep(h.toValue)) {
      const tracking = (h.fromValue ?? '').trim();
      text = `Marked ${FACTORY_STEP_LABEL[h.toValue]}${tracking ? ` · tracking ${tracking}` : ''}`;
    } else if (h.action === 'factory_finish_date') text = h.toValue ? `Expects to finish ${formatLong(h.toValue)}` : 'Cleared their finish date';
    else if (h.action === 'factory_cost') {
      const from = h.fromValue ? Number(h.fromValue) : null;
      const to = h.toValue ? Number(h.toValue) : null;
      text = to === null ? 'Cleared their cost' : from === null ? `Set their cost: ${usd(to)} USD` : `Changed their cost: ${usd(from)} → ${usd(to)} USD`;
    } else if (h.action === 'factory_shipping') {
      const to = Number(h.toValue ?? 0);
      text = to > 0 ? `Extra shipping: ${usd(to)} USD` : 'Removed the extra shipping';
    }
    if (text === null) continue;
    items.push({ id: h.id, at: h.at, by: h.actorName, text, needsApproval: state.pending?.id === h.id });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  const unread = items.filter((i) => i.needsApproval || !state.ackAt || i.at > state.ackAt).length;
  return { items, unread, state };
}
