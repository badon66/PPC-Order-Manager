import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logEntry } from '@/lib/data/logic';
import {
  factoryActivityOf, factoryStateOf, isFactoryJob, orderPatchOnApproval, planStepChange,
} from '@/lib/factory/steps';
import { blankOrder } from '@/lib/order-utils';
import type { ChangeLogEntry } from '@/lib/types';

let clock = Date.parse('2026-11-20T10:00:00.000Z');
/** An entry one minute after the last, so order is never a tie. */
function e(action: ChangeLogEntry['action'], extra: Partial<ChangeLogEntry> = {}): ChangeLogEntry {
  clock += 60_000;
  return { ...logEntry({ orderId: 'o1', action, summary: '', actorEmail: '', actorName: 'Michael', ...extra }), at: new Date(clock).toISOString() };
}

test('a job is the factory\'s once sent or in production — never a draft, a design, or a deleted order', () => {
  const o = blankOrder();
  for (const status of ['incomplete', 'draft', 'design_talk', 'finalizing_details', 'waiting_for_deposit', 'waiting_for_approval', 'waiting_for_production_deposit'] as const) {
    assert.equal(isFactoryJob({ ...o, status, sentToFactoryAt: null }), false, status);
  }
  for (const status of ['in_production', 'waiting_for_final_approval', 'waiting_for_payment', 'shipped', 'completed'] as const) {
    assert.equal(isFactoryJob({ ...o, status, sentToFactoryAt: null }), true, status);
  }
  assert.equal(isFactoryJob({ ...o, status: 'waiting_for_approval', sentToFactoryAt: '2026-11-01' }), true);
  assert.equal(isFactoryJob({ ...o, status: 'in_production', sentToFactoryAt: '2026-11-01', deletedAt: '2026-11-02T00:00:00Z' }), false);
});

test('ordinary steps move at once; the state is the last move, whatever order the entries arrive in', () => {
  const a = e('factory_step', { toValue: 'received' });
  const b = e('factory_step', { toValue: 'prepping' });
  const c = e('factory_finish_date', { toValue: '2026-12-10' });
  const s = factoryStateOf([c, b, a]);
  assert.equal(s.step, 'prepping');
  assert.equal(s.finishDate, '2026-12-10');
  assert.equal(s.pending, null);
  assert.deepEqual(planStepChange(s, 'in_production'), { kind: 'move' });
  assert.equal(planStepChange(s, 'prepping').kind, 'none');
  assert.deepEqual(planStepChange(s, 'completed'), { kind: 'request' });
  assert.deepEqual(planStepChange(s, 'shipped'), { kind: 'request' });
});

test('Completed and Shipped wait for approval, and only the named request is approved', () => {
  const moved = e('factory_step', { toValue: 'almost_finished' });
  const req = e('factory_step_requested', { toValue: 'completed' });
  let s = factoryStateOf([moved, req]);
  assert.equal(s.step, 'almost_finished', 'not completed until approved');
  assert.equal(s.pending?.step, 'completed');
  assert.equal(planStepChange(s, 'completed').kind, 'none');

  // An approval naming some other request changes nothing.
  s = factoryStateOf([moved, req, e('factory_step_approved', { field: 'someone-else', toValue: 'completed' })]);
  assert.equal(s.step, 'almost_finished');
  assert.ok(s.pending);

  const ok = e('factory_step_approved', { field: req.id, toValue: 'completed' });
  s = factoryStateOf([moved, req, ok]);
  assert.equal(s.step, 'completed');
  assert.equal(s.pending, null);
  // Approving the same request twice is harmless.
  s = factoryStateOf([moved, req, ok, e('factory_step_approved', { field: req.id, toValue: 'completed' })]);
  assert.equal(s.step, 'completed');
});

test('a declined request leaves the step where it was; moving on by hand withdraws a request', () => {
  const moved = e('factory_step', { toValue: 'in_production' });
  const req = e('factory_step_requested', { toValue: 'shipped', fromValue: ' 1Z999 ' });
  assert.equal(factoryStateOf([moved, req]).pending?.tracking, '1Z999');
  let s = factoryStateOf([moved, req, e('factory_step_declined', { field: req.id, toValue: 'shipped' })]);
  assert.equal(s.step, 'in_production');
  assert.equal(s.pending, null);
  s = factoryStateOf([moved, req, e('factory_step', { toValue: 'almost_finished' })]);
  assert.equal(s.step, 'almost_finished');
  assert.equal(s.pending, null);
  // …and an approval arriving after it was withdrawn does nothing.
  s = factoryStateOf([moved, req, e('factory_step', { toValue: 'almost_finished' }), e('factory_step_approved', { field: req.id, toValue: 'shipped' })]);
  assert.equal(s.step, 'almost_finished');
});

test('approval moves the order forward only, and never blanks a tracking number', () => {
  const base = { status: 'in_production' as const, productionFinishDate: null, trackingCode: '' };
  assert.deepEqual(orderPatchOnApproval(base, { step: 'completed', tracking: '' }, '2026-12-01'), {
    productionFinishDate: '2026-12-01', status: 'waiting_for_final_approval',
  });
  // Already past the final check: the status is left alone, the date kept.
  assert.deepEqual(
    orderPatchOnApproval({ status: 'waiting_for_payment', productionFinishDate: '2026-11-28', trackingCode: '' }, { step: 'completed', tracking: '' }, '2026-12-01'),
    {},
  );
  assert.deepEqual(orderPatchOnApproval({ ...base, status: 'waiting_for_payment', productionFinishDate: '2026-11-28' }, { step: 'shipped', tracking: '1Z999' }, '2026-12-03'), {
    trackingCode: '1Z999', status: 'shipped',
  });
  // No tracking given: the one Keenan already typed stays. Completed order: not dragged back to Shipped.
  assert.deepEqual(
    orderPatchOnApproval({ status: 'completed', productionFinishDate: '2026-11-28', trackingCode: 'KEEP' }, { step: 'shipped', tracking: '' }, '2026-12-03'),
    {},
  );
});

test("Keenan's list: every factory move, unread until cleared, a waiting request always unread", () => {
  const a = e('factory_step', { toValue: 'received' });
  const ack = e('factory_ack', { actorName: 'Keenan' });
  const b = e('factory_step', { toValue: 'prepping' });
  const noise = e('field_changed', { field: 'teamName' });
  let f = factoryActivityOf([a, ack, b, noise]);
  assert.deepEqual(f.items.map((i) => i.text), ['Moved to Prepping', 'Moved to Received']);
  assert.equal(f.unread, 1);
  const req = e('factory_step_requested', { toValue: 'completed' });
  f = factoryActivityOf([a, b, req, e('factory_ack', { actorName: 'Keenan' })]);
  assert.equal(f.unread, 1, 'clearing the list never hides a request that still needs an answer');
  assert.equal(f.items[0].needsApproval, true);
});
