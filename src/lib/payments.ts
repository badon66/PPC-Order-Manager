import { STATUS_META } from './constants';
import { PAYMENT_KIND_LABEL, type Order, type PaymentKind } from './types';

/**
 * What's been paid on an order. KEENAN ONLY (money rule, CLAUDE.md).
 *
 * Two sources, and they do not mix:
 *
 *   MARKED    Keenan ticked payments in the quick-edit popup. Once he has,
 *             what he ticked is the whole truth — untick the final payment and
 *             it is unpaid, whatever the status says. `paymentsReceived` is an
 *             array from then on, empty included.
 *
 *   INFERRED  He never has (`paymentsReceived` is null: an order from before
 *             the popup existed, or one he hasn't touched). Then the best
 *             guess from the order's position: past a deposit gate means that
 *             deposit is in, Completed means paid in full, and a "payment
 *             received" email names its payment.
 *
 * The first version let the guesses override the ticks, so unticking did
 * nothing on screen. It also read `datePaid` as "paid in full", which on an
 * order still in production put "Paid in full" on the board when the truth
 * was "deposit in" — that field has been used for the deposit day as often as
 * the final one, so it is not a signal here at all.
 */

const pos = (s: Order['status']) => STATUS_META[s].order;

export interface PaymentState {
  initialDeposit: boolean;
  productionDeposit: boolean;
  finalPayment: boolean;
  /** Where the answer came from. */
  source: 'marked' | 'inferred';
}

export type PaymentInput = Pick<Order, 'status' | 'customerEmails' | 'paymentsReceived'>;

export function paymentsOn(order: PaymentInput): PaymentState {
  if (order.paymentsReceived !== null && order.paymentsReceived !== undefined) {
    const m = new Set<PaymentKind>(order.paymentsReceived);
    return {
      initialDeposit: m.has('initial_deposit'),
      productionDeposit: m.has('production_deposit'),
      finalPayment: m.has('final_payment'),
      source: 'marked',
    };
  }

  const emailed = new Set<PaymentKind>();
  for (const e of order.customerEmails) {
    if (e.stage !== 'payment_received') continue;
    for (const k of Object.keys(PAYMENT_KIND_LABEL) as PaymentKind[]) {
      if (e.detail === PAYMENT_KIND_LABEL[k]) emailed.add(k);
    }
  }
  const p = pos(order.status);
  const paidInFull = emailed.has('final_payment') || order.status === 'completed';
  return {
    initialDeposit: paidInFull || emailed.has('initial_deposit') || p > pos('waiting_for_deposit'),
    productionDeposit: paidInFull || emailed.has('production_deposit') || p > pos('waiting_for_production_deposit'),
    finalPayment: paidInFull,
    source: 'inferred',
  };
}

/** Any money at all has come in on this order. */
export function hasDeposit(order: PaymentInput): boolean {
  const p = paymentsOn(order);
  return p.initialDeposit || p.productionDeposit || p.finalPayment;
}

/** For the card: how far along the money is, as a short label. */
export function paymentLabel(state: Pick<PaymentState, 'initialDeposit' | 'productionDeposit' | 'finalPayment'>): string {
  if (state.finalPayment) return 'Paid in full';
  if (state.productionDeposit) return 'Deposits in';
  if (state.initialDeposit) return 'Deposit in';
  return 'Nothing paid yet';
}
