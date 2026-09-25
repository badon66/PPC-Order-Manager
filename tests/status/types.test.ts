import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healOrder, healSettings } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import { DEFAULT_APP_SETTINGS, UPDATE_STAGES, UPDATE_STAGE_LABEL } from '@/lib/types';
import type { Order } from '@/lib/types';

test('a blank order has no customer emails yet, and old rows are healed to the same', () => {
  assert.deepEqual(blankOrder().customerEmails, []);
  const o = blankOrder() as Partial<Order>;
  delete o.customerEmails;
  assert.deepEqual(healOrder(o as Order).customerEmails, []);
});

test('there are twelve stages and every one has a label', () => {
  assert.equal(UPDATE_STAGES.length, 12);
  for (const s of UPDATE_STAGES) assert.ok(UPDATE_STAGE_LABEL[s].length > 3, s);
});

test('settings heal to the defaults, and the default how-to-pay names both ways to pay', () => {
  const s = healSettings({});
  assert.deepEqual(s, DEFAULT_APP_SETTINGS);
  assert.match(s.howToPay, /info@powerplaycustoms\.ca/);
  assert.match(s.howToPay, /3%/);
  assert.equal(healSettings({ howToPay: 'cash' }).howToPay, 'cash');
});
