import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeEnquiryMail, esc, firstNameOf } from '@/lib/data/intake-mail';

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

test('the mail carries the link, the promises and the email alternative, in text and HTML', () => {
  const m = composeEnquiryMail({ ...base, startingPoint: 'Design ready' });
  assert.equal(m.subject, "We've got your enquiry — Ice Cats");
  for (const body of [m.text, m.html]) {
    assert.ok(body.includes(base.rosterUrl), 'link');
    assert.ok(body.includes('Hi Sam'), 'first name');
    assert.ok(body.includes('info@powerplaycustoms.ca'), 'email alternative');
    assert.ok(body.includes('Nothing is locked in until you approve the proof.'), 'promise');
    assert.ok(body.includes('+1 (403) 895-9915'), 'phone');
    assert.ok(!/\$\s?\d/.test(body), 'no prices');
  }
});

test('the next-step line follows the route', () => {
  assert.match(composeEnquiryMail({ ...base, startingPoint: 'Design ready' }).text, /upload your logos/);
  assert.match(composeEnquiryMail({ ...base, startingPoint: 'Starting from scratch' }).text, /No logo yet is fine/);
  assert.match(composeEnquiryMail({ ...base, startingPoint: 'Ordered before' }).text, /fill in your roster/);
});

test('a repeat enquiry says the link replaces the earlier one', () => {
  const again = composeEnquiryMail({ ...base, startingPoint: 'Ordered before', created: false });
  assert.match(again.text, /replaces the one in our earlier email/);
  assert.doesNotMatch(composeEnquiryMail({ ...base, startingPoint: 'Ordered before' }).text, /replaces the one/);
});

test('what the customer typed is escaped in the HTML, and a blank team name has a fallback', () => {
  const m = composeEnquiryMail({ ...base, teamName: 'Ice <Cats> & "Co"', startingPoint: 'Design ready' });
  assert.ok(m.html.includes('Ice &lt;Cats&gt; &amp; &quot;Co&quot;'));
  assert.ok(!m.html.includes('<Cats>'));
  assert.equal(esc(`a'b`), 'a&#39;b');
  assert.match(composeEnquiryMail({ ...base, teamName: '  ', startingPoint: 'Design ready' }).subject, /your team/);
});
