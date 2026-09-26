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
  products: { socks: true, pantShells: false },
  amount: '$250', howToPay: 'E-transfer to info@powerplaycustoms.ca (no fee), or by card (3% fee).',
  estimatedFinishDate: '2026-10-15', trackingCode: 'CP123456789CA',
  paymentReceivedFirst: false, cameFromGate: false, paymentKind: 'final_payment', photos: [], finalPaid: false,
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

test('approval confirmed says what comes next; the thank-you and the follow-up both ask for a review once the link is set', () => {
  assert.match(composeUpdateMail('approval_confirmed', base).text, /production/i);
  assert.match(composeUpdateMail('approval_confirmed', { ...base, nextAfterApproval: 'deposit' }).text, /deposit/i);

  const done = composeUpdateMail('completed', base);
  assert.ok(done.html.includes(base.googleReviewUrl) && done.text.includes(base.googleReviewUrl));
  assert.match(done.text, /quick, honest Google review from you, and from a few of your teammates/);
  assert.ok(done.text.includes(base.referralLine));
  const bareDone = composeUpdateMail('completed', { ...base, googleReviewUrl: '', referralLine: '' });
  assert.doesNotMatch(bareDone.text, /review/i, 'no review ask without a link to send them to');
  assert.ok(bareDone.text.includes(base.shareUrl));

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

test('the jerseys are done: photos first, then what we need before they ship; pre-production says 50%', () => {
  const photos = [{ cid: 'photo-1', name: 'front.jpg' }, { cid: 'photo-2', name: 'back.jpg' }];
  const m = composeUpdateMail('final_payment_requested', { ...base, photos });
  assert.match(m.subject, /^The jerseys are done/);
  assert.ok(m.html.includes('cid:photo-1') && m.html.includes('cid:photo-2'));
  assert.ok(m.text.includes('Production on Ice Cats is finished. Here are photos of the finished jerseys.'));
  assert.ok(m.text.includes('Before they ship: The final payment: $250.'));
  assert.ok(m.html.indexOf('cid:photo-1') < m.html.indexOf('Before they ship'), 'photos come before the ask');
  assert.match(m.text, /UPS tracking number follows shortly after/);
  assert.doesNotMatch(composeUpdateMail('final_payment_requested', base).text, /Here are photos/);

  const paid = composeUpdateMail('final_payment_requested', { ...base, photos, finalPaid: true });
  assert.ok(paid.html.includes('cid:photo-1'));
  assert.match(paid.text, /already in/);
  assert.ok(!/\$\s?\d/.test(paid.text) && !paid.text.includes('3% fee'), 'no payment ask once paid');
  assert.match(composeUpdateMail('production_deposit_requested', base).text, /50% of the order: \$250/);
});

test('"nearly there" asks only for the sizes of what is on the order', () => {
  const jerseysOnly = composeUpdateMail('finalizing_details', { ...base, products: { socks: false, pantShells: false } });
  assert.match(jerseysOnly.text, /their number, and jersey sizes, plus/);
  assert.ok(!/sock|pant/i.test(jerseysOnly.text), 'no socks or pants on a jerseys-only order');
  const all = composeUpdateMail('finalizing_details', { ...base, products: { socks: true, pantShells: true } });
  assert.match(all.text, /jersey, sock and pant shell sizes/);
  assert.match(all.html, /jersey, sock and pant shell sizes/);
});

test('payment received links the order sheet, plus the upload page after the initial deposit only', () => {
  const initial = composeUpdateMail('payment_received', { ...base, paymentKind: 'initial_deposit' });
  for (const body of [initial.text, initial.html]) {
    assert.ok(body.includes(base.shareUrl), 'order sheet');
    assert.ok(body.includes(base.rosterUrl), 'upload page');
  }
  assert.match(initial.text, /See your order: /);
  assert.match(initial.text, /Upload your info and files: /);
  for (const kind of ['production_deposit', 'final_payment'] as const) {
    const m = composeUpdateMail('payment_received', { ...base, paymentKind: kind });
    assert.ok(m.text.includes(base.shareUrl), `${kind} order sheet`);
    assert.ok(!m.text.includes(base.rosterUrl) && !m.html.includes(base.rosterUrl), `${kind} has no upload link`);
  }
});

test('shipped is a UPS email: tracking link, 3 to 6 days, and UPS for any questions', () => {
  const m = composeUpdateMail('shipped', base);
  assert.ok(m.text.includes('https://www.ups.com/track?tracknum=CP123456789CA'));
  assert.match(m.text, /UPS tracking number: CP123456789CA/);
  assert.match(m.text, /3 to 6 days/);
  assert.match(m.text, /out of our control/);
  assert.match(m.text, /in your name, not ours/);
  assert.match(m.text, /contact UPS directly/);
  assert.ok(m.text.includes(base.shareUrl));
});

test('from production on, every email points at the order sheet, never the team form', () => {
  for (const stage of ['approval_confirmed', 'in_production', 'final_payment_requested', 'shipped', 'completed'] as const) {
    const m = composeUpdateMail(stage, { ...base, googleReviewUrl: '' });
    assert.ok(m.text.includes(base.shareUrl), `${stage} links the order sheet`);
    assert.ok(!m.text.includes(base.rosterUrl) && !m.html.includes(base.rosterUrl), `${stage} doesn't link the form`);
  }
});
