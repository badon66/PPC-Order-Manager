import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contact } from '@/lib/types';
import { blankContact } from '@/lib/data/sales-logic';
import { fillBlanks } from '@/lib/sales/merge';

const NOW = '2026-09-08T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', ...over });

test('fills empty string, null and empty raw cells; never overwrites', () => {
  const existing = c({
    contactName: 'Jamie', email: '', website: 'https://a.ca', teams: null, players: 12, priority: '',
    raw: { 'Org Name': 'Eagles', 'Rink': '', 'Website': 'https://a.ca' },
    callCount: 3, lastOutcome: 'interested', isJerseyManager: true, doNotCall: false,
  });
  const row = c({
    id: 'row', contactName: 'J. Ouellette', email: 'j@x.ca', website: 'https://b.ca', teams: 14, players: 99, priority: 'B',
    raw: { 'Org Name': 'Eagles FC', 'Rink': 'Ennismore CC', 'Website': 'https://b.ca', 'Sponsor': 'Tim Hortons' },
    doNotCall: true,
  });
  const { patch, filled } = fillBlanks(existing, row);
  assert.deepEqual(patch, {
    email: 'j@x.ca', teams: 14, priority: 'B',
    raw: { 'Org Name': 'Eagles', 'Rink': 'Ennismore CC', 'Website': 'https://a.ca', 'Sponsor': 'Tim Hortons' },
  });
  assert.deepEqual(filled, ['Email', 'Teams (#)', 'Priority', 'Rink', 'Sponsor']);
  assert.equal('callCount' in patch, false);
  assert.equal('doNotCall' in patch, false);
  assert.equal('isJerseyManager' in patch, false);
});

test('nothing to fill → empty patch and empty filled', () => {
  const full = c({ email: 'j@x.ca', raw: { 'Org Name': 'Eagles' } });
  const { patch, filled } = fillBlanks(full, c({ id: 'row', email: 'j@x.ca', raw: { 'Org Name': 'Eagles' } }));
  assert.deepEqual(patch, {});
  assert.deepEqual(filled, []);
});
