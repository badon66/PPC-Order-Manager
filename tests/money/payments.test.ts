import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankOrder } from '@/lib/order-utils';
import { hasDeposit, paymentLabel, paymentsOn } from '@/lib/payments';
import type { Order } from '@/lib/types';

function at(status: Order['status'], over: Partial<Order> = {}): Order {
  return { ...blankOrder(), status, ...over };
}

/* Marked: what Keenan ticked is the whole truth */

test('marked: exactly the ticks, nothing inferred on top', () => {
  const p = paymentsOn(at('in_production', { paymentsReceived: ['initial_deposit'] }));
  assert.equal(p.source, 'marked');
  assert.deepEqual([p.initialDeposit, p.productionDeposit, p.finalPayment], [true, false, false]);
  assert.equal(paymentLabel(p), 'Deposit in');
});

test('marked: unticking the final payment makes it unpaid, whatever the status says', () => {
  const p = paymentsOn(at('completed', { paymentsReceived: ['initial_deposit', 'production_deposit'] }));
  assert.equal(p.finalPayment, false);
  assert.equal(paymentLabel(p), 'Deposits in');
});

test('marked: an empty array is "nothing paid", not "never marked"', () => {
  const p = paymentsOn(at('in_production', { paymentsReceived: [] }));
  assert.equal(p.source, 'marked');
  assert.equal(hasDeposit(at('in_production', { paymentsReceived: [] })), false);
  assert.equal(paymentLabel(p), 'Nothing paid yet');
});

/* Inferred: never marked, so the best guess from the order's position */

test('inferred: nothing on a fresh order in design talk', () => {
  const p = paymentsOn(at('design_talk', { paymentsReceived: null }));
  assert.equal(p.source, 'inferred');
  assert.deepEqual([p.initialDeposit, p.productionDeposit, p.finalPayment], [false, false, false]);
});

test('inferred: moving past a payment gate implies that payment, and in production is "deposits in"', () => {
  assert.equal(paymentsOn(at('waiting_for_approval', { paymentsReceived: null })).initialDeposit, true);
  const prod = paymentsOn(at('in_production', { paymentsReceived: null }));
  assert.equal(prod.productionDeposit, true);
  assert.equal(prod.finalPayment, false);
  assert.equal(paymentLabel(prod), 'Deposits in');
});

test('inferred: datePaid is NOT read as paid in full', () => {
  const p = paymentsOn(at('in_production', { paymentsReceived: null, datePaid: '2026-08-17' }));
  assert.equal(p.finalPayment, false);
  assert.equal(paymentLabel(p), 'Deposits in');
});

test('inferred: a "payment received" email names its payment; Completed means paid in full', () => {
  const email = { stage: 'payment_received' as const, sentAt: '2026-10-01T00:00:00Z', to: 'x@y.z', messageId: 'm', detail: 'pre-production deposit' };
  assert.equal(paymentsOn(at('waiting_for_deposit', { paymentsReceived: null, customerEmails: [email] })).productionDeposit, true);
  const done = paymentsOn(at('completed', { paymentsReceived: null }));
  assert.equal(done.finalPayment && done.initialDeposit && done.productionDeposit, true);
  assert.equal(paymentLabel(done), 'Paid in full');
});
