import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contact, ScriptItem } from '@/lib/types';
import { parseShowWhen, showWhenMatches, applicableItems, fillPlaceholders } from '@/lib/sales/script';

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c1', listId: 'l1', sortOrder: 1, source: 'sheet', referredFromContactId: null,
    orgName: 'Ennismore Eagles', orgType: 'Minor Hockey Association', contactName: 'Jamie Ouellette',
    role: 'Equipment Manager', phone: '7055550142', altPhone: '', email: '', city: 'Ennismore',
    province: 'ON', timezoneOverride: '', league: 'OMHA', ageDivisions: 'U9, U11, U13', teams: 14,
    players: 210, seasonStartMonth: 'Sep', orderingMonth: 'Jun', currentSupplier: 'XYZ Sports',
    lastOrderedYear: '2023', colours: 'navy/gold', website: '', social: '', leadSource: 'Web research',
    priority: 'A', bestTimeToCall: 'Weekday evening', doNotCall: false, notes: '',
    raw: { 'Rink': 'Ennismore CC' },
    lastOutcome: null, lastCalledAt: null, callCount: 0, skipCount: 0, lastSkippedAt: null,
    nextCallDate: null, leadRating: null, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
    ...over,
  };
}

test('parseShowWhen: blank, =, !=, multi-value, ;, and errors', () => {
  assert.deepEqual(parseShowWhen(''), { ok: true, clauses: [] });
  assert.deepEqual(parseShowWhen('Org Type = Minor Hockey Association'), {
    ok: true, clauses: [{ field: 'Org Type', op: '=', values: ['minor hockey association'] }],
  });
  assert.deepEqual(parseShowWhen('Role != Head Coach; Priority = A, B'), {
    ok: true,
    clauses: [
      { field: 'Role', op: '!=', values: ['head coach'] },
      { field: 'Priority', op: '=', values: ['a', 'b'] },
    ],
  });
  assert.equal(parseShowWhen('Org Type').ok, false);
  assert.equal(parseShowWhen('= Adult Team').ok, false);
  assert.equal(parseShowWhen('Org Type = ').ok, false);
});

test('showWhenMatches resolves headers, keys and raw columns', () => {
  const c = contact();
  assert.ok(showWhenMatches('Org Type = Minor Hockey Association', c));
  assert.ok(showWhenMatches('orgType = minor hockey association', c));
  assert.ok(!showWhenMatches('Org Type = Adult Team', c));
  assert.ok(showWhenMatches('Org Type = Adult Team, Minor Hockey Association', c));
  assert.ok(showWhenMatches('Role != Head Coach', c));
  assert.ok(!showWhenMatches('Role != Equipment Manager', c));
  assert.ok(showWhenMatches('Age Divisions = U11', c));          // contains any
  assert.ok(!showWhenMatches('Age Divisions = U15', c));
  assert.ok(showWhenMatches('Rink = Ennismore CC', c));          // raw column
  assert.ok(!showWhenMatches('Rink = Somewhere Else', c));
  assert.ok(showWhenMatches('Role != Head Coach; Priority = A', c));
  assert.ok(!showWhenMatches('Role != Head Coach; Priority = B', c));
  assert.ok(showWhenMatches('Nonexistent Column = X', c) === false);
  assert.ok(showWhenMatches('Nonexistent Column != X', c) === true);
});

test('unparseable rule shows the item (never hides)', () => {
  assert.ok(showWhenMatches('garbage', contact()));
});

test('applicableItems keeps order and filters', () => {
  const script: ScriptItem[] = [
    { id: 's1', section: 'opening', kind: 'read', text: 'Hi [Name]', response: '', options: [], showWhen: '' },
    { id: 's2', section: 'opening', kind: 'reminder', text: 'Ask about AGM', response: '', options: [], showWhen: 'Org Type = Minor Hockey Association' },
    { id: 's3', section: 'opening', kind: 'reminder', text: 'Ask about sponsor', response: '', options: [], showWhen: 'Org Type = Adult Team' },
  ];
  assert.deepEqual(applicableItems(script, contact()).map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(applicableItems(script, contact({ orgType: 'Adult Team' })).map((s) => s.id), ['s1', 's3']);
});

test('placeholders', () => {
  const c = contact();
  assert.equal(fillPlaceholders('Hi [Name], it\'s [Rep] about [Org] in [City]', c, 'Keenan Huber'), 'Hi Jamie, it\'s Keenan about Ennismore Eagles in Ennismore');
  assert.equal(fillPlaceholders('[Full Name] / [Supplier]', c, 'K'), 'Jamie Ouellette / XYZ Sports');
  assert.equal(fillPlaceholders('[Name]', contact({ contactName: '' }), 'K'), 'there');
  assert.equal(fillPlaceholders('[Supplier]', contact({ currentSupplier: '' }), 'K'), 'your current supplier');
  assert.equal(fillPlaceholders('at [Rink]', c, 'K'), 'at Ennismore CC');
  assert.equal(fillPlaceholders('[Unknown Thing]', c, 'K'), '[Unknown Thing]');
  assert.equal(fillPlaceholders('[name] [ORG]', c, 'K'), 'Jamie Ennismore Eagles');
});
