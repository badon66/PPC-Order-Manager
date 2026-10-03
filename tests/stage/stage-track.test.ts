import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankOrder } from '@/lib/order-utils';
import { TRACK_STATUSES, inStageSince, stageSummary } from '@/lib/data/stage-track';
import { surfaceFor, asSurface } from '@/lib/surface';
import type { ChangeLogEntry, Order } from '@/lib/types';

const TODAY = '2026-10-02';

function at(status: Order['status'], over: Partial<Order> = {}): Order {
  return { ...blankOrder(), status, createdAt: '2026-09-01T12:00:00Z', ...over };
}
function moved(to: Order['status'], at: string): ChangeLogEntry {
  return { id: at, orderId: 'o', action: 'status_changed', field: 'status', fromValue: null, toValue: to, summary: '', at, actorEmail: '', actorName: '' } as ChangeLogEntry;
}

test('the track has one node per working stage, folding Incomplete into Setup', () => {
  const s = stageSummary(at('incomplete'), [], TODAY);
  assert.equal(s.nodes.length, TRACK_STATUSES.length);
  assert.equal(s.current, 'draft');
  assert.equal(s.nodes[0].state, 'current');
  assert.equal(s.index, 0);
});

test('nodes before the current stage are done, after it upcoming', () => {
  const s = stageSummary(at('in_production'), [], TODAY);
  const states = s.nodes.map((n) => n.state);
  const i = TRACK_STATUSES.indexOf('in_production');
  assert.ok(states.slice(0, i).every((x) => x === 'done'));
  assert.equal(states[i], 'current');
  assert.ok(states.slice(i + 1).every((x) => x === 'upcoming'));
});

test('time in stage comes from the newest status change, or creation if none', () => {
  const log = [moved('design_talk', '2026-09-10T10:00:00Z'), moved('waiting_for_approval', '2026-09-26T10:00:00Z')];
  const s = stageSummary(at('waiting_for_approval'), log, TODAY);
  assert.equal(s.inStageSince, '2026-09-26');
  assert.equal(s.daysInStage, 6);
  assert.equal(inStageSince(at('draft'), []), '2026-09-01');
});

test('facts under the dots: sign-off date, factory day, ship day, deposits in', () => {
  const o = at('shipped', {
    approvedDate: '2026-09-20', sentToFactoryAt: '2026-09-28', completedAt: '2026-10-01',
    paymentsReceived: ['initial_deposit', 'production_deposit', 'final_payment'],
  });
  const s = stageSummary(o, [], TODAY);
  const fact = (st: Order['status']) => s.nodes.find((n) => n.status === st)!.fact;
  assert.match(fact('waiting_for_approval')!, /Signed/);
  assert.match(fact('in_production')!, /Out/);
  assert.equal(fact('waiting_for_deposit'), 'In');
  assert.equal(fact('waiting_for_production_deposit'), 'In');
  assert.match(fact('waiting_for_payment')!, /Paid/);
  assert.ok(fact('shipped'));
});

test('finish: a promise before Shipped, history after', () => {
  const late = stageSummary(at('in_production', { estimatedFinishDate: '2026-09-25' }), [], TODAY);
  assert.equal(late.finish.tone, 'overdue');
  assert.equal(late.finish.delta, -7);
  assert.ok(late.attention.some((a) => /7 days past/.test(a)));

  const soon = stageSummary(at('in_production', { estimatedFinishDate: '2026-10-05' }), [], TODAY);
  assert.equal(soon.finish.tone, 'due-soon');
  assert.equal(soon.finish.delta, 3);

  const shipped = stageSummary(at('shipped', { estimatedFinishDate: '2026-09-25', completedAt: '2026-09-30' }), [], TODAY);
  assert.equal(shipped.finish.tone, 'done');
  assert.equal(shipped.finish.date, '2026-09-30');
  assert.equal(shipped.attention.some((a) => /past the estimated/.test(a)), false);
});

test('attention: the things that need a hand, and nothing when nothing does', () => {
  // A live order with no finish date and no email on file
  const bare = stageSummary(at('design_talk', { contactEmail: '' }), [], TODAY);
  assert.ok(bare.attention.some((a) => /No estimated finish/.test(a)));
  assert.ok(bare.attention.some((a) => /No customer email/.test(a)));

  // Waiting on sign-off, proof never sent
  const proof = stageSummary(at('waiting_for_approval', { contactEmail: 'c@t.ca', estimatedFinishDate: '2026-11-01' }), [], TODAY);
  assert.ok(proof.attention.some((a) => /Proof email/.test(a)));

  // In production, not marked as sent to the factory
  const prod = stageSummary(at('in_production', { contactEmail: 'c@t.ca', estimatedFinishDate: '2026-11-01', paymentsReceived: ['initial_deposit', 'production_deposit'] }), [], TODAY);
  assert.ok(prod.attention.some((a) => /sent to the factory/.test(a)));

  // Deposits implied by stage but never marked (null = never marked)
  assert.ok(stageSummary(at('waiting_for_approval', { contactEmail: 'c@t.ca', estimatedFinishDate: '2026-11-01', paymentsReceived: null }), [], TODAY)
    .attention.some((a) => /Initial deposit looks in/.test(a)));
  // Once marked, no such nag
  assert.equal(stageSummary(at('waiting_for_approval', { contactEmail: 'c@t.ca', estimatedFinishDate: '2026-11-01', paymentsReceived: ['initial_deposit'] }), [], TODAY)
    .attention.some((a) => /looks in/.test(a)), false);

  // Shipped, no tracking
  assert.ok(stageSummary(at('shipped', { contactEmail: 'c@t.ca', completedAt: '2026-10-01', paymentsReceived: ['final_payment'] }), [], TODAY)
    .attention.some((a) => /tracking/.test(a)));

  // Completed: the quiet state (only the review email can be owed)
  const done = stageSummary(at('completed', { contactEmail: 'c@t.ca', completedAt: '2026-10-01', paymentsReceived: ['final_payment'] }), [], TODAY);
  assert.equal(done.attention.filter((a) => !/owed/.test(a)).length, 0);
});

test('headline and next step follow the stage and the money', () => {
  assert.match(stageSummary(at('waiting_for_deposit'), [], TODAY).headline, /Waiting on the initial deposit/);
  assert.match(stageSummary(at('waiting_for_deposit', { paymentsReceived: ['initial_deposit'] }), [], TODAY).headline, /is in/);
  assert.match(stageSummary(at('waiting_for_approval', { approvedDate: '2026-09-20', approvedBy: 'Dana' }), [], TODAY).headline, /Signed off by Dana/);
  assert.match(stageSummary(at('in_production', { sentToFactoryAt: '2026-09-28' }), [], TODAY).headline, /since Sep 28/);
});

test('surface: public routes standard, sales left alone, everything else admin', () => {
  assert.equal(surfaceFor('/share/abc', true), 'public');
  assert.equal(surfaceFor('/roster/abc/design', true), 'public');
  assert.equal(surfaceFor('/sales', false), 'admin');
  assert.equal(surfaceFor('/sales/x', false), 'admin');
  assert.equal(surfaceFor('/sales/x/call', false), 'sales');
  assert.equal(surfaceFor('/sales/x/call/', false), 'sales');
  assert.equal(surfaceFor('/salesperson', false), 'admin');
  assert.equal(surfaceFor('/orders', false), 'admin');
  assert.equal(asSurface(null), 'public');
  assert.equal(asSurface('admin'), 'admin');
  assert.equal(asSurface('nonsense'), 'public');
});
