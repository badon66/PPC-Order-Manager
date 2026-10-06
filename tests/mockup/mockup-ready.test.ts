import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { dueUpdates, nextMockupVersion } from '@/lib/data/customer-updates-logic';
import { stageSummary } from '@/lib/data/stage-track';
import { blankOrder } from '@/lib/order-utils';
import type { CustomerEmailRecord, Order } from '@/lib/types';

const base: UpdateMailInput = {
  teamName: 'Ice Cats', firstName: 'Sam',
  rosterUrl: 'https://x/roster/t', shareUrl: 'https://x/share/s',
  designUrl: 'https://x/roster/t/design', detailsUrl: 'https://x/roster/t/details',
  products: { socks: true, pantShells: false },
  amount: '', howToPay: 'e-transfer', estimatedFinishDate: null, trackingCode: '',
  paymentReceivedFirst: false, cameFromGate: false, nextAfterApproval: 'deposit', approvedBy: '',
  paymentKind: 'final_payment', mockupVersion: 'V1', photos: [], finalPaid: false,
  googleReviewUrl: '', referralLine: '',
};

function sentRow(detail: string): CustomerEmailRecord {
  return { stage: 'mockup_ready', sentAt: '2026-10-01T00:00:00Z', to: 'x@y.z', messageId: 'm', detail };
}
function at(status: Order['status'], over: Partial<Order> = {}): Order {
  return { ...blankOrder(), status, contactEmail: 'c@t.ca', ...over };
}

test('mockup ready: names the round, says the pictures follow separately, promises the follow-up, no money', () => {
  const v1 = composeUpdateMail('mockup_ready', base);
  assert.match(v1.subject, /^V1 of your mockup is ready/);
  assert.match(v1.text, /first mockup/);
  assert.match(v1.text, /separate email/);
  assert.match(v1.text, /follow up/);
  assert.match(v1.text, /nothing is locked in/);
  assert.doesNotMatch(v1.text, /\$/);
  assert.ok(v1.html.includes('https://x/roster/t/design'));

  const v3 = composeUpdateMail('mockup_ready', { ...base, mockupVersion: 'V3' });
  assert.match(v3.subject, /^V3 of your mockup/);
  assert.match(v3.text, /reworked/);
  assert.doesNotMatch(v3.text, /first mockup/);
});

test('next round: V1 with nothing sent, one past the highest sent, capped at V4', () => {
  assert.equal(nextMockupVersion([]), 'V1');
  assert.equal(nextMockupVersion([sentRow('V1')]), 'V2');
  assert.equal(nextMockupVersion([sentRow('V1'), sentRow('V3')]), 'V4');
  assert.equal(nextMockupVersion([sentRow('V4')]), 'V4');
  // an old row with no round recorded doesn't count
  assert.equal(nextMockupVersion([{ ...sentRow('V2'), detail: undefined }]), 'V1');
});

test('offered only during Design Talk, repeatable, with the next round attached', () => {
  const talk = dueUpdates(at('design_talk', { customerEmails: [sentRow('V1')] }), []);
  const m = talk.find((d) => d.stage === 'mockup_ready');
  assert.ok(m);
  assert.equal(m.repeatable, true);
  assert.equal(m.mockupVersion, 'V2');
  assert.equal(dueUpdates(at('finalizing_details'), []).some((d) => d.stage === 'mockup_ready'), false);
  assert.equal(dueUpdates(at('waiting_for_approval'), []).some((d) => d.stage === 'mockup_ready'), false);
});

test('an optional, repeatable email is never counted as "owed"', () => {
  const s = stageSummary(at('design_talk', { estimatedFinishDate: '2026-12-01', customerEmails: [] }), [], '2026-10-06');
  // the one-shot "send us your logos" email IS owed; mockup ready is not
  const owed = s.attention.find((a) => /owed/.test(a));
  assert.ok(owed);
  assert.match(owed, /^1 update owed/);
});
