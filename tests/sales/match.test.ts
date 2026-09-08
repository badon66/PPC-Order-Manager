import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallList, Contact } from '@/lib/types';
import { blankContact, blankCallList } from '@/lib/data/sales-logic';
import { phoneKey, emailKey, identityKeys, matches, findMatch, alsoIn } from '@/lib/sales/match';

const NOW = '2026-09-08T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', ...over });

test('phoneKey: digits only, leading 1 dropped, short numbers are no key', () => {
  assert.equal(phoneKey('(705) 555-0142'), '7055550142');
  assert.equal(phoneKey('1 705 555 0142'), '7055550142');
  assert.equal(phoneKey('+1-705-555-0142'), '7055550142');
  assert.equal(phoneKey('555-01'), '');
  assert.equal(phoneKey(''), '');
});

test('emailKey: trimmed and lowercased; no @ is no key', () => {
  assert.equal(emailKey('  Jamie@Example.CA '), 'jamie@example.ca');
  assert.equal(emailKey('not an email'), '');
  assert.equal(emailKey(''), '');
});

test('identityKeys and matches', () => {
  const a = c({ phone: '705 555 0142', altPhone: '705 555 0199', email: 'J@x.ca' });
  assert.deepEqual([...identityKeys(a)].sort(), ['7055550142', '7055550199', 'j@x.ca']);
  assert.ok(matches(a, c({ id: 'p', phone: '(705) 555-0142' })), 'phone');
  assert.ok(matches(a, c({ id: 'e', email: 'j@X.ca' })), 'email');
  assert.ok(matches(a, c({ id: 'alt', phone: '7055550199' })), 'their phone against our alt phone');
  assert.ok(!matches(a, c({ id: 'n', phone: '705 555 0000', email: 'other@x.ca' })));
  assert.ok(!matches(c({ phone: '', email: '' }), c({ id: 'z', phone: '', email: '' })), 'no keys match nothing');
});

test('findMatch: first by sortOrder then createdAt', () => {
  const existing = [
    c({ id: 'late', sortOrder: 3, phone: '705 555 0142' }),
    c({ id: 'early', sortOrder: 2, phone: '705 555 0142' }),
    c({ id: 'other', sortOrder: 1, phone: '705 555 0001' }),
  ];
  assert.equal(findMatch(c({ id: 'row', phone: '7055550142' }), existing)?.id, 'early');
  assert.equal(findMatch(c({ id: 'row', phone: '7055550999' }), existing), null);
});

test('alsoIn: other non-deleted lists only, one entry per list', () => {
  const beer: CallList = blankCallList('l2', 'Beer league', 'Keenan', NOW);
  const gone: CallList = { ...blankCallList('l3', 'Old', 'Keenan', NOW), deletedAt: NOW };
  const me = c({ listId: 'l1', phone: '705 555 0142' });
  const others = [
    { list: blankCallList('l1', 'Youth', 'Keenan', NOW), contacts: [me] },
    { list: beer, contacts: [c({ id: 'b1', listId: 'l2', phone: '7055550142' }), c({ id: 'b2', listId: 'l2', phone: '7055550142' })] },
    { list: gone, contacts: [c({ id: 'g1', listId: 'l3', phone: '7055550142' })] },
  ];
  assert.deepEqual(alsoIn(me, others), [{ listId: 'l2', listName: 'Beer league', contactId: 'b1' }]);
});
