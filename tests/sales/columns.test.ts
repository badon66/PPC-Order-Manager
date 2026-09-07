import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_COLUMNS, keyForHeader, headerForKey, normaliseHeader } from '@/lib/sales/columns';

test('26 template columns, first is Org Name, last is Notes', () => {
  assert.equal(CONTACT_COLUMNS.length, 26);
  assert.equal(CONTACT_COLUMNS[0].header, 'Org Name');
  assert.equal(CONTACT_COLUMNS[25].header, 'Notes');
});

test('headers and aliases resolve case-insensitively, unknown → null', () => {
  assert.equal(keyForHeader('Org Name'), 'orgName');
  assert.equal(keyForHeader('  organization '), 'orgName');
  assert.equal(keyForHeader('Team Name'), 'orgName');
  assert.equal(keyForHeader('PHONE NUMBER'), 'phone');
  assert.equal(keyForHeader('Do Not Call?'), 'doNotCall');
  assert.equal(keyForHeader('Priority (A/B/C)'), 'priority');
  assert.equal(keyForHeader('Rink'), null);
  assert.equal(headerForKey('orderingMonth'), 'Ordering Window (month)');
});

test('normaliseHeader collapses spaces and strips punctuation', () => {
  assert.equal(normaliseHeader('  League / Level '), 'league level');
  assert.equal(normaliseHeader('Teams (#)'), 'teams');
});
