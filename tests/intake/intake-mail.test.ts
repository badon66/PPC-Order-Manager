import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPARE_URL, FAQ_URL, IMAGES, composeEnquiryMail, esc, firstNameOf } from '@/lib/data/intake-mail';

const base = {
  customerName: 'Sam Carter',
  teamName: 'Ice Cats',
  rosterUrl: 'https://orders.powerplaycustoms.ca/roster/' + 'a'.repeat(64),
  created: true,
} as const;

test('first name, with a fallback for a blank name', () => {
  assert.equal(firstNameOf('Sam Carter'), 'Sam');
  assert.equal(firstNameOf('  '), 'there');
});

test('the mail carries the link, the specialist, the promises and the two site links, in text and HTML', () => {
  const m = composeEnquiryMail({ ...base, startingPoint: 'Design ready' });
  assert.equal(m.subject, "We've got your enquiry — Ice Cats");
  for (const body of [m.text, m.html]) {
    assert.ok(body.includes(base.rosterUrl), 'link');
    assert.ok(body.includes("We've got it, Sam."), 'first name');
    assert.ok(body.includes('assigned to one of our jersey specialists'), 'specialist line');
    assert.ok(body.includes('2 hours'), 'reply promise');
    assert.ok(body.includes('Get ahead of the next steps.'), 'in a rush banner');
    assert.ok(body.includes('Nothing is locked in until you approve it.'), 'mockup promise');
    assert.ok(body.includes(COMPARE_URL), 'comparison chart');
    assert.ok(body.includes(FAQ_URL), 'faq');
    assert.ok(body.includes('info@powerplaycustoms.ca'), 'email alternative');
    assert.ok(body.includes('+1 (403) 895-9915'), 'phone');
    assert.ok(!/\$\s?\d/.test(body), 'no prices');
  }
  assert.ok(m.html.includes('Keenan'), 'specialist named in HTML');
  assert.ok(m.text.includes('Keenan'), 'specialist named in text');
  assert.ok(!/<[a-z]/i.test(m.text), 'plain text has no tags');
});

test('the HTML carries the logo, both hero crops and the two tile photos', () => {
  const { html } = composeEnquiryMail({ ...base, startingPoint: 'Design ready' });
  for (const src of Object.values(IMAGES)) assert.ok(html.includes(esc(src)), src);
  assert.ok(html.includes('class="hero-desk"') && html.includes('class="hero-mob"'), 'desktop and phone hero');
  assert.ok(html.includes('max-width:700px'), 'desktop width');
});

test('the steps follow the route', () => {
  assert.match(composeEnquiryMail({ ...base, startingPoint: 'Design ready' }).text, /Drop in your logo and any inspiration/);
  assert.match(composeEnquiryMail({ ...base, startingPoint: 'Starting from scratch' }).text, /No logo yet is fine/);
  assert.match(composeEnquiryMail({ ...base, startingPoint: 'Ordered before' }).text, /Fill in your roster/);
  assert.match(composeEnquiryMail({ ...base, startingPoint: 'Ordered before' }).html, /Fill in your roster/);
});

test('a repeat enquiry says the link replaces the earlier one', () => {
  const again = composeEnquiryMail({ ...base, startingPoint: 'Ordered before', created: false });
  assert.match(again.text, /replaces the one in our earlier email/);
  assert.match(again.html, /replaces the one in our earlier email/);
  assert.doesNotMatch(composeEnquiryMail({ ...base, startingPoint: 'Ordered before' }).text, /replaces the one/);
  assert.doesNotMatch(composeEnquiryMail({ ...base, startingPoint: 'Ordered before' }).html, /replaces the one/);
});

test('what the customer typed is escaped in the HTML, and a blank team name has a fallback', () => {
  const m = composeEnquiryMail({ ...base, customerName: 'Sam <b>', teamName: 'Ice <Cats> & "Co"', startingPoint: 'Design ready' });
  assert.ok(m.html.includes('Ice &lt;Cats&gt; &amp; &quot;Co&quot;'));
  assert.ok(!m.html.includes('<Cats>'));
  assert.ok(m.html.includes('We\'ve got it, Sam.') || m.html.includes('We&#39;ve got it, Sam.'));
  assert.ok(!m.html.includes('Sam <b>'));
  assert.equal(esc(`a'b`), 'a&#39;b');
  assert.match(composeEnquiryMail({ ...base, teamName: '  ', startingPoint: 'Design ready' }).subject, /your team/);
});
