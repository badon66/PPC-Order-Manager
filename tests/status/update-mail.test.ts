import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { PRODUCTION_NOTE } from '@/lib/data/timeline';
import { UPDATE_STAGES } from '@/lib/types';

const base: UpdateMailInput = {
  teamName: 'Ice Cats', firstName: 'Sam',
  rosterUrl: 'https://orders.powerplaycustoms.ca/roster/' + 'a'.repeat(64),
  shareUrl: 'https://orders.powerplaycustoms.ca/share/' + 'b'.repeat(64),
  amount: '$250', howToPay: 'E-transfer to info@powerplaycustoms.ca (no fee), or by card (3% fee).',
  estimatedFinishDate: '2026-10-15', trackingCode: 'CP123456789CA',
  paymentReceivedFirst: false, nextAfterApproval: 'production', approvedBy: 'Sam Carter',
  googleReviewUrl: 'https://g.page/r/abc/review', referralLine: 'Know another team? Send them our way.',
};

test('every stage composes a subject with the team, and both bodies link the team page or the order sheet', () => {
  for (const stage of UPDATE_STAGES) {
    const m = composeUpdateMail(stage, base);
    assert.match(m.subject, /Ice Cats/, stage);
    for (const body of [m.text, m.html]) {
      assert.ok(body.includes(base.rosterUrl) || body.includes(base.shareUrl), `${stage} link`);
      assert.ok(body.includes('+1 (403) 895-9915'), `${stage} phone`);
    }
    assert.ok(!/<[a-z]/i.test(m.text), `${stage} text has no tags`);
  }
});

test('only the three request emails carry the amount and how to pay; nothing else mentions money', () => {
  for (const stage of UPDATE_STAGES) {
    const m = composeUpdateMail(stage, base);
    const money = ['initial_deposit_requested', 'production_deposit_requested', 'final_payment_requested'].includes(stage);
    assert.equal(m.text.includes('$250'), money, `${stage} amount in text`);
    assert.equal(m.html.includes('$250'), money, `${stage} amount in html`);
    assert.equal(m.text.includes('3% fee'), money, `${stage} how to pay`);
    if (!money) assert.ok(!/\$\s?\d/.test(m.text) && !/\$\s?\d/.test(m.html), `${stage} has no dollar figure`);
  }
});

test('in production carries the estimate and the production note; shipped carries tracking', () => {
  const prod = composeUpdateMail('in_production', base);
  assert.ok(prod.text.includes(PRODUCTION_NOTE) && prod.html.includes(PRODUCTION_NOTE));
  assert.match(prod.text, /October 15, 2026|Oct 15, 2026/);
  const noDate = composeUpdateMail('in_production', { ...base, estimatedFinishDate: null });
  assert.doesNotMatch(noDate.text, /Estimated finish/);
  const ship = composeUpdateMail('shipped', base);
  assert.ok(ship.text.includes('CP123456789CA') && ship.html.includes('CP123456789CA'));
  assert.doesNotMatch(ship.text, /Payment received/);
  assert.match(composeUpdateMail('shipped', { ...base, paymentReceivedFirst: true }).text, /Payment received/);
});

test('approval confirmed says what comes next; completed shows the review button and referral only when set', () => {
  assert.match(composeUpdateMail('approval_confirmed', base).text, /production/i);
  assert.match(composeUpdateMail('approval_confirmed', { ...base, nextAfterApproval: 'deposit' }).text, /deposit/i);
  const done = composeUpdateMail('completed', base);
  assert.ok(done.html.includes(base.googleReviewUrl) && done.text.includes(base.googleReviewUrl));
  assert.ok(done.text.includes(base.referralLine));
  const bare = composeUpdateMail('completed', { ...base, googleReviewUrl: '', referralLine: '' });
  assert.doesNotMatch(bare.text, /review/i);
  assert.ok(!bare.text.includes('Send them our way'));
});

test('what people typed is escaped in the HTML', () => {
  const m = composeUpdateMail('initial_deposit_requested', { ...base, teamName: 'Ice <Cats> & "Co"', amount: '<b>$1</b>', howToPay: 'a < b' });
  assert.ok(m.html.includes('Ice &lt;Cats&gt; &amp; &quot;Co&quot;'));
  assert.ok(!m.html.includes('<b>$1</b>') && m.html.includes('&lt;b&gt;$1&lt;/b&gt;'));
  assert.ok(m.html.includes('a &lt; b'));
});
