import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intakeOrder } from '@/lib/data/intake';
import { parseIntake } from '@/lib/data/intake-logic';
import { blankOrder } from '@/lib/order-utils';
import type { Actor } from '@/lib/data/repository';
import type { Order } from '@/lib/types';

function fakeRepo(seed: Order[] = []) {
  const orders = [...seed];
  const log: string[] = [];
  return {
    orders,
    log,
    async listOrders() {
      return orders.filter((o) => !o.deletedAt);
    },
    async getByRosterToken(token: string) {
      return orders.some((o) => o.rosterToken === token) ? ({} as never) : null;
    },
    async createOrder(patch: Partial<Order>, actor: Actor) {
      const o = { ...blankOrder(), ...patch, createdAt: new Date().toISOString() } as Order;
      orders.push(o);
      log.push('create by ' + actor.name);
      return o;
    },
    async updateOrder(id: string, patch: Partial<Order>, actor: Actor) {
      const i = orders.findIndex((o) => o.id === id);
      orders[i] = { ...orders[i], ...patch };
      log.push('update by ' + actor.name);
      return orders[i];
    },
  };
}

const T1 = 'a'.repeat(64);
const T2 = 'b'.repeat(64);
const body = (t: string) => ({
  rosterToken: t, startingPoint: 'Ordered before', customerName: 'Sam Carter',
  email: 'sam@example.com', teamName: 'Ice Cats', previousOrder: 'Ice Cats 2025',
});
const input = (t: string) => {
  const r = parseIntake(body(t));
  if (!r.ok || r.honeypot) throw new Error('bad');
  return r.value;
};

test('first enquiry creates a website Draft carrying the token', async () => {
  const repo = fakeRepo();
  const { order, created } = await intakeOrder(input(T1), repo);
  assert.equal(created, true);
  assert.equal(order.source, 'website');
  assert.equal(order.rosterToken, T1);
  assert.deepEqual(order.clientLinkSections, { logos: false, inspiration: false, roster: true, personalDetails: true });
  assert.deepEqual(repo.log, ['create by Website enquiry']);
});

test('a second enquiry inside a day updates the Draft and moves the link to the new token', async () => {
  const repo = fakeRepo();
  await intakeOrder(input(T1), repo);
  const { order, created } = await intakeOrder({ ...input(T2), startingPoint: 'Design ready', colours: 'red' }, repo);
  assert.equal(created, false);
  assert.deepEqual(order.clientLinkSections, { logos: true, inspiration: true, roster: false, personalDetails: false });
  assert.equal(repo.orders.length, 1);
  assert.equal(order.rosterToken, T2);
  assert.equal(order.enquiry?.colours, 'red');
  assert.deepEqual(repo.log, ['create by Website enquiry', 'update by Website enquiry']);
});

test('a token already used by another order is refused', async () => {
  const repo = fakeRepo([{ ...blankOrder(), rosterToken: T1, teamName: 'Someone Else' }]);
  await assert.rejects(() => intakeOrder(input(T1), repo), /token/i);
});
