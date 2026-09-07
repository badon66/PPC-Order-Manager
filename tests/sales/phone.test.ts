import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneDigits, isNorthAmerican, telHref, phoneDisplay } from '@/lib/sales/phone';

test('digits, NA detection', () => {
  assert.equal(phoneDigits('(705) 555-0142'), '7055550142');
  assert.equal(phoneDigits('+1 705.555.0142 ext 4'), '17055550142' + '4');
  assert.ok(isNorthAmerican('705-555-0142'));
  assert.ok(isNorthAmerican('1 705 555 0142'));
  assert.ok(!isNorthAmerican('555-0142'));
});

test('tel: hrefs', () => {
  assert.equal(telHref('705 555 0142'), 'tel:+17055550142');
  assert.equal(telHref('+1 (705) 555-0142'), 'tel:+17055550142');
  assert.equal(telHref('0044 20 7946 0958'), 'tel:00442079460958');
  assert.equal(telHref(''), null);
  assert.equal(telHref('n/a'), null);
});

test('display keeps odd numbers verbatim', () => {
  assert.equal(phoneDisplay('7055550142'), '(705) 555-0142');
  assert.equal(phoneDisplay('1-705-555-0142'), '(705) 555-0142');
  assert.equal(phoneDisplay(' 555-0142 '), '555-0142');
});
