import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healOrder, healSettings } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import { DEFAULT_APP_SETTINGS, UPDATE_STAGES, UPDATE_STAGE_LABEL } from '@/lib/types';
import type { Order } from '@/lib/types';
import { PAYMENT_KINDS, PAYMENT_KIND_LABEL, ASSET_ROLES } from '@/lib/types';
import { healSubmission } from '@/lib/data/logic';
import type { ClientRosterSubmission } from '@/lib/types';

test('a blank order has no customer emails yet, and old rows are healed to the same', () => {
  assert.deepEqual(blankOrder().customerEmails, []);
  const o = blankOrder() as Partial<Order>;
  delete o.customerEmails;
  assert.deepEqual(healOrder(o as Order).customerEmails, []);
});

test('there are twelve stages and every one has a label', () => {
  assert.equal(UPDATE_STAGES.length, 14);
  for (const s of UPDATE_STAGES) assert.ok(UPDATE_STAGE_LABEL[s].length > 3, s);
});

test('round two adds two stages, three payment kinds, the finished-photo role, and heals colours', () => {
  assert.equal(UPDATE_STAGES.length, 14);
  assert.equal(UPDATE_STAGE_LABEL.payment_received, 'Payment received');
  assert.equal(UPDATE_STAGE_LABEL.review_request, 'Review and referral');
  assert.deepEqual([...PAYMENT_KINDS], ['initial_deposit', 'production_deposit', 'final_payment']);
  assert.equal(PAYMENT_KIND_LABEL.production_deposit, 'pre-production deposit');
  assert.ok((ASSET_ROLES as readonly string[]).includes('finished_photo'));
  const s = { players: [] } as unknown as ClientRosterSubmission;
  assert.equal(healSubmission(s).colours, '');
});

test('settings heal to the defaults, and the default how-to-pay names both ways to pay', () => {
  const s = healSettings({});
  assert.deepEqual(s, DEFAULT_APP_SETTINGS);
  assert.match(s.howToPay, /info@powerplaycustoms\.ca/);
  assert.match(s.howToPay, /3%/);
  assert.equal(healSettings({ howToPay: 'cash' }).howToPay, 'cash');
});
