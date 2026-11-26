import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logEntry } from '@/lib/data/logic';
import { allReminders, jobCardOf, remindersFor, sortCards } from '@/lib/factory/board';
import { FACTORY_FIELDS, changesFor, describeChange } from '@/lib/factory/changes';
import { afterFailure, afterSuccess, EMPTY_GATE, GATE_MAX_GLOBAL, GATE_WINDOW_MS, lockedFor, triesLeft } from '@/lib/factory/gate';
import { blankOrder, blankRosterEntry } from '@/lib/order-utils';
import type { ChangeLogEntry, Order } from '@/lib/types';

const SENTINEL = 7391;
const MONEY_KEY = /value|price|cost|amount|money|paid|deposit|payment/i;

function job(): Order {
  const o = blankOrder();
  o.id = 'o1';
  o.teamName = 'Riverbend Rockets';
  o.invoiceNumber = 'PPC1801';
  o.status = 'in_production';
  o.sentToFactoryAt = '2026-11-10';
  o.estimatedFinishDate = '2026-12-12';
  o.orderValue = SENTINEL;
  o.paymentsReceived = ['initial_deposit'];
  o.datePaid = '2026-11-02';
  o.sets = [{ ...o.sets[0], playerJerseys: 16, goalieJerseys: 1, sockPairs: 17, pantShells: 0, extraJerseys: 2 }];
  return o;
}

let clock = Date.parse('2026-11-12T10:00:00.000Z');
function e(action: ChangeLogEntry['action'], extra: Partial<ChangeLogEntry> = {}): ChangeLogEntry {
  clock += 60_000;
  return { ...logEntry({ orderId: 'o1', action, summary: '', actorEmail: 'k@x', actorName: 'Keenan', ...extra }), at: new Date(clock).toISOString() };
}

function keysDeep(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((v) => keysDeep(v, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.push(k); keysDeep(v, out); }
  return out;
}

test('the job card carries the right numbers and no money, by value or by key', () => {
  const o = job();
  const history = [
    e('field_changed', { field: 'orderValue', fromValue: '100', toValue: String(SENTINEL) }),
    e('field_changed', { field: 'paymentsReceived', toValue: `["initial_deposit",${SENTINEL}]` }),
    e('field_changed', { field: 'datePaid', toValue: '2026-11-02' }),
    e('field_changed', { field: 'teamName', fromValue: 'Riverbend', toValue: 'Riverbend Rockets' }),
  ];
  const card = jobCardOf(o, [blankRosterEntry('o1', 0, { jerseys: true, socks: true, pantShells: false })], history);
  assert.equal(card.jerseys, 19);
  assert.equal(card.sockPairs, 17);
  assert.equal(card.pantShells, 0);
  assert.equal(card.neededBy, '2026-12-12');
  assert.equal(card.jobNumber, 'PPC1801');
  assert.equal(JSON.stringify(card).includes(String(SENTINEL)), false, 'a price reached the factory card');
  // `money` is the factory's OWN (its cost, what Powerplay sent it) — the one money object allowed.
  const { money, ...rest } = card;
  assert.deepEqual(keysDeep(rest).filter((k) => MONEY_KEY.test(k)), []);
  // With no factory_* money entries it is empty, whatever the customer paid Powerplay.
  assert.deepEqual([money.cost, money.shipping, money.paid, money.total, money.dueNow, money.payments.length], [null, 0, 0, 0, 0, 0]);
  // Only the team-name change is described; the three money changes say nothing at all.
  assert.deepEqual(card.changes.map((c) => c.text), ['Team name: “Riverbend” → “Riverbend Rockets”']);
});

test('the change feed is an allowlist: no money field is on it, and an unknown field is silent', () => {
  for (const f of ['orderValue', 'paymentsReceived', 'datePaid', 'completedAt', 'approvalRecord', 'shareToken', 'rosterToken', 'factoryToken', 'contactEmail', 'enquiry', 'customerEmails', 'sectionComments']) {
    assert.equal(f in FACTORY_FIELDS, false, `${f} must not be described to the factory`);
    assert.equal(describeChange(e('field_changed', { field: f, fromValue: 'a', toValue: 'b' })), null);
  }
  assert.equal(describeChange(e('field_changed', { field: 'someFieldAddedNextYear', toValue: 'x' })), null);
  assert.equal(describeChange(e('customer_emailed', { summary: 'Final payment requested: $4,000' })), null);
  assert.equal(describeChange(e('page_note', { summary: 'The team left a note' })), null);
  assert.equal(describeChange(e('field_changed', { field: 'dimpledShoulders', fromValue: 'false', toValue: 'true' })), 'Dimpled shoulders turned on');
  assert.equal(describeChange(e('field_changed', { field: 'estimatedFinishDate', fromValue: '2026-12-12', toValue: '2026-12-05' })), 'Needed by: December 12, 2026 → December 5, 2026');
  assert.equal(describeChange(e('field_changed', { field: 'sets', toValue: '[...]' })), 'Quantities changed — check the sheet');
  assert.equal(describeChange(e('status_changed', { toValue: 'shipped' })), 'Order status is now Shipped');
});

test('only changes after the job was sent are shown, and they are new until the factory opens the job', () => {
  const o = job();
  const before: ChangeLogEntry = { ...e('field_changed', { field: 'teamName', fromValue: 'A', toValue: 'B' }), at: '2026-11-09T23:00:00.000Z' };
  const after = e('field_changed', { field: 'numberDetails', fromValue: '', toValue: 'Gold outline' });
  const other = { ...e('field_changed', { field: 'teamName', toValue: 'X' }), orderId: 'someone-else' };
  let card = jobCardOf(o, [], [before, after, other]);
  assert.deepEqual(card.changes.map((c) => c.id), [after.id]);
  assert.equal(card.newChanges, 1);
  const seen = e('factory_seen', { actorName: 'Michael' });
  const later = e('roster_changed', { summary: 'Roster: #7 Hansen is now #17' });
  card = jobCardOf(o, [], [before, after, seen, later]);
  assert.deepEqual(card.changes.map((c) => [c.text, c.isNew]), [['Roster: #7 Hansen is now #17', true], ['Number details: blank → “Gold outline”', false]]);
});

test('reminders say what a job needs, and stop once it is done', () => {
  const o = job();
  const fresh = jobCardOf(o, [], []);
  assert.deepEqual(remindersFor(fresh, '2026-11-15').map((r) => r.text), ['New job — mark it Received', 'Enter your cost for this job', 'Set the date you expect to finish']);

  const late = jobCardOf(o, [], [e('factory_step', { toValue: 'in_production', actorName: 'M' }), e('factory_finish_date', { toValue: '2026-12-20', actorName: 'M' })]);
  assert.ok(remindersFor(late, '2026-11-15').some((r) => /after the day Powerplay needs it/.test(r.text)));
  assert.ok(remindersFor(late, '2026-12-25').some((r) => r.tone === 'late' && /has passed/.test(r.text)));

  const req = e('factory_step_requested', { toValue: 'completed', actorName: 'M' });
  const waiting = jobCardOf(o, [], [req]);
  assert.deepEqual(remindersFor(waiting, '2026-12-25').map((r) => [r.tone, r.text]), [['act', 'Enter your cost for this job'], ['info', 'Completed is waiting for Powerplay to approve']]);

  const shipReq = e('factory_step_requested', { toValue: 'shipped', actorName: 'M' });
  const done = jobCardOf({ ...o, status: 'shipped' }, [], [req, e('factory_step_approved', { field: req.id, toValue: 'completed' }), shipReq, e('factory_step_approved', { field: shipReq.id, toValue: 'shipped' }), e('factory_seen')]);
  // An order Powerplay already moved past production, never touched by the factory: no "mark it Received".
  const old = jobCardOf({ ...o, status: 'waiting_for_payment' }, [], []);
  assert.deepEqual(remindersFor(old, '2027-01-01').map((r) => r.text), ['Finished — mark it Shipped with the tracking number when it leaves']);
  assert.deepEqual(remindersFor(jobCardOf({ ...o, status: 'completed' }, [], []), '2027-01-01'), []);
  assert.equal(done.done, true);
  assert.deepEqual(remindersFor(done, '2027-01-01'), []);
  assert.equal(sortCards([done, fresh], '2026-11-15')[0], fresh);
  assert.equal(allReminders([fresh, waiting], '2026-11-15')[0].tone, 'act');
});

test('the door: five wrong codes lock a device, a flood locks everyone, time lets them back', () => {
  const t0 = 1_800_000_000_000;
  let g = EMPTY_GATE;
  for (let i = 0; i < 4; i++) g = afterFailure(g, 'a', t0 + i);
  assert.equal(lockedFor(g, 'a', t0 + 10), 0);
  assert.equal(triesLeft(g, 'a', t0 + 10), 1);
  g = afterFailure(g, 'a', t0 + 5);
  assert.ok(lockedFor(g, 'a', t0 + 10) > 0);
  assert.equal(lockedFor(g, 'b', t0 + 10), 0, 'another device is not locked by this one');
  assert.equal(lockedFor(g, 'a', t0 + GATE_WINDOW_MS + 10), 0, 'the lock lifts');

  // Getting in forgives the strikes; old strikes expire on their own.
  let h = afterFailure(afterFailure(EMPTY_GATE, 'c', t0), 'c', t0 + 1);
  assert.equal(triesLeft(afterSuccess(h, 'c', t0 + 2), 'c', t0 + 3), 5);
  assert.equal(triesLeft(h, 'c', t0 + GATE_WINDOW_MS + 5), 5);

  // Thirty wrong codes from thirty different addresses: the door shuts for everybody new.
  h = EMPTY_GATE;
  for (let i = 0; i < GATE_MAX_GLOBAL; i++) h = afterFailure(h, `ip${i}`, t0 + i);
  assert.ok(lockedFor(h, 'never-tried', t0 + 100) > 0);
  assert.equal(lockedFor(h, 'never-tried', t0 + GATE_WINDOW_MS + 200), 0);
});
