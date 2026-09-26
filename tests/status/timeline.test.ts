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

test('the designing and finalizing steps link to their pages only while current', () => {
  const opts = { designUrl: '/roster/t/design', detailsUrl: '/roster/t/details' };
  const designing = timelineOf(order('design_talk'), [], opts).find((s) => s.key === 'designing')!;
  assert.equal(designing.href, '/roster/t/design');
  assert.equal(designing.linkLabel, 'Send logos and inspiration');
  const finalizing = timelineOf(order('finalizing_details'), [], opts).find((s) => s.key === 'finalizing')!;
  assert.equal(finalizing.href, '/roster/t/details');
  assert.equal(timelineOf(order('in_production'), [], opts).find((s) => s.key === 'designing')!.href, null);
  assert.equal(timelineOf(order('design_talk'), []).find((s) => s.key === 'designing')!.href, null);
});
