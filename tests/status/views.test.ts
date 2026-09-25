import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicViewOf, rosterLinkView } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';

test('both customer views carry the timeline, and neither carries the email records', () => {
  const o = { ...blankOrder(), status: 'in_production' as const, customerEmails: [{ stage: 'in_production' as const, sentAt: 'x', to: 'sam@example.com', messageId: '' }] };
  const roster = rosterLinkView(o, 0, []);
  const share = publicViewOf(o, [], [], []);
  for (const v of [roster, share]) {
    assert.equal(v.timeline.find((s) => s.key === 'in_production')?.state, 'current');
    assert.ok(!('customerEmails' in v));
  }
  assert.equal(rosterLinkView(o, 0).timeline.length, 10, 'history defaults to empty');
});
