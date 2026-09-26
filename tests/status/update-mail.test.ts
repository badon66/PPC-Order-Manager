import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { PRODUCTION_NOTE } from '@/lib/data/timeline';
import { PAYMENT_KIND_LABEL, UPDATE_STAGES } from '@/lib/types';

const base: UpdateMailInput = {
  teamName: 'Ice Cats', firstName: 'Sam',
  rosterUrl: 'https://orders.powerplaycustoms.ca/roster/' + 'a'.repeat(64),
  shareUrl: 'https://orders.powerplaycustoms.ca/share/' + 'b'.repeat(64),
  designUrl: 'https://x/roster/t/design', detailsUrl: 'https://x/roster/t/details',
  amount: '$250', howToPay: 'E-transfer to info@powerplaycustoms.ca (no fee), or by card (3% fee).',
  estimatedFinishDate: '2026-10-15', trackingCode: 'CP123456789CA',
  paymentReceivedFirst: false, cameFromGate: false, paymentKind: 'final_payment', photos: [],
  nextAfterApproval: 'production', approvedBy: 'Sam Carter',
  googleReviewUrl: 'https://g.page/r/abc/review', referralLine: 'Know another team? Send them our way.',
};

test('every stage composes a subject with the team, and both bodies link the team page, the order sheet, a stage page, or the review link', () => {
  const links = [base.rosterUrl, base.shareUrl, base.designUrl, base.detailsUrl, base.googleReviewUrl].filter(
    (u): u is string => Boolean(u),
  );
  for (const stage of UPDATE_STAGES) {
    const m = composeUpdateMail(stage, base);
    assert.match(m.subject, /Ice Cats/, stage);
    for (const body of [m.text, m.html]) {
      assert.ok(links.some((u) => body.includes(u)), `${stage} link`);
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

test('approval confirmed says what comes next; completed has no review button or referral, review_request does', () => {
  assert.match(composeUpdateMail('approval_confirmed', base).text, /production/i);
  assert.match(composeUpdateMail('approval_confirmed', { ...base, nextAfterApproval: 'deposit' }).text, /deposit/i);

  const done = composeUpdateMail('completed', base);
  assert.ok(!done.html.includes(base.googleReviewUrl) && !done.text.includes(base.googleReviewUrl));
  assert.ok(!done.text.includes(base.referralLine));

  const review = composeUpdateMail('review_request', base);
  assert.ok(review.html.includes(base.googleReviewUrl) && review.text.includes(base.googleReviewUrl));
  assert.ok(review.text.includes(base.referralLine));

  const bareReview = composeUpdateMail('review_request', { ...base, googleReviewUrl: '', referralLine: '' });
  assert.doesNotMatch(bareReview.text, /review/i);
  assert.ok(!bareReview.text.includes('Send them our way'));
});

test('what people typed is escaped in the HTML', () => {
  const m = composeUpdateMail('initial_deposit_requested', { ...base, teamName: 'Ice <Cats> & "Co"', amount: '<b>$1</b>', howToPay: 'a < b' });
  assert.ok(m.html.includes('Ice &lt;Cats&gt; &amp; &quot;Co&quot;'));
  assert.ok(!m.html.includes('<b>$1</b>') && m.html.includes('&lt;b&gt;$1&lt;/b&gt;'));
  assert.ok(m.html.includes('a &lt; b'));
});

test('the two link emails point at their stage pages', () => {
  assert.ok(composeUpdateMail('design_talk', base).html.includes(base.designUrl));
  assert.ok(composeUpdateMail('finalizing_details', base).text.includes(base.detailsUrl));
});

test('payment received names the payment and what comes next, never an amount', () => {
  for (const [kind, next] of [['initial_deposit', /next mockup/], ['production_deposit', /Production is next/], ['final_payment', /tracking number/]] as const) {
    const m = composeUpdateMail('payment_received', { ...base, paymentKind: kind });
    assert.match(m.text, next);
    assert.ok(m.text.includes(PAYMENT_KIND_LABEL[kind]));
    assert.ok(!/\$\s?\d/.test(m.text));
  }
});

test('proof ready explains the factory sheet; in production opens with payment received after the gate', () => {
  assert.match(composeUpdateMail('proof_ready', base).text, /exactly what our factory sees/);
  assert.match(composeUpdateMail('proof_ready', base).text, /sales representative/);
  assert.match(composeUpdateMail('in_production', { ...base, cameFromGate: true }).text, /We received your payment/);
  assert.doesNotMatch(composeUpdateMail('in_production', base).text, /received your payment/);
});

test('final payment carries the photos and the tracking promise; pre-production says 50%', () => {
  const m = composeUpdateMail('final_payment_requested', { ...base, photos: [{ cid: 'photo-1', name: 'front.jpg' }, { cid: 'photo-2', name: 'back.jpg' }] });
  assert.ok(m.html.includes('cid:photo-1') && m.html.includes('cid:photo-2'));
  assert.match(m.text, /Photos of the finished jerseys are attached/);
  assert.match(m.text, /tracking number shortly after/);
  assert.doesNotMatch(composeUpdateMail('final_payment_requested', base).text, /attached/);
  assert.match(composeUpdateMail('production_deposit_requested', base).text, /50% of the order: \$250/);
});
