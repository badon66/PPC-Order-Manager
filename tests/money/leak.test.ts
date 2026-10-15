import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankOrder, blankRosterEntry } from '@/lib/order-utils';
import { factoryViewOf, publicViewOf, rosterLinkView, stampCompletion } from '@/lib/data/logic';
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
const MONEY_KEY = /value|price|cost|amount|money|invoice_total|paid_amount|deposit|payments|factory/i;

function pricedOrder(): Order {
  const o = blankOrder();
  o.orderValue = SENTINEL;
  o.paymentsReceived = ['initial_deposit'];
  o.sentToFactoryAt = '2026-10-01';
  o.datePaid = '2026-10-02';
  o.teamName = 'Leak Test';
  // The factory's business, which the customer must never see.
  o.factoryNotes = 'KEEPER-NOTE-4471';
  o.factoryToken = 'FACTORY-TOKEN-4472';
  o.keeperJerseys = [{ id: 'k1', setIndex: 0, number: '4473', name: 'KEEPERNAME', size: 'L' }];
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

test('publicViewOf carries nothing of the factory: no keepers, no factory notes, no factory token', () => {
  const json = JSON.stringify(publicViewOf(pricedOrder(), [], []));
  for (const marker of ['KEEPER-NOTE-4471', 'FACTORY-TOKEN-4472', '4473', 'KEEPERNAME']) {
    assert.equal(json.includes(marker), false, `${marker} reached the customer's view`);
  }
  const keys = keysDeep(publicViewOf(pricedOrder(), [], []));
  assert.deepEqual(keys.filter((k) => /keeper|factory/i.test(k)), []);
});

test('factoryViewOf carries no money and no payment date, by value or by key', () => {
  const o = pricedOrder();
  const view = factoryViewOf(o, [], []);
  const json = JSON.stringify(view);
  assert.equal(json.includes(String(SENTINEL)), false, 'order value reached the factory view');
  assert.equal(json.includes('2026-10-02'), false, 'the payment date reached the factory view');
  assert.equal(json.includes('initial_deposit'), false, 'payment state reached the factory view');
  // `factory` is a money-shaped key on the CUSTOMER's surfaces (sentToFactoryAt
  // is Keenan's bookkeeping there); on the factory's own sheet it's the point.
  const bad = keysDeep(view).filter((k) => MONEY_KEY.test(k) && k !== 'invoiceNumber' && !/factory/i.test(k));
  assert.deepEqual(bad, [], `money-shaped keys in factory view: ${bad.join(', ')}`);
  assert.equal('approvalRecord' in view, false, 'the signature record is not the factory\'s');
  assert.equal('orderId' in view, false, 'the row id is not the factory\'s');
  // and it DOES carry what the factory is for
  assert.equal(view.factoryNotes, 'KEEPER-NOTE-4471');
  assert.equal(view.keeperJerseys.length, 1);
  assert.equal(view.sentToFactoryAt, '2026-10-01');
});

test('the factory view keeps the font; the customer view drops it', () => {
  const o = pricedOrder();
  const font = { id: 'a1', orderId: o.id, role: 'font' as const, slot: 0, fileUrl: 'k', fileName: 'f.otf', displayName: '', placementFileUrl: '', notes: '', groupId: '' };
  const crest = { ...font, id: 'a2', role: 'main_crest' as const };
  const assets = [font, crest] as unknown as Parameters<typeof factoryViewOf>[2];
  assert.deepEqual(factoryViewOf(o, [], assets).assets.map((a) => a.role), ['font', 'main_crest']);
  assert.deepEqual(publicViewOf(o, [], assets).assets.map((a) => a.role), ['main_crest']);
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

test('stampCompletion: the completion date is the day it SHIPPED', () => {
  const making = { ...blankOrder(), status: 'in_production' as const };
  // in production -> shipped: stamped
  assert.equal(stampCompletion(making, { status: 'shipped' }, '2026-10-02').completedAt, '2026-10-02');
  // in production -> completed directly (shipped skipped): stamped
  assert.equal(stampCompletion(making, { status: 'completed' }, '2026-10-02').completedAt, '2026-10-02');
  // shipped -> completed later: NOT restamped, the ship day stands
  const shipped = { ...blankOrder(), status: 'shipped' as const, completedAt: '2026-09-20' as const };
  assert.equal(stampCompletion(shipped, { status: 'completed' }, '2026-10-02').completedAt, undefined);
  // an explicit date in the patch wins
  assert.equal(stampCompletion(making, { status: 'shipped', completedAt: '2026-09-30' }, '2026-10-02').completedAt, '2026-09-30');
  // moving between two unfinished stages never stamps
  assert.equal(stampCompletion(making, { status: 'waiting_for_final_approval' }, '2026-10-02').completedAt, undefined);
  // a non-status change never stamps
  assert.equal(stampCompletion(making, { teamName: 'x' }, '2026-10-02').completedAt, undefined);
});

test('awaitingFinish: a deadline means something only before Shipped', async () => {
  const { awaitingFinish } = await import('@/lib/constants');
  assert.equal(awaitingFinish('in_production'), true);
  assert.equal(awaitingFinish('waiting_for_payment'), true);
  assert.equal(awaitingFinish('shipped'), false);
  assert.equal(awaitingFinish('completed'), false);
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

test('list price: pro cut multi-panel socks are +$5 a pair, and only with socks', () => {
  const o = sized({ sockType: 'sublimated', multiPanelSocks: true });
  o.sets = [{ ...o.sets[0], playerJerseys: 12, goalieJerseys: 0, sockPairs: 12 }];
  const line = listPrice(o)!.lines.find((l) => /Socks/.test(l.label))!;
  assert.equal(line.unit, 35);
  assert.match(line.label, /multi-panel/i);
  // no socks on the order: the flag changes nothing
  const none = sized({ multiPanelSocks: true });
  assert.equal(listPrice(none)!.lines.some((l) => /Socks/.test(l.label)), false);
});

test('Premier does not include stitched-on logos: they are a $20-a-jersey add-on', async () => {
  const { tierById, tierPatch } = await import('@/lib/constants');
  const premier = tierById('premier')!;
  assert.equal(premier.addons.includes('stitchedSublimatedLogos'), false);
  // Applying Premier leaves the add-on as it was rather than ticking it.
  assert.equal('stitchedSublimatedLogos' in tierPatch(premier), false);
  const plain = sized({});
  assert.equal(listPrice(plain)!.lines.some((l) => /Stitched/.test(l.label)), false);
  const withLogos = sized({ stitchedSublimatedLogos: true });
  const line = listPrice(withLogos)!.lines.find((l) => /Stitched/.test(l.label))!;
  assert.equal(line.unit, 20);
});
