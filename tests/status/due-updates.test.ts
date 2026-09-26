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

test('recipient is the trimmed contact email, or nothing', () => {
  assert.equal(recipientOf({ contactEmail: ' a@b.c ' }), 'a@b.c');
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
  const withoutAutoStages = (list: UpdateStage[]) =>
    list.filter((s) => s !== 'payment_received' && s !== 'review_request');
  for (const [status, stage] of cases) {
    assert.deepEqual(withoutAutoStages(stages(order(status))), [stage], status);
    const sent = order(status, { customerEmails: [{ stage, sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
    assert.deepEqual(withoutAutoStages(stages(sent)), [], `${status} already sent`);
  }
  assert.deepEqual(stages(order('draft')), []);
  assert.deepEqual(withoutAutoStages(stages(order('waiting_for_final_approval'))), []);
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

test('payment received is offered from the initial deposit through shipped, repeatable, with a sensible default kind', () => {
  const at = (s: OrderStatus) => dueUpdates(order(s), []).find((d) => d.stage === 'payment_received');
  assert.equal(at('draft'), undefined);
  assert.equal(at('finalizing_details'), undefined);
  assert.equal(at('waiting_for_deposit')?.paymentKind, 'initial_deposit');
  assert.equal(at('waiting_for_approval')?.paymentKind, 'production_deposit');
  assert.equal(at('in_production')?.paymentKind, 'production_deposit');
  assert.equal(at('waiting_for_payment')?.paymentKind, 'final_payment');
  assert.equal(at('shipped')?.paymentKind, 'final_payment');
  assert.equal(at('completed'), undefined);
  const sentTwice = order('shipped', { trackingCode: 'x', customerEmails: [{ stage: 'payment_received', sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
  assert.equal(dueUpdates(sentTwice, []).find((d) => d.stage === 'payment_received')?.repeatable, true);
});

test('the deposit-received follow-ups are no longer offered by status', () => {
  const past = [moved('design_talk', 'waiting_for_deposit'), moved('waiting_for_deposit', 'waiting_for_approval', '2026-09-22T10:00:00Z')];
  assert.ok(!stages(order('waiting_for_approval'), past).includes('initial_deposit_received'));
  const prod = [moved('waiting_for_approval', 'waiting_for_production_deposit'), moved('waiting_for_production_deposit', 'in_production', '2026-09-22T10:00:00Z')];
  assert.ok(!stages(order('in_production'), prod).includes('production_deposit_received'));
});

test('the review request is offered once, only on completed', () => {
  assert.ok(stages(order('completed')).includes('review_request'));
  assert.ok(!stages(order('shipped', { trackingCode: 'x' })).includes('review_request'));
  const sent = order('completed', { customerEmails: [{ stage: 'review_request', sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
  assert.ok(!stages(sent).includes('review_request'));
});

test('proof ready is not offered once approved; the receipt is offered only if it never went out', () => {
  const approved = order('waiting_for_approval', { approvedDate: '2026-09-24' });
  assert.deepEqual(stages(approved).filter((s) => s !== 'payment_received'), ['approval_confirmed']);
  const receipted = order('waiting_for_approval', { approvedDate: '2026-09-24', customerEmails: [{ stage: 'approval_confirmed', sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
  assert.deepEqual(stages(receipted).filter((s) => s !== 'payment_received'), []);
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
