import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSheet } from '@/lib/sales/import';
import { callListToCsv } from '@/lib/sales/export';
import { parseCsv } from '@/lib/csv';
import type { CallLog } from '@/lib/types';
import { blankCallList, blankCallLogInput } from '@/lib/data/sales-logic';

test('export round-trips headers, adds outcome columns and question columns', async () => {
  const r = await parseSheet({
    fileName: 'sample-list.xlsx', bytes: new Uint8Array(readFileSync('tests/sales/fixtures/sample-list.xlsx')),
    listId: 'l1', now: '2026-09-06T20:00:00.000Z',
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const list = { ...blankCallList('l1', 'S', 'K', '2026-09-06T20:00:00.000Z'), script: r.script ?? [] };
  const eagles = r.contacts[0];
  eagles.lastOutcome = 'send_info'; eagles.callCount = 1; eagles.leadRating = 4; eagles.nextCallDate = '2026-09-13'; eagles.email = 'new@example.ca';
  const log: CallLog = {
    ...blankCallLogInput('2026-09-06T20:00:00.000Z'), id: 'g1', listId: 'l1', contactId: eagles.id, outcome: 'send_info',
    notes: 'wants the catalogue', answers: { s7: 'This person' }, endedAt: '2026-09-06T20:05:00.000Z',
    createdAt: '2026-09-06T20:05:00.000Z', updatedAt: '2026-09-06T20:05:00.000Z',
  };
  const csv = callListToCsv({ list, contacts: r.contacts, logs: [log], sessions: [] });
  assert.ok(csv.startsWith('\uFEFF'));
  const rows = parseCsv(csv.slice(1));
  const header = rows[0];
  assert.equal(header[0], 'Org Name');
  assert.equal(header[25], 'Notes');
  assert.equal(header[26], 'Lead Rating');
  assert.equal(header[33], 'Source');
  assert.equal(header[34], 'Jersey Manager');
  assert.equal(header[35], 'Linked Contacts');
  assert.ok(header.includes('Q: Who handles the jerseys for [Org] — is that you, or someone else?'));
  assert.equal(header[header.length - 1], 'Rink');
  const row = rows[1];
  assert.equal(row[0], 'Ennismore Eagles');
  assert.equal(row[6], 'new@example.ca');
  assert.equal(row[26], '4');
  assert.equal(row[27], 'Send Info');
  assert.equal(row[28], '1');
  assert.equal(row[31], '2026-09-13');
  assert.equal(row[32], 'wants the catalogue');
  assert.equal(row[header.indexOf('Q: Who handles the jerseys for [Org] — is that you, or someone else?')], 'This person');
  assert.equal(row[34], 'N');
  // The duplicate Eagles row (line 5 of the sheet) is the same organisation, so the two link to each other.
  assert.equal(row[35], 'Jamie Ouellette');
  assert.equal(rows[3][35], 'Jamie Ouellette');
  assert.equal(rows[2][35], '');
  assert.equal(row[header.length - 1], 'Ennismore CC');
  assert.equal(rows.length, 6);
});
