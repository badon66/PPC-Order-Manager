import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankOrder, blankRosterEntry } from '@/lib/order-utils';
import { publicViewOf, rosterLinkView, stampCompletion } from '@/lib/data/logic';
import { rosterToCsv } from '@/lib/csv';
import type { Order } from '@/lib/types';

/**
 * The money rule, as a test.
 *
 * Money lives behind the access code and nowhere else. This builds an order
 * with a value nobody would type by accident and checks that every surface a
 * customer or the manufacturer can reach is free of it — by VALUE, so a field
 * renamed or copied under another name still fails, and by key name, so an
 * empty money field can't slip through either.
 */

const SENTINEL = 7391;
const MONEY_KEY = /value|price|cost|amount|money|invoice_total|paid_amount|deposit/i;

function pricedOrder(): Order {
  const o = blankOrder();
  o.orderValue = SENTINEL;
  o.teamName = 'Leak Test';
  return o;
}

function keysDeep(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((v) => keysDeep(v, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

test('publicViewOf carries no money, by value or by key', () => {
  const view = publicViewOf(pricedOrder(), [], []);
  const json = JSON.stringify(view);
  assert.equal(json.includes(String(SENTINEL)), false, 'order value reached the public view');
  const bad = keysDeep(view).filter((k) => MONEY_KEY.test(k) && k !== 'invoiceNumber');
  assert.deepEqual(bad, [], `money-shaped keys in public view: ${bad.join(', ')}`);
});

test('the roster link view carries no money', () => {
  const view = rosterLinkView(pricedOrder(), 0);
  assert.equal(JSON.stringify(view).includes(String(SENTINEL)), false);
  const bad = keysDeep(view).filter((k) => MONEY_KEY.test(k) && k !== 'invoiceNumber');
  assert.deepEqual(bad, []);
});

test('the roster CSV (what the manufacturer gets) carries no money', () => {
  const o = pricedOrder();
  const r = blankRosterEntry(o.id, 0);
  r.playerNameAsPrinted = 'SMITH';
  const csv = rosterToCsv([r], o.nameStyle);
  assert.equal(csv.includes(String(SENTINEL)), false);
  assert.doesNotMatch(csv.split('\n')[0], /value|price|cost/i);
});

test('stampCompletion dates the first move to Completed, and only that', () => {
  const o = blankOrder();
  o.status = 'shipped';
  const p = stampCompletion(o, { status: 'completed' }, '2026-10-02');
  assert.equal(p.completedAt, '2026-10-02');
  // explicit date wins
  assert.equal(stampCompletion(o, { status: 'completed', completedAt: '2026-09-30' }, '2026-10-02').completedAt, '2026-09-30');
  // already complete: untouched
  const done = { ...o, status: 'completed' as const, completedAt: '2026-09-01' as const };
  assert.equal(stampCompletion(done, { status: 'completed' }, '2026-10-02').completedAt, undefined);
  // a non-status change never stamps
  assert.equal(stampCompletion(o, { teamName: 'x' }, '2026-10-02').completedAt, undefined);
});

/* ------------------------------------------------------------------ *
 * Automatic pricing
 * ------------------------------------------------------------------ */

import { listPrice, orderValueOf } from '@/lib/pricing';

function sized(over: Partial<Order>): Order {
  const o = blankOrder();
  o.jerseyTier = 'premier';
  o.jerseyType = 'sublimated';
  o.sets = [{ ...o.sets[0], playerJerseys: 16, goalieJerseys: 2, sockPairs: 0, pantShells: 0 }];
  return { ...o, ...over };
}

test('list price: tier × jerseys, nothing else when nothing else is on the order', () => {
  const p = listPrice(sized({}))!;
  assert.equal(p.total, 18 * 95);
  assert.equal(p.lines.length, 1);
});

test('list price: under 8 jerseys is +50% each', () => {
  const o = sized({});
  o.sets = [{ ...o.sets[0], playerJerseys: 6, goalieJerseys: 0 }];
  const p = listPrice(o)!;
  assert.equal(p.lines[0].unit, Math.round(95 * 1.5));
  assert.match(p.caveats.join(' '), /Under 8/);
});

test('list price: socks, shells, and the bundle at 16 players', () => {
  const o = sized({ sockType: 'sublimated', pantShellType: 'sublimated' });
  o.sets = [{ ...o.sets[0], playerJerseys: 16, goalieJerseys: 0, sockPairs: 16, pantShells: 16 }];
  const p = listPrice(o)!;
  const labels = p.lines.map((l) => l.label);
  assert.ok(labels.some((l) => /Socks/.test(l)));
  assert.ok(labels.some((l) => /Pant shells/.test(l)));
  assert.ok(labels.some((l) => /bundle/i.test(l)));
  assert.equal(p.total, 16 * 95 + 16 * 30 + 16 * 55 - 16 * 35);
});

test('list price: no bundle under 16 players', () => {
  const o = sized({ sockType: 'sublimated', pantShellType: 'sublimated' });
  o.sets = [{ ...o.sets[0], playerJerseys: 12, goalieJerseys: 0, sockPairs: 12, pantShells: 12 }];
  assert.equal(listPrice(o)!.lines.some((l) => /bundle/i.test(l.label)), false);
});

test('list price: stitched logos on a sublimated body, not on embroidered', () => {
  const sub = sized({ stitchedSublimatedLogos: true });
  assert.ok(listPrice(sub)!.lines.some((l) => /Stitched/.test(l.label)));
  const emb = sized({ stitchedSublimatedLogos: true, jerseyType: 'embroidered', jerseyTier: 'pro' });
  assert.equal(listPrice(emb)!.lines.some((l) => /Stitched/.test(l.label)), false);
});

test("list price: C's and A's priced per 1C+3A set", () => {
  const o = sized({ hasCaptainPatches: true, captainCQuantity: 1, captainAQuantity: 3 });
  assert.equal(listPrice(o)!.lines.find((l) => /C's and A's/.test(l.label))!.amount, 20);
  const two = sized({ hasCaptainPatches: true, captainCQuantity: 2, captainAQuantity: 2 });
  assert.equal(listPrice(two)!.lines.find((l) => /C's and A's/.test(l.label))!.qty, 2);
});

test('orderValueOf: override wins, list price otherwise, null with no tier', () => {
  const o = sized({});
  assert.equal(orderValueOf(o), 18 * 95);
  assert.equal(orderValueOf({ ...o, orderValue: 1500 }), 1500);
  assert.equal(orderValueOf({ ...o, jerseyTier: null }), null);
});
