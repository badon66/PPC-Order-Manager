import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCredential } from '@/lib/mail';

const G = 'smtp.gmail.com';

test('a clean credential passes through untouched', () => {
  assert.deepEqual(cleanCredential('abcdefghijklmnop', G), { value: 'abcdefghijklmnop', fixes: [] });
  assert.deepEqual(cleanCredential('info@powerplaycustoms.ca', G), { value: 'info@powerplaycustoms.ca', fixes: [] });
});

test('surrounding whitespace and quotes from a paste are stripped and named', () => {
  assert.deepEqual(cleanCredential('  abcdefghijklmnop\n', G), { value: 'abcdefghijklmnop', fixes: ['surrounding whitespace'] });
  assert.deepEqual(cleanCredential('"abcdefghijklmnop"', G), { value: 'abcdefghijklmnop', fixes: ['quotes'] });
  assert.deepEqual(cleanCredential(" 'abcdefghijklmnop' ", G), { value: 'abcdefghijklmnop', fixes: ['surrounding whitespace', 'quotes'] });
});

test('the spaces Google prints in an app password are removed for Google hosts only', () => {
  assert.deepEqual(cleanCredential('abcd efgh ijkl mnop', G), { value: 'abcdefghijklmnop', fixes: ['inner spaces'] });
  assert.deepEqual(cleanCredential('abcd efgh ijkl mnop', 'smtp.googlemail.com').value, 'abcdefghijklmnop');
  // Another provider's password may legitimately contain a space.
  assert.deepEqual(cleanCredential('pass word', 'smtp.resend.com'), { value: 'pass word', fixes: [] });
});

test('a lone quote character is not treated as wrapping', () => {
  assert.deepEqual(cleanCredential('"', G), { value: '"', fixes: [] });
  assert.deepEqual(cleanCredential('"abc', G), { value: '"abc', fixes: [] });
});
