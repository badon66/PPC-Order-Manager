import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healOrder } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import type { Order } from '@/lib/types';

test('healOrder gives old rows a source and an empty enquiry', () => {
  const o = blankOrder() as Partial<Order>;
  delete o.source;
  delete o.enquiry;
  const healed = healOrder(o as Order);
  assert.equal(healed.source, 'manual');
  assert.equal(healed.enquiry, null);
});

test('blankOrder is a manual order with no enquiry', () => {
  const o = blankOrder();
  assert.equal(o.source, 'manual');
  assert.equal(o.enquiry, null);
});
