import { STATUS_META } from './constants';
import { PAYMENT_KIND_LABEL, type Order, type PaymentKind } from './types';

/**
 * What's been paid on an order. KEENAN ONLY (money rule, CLAUDE.md).
 *
 * There is no payments table; the app records a payment three ways and this
 * reads all of them:
 *
 *   0. Keenan ticked it in the quick-edit popup (`paymentsReceived`). The
 *      deliberate record.
 *   1. A "payment received" email was sent, and its `detail` names which
 *      payment.
 *   2. The order moved PAST a payment gate. You don't take a job out of
 *      Waiting for Initial Deposit until the deposit is in, so the position
 *      implies the payment even when no email went out.
 *
 * `datePaid` counts as the final payment: that field predates the three-stage
 * split and has always meant "paid in full".
 */

const pos = (s: Order['status']) => STATUS_META[s].order;

export interface PaymentState {
  initialDeposit: boolean;
  productionDeposit: boolean;
  finalPayment: boolean;
}

export type PaymentInput = Pick<Order, 'status' | 'datePaid' | 'customerEmails' | 'paymentsReceived'>;

export function paymentsOn(order: PaymentInput): PaymentState {
  const received = new Set<PaymentKind>(order.paymentsReceived ?? []);
  for (const e of order.customerEmails) {
    if (e.stage !== 'payment_received') continue;
    for (const k of Object.keys(PAYMENT_KIND_LABEL) as PaymentKind[]) {
      if (e.detail === PAYMENT_KIND_LABEL[k]) received.add(k);
    }
  }
  const p = pos(order.status);
  const paidInFull = Boolean(order.datePaid) || received.has('final_payment') || order.status === 'completed';
  return {
    initialDeposit: paidInFull || received.has('initial_deposit') || p > pos('waiting_for_deposit'),
    productionDeposit: paidInFull || received.has('production_deposit') || p > pos('waiting_for_production_deposit'),
    finalPayment: paidInFull,
  };
}

/** Any money at all has come in on this order. */
export function hasDeposit(order: PaymentInput): boolean {
  return paymentsOn(order).initialDeposit;
}

/** For the card: how far along the money is, as a short label. */
export function paymentLabel(state: PaymentState): string {
  if (state.finalPayment) return 'Paid in full';
  if (state.productionDeposit) return 'Deposits in';
  if (state.initialDeposit) return 'Deposit in';
  return 'Nothing paid yet';
}
