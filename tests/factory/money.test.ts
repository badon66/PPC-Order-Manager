import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { healSettings, logEntry } from '@/lib/data/logic';
import { jobCardOf, remindersFor } from '@/lib/factory/board';
import { describeChange } from '@/lib/factory/changes';
import {
  allocatePayment, balanceTotals, centsToInput, costCheck, expectedCostOf, jobMoneyOf, parseMoney, profitOf, usd,
} from '@/lib/factory/money';
import { factoryActivityOf } from '@/lib/factory/steps';
import { blankOrder } from '@/lib/order-utils';
import { DEFAULT_APP_SETTINGS, type ChangeLogEntry, type Order } from '@/lib/types';

let clock = Date.parse('2026-11-20T10:00:00.000Z');
function e(action: ChangeLogEntry['action'], extra: Partial<ChangeLogEntry> = {}, orderId = 'o1'): ChangeLogEntry {
  clock += 60_000;
  return { ...logEntry({ orderId, action, summary: '', actorEmail: '', actorName: 'Michael', ...extra }), at: new Date(clock).toISOString() };
}
const RATES = DEFAULT_APP_SETTINGS.factoryRates;

test('amounts are read as whole cents, and anything that is not a plain amount is refused', () => {
  assert.equal(parseMoney('1250'), 125000);
  assert.equal(parseMoney('$1,250.50'), 125050);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('0.07'), 7);
  assert.equal(parseMoney(' 19.99 '), 1999);
  for (const bad of ['', 'abc', '-5', '1.234', '1e5', '12..5', '1,2.3.4', '99999999999']) assert.equal(parseMoney(bad), null, bad);
  assert.equal(usd(125050), '$1,250.50');
  assert.equal(usd(125000), '$1,250');
  assert.equal(usd(5), '$0.05');
  assert.equal(centsToInput(125050), '1250.50');
  assert.equal(centsToInput(null), '');
});

test('a job: half is due while it is being made, all of it once finished, less what was paid', () => {
  const h = [e('factory_cost', { toValue: '100000' }), e('factory_shipping', { toValue: '5000' })];
  let m = jobMoneyOf(h, false);
  assert.deepEqual([m.cost, m.shipping, m.total, m.paid, m.dueNow, m.balance], [100000, 5000, 105000, 0, 52500, 105000]);
  h.push(e('factory_payment', { field: 'pay_aaaaaaaa', toValue: '40000', actorName: 'Keenan' }));
  m = jobMoneyOf(h, false);
  assert.deepEqual([m.paid, m.dueNow, m.balance], [40000, 12500, 65000]);
  // Finished: the rest comes due.
  m = jobMoneyOf(h, true);
  assert.deepEqual([m.dueNow, m.balance, m.fullDue], [65000, 65000, true]);
  // Paid past half before it's finished: nothing due, the rest still outstanding.
  h.push(e('factory_payment', { field: 'pay_bbbbbbbb', toValue: '30000' }));
  m = jobMoneyOf(h, false);
  assert.deepEqual([m.dueNow, m.balance], [0, 35000]);
  // An odd cent rounds the half UP.
  assert.equal(jobMoneyOf([e('factory_cost', { toValue: '10001' })], false).dueNow, 5001);
});

test('the latest cost wins, a voided payment stops counting, and a split payment counts once per job', () => {
  const h = [
    e('factory_cost', { toValue: '100000' }),
    e('factory_cost', { fromValue: '100000', toValue: '120000' }),
    e('factory_payment', { field: 'pay_one00000', toValue: '50000' }),
    e('factory_payment', { field: 'pay_two00000', toValue: '20000' }),
    e('factory_payment_void', { field: 'pay_two00000', toValue: '20000' }),
    // Garbage amounts never count.
    e('factory_payment', { field: 'pay_bad00000', toValue: '-500' }),
    e('factory_payment', { field: 'pay_bad00001', toValue: 'lots' }),
  ];
  const m = jobMoneyOf(h, true);
  assert.deepEqual([m.cost, m.paid, m.balance, m.payments.length], [120000, 50000, 70000, 1]);
});

test('totals: outstanding and due now across jobs, with money paid ahead taken off', () => {
  const a = jobMoneyOf([e('factory_cost', { toValue: '100000' })], true); // 1000 due in full
  const b = jobMoneyOf([e('factory_cost', { toValue: '60000' })], false); // 300 due, 600 outstanding
  const c = jobMoneyOf([], false); // no cost yet
  let t = balanceTotals([a, b, c]);
  assert.deepEqual([t.outstanding, t.dueNow, t.uncosted, t.credit], [160000, 130000, 1, 0]);
  // 200 paid ahead on a job with no cost yet comes off both.
  const d = jobMoneyOf([e('factory_payment', { field: 'pay_ahead000', toValue: '20000' })], false);
  t = balanceTotals([a, b, d]);
  assert.deepEqual([t.outstanding, t.dueNow, t.credit, t.paid], [140000, 110000, 20000, 20000]);
});

test('a payment to the balance covers what is due first, oldest job first, then the rest', () => {
  const jobs = [
    { orderId: 'new', sentAt: '2026-11-10', balance: 60000, dueNow: 30000 },
    { orderId: 'old', sentAt: '2026-10-01', balance: 100000, dueNow: 50000 },
  ];
  // Exactly what's due: both jobs' halves, not all of it on the oldest.
  let r = allocatePayment(jobs, 80000, null);
  assert.deepEqual(r, { ok: true, parts: [{ orderId: 'old', cents: 50000 }, { orderId: 'new', cents: 30000 }] });
  // Less than what's due: oldest first.
  r = allocatePayment(jobs, 60000, null);
  assert.deepEqual(r, { ok: true, parts: [{ orderId: 'old', cents: 50000 }, { orderId: 'new', cents: 10000 }] });
  // More than due: the extra goes on the oldest job's remainder.
  r = allocatePayment(jobs, 100000, null);
  assert.deepEqual(r, { ok: true, parts: [{ orderId: 'old', cents: 70000 }, { orderId: 'new', cents: 30000 }] });
  // Every cent sent is placed — never more, never less.
  for (const amount of [1, 4999, 80000, 123456, 160000]) {
    const x = allocatePayment(jobs, amount, null);
    assert.ok(x.ok);
    assert.equal(x.parts.reduce((n, p) => n + p.cents, 0), amount);
    for (const p of x.parts) assert.ok(p.cents <= jobs.find((j) => j.orderId === p.orderId)!.balance);
  }
  // More than everything outstanding has nowhere to go.
  assert.equal(allocatePayment(jobs, 160001, null).ok, false);
  assert.equal(allocatePayment([], 100, null).ok, false);
  assert.equal(allocatePayment(jobs, 0, null).ok, false);
  assert.equal(allocatePayment(jobs, 12.5, null).ok, false);
  // A named job takes all of it, even ahead of its cost; an unknown job is refused.
  assert.deepEqual(allocatePayment(jobs, 500000, 'new'), { ok: true, parts: [{ orderId: 'new', cents: 500000 }] });
  assert.equal(allocatePayment(jobs, 100, 'nope').ok, false);
});

function order(): Order {
  const o = blankOrder();
  o.id = 'o1';
  o.status = 'in_production';
  o.sentToFactoryAt = '2026-11-10';
  o.jerseyType = 'sublimated';
  o.sockType = 'sublimated';
  o.sets = [{ ...o.sets[0], playerJerseys: 16, goalieJerseys: 1, extraJerseys: 2, sockPairs: 17, extraSockPairs: 1, pantShells: 0 }];
  return o;
}

test('the cost check: quantities × the standard rates, spares and keepers included', () => {
  const o = order();
  // 19 jerseys × $25 + 18 socks × $12.50 = 475 + 225 = $700
  let x = expectedCostOf(o, RATES);
  assert.equal(x.cents, 70000);
  assert.deepEqual(x.unpriced, []);
  // A keeper jersey is made too.
  o.keeperJerseys = [{ id: 'k', setIndex: 0, number: '7', name: '', size: 'Senior Large' }];
  assert.equal(expectedCostOf(o, RATES).cents, 72500);
  o.keeperJerseys = [];
  // Embroidered jerseys and socks use their own rates.
  o.jerseyType = 'embroidered';
  o.sockType = 'embroidered';
  assert.equal(expectedCostOf(o, RATES).cents, 19 * 5000 + 18 * 1350);
  // A second set built differently is priced by its own type.
  const two = order();
  two.orderMode = 'home_away_set';
  two.sets = [
    { ...two.sets[0], sockPairs: 0, extraSockPairs: 0 },
    { ...two.sets[0], label: 'Away Set', jerseyType: 'embroidered', sockPairs: 0, extraSockPairs: 0 },
  ];
  assert.equal(expectedCostOf(two, RATES).cents, 19 * 2500 + 19 * 5000);
  // Pant shells have no rate yet: listed, left out of the total.
  const shells = order();
  shells.pantShellType = 'sublimated';
  shells.sets = [{ ...shells.sets[0], pantShells: 17 }];
  x = expectedCostOf(shells, RATES);
  assert.equal(x.cents, 70000);
  assert.deepEqual(x.unpriced, ['17 × sublimated pant shell']);
  // …until Keenan sets one.
  assert.equal(expectedCostOf(shells, { ...RATES, sublimatedShells: 20 }).cents, 70000 + 17 * 2000);
});

test('a cost $100 or more from the standard rates is flagged; closer is fine', () => {
  const x = expectedCostOf(order(), RATES); // $700
  assert.equal(costCheck(null, x, 10000).kind, 'none');
  assert.equal(costCheck(70000, x, 10000).kind, 'ok');
  assert.equal(costCheck(79999, x, 10000).kind, 'ok');
  assert.deepEqual(costCheck(80000, x, 10000), { kind: 'flag', expected: x, diff: 10000, partial: false });
  assert.equal(costCheck(60000, x, 10000).kind, 'flag');
  assert.equal(costCheck(60001, x, 10000).kind, 'ok');
  // The threshold is Keenan's to change.
  assert.equal(costCheck(72500, x, 2500).kind, 'flag');
  // With an unpriced item, a higher cost can't be judged; a much lower one still can.
  const shells = order();
  shells.pantShellType = 'sublimated';
  shells.sets = [{ ...shells.sets[0], pantShells: 17 }];
  const p = expectedCostOf(shells, RATES);
  assert.deepEqual([costCheck(110000, p, 10000).kind, costCheck(50000, p, 10000).kind], ['ok', 'flag']);
  // Nothing priced at all: no verdict.
  const rev = order();
  rev.jerseyType = 'reversible_sublimated';
  rev.sets = [{ ...rev.sets[0], sockPairs: 0, extraSockPairs: 0 }];
  assert.equal(costCheck(90000, expectedCostOf(rev, RATES), 10000).kind, 'unknown');
});

test('profit needs a price, a cost and an exchange rate, and is the price less the converted cost', () => {
  assert.equal(profitOf(2000, 70000, 1.4), 200000 - 98000);
  assert.equal(profitOf(null, 70000, 1.4), null);
  assert.equal(profitOf(2000, 70000, null), null);
  assert.equal(profitOf(2000, 0, 1.4), null);
});

test('settings: rates default, a cleared rate stays cleared, a silly exchange rate is dropped', () => {
  const fresh = healSettings({ howToPay: 'x' });
  assert.deepEqual(fresh.factoryRates, RATES);
  assert.equal(fresh.factoryFlagAt, 100);
  assert.equal(fresh.usdToCad, null);
  const s = healSettings({ factoryRates: { ...RATES, sublimatedJersey: null, sublimatedShells: 22 }, factoryFlagAt: 50, usdToCad: 1.41 });
  assert.deepEqual([s.factoryRates.sublimatedJersey, s.factoryRates.sublimatedShells, s.factoryFlagAt, s.usdToCad], [null, 22, 50, 1.41]);
  assert.equal(healSettings({ usdToCad: 140 }).usdToCad, null);
  assert.equal(healSettings({ factoryFlagAt: -5 }).factoryFlagAt, 100);
});

test('the job card: money comes only from factory entries, full amount due only after APPROVAL', () => {
  const o = order();
  o.orderValue = 7391;
  const h = [
    e('field_changed', { field: 'orderValue', toValue: '7391' }),
    e('factory_cost', { toValue: '70000' }),
    e('factory_step_requested', { toValue: 'completed' }),
  ];
  let card = jobCardOf(o, [], h);
  // Asked for Completed, not approved: still half.
  assert.deepEqual([card.money.total, card.money.dueNow, card.money.fullDue], [70000, 35000, false]);
  assert.equal(JSON.stringify(card).includes('7391'), false);
  h.push(e('factory_step_approved', { field: h[2].id, toValue: 'completed' }));
  card = jobCardOf(o, [], h);
  assert.deepEqual([card.money.dueNow, card.money.fullDue], [70000, true]);
  // No cost yet → the factory is reminded; with one, not.
  assert.ok(remindersFor(jobCardOf(o, [], []), '2026-11-21').some((r) => r.text === 'Enter your cost for this job'));
  assert.ok(!remindersFor(card, '2026-11-21').some((r) => r.text === 'Enter your cost for this job'));
  // Another order's money never lands here.
  const other = jobCardOf(o, [], [e('factory_cost', { toValue: '99900' }, 'someone-else')]);
  assert.equal(other.money.cost, null);
});

test('both sides are told: the factory about payments, Keenan about a cost and a change to it', () => {
  assert.equal(describeChange(e('factory_payment', { field: 'pay_x0000000', toValue: '150000', fromValue: 'wire Nov 26' })), 'Powerplay sent $1,500 USD — “wire Nov 26”');
  assert.equal(describeChange(e('factory_payment_void', { field: 'pay_x0000000', toValue: '150000' })), 'Powerplay removed a payment of $1,500 USD (entered by mistake)');
  // The factory's feed never describes its own cost entries back to it as Powerplay's changes.
  assert.equal(describeChange(e('factory_cost', { toValue: '70000' })), null);
  const a = factoryActivityOf([
    e('factory_cost', { fromValue: '', toValue: '70000' }),
    e('factory_cost', { fromValue: '70000', toValue: '82000' }),
    e('factory_shipping', { fromValue: '0', toValue: '4500' }),
  ]);
  assert.deepEqual(a.items.map((i) => i.text).reverse(), ['Set their cost: $700 USD', 'Changed their cost: $700 → $820 USD', 'Extra shipping: $45 USD']);
  assert.equal(a.unread, 3);
});

test("nothing the factory can open imports Keenan's side of the money", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk('src/app/factory');
  walk('src/app/api/factory');
  files.push('src/components/factory/cost.tsx', 'src/components/factory/progress.tsx', 'src/lib/factory/board.ts', 'src/lib/factory/load.ts');
  assert.ok(files.length > 8);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const banned of ['factory/balance', 'lib/pricing', 'money-summary', 'send-money', 'profitOf', 'expectedCostOf', 'costCheck', 'orderValue', 'factoryRates']) {
      assert.equal(src.includes(banned), false, `${f} must not touch ${banned}`);
    }
  }
});
